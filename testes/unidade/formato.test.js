// Formato da gravacao — Gravador v1, 09/11/2026.
// Defeito que este teste impede: o formato trocar sem decisao (o combinado e M4A/AAC, que abre em
// qualquer player e no celular; o Chrome 156 grava nativo). O teste de audio confere o arquivo real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATO_GRAVACAO, TIPO_ARQUIVO, EXTENSAO, BITS_POR_SEGUNDO } from '../../extensao/lib/formato.js';

test('formato: M4A com AAC a 96 kbps', () => {
  assert.equal(FORMATO_GRAVACAO, 'audio/mp4;codecs=mp4a.40.2');
  assert.equal(TIPO_ARQUIVO, 'audio/mp4');
  assert.equal(EXTENSAO, 'm4a');
  assert.equal(BITS_POR_SEGUNDO, 96000);
});
