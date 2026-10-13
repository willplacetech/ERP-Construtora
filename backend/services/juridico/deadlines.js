import mongoose from 'mongoose';
import Contrato from '../../models/Contrato.js';
import DocumentoJuridico from '../../models/DocumentoJuridico.js';
import EventoPrazoJuridico from '../../models/EventoPrazoJuridico.js';
import { currentTenant } from '../../middleware/tenantContext.js';
import { writeJuridicoAudit } from './audit.js';

const countingRules = new Set(['dias_corridos', 'meses']);
const eventTypes = new Set(['prorrogacao', 'suspensao', 'reinicio']);

function deadlineError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function tenantId() {
  const id = currentTenant()?.empresaId;
  if (!id) throw deadlineError('Contexto de empresa ausente', 401);
  return String(id);
}

function requireObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw deadlineError(`${label} invalido`);
  return String(value);
}

function parseDate(value, label) {
  if (!(value instanceof Date) && typeof value !== 'string') {
    throw deadlineError(`${label} invalida`);
  }
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw deadlineError(`${label} invalida`);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function parseDuration(duration, countingRule) {
  if (!duration || typeof duration !== 'object' || Array.isArray(duration)) {
    throw deadlineError('Duracao do prazo obrigatoria');
  }
  const { value, unit } = duration;
  if (!Number.isSafeInteger(value) || value < 1) throw deadlineError('Duracao deve ser um inteiro positivo');
  if (unit === 'dias_uteis' || countingRule === 'dias_uteis') {
    throw deadlineError('Dias uteis exigem calendario de feriados configurado');
  }
  if (!countingRules.has(unit)) throw deadlineError('Unidade de prazo nao suportada');
  if (!countingRules.has(countingRule)) throw deadlineError('Regra explicita de contagem obrigatoria');
  if (countingRule !== unit) throw deadlineError('Regra de contagem deve corresponder a unidade informada');
  return { value, unit };
}

function addDuration(date, duration) {
  const result = new Date(date.getTime());
  if (duration.unit === 'dias_corridos') {
    result.setUTCDate(result.getUTCDate() + duration.value);
  } else {
    const originalDay = result.getUTCDate();
    const targetMonth = result.getUTCMonth() + duration.value;
    result.setUTCDate(1);
    result.setUTCMonth(targetMonth);
    const lastDay = new Date(result.getTime());
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
    result.setUTCDate(Math.min(originalDay, lastDay.getUTCDate()));
  }
  if (!Number.isFinite(result.getTime())) throw deadlineError('Data final calculada fora do intervalo valido');
  return result;
}

function eventDate(event) {
  return parseDate(event.effectiveDate ?? event.dataEfetiva, 'Data efetiva do evento');
}

function eventDuration(event) {
  const duration = event.duration || {
    value: event.duracao,
    unit: event.unit || event.unidade
  };
  return parseDuration(duration, event.countingRule || event.regraContagem);
}

function orderEvents(events) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => (
      eventDate(left.event).getTime() - eventDate(right.event).getTime()
      || new Date(left.event.createdAt || 0).getTime() - new Date(right.event.createdAt || 0).getTime()
      || String(left.event._id || '').localeCompare(String(right.event._id || ''))
      || left.index - right.index
    ))
    .map(({ event }) => event);
}

export function calculateContractDeadline({
  baseDate,
  baseDuration,
  countingRule,
  confirmedDueDate,
  events = []
}) {
  if (!Array.isArray(events)) throw deadlineError('Lista de eventos invalida');
  let dueDate;
  const explanation = [];
  if (confirmedDueDate !== undefined) {
    if (baseDate !== undefined || baseDuration !== undefined || countingRule !== undefined) {
      throw deadlineError('Informe somente uma forma de prazo base');
    }
    dueDate = parseDate(confirmedDueDate, 'Data final confirmada');
    explanation.push({
      type: 'prazo_base',
      source: 'data_fim_confirmada',
      dueDate: new Date(dueDate)
    });
  } else {
    if (typeof countingRule !== 'string' || !countingRule) {
      throw deadlineError('Regra explicita de contagem obrigatoria');
    }
    const normalizedBaseDuration = parseDuration(baseDuration, countingRule);
    const normalizedBaseDate = parseDate(baseDate, 'Data base');
    dueDate = addDuration(normalizedBaseDate, normalizedBaseDuration);
    explanation.push({
      type: 'prazo_base',
      source: 'prazo_base_confirmado',
      effectiveDate: normalizedBaseDate,
      duration: normalizedBaseDuration,
      countingRule,
      dueDate: new Date(dueDate)
    });
  }

  for (const event of orderEvents(events)) {
    const type = event.type || event.tipo;
    if (!eventTypes.has(type)) throw deadlineError('Tipo de evento de prazo nao suportado');
    const effectiveDate = eventDate(event);
    const duration = eventDuration(event);
    const before = new Date(dueDate);
    dueDate = type === 'reinicio'
      ? addDuration(effectiveDate, duration)
      : addDuration(dueDate, duration);
    explanation.push({
      eventId: event._id ? String(event._id) : undefined,
      type,
      source: event.source || event.fonte,
      effectiveDate,
      duration,
      countingRule: event.countingRule || event.regraContagem,
      before,
      dueDate: new Date(dueDate)
    });
  }

  return { dueDate, explanation };
}

