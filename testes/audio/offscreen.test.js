// O offscreen.js de verdade num Chrome sem cabeca, com o Chrome da extensao falso por fora
// (pagina-offscreen.js) — Gravador v1, achados da revisao de 09/11/2026.
// Defeitos que este teste impede:
// - fluxo inteiro quebrado (iniciar > gravando > parar > arquivo entregue > salvo > parado), com as
//   vozes nos canais certos;
// - aba fechada durante o inicio: a gravacao seguia "gravando" para sempre (evento perdido);
// - aba fechada no meio: a gravacao tem de parar e ser entregue sozinha;
// - microfone negado: a captura da aba ficava aberta (aba muda para o usuario);
// - falha do IndexedDB depois do Parar: a maquina ficava presa em "salvando" e nada mais gravava;
// - download recusado: a copia de seguranca tem de ficar (pendente) e poder ser salva depois;
// - conclusao de gravacao que o offscreen nao conhece (recriado no meio do download): "salvo" nao
//   apagava a copia e ela voltava na lista, gerando arquivo duplicado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ferramentaQueFalta, iniciarAmbiente } from './ambiente-chrome.js';
import { sondar, decodificar, amplitude } from './analise-audio.js';

const falta = ferramentaQueFalta();
const opcoes = { skip: falta || false, timeout: 90000 };
const PRESENTE = 0.1;
const AUSENTE = 0.01;

let ambiente;
let pasta;
let c;

before(async () => {
  if (falta) return;
  pasta = mkdtempSync(path.join(tmpdir(), 'gravador-offscreen-'));
  ambiente = await iniciarAmbiente('/testes/audio/pagina-offscreen.html');
  c = await ambiente.avaliar('window.rodarCenarios()');
}, { timeout: 90000 });

after(async () => {
  await ambiente?.encerrar();
  if (pasta) rmSync(pasta, { recursive: true, force: true });
});

test('offscreen: fluxo inteiro iniciar > gravando > parar > entregue > salvo > parado', opcoes, () => {
  const f = c.fluxoCompleto;
  assert.deepEqual(f.inicio, { ok: true, origem: 'WhatsApp', nome: 'Gravacoes de Chamadas/a.m4a' });
  assert.equal(f.gravando.estado, 'gravando');
  assert.equal(f.gravando.tabId, 7);
  assert.equal(f.parar.ok, true);
  assert.equal(f.nomeEntregue, 'Gravacoes de Chamadas/a.m4a');
  assert.equal(f.salvando.estado, 'salvando');
  assert.deepEqual(f.salvando.emEntrega, [f.idGravacao]);
  assert.deepEqual(f.situacaoAntes, [{ id: f.idGravacao, situacao: 'salvando' }]);
  assert.deepEqual(f.fim, { estado: 'parado', tabId: null, emEntrega: [], niveis: null });
  assert.deepEqual(f.gravacoesDepois, []);
  assert.deepEqual(f.estadosAvisados, ['iniciando', 'gravando', 'salvando', 'parado']);
});

test('offscreen: medidores medem cada lado durante a gravacao', opcoes, () => {
  const n = c.fluxoCompleto.gravando.niveis;
  assert.ok(n.voce > 0.25 && n.voce < 0.35, 'voce: ' + n.voce);
  assert.ok(n.cliente > 0.25 && n.cliente < 0.35, 'cliente: ' + n.cliente);
});

test('offscreen: arquivo entregue tem a voce so na esquerda e o cliente so na direita', opcoes, () => {
  const arquivo = path.join(pasta, 'offscreen.m4a');
  writeFileSync(arquivo, Buffer.from(c.fluxoCompleto.arquivo, 'base64'));
  const info = sondar(arquivo);
  assert.equal(info.codec, 'aac');
  assert.equal(info.canais, 2);
  const [esquerdo, direito] = decodificar(arquivo, 2);
  assert.ok(amplitude(esquerdo, 440, 0.75) > PRESENTE, 'voce ausente na esquerda');
  assert.ok(amplitude(esquerdo, 1000, 0.75) < AUSENTE, 'cliente vazando na esquerda');
  assert.ok(amplitude(direito, 1000, 0.75) > PRESENTE, 'cliente ausente na direita');
  assert.ok(amplitude(direito, 440, 0.75) < AUSENTE, 'voce vazando na direita');
});

test('offscreen: aba fechada durante o inicio recusa e volta para parado sem sobra', opcoes, () => {
  const a = c.abaFechadaDuranteInicio;
  assert.equal(a.inicio.ok, false);
  assert.equal(a.inicio.motivo, 'captura-aba');
  assert.equal(a.fim.estado, 'parado');
  assert.deepEqual(a.gravacoes, []);
});

test('offscreen: aba fechada no meio para, entrega o arquivo e volta para parado', opcoes, () => {
  const a = c.abaFechadaGravando;
  assert.equal(a.recebeuArquivo, true);
  assert.equal(a.fim.estado, 'parado');
  assert.deepEqual(a.gravacoes, []);
});

test('offscreen: microfone negado recusa com o motivo certo e solta a captura da aba', opcoes, () => {
  const m = c.microfoneNegado;
  assert.equal(m.inicio.ok, false);
  assert.equal(m.inicio.motivo, 'microfone');
  assert.equal(m.fim.estado, 'parado');
  assert.equal(m.abaSolta, 'ended');
  assert.deepEqual(m.gravacoes, []);
});

test('offscreen: falha do armazem ao parar e ao concluir nao prende a maquina em salvando', opcoes, () => {
  const a = c.armazemFalhandoAoParar;
  assert.equal(a.parar.ok, true);
  assert.equal(a.recebeuArquivo, true);
  assert.equal(a.fim.estado, 'parado');
});

test('offscreen: download recusado guarda a copia como pendente e ela pode ser salva depois', opcoes, () => {
  const s = c.swRecusaEDepoisRecupera;
  assert.deepEqual(s.parar, { ok: false, motivo: 'salvar', detalhe: 'download recusado (falso)' });
  assert.equal(s.fim.estado, 'parado');
  assert.equal(s.guardadas.length, 1);
  assert.equal(s.guardadas[0].situacao, 'pendente');
  assert.equal(s.recuperar.ok, true);
  assert.equal(s.nomeRecuperado, 'Gravacoes de Chamadas/a.m4a');
  assert.deepEqual(s.gravacoesDepois, []);
});

test('offscreen: salvo de gravacao desconhecida apaga a copia; falha marca pendente', opcoes, () => {
  assert.deepEqual(c.conclusaoDeGravacaoDesconhecida.depois, [{ id: 'antiga-falhou', situacao: 'pendente' }]);
});
