import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarConfidence,
  comMetadadosConfianca,
  CONFIDENCE_THRESHOLD
} from '../../services/assistente/extratorFoto.js';

describe('OCR confidence helpers', () => {
  it('normaliza 0-1 e percentuais 0-100', () => {
    assert.equal(normalizarConfidence(0.82), 0.82);
    assert.equal(normalizarConfidence(85), 0.85);
    assert.equal(normalizarConfidence(-1), 0);
    assert.equal(normalizarConfidence(150), 1);
    assert.equal(normalizarConfidence('x'), 0.5);
  });

  it('marca lowConfidence abaixo do threshold', () => {
    const r = comMetadadosConfianca({ valor: 100, confidence: 0.4 });
    assert.equal(r.lowConfidence, true);
    assert.equal(r.exigeRevisao, true);
    assert.equal(r.threshold, CONFIDENCE_THRESHOLD);
  });

  it('não exige revisão se confidence alta e tem valor', () => {
    const r = comMetadadosConfianca({ valor: 50.5, confidence: 0.95 });
    assert.equal(r.lowConfidence, false);
    assert.equal(r.exigeRevisao, false);
  });

  it('modo demo não marca lowConfidence', () => {
    const r = comMetadadosConfianca({ valor: 10, confidence: 0.2, isDemo: true });
    assert.equal(r.isDemo, true);
    assert.equal(r.lowConfidence, false);
  });
});
