import Lancamento from '../../models/Lancamento.js';
import Obra from '../../models/Obra.js';
import Contrato from '../../models/Contrato.js';
import Certidao from '../../models/Certidao.js';
import Colaborador from '../../models/Colaborador.js';
import Etapa from '../../models/Etapa.js';
import { incluirProgressoObras } from '../../utils/progressoObra.js';

const fmtMoeda = (v) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

/** Normaliza args vindos do LLM (objeto) ou chamada direta. */
function pickOpts(arg, defaults = {}) {
  if (arg == null) return { ...defaults };
  if (typeof arg === 'object' && !Array.isArray(arg)) {
    return { ...defaults, ...arg };
  }
  return { ...defaults };
}

async function obrasIdsDaEmpresa(empresaId) {
  if (!empresaId) return null;
  return Obra.find({ empresa: empresaId }).distinct('_id');
}

export async function resumoDoDia(arg) {
  const { empresaId } = pickOpts(arg);
  const opts = { empresaId };
  const [contasPagar, contasReceber, etapas, obras, certidoes, documentos] = await Promise.all([
    contasAPagarVencendo({ ...opts, dias: 7 }),
    contasAReceberAtrasadas(opts),
    etapasVencendo({ ...opts, dias: 5 }),
    obrasAtrasadas(opts),
    certidoesVencendo({ ...opts, dias: 15 }),
    documentosRHVencendo(opts)
  ]);

  return {
    contasPagar,
    contasReceber,
    etapas,
    obras,
    certidoes,
    documentos,
    totalAlertas:
      contasPagar.itens.length +
      contasReceber.itens.length +
      etapas.itens.length +
      obras.itens.length +
      certidoes.itens.length +
      documentos.itens.length
  };
}

export async function contasAPagarVencendo(arg) {
  const { empresaId, dias = 7 } = pickOpts(arg, { dias: 7 });
  const nDias = Number(dias) || 7;
  const hoje = new Date();
  const limite = new Date();
  limite.setUTCDate(limite.getUTCDate() + nDias);
  limite.setUTCHours(23, 59, 59, 999);

  const filtro = {
    tipo: 'pagar',
    status: { $ne: 'pago' },
    dataVencimento: { $gte: hoje, $lte: limite }
  };
  if (empresaId) filtro.empresa = empresaId;

  const lancamentos = await Lancamento.find(filtro)
    .populate('obra', 'nome codigo')
    .populate('fornecedorVinculado', 'nome')
    .select('descricao valor dataVencimento status categoria obra fornecedor fornecedorVinculado')
    .sort({ dataVencimento: 1 });

  const fontes = lancamentos.map((l) => ({
    tipo: 'lancamento',
    referenciaId: l._id,
    nome: l.descricao
  }));

  return {
    fontes,
    itens: lancamentos.map((l) => ({
      _id: l._id,
      fornecedor: l.fornecedor || l.fornecedorVinculado?.nome || 'Não informado',
      valor: fmtMoeda(l.valor),
      dataVencimento: l.dataVencimento,
      diasVencimento: Math.ceil((l.dataVencimento - hoje) / 86400000),
      status: l.status,
      obra: l.obra?.nome || '',
      categoria: l.categoria || ''
    }))
  };
}

export async function contasAReceberAtrasadas(arg) {
  const { empresaId } = pickOpts(arg);
  const hoje = new Date();

  const filtro = {
    tipo: 'receber',
    status: { $in: ['pendente', 'atrasado'] },
    dataVencimento: { $lt: hoje }
  };
  if (empresaId) filtro.empresa = empresaId;

  const lancamentos = await Lancamento.find(filtro)
    .populate('obra', 'nome codigo')
    .populate('cliente', 'nome')
    .select('descricao valor dataVencimento status categoria obra cliente')
    .sort({ dataVencimento: 1 });

  const fontes = lancamentos.map((l) => ({
    tipo: 'lancamento',
    referenciaId: l._id,
    nome: l.descricao
  }));

  return {
    fontes,
    itens: lancamentos.map((l) => ({
      _id: l._id,
      cliente: l.cliente?.nome || l.obra?.nome || 'Não informado',
      valor: fmtMoeda(l.valor),
      dataVencimento: l.dataVencimento,
      diasAtraso: Math.abs(Math.floor((hoje - l.dataVencimento) / 86400000)),
      status: l.status
    }))
  };
}

export async function etapasVencendo(arg) {
  const { empresaId, dias = 15 } = pickOpts(arg, { dias: 15 });
  const nDias = Number(dias) || 15;
  const hoje = new Date();
  const limite = new Date();
  limite.setUTCDate(limite.getUTCDate() + nDias);
  limite.setUTCHours(23, 59, 59, 999);

  const filtro = {
    status: { $ne: 'concluida' },
    prazoEntrega: { $gte: hoje, $lte: limite }
  };

  if (empresaId) {
    const ids = await obrasIdsDaEmpresa(empresaId);
    filtro.obra = { $in: ids };
  }

  const etapas = await Etapa.find(filtro)
    .populate('obra', 'nome codigo')
    .populate('contrato', 'numero')
    .select('descricao unidade quantidadeTotal quantidadeMedida precoUnitario status prazoEntrega')
    .sort({ prazoEntrega: 1 });

  const fontes = etapas.map((e) => ({
    tipo: 'etapa',
    referenciaId: e._id,
    nome: e.descricao
  }));

  return {
    fontes,
    itens: etapas.map((e) => ({
      _id: e._id,
      contrato: e.contrato?.numero || '',
      obra: e.obra?.nome || '',
      descricao: e.descricao,
      dataPrevista: e.prazoEntrega,
      valor: fmtMoeda(e.precoUnitario * e.quantidadeTotal),
      diasRestantes: Math.ceil((e.prazoEntrega - hoje) / 86400000)
    }))
  };
}