function calculationInput(base, events) {
  if (base.modo === 'data_fim_confirmada') {
    return { confirmedDueDate: base.dataFimConfirmada, events };
  }
  return {
    baseDate: base.dataBase,
    baseDuration: { value: base.duracao.valor, unit: base.duracao.unidade },
    countingRule: base.regraContagem,
    events
  };
}

async function inTransaction(callback) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

function snapshotProjection(projection) {
  return projection
    ? { dataFim: projection.dataFim, memoriaCalculo: projection.memoriaCalculo }
    : null;
}

function contractDeadlineSnapshot(contract) {
  return {
    _id: contract._id,
    numero: contract.numero,
    obra: contract.obra,
    dataFim: contract.dataFim,
    prazoBaseJuridico: contract.prazoBaseJuridico,
    prazoAtualJuridico: contract.prazoAtualJuridico
  };
}

export async function confirmContractDeadlineBase({
  actorId,
  contractId,
  baseDate,
  baseDuration,
  countingRule,
  confirmedEndDate
}) {
  const empresaId = tenantId();
  const actor = requireObjectId(actorId, 'Usuario');
  const contract = requireObjectId(contractId, 'Contrato');
  if (
    confirmedEndDate !== undefined
    && (baseDate !== undefined || baseDuration !== undefined || countingRule !== undefined)
  ) {
    throw deadlineError('Informe somente uma forma de prazo base');
  }
  const directDeadline = confirmedEndDate !== undefined
    ? parseDate(confirmedEndDate, 'Data final confirmada')
    : null;
  const normalizedBaseDate = directDeadline ? null : parseDate(baseDate, 'Data base');
  const normalizedDuration = directDeadline ? null : parseDuration(baseDuration, countingRule);
  const base = directDeadline
    ? { modo: 'data_fim_confirmada', dataFimConfirmada: directDeadline }
    : {
      modo: 'duracao',
      dataBase: normalizedBaseDate,
      duracao: normalizedDuration,
      regraContagem: countingRule
    };
  const calculation = calculateContractDeadline(
    directDeadline
      ? { confirmedDueDate: directDeadline, events: [] }
      : {
        baseDate: normalizedBaseDate,
        baseDuration: normalizedDuration,
        countingRule,
        events: []
      }
  );

  return inTransaction(async (session) => {
    const document = await Contrato.findById(contract).session(session);
    if (!document) throw deadlineError('Contrato nao encontrado', 404);
    if (document.prazoBaseJuridico) throw deadlineError('Prazo base ja confirmado', 409);
    const before = snapshotProjection(document.prazoAtualJuridico);
    document.prazoBaseJuridico = {
      ...base,
      ...(normalizedDuration ? {
        duracao: { valor: normalizedDuration.value, unidade: normalizedDuration.unit }
      } : {}),
      confirmadoPor: actor,
      confirmadoEm: new Date()
    };
    document.prazoAtualJuridico = {
      dataFim: calculation.dueDate,
      memoriaCalculo: calculation.explanation,
      atualizadoPor: actor,
      atualizadoEm: new Date()
    };
    await document.save({ session });
    await writeJuridicoAudit({
      actorId: actor,
      empresaId,
      action: 'prazo.base_confirmado',
      entityType: 'prazo_contrato',
      entityId: document._id,
      before,
      after: snapshotProjection(document.prazoAtualJuridico),
      origin: 'api',
      session
    });
    return {
      contract: contractDeadlineSnapshot(document),
      dueDate: calculation.dueDate,
      explanation: calculation.explanation
    };
  });
}

