// Avisos pendentes do icone — 2a rodada de revisao (09/11/2026).
// Defeitos que estes testes impedem: um aviso pendente apagando outro nao lido (era uma vaga so);
// "nao salva" sumindo so porque a janelinha abriu, com a gravacao ainda por salvar; aviso
// informativo ficando para sempre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comPendente, semPendentes, depoisDeVisto } from '../../extensao/lib/pendentes.js';

test('pendentes: um aviso novo entra sem apagar o anterior e sem repetir', () => {
  assert.deepEqual(comPendente(['nao-salva'], 'gravador-parou'), ['nao-salva', 'gravador-parou']);
  assert.deepEqual(comPendente(['nao-salva'], 'nao-salva'), ['nao-salva']);
  assert.deepEqual(comPendente([], 'nao-salva-memoria'), ['nao-salva-memoria']);
});

test('pendentes: resolver tira so os codigos resolvidos', () => {
  assert.deepEqual(semPendentes(['nao-salva', 'gravador-parou', 'nao-salva-memoria'], ['nao-salva', 'nao-salva-memoria']), ['gravador-parou']);
});

test('pendentes: abrir a janelinha tira os informativos e mantem os que ainda pedem acao', () => {
  assert.deepEqual(depoisDeVisto(['nao-salva', 'gravador-parou', 'nao-salva-memoria', 'nao-salva-perdida']), ['nao-salva', 'nao-salva-memoria']);
});