export async function obrasAtrasadas(arg) {
  const { empresaId } = pickOpts(arg);
  const hoje = new Date();

  const filtro = {
    status: 'em_andamento',
    dataPrevisaoFim: { $exists: true, $ne: null }
  };
  if (empresaId) filtro.empresa = empresaId;

  const obras = await Obra.find(filtro).select(
    'nome codigo status valorOrcamento dataInicio dataPrevisaoFim'
  );

  const obrasProgresso = await incluirProgressoObras(obras);

  const atrasadas = obrasProgresso.filter((obra) => {
    const fim = obra.dataPrevisaoFim ? new Date(obra.dataPrevisaoFim).getTime() : 0;
    if (!fim || fim >= Date.now()) return false;
    const inicio = obra.dataInicio ? new Date(obra.dataInicio).getTime() : 0;
    if (!inicio || Date.now() <= inicio) return false;
    const esperado = Math.min(100, ((Date.now() - inicio) / (fim - inicio)) * 100);
    const atraso = esperado - (Number(obra.percentualConclusao) || 0);
    return atraso > 5;
  });

  const fontes = atrasadas.map((o) => ({
    tipo: 'obra',
    referenciaId: o._id,
    nome: o.nome
  }));

  return {
    fontes,
    itens: atrasadas.map((o) => ({
      _id: o._id,
      nome: o.nome,
      codigo: o.codigo,
      percentualConclusao: o.percentualConclusao || 0,
      percentualFinanceiro: o.percentualFinanceiro || 0,
      dataPrevisaoFim: o.dataPrevisaoFim,
      atrasoDias: Math.ceil((hoje - new Date(o.dataPrevisaoFim)) / 86400000)
    }))
  };
}

export async function certidoesVencendo(arg) {
  const { empresaId, dias = 30 } = pickOpts(arg, { dias: 30 });
  const nDias = Number(dias) || 30;
  const hoje = new Date();
  const limite = new Date();
  limite.setUTCDate(limite.getUTCDate() + nDias);

  const filtro = {
    dataVencimento: { $gte: hoje, $lte: limite }
  };
  if (empresaId) filtro.empresa = empresaId;

  const certidoes = await Certidao.find(filtro).sort({ dataVencimento: 1 });

  const fontes = certidoes.map((c) => ({
    tipo: 'certidao',
    referenciaId: c._id,
    nome: c.nome
  }));

  return {
    fontes,
    itens: certidoes.map((c) => ({
      _id: c._id,
      tipo: c.tipo,
      nome: c.nome,
      dataVencimento: c.dataVencimento,
      diasRestantes: Math.ceil((c.dataVencimento - hoje) / 86400000)
    }))
  };
}

export async function documentosRHVencendo(arg) {
  const { empresaId } = pickOpts(arg);
  const hoje = new Date();

  const filtro = { status: 'ativo' };
  if (empresaId) filtro.empresa = empresaId;

  const colaboradores = await Colaborador.find(filtro)
    .select('nome funcao documentos')
    .sort({ nome: 1 });

  const itens = [];
  const fontes = [];

  for (const col of colaboradores) {
    for (const doc of col.documentos || []) {
      if (!doc.validade) continue;
      const validade = new Date(doc.validade);
      const diff = Math.ceil((validade - hoje) / 86400000);
      if (diff <= 30) {
        const status =
          doc.status || (diff < 0 ? 'vencido' : diff <= 7 ? 'vence_em_breve' : 'atencao');
        itens.push({
          _id: col._id,
          colaborador: col.nome,
          funcao: col.funcao,
          tipoDoc: doc.tipo,
          nomeDoc: doc.nome,
          dataValidade: doc.validade,
          status,
          diasRestantes: diff
        });
        fontes.push({
          tipo: 'colaborador',
          referenciaId: col._id,
          nome: `${col.nome} — ${doc.nome}`
        });
      }
    }
  }

  itens.sort((a, b) => a.diasRestantes - b.diasRestantes);

  return { fontes, itens };
}

export async function medicoesPendentes(arg) {
  const { empresaId } = pickOpts(arg);

  const filtro = { status: { $in: ['nao_iniciada', 'em_andamento'] } };
  if (empresaId) {
    const ids = await obrasIdsDaEmpresa(empresaId);
    filtro.obra = { $in: ids };
  }

  const etapas = await Etapa.find(filtro)
    .populate('obra', 'nome codigo')
    .select('descricao quantidadeTotal quantidadeMedida unidade')
    .sort({ createdAt: 1 });

  const fontes = etapas.map((e) => ({
    tipo: 'etapa',
    referenciaId: e._id,
    nome: `${e.obra?.nome || ''} — ${e.descricao}`
  }));

  return {
    fontes,
    itens: etapas.map((e) => ({
      _id: e._id,
      obra: e.obra?.nome || '',
      etapa: e.descricao,
      unidade: e.unidade,
      total: e.quantidadeTotal,
      medido: e.quantidadeMedida,
      faltando: Number(e.quantidadeTotal) - Number(e.quantidadeMedida),
      percentual:
        Number(e.quantidadeTotal) > 0
          ? Math.round((e.quantidadeMedida / e.quantidadeTotal) * 100)
          : 0
    }))
  };
}