export async function appendDeadlineEvent({
  actorId,
  contractId,
  sourceDocumentId,
  type,
  effectiveDate,
  duration,
  unit,
  countingRule,
  source
}) {
  const empresaId = tenantId();
  const actor = requireObjectId(actorId, 'Usuario');
  const contractIdValue = requireObjectId(contractId, 'Contrato');
  if (!eventTypes.has(type)) throw deadlineError('Tipo de evento de prazo nao suportado');
  const normalizedDate = parseDate(effectiveDate, 'Data efetiva do evento');
  const normalizedDuration = parseDuration({ value: duration?.value, unit: duration?.unit || unit }, countingRule);
  if (typeof source !== 'string' || !source.trim() || source.trim().length > 500) {
    throw deadlineError('Fonte do evento obrigatoria');
  }
  const sourceDocument = sourceDocumentId
    ? requireObjectId(sourceDocumentId, 'Documento de origem')
    : undefined;

  return inTransaction(async (session) => {
    const contract = await Contrato.findById(contractIdValue).session(session);
    if (!contract) throw deadlineError('Contrato nao encontrado', 404);
    if (!contract.prazoBaseJuridico) throw deadlineError('Prazo base do contrato ainda nao foi confirmado', 409);
    if (sourceDocument) {
      const source = await DocumentoJuridico.findById(sourceDocument).session(session);
      if (!source || (source.obra && String(source.obra) !== String(contract.obra))) {
        throw deadlineError('Documento de origem nao encontrado', 404);
      }
    }
    const existingEvents = await EventoPrazoJuridico.find({ contrato: contract._id })
      .sort({ dataEfetiva: 1, createdAt: 1, _id: 1 })
      .session(session);
    const previous = calculateContractDeadline(calculationInput(contract.prazoBaseJuridico, existingEvents));
    const eventId = new mongoose.Types.ObjectId();
    const candidate = {
      _id: eventId,
      type,
      effectiveDate: normalizedDate,
      duration: normalizedDuration,
      countingRule,
      source: source.trim()
    };
    const calculation = calculateContractDeadline({
      ...calculationInput(contract.prazoBaseJuridico, existingEvents),
      events: [...existingEvents, candidate]
    });
    const [event] = await EventoPrazoJuridico.create([{
      _id: eventId,
      contrato: contract._id,
      ...(sourceDocument ? { documentoOrigem: sourceDocument } : {}),
      tipo: type,
      dataEfetiva: normalizedDate,
      duracao: normalizedDuration.value,
      unidade: normalizedDuration.unit,
      regraContagem: countingRule,
      fonte: source.trim(),
      registradoPor: actor,
      dataFimAnterior: previous.dueDate,
      dataFimResultante: calculation.dueDate,
      memoriaCalculo: calculation.explanation
    }], { session });

    const before = snapshotProjection(contract.prazoAtualJuridico);
    contract.prazoAtualJuridico = {
      dataFim: calculation.dueDate,
      memoriaCalculo: calculation.explanation,
      atualizadoPor: actor,
      atualizadoEm: new Date()
    };
    await contract.save({ session });
    await writeJuridicoAudit({
      actorId: actor,
      empresaId,
      action: 'prazo.evento_registrado',
      entityType: 'prazo_contrato',
      entityId: event._id,
      before,
      after: {
        ...snapshotProjection(contract.prazoAtualJuridico),
        tipo: event.tipo,
        dataEfetiva: event.dataEfetiva,
        duracao: event.duracao,
        unidade: event.unidade,
        regraContagem: event.regraContagem,
        fonte: event.fonte
      },
      origin: 'api',
      session
    });
    return {
      contract: contractDeadlineSnapshot(contract),
      event,
      dueDate: calculation.dueDate,
      explanation: calculation.explanation
    };
  });
}

export async function getContractDeadline(contractId) {
  tenantId();
  const id = requireObjectId(contractId, 'Contrato');
  const contract = await Contrato.findById(id);
  if (!contract) throw deadlineError('Contrato nao encontrado', 404);
  const events = await EventoPrazoJuridico.find({ contrato: id })
    .sort({ dataEfetiva: 1, createdAt: 1, _id: 1 });
  if (!contract.prazoBaseJuridico) {
    return { contract: contractDeadlineSnapshot(contract), events, dueDate: null, explanation: [] };
  }
  const calculation = calculateContractDeadline(calculationInput(contract.prazoBaseJuridico, events));
  return { contract: contractDeadlineSnapshot(contract), events, ...calculation };
}
