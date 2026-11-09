// Maquina de estados da gravacao — Gravador v1, 09/11/2026.
// Defeitos que estes testes impedem: Parar apertado duas vezes gerando dois arquivos; uma segunda
// aba comecando a gravar por cima da primeira; clique durante o salvamento parando ou iniciando algo
// errado; gravacao em andamento aparecendo como "interrompida" para recuperar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarMaquina, decidirAlternar, gravacoesParaRecuperar } from '../../extensao/lib/estado.js';

test('maquina: comeca parada e sem aba', () => {
  const m = criarMaquina();
  assert.equal(m.estado, 'parado');
  assert.equal(m.tabId, null);
});

test('maquina: caminho feliz parado > iniciando > gravando > salvando > parado', () => {
  const m = criarMaquina();
  assert.equal(m.pedirInicio(7), true);
  assert.equal(m.estado, 'iniciando');
  assert.equal(m.tabId, 7);
  assert.equal(m.confirmarInicio(), true);
  assert.equal(m.estado, 'gravando');
  assert.equal(m.pedirParada(), true);
  assert.equal(m.estado, 'salvando');
  assert.equal(m.concluirSalvamento(), true);
  assert.equal(m.estado, 'parado');
  assert.equal(m.tabId, null);
});

test('maquina: Parar apertado duas vezes so aceita o primeiro (um arquivo so)', () => {
  const m = criarMaquina();
  m.pedirInicio(7);
  m.confirmarInicio();
  assert.equal(m.pedirParada(), true);
  assert.equal(m.pedirParada(), false);
  assert.equal(m.estado, 'salvando');
});

test('maquina: Parar sem nada gravando e recusado', () => {
  const m = criarMaquina();
  assert.equal(m.pedirParada(), false);
  assert.equal(m.estado, 'parado');
});

test('maquina: pedir inicio durante uma gravacao e recusado e nao troca a aba', () => {
  const m = criarMaquina();
  m.pedirInicio(7);
  m.confirmarInicio();
  assert.equal(m.pedirInicio(9), false);
  assert.equal(m.estado, 'gravando');
  assert.equal(m.tabId, 7);
});

test('maquina: falha ao iniciar volta para parado e solta a aba', () => {
  const m = criarMaquina();
  m.pedirInicio(7);
  assert.equal(m.falharInicio(), true);
  assert.equal(m.estado, 'parado');
  assert.equal(m.tabId, null);
});

test('alternar: parado inicia', () => {
  assert.equal(decidirAlternar('parado', null, 7), 'iniciar');
});

test('alternar: gravando a mesma aba para', () => {
  assert.equal(decidirAlternar('gravando', 7, 7), 'parar');
});

test('alternar: gravando outra aba recusa', () => {
  assert.equal(decidirAlternar('gravando', 7, 9), 'recusar-outra-aba');
});

test('alternar: iniciando ou salvando manda aguardar', () => {
  assert.equal(decidirAlternar('iniciando', 7, 7), 'aguardar');
  assert.equal(decidirAlternar('salvando', 7, 7), 'aguardar');
});

test('recuperar: lista as gravacoes que sobraram, mais nova primeiro, sem as ocupadas agora', () => {
  const lista = [
    { id: 'a', inicio: 1000, situacao: 'gravando' },
    { id: 'b', inicio: 3000, situacao: 'pendente' },
    { id: 'c', inicio: 2000, situacao: 'gravando' },
    { id: 'd', inicio: 4000, situacao: 'salvando' },
  ];
  // c gravando agora, d sendo salva agora: nenhuma das duas aparece
  assert.deepEqual(gravacoesParaRecuperar(lista, ['c', 'd']).map((g) => g.id), ['b', 'a']);
  assert.deepEqual(gravacoesParaRecuperar(lista, []).map((g) => g.id), ['d', 'b', 'c', 'a']);
  assert.deepEqual(gravacoesParaRecuperar([], []), []);
});
