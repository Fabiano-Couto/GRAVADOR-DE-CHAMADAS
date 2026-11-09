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
//   apagava a copia e ela voltava na lista, gerando arquivo duplicado;
// - (revisao de seguranca) microfone e captura da aba abertos depois do Parar; endereco blob da
//   gravacao nunca liberado; politica de seguranca que nao bloqueia conexao de verdade.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ferramentaQueFalta, iniciarAmbiente } from './ambiente-chrome.js';
import { sondar, decodificar, amplitude, duracaoS } from './analise-audio.js';

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

test('offscreen: depois do Parar o microfone e a captura da aba estao fechados', opcoes, () => {
  const f = c.fluxoCompleto;
  assert.deepEqual(f.trilhasGravando, { aba: 'live', mic: 'live' });
  assert.deepEqual(f.trilhasDepoisDoParar, { aba: 'ended', mic: 'ended' });
  assert.equal(c.abaFechadaGravando.micDepois, 'ended');
});

test('offscreen: o endereco blob so e liberado quando o salvamento termina', opcoes, () => {
  assert.equal(c.fluxoCompleto.revogadoAntesDoSalvo, false);
  assert.equal(c.fluxoCompleto.revogadoDepoisDoSalvo, true);
});

test('politica de seguranca do manifest: o Chrome bloqueia conexao (ate para o proprio servidor)', opcoes, () => {
  assert.equal(c.politicaBloqueiaConexao.fetchBloqueado, true);
});

// Pergunta do usuario na conferencia local (09/11/2026): "nao lembro se foi o microfone do
// computador ou o do headset". A janelinha mostra o nome do microfone que de fato abriu.
test('offscreen: informa o nome do microfone que esta sendo gravado', opcoes, () => {
  assert.equal(c.fluxoCompleto.microfone, 'Microfone de Teste (Headset falso)');
});

test('offscreen: medidores medem cada lado durante a gravacao', opcoes, () => {
  const n = c.fluxoCompleto.gravando.niveis;
  assert.ok(n.voce > 0.25 && n.voce < 0.35, 'voce: ' + n.voce);
  assert.ok(n.cliente > 0.25 && n.cliente < 0.35, 'cliente: ' + n.cliente);
});

// Mede no ULTIMO segundo do arquivo. Com a maquina ocupada (suite em paralelo), o microfone falso
// do teste (criado por ultimo, noutro contexto de audio) comecou a soar tarde: medido em
// 09/11/2026, voz 0,11986 na janela fixa de 0,75 s contra 0,30 normal, e uma falha da suite. O
// fim do arquivo ja esta em regime.
test('offscreen: arquivo entregue tem a voce so na esquerda e o cliente so na direita', opcoes, () => {
  const arquivo = path.join(pasta, 'offscreen.m4a');
  writeFileSync(arquivo, Buffer.from(c.fluxoCompleto.arquivo, 'base64'));
  const info = sondar(arquivo);
  assert.equal(info.codec, 'aac');
  assert.equal(info.canais, 2);
  const [esquerdo, direito] = decodificar(arquivo, 2);
  const inicioDaJanela = duracaoS(esquerdo) - 1.1;
  assert.ok(inicioDaJanela >= 1, 'arquivo curto demais: ' + duracaoS(esquerdo) + ' s');
  const medir = (canal, freq) => amplitude(canal, freq, inicioDaJanela);
  assert.ok(medir(esquerdo, 440) > PRESENTE, 'voce ausente na esquerda: ' + medir(esquerdo, 440));
  assert.ok(medir(esquerdo, 1000) < AUSENTE, 'cliente vazando na esquerda: ' + medir(esquerdo, 1000));
  assert.ok(medir(direito, 1000) > PRESENTE, 'cliente ausente na direita: ' + medir(direito, 1000));
  assert.ok(medir(direito, 440) < AUSENTE, 'voce vazando na direita: ' + medir(direito, 440));
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

// ---- achados da revisao de defeito (09/11/2026) ----

test('offscreen: download concluido e copia que nao apagou fica marcada salva (nao volta como nao salva)', opcoes, () => {
  const a = c.armazemFalhandoAoParar;
  assert.equal(a.copiaQueSobrou.length, 1);
  assert.equal(a.copiaQueSobrou[0].situacao, 'salva');
});

test('offscreen: com som nos dois lados nao ha aviso; com os dois mudos avisa microfone e aba', opcoes, () => {
  const a = c.avisos;
  assert.deepEqual(a.comSom, []);
  assert.deepEqual([...a.mudos].sort(), ['aba-muda', 'microfone-mudo']);
  assert.deepEqual([...a.ultimoAvisado].sort(), ['aba-muda', 'microfone-mudo']);
});

test('offscreen: sem copia de seguranca grava mesmo assim, avisa e entrega o arquivo', opcoes, () => {
  const s = c.semCopiaDeSeguranca;
  assert.equal(s.inicio.ok, true);
  assert.equal(s.estadoDurante, 'gravando');
  assert.deepEqual(s.alertas, ['sem-copia']);
  assert.equal(s.parar.ok, true);
  assert.ok(s.bytes > 1000, 'arquivo vazio: ' + s.bytes);
  assert.equal(s.fim.estado, 'parado');
  assert.deepEqual(s.gravacoes, []);
});

test('offscreen: erro do gravador no meio para sozinho, entrega o arquivo e deixa aviso pendente', opcoes, () => {
  const g = c.gravadorComErro;
  assert.equal(g.recebeuArquivo, true);
  assert.deepEqual(g.avisos, ['gravador-parou']);
  assert.equal(g.fim.estado, 'parado');
});

test('offscreen: recuperar interrompida que falha continua gravando e salva depois com _recuperada', opcoes, () => {
  const r = c.recuperarInterrompidaQueFalha;
  assert.equal(r.primeira.ok, false);
  assert.deepEqual(r.depoisDaFalha, [{ id: 'interrompida', situacao: 'gravando' }]);
  assert.equal(r.segunda.ok, true);
  assert.equal(r.nome, 'Gravacoes de Chamadas/b_recuperada.m4a');
  assert.deepEqual(r.gravacoesDepois, []);
});

test('offscreen: aba fechada no ultimo instante do inicio salva o que houver e volta para parado', opcoes, () => {
  const a = c.abaFechadaNoUltimoInstante;
  assert.equal(a.inicio.ok, true);
  assert.equal(a.recebeuArquivo, true);
  assert.equal(a.fim.estado, 'parado');
  assert.deepEqual(a.gravacoes, []);
});

test('offscreen: falha depois de registrar a gravacao nao deixa sobra no armazem', opcoes, () => {
  const f = c.falhaDepoisDeRegistrar;
  assert.equal(f.inicio.ok, false);
  assert.equal(f.inicio.motivo, 'interno');
  assert.equal(f.fim.estado, 'parado');
  assert.deepEqual(f.gravacoes, []);
});

// ---- 2a rodada de revisao (09/11/2026) ----

test('offscreen: sem copia e download falhando, a gravacao fica na memoria, avisa e pode ser salva', opcoes, () => {
  const s = c.semCopiaEDownloadFalha;
  assert.equal(s.parar.ok, false);
  assert.equal(s.estadoDepois, 'parado');
  assert.deepEqual(s.naMemoria, [{ situacao: 'memoria', nome: 'Gravacoes de Chamadas/a.m4a' }]);
  assert.deepEqual(s.avisos, ['nao-salva-memoria']);
  assert.ok(s.bytesOriginais > 1000, 'arquivo original vazio: ' + s.bytesOriginais);
  assert.equal(s.recuperar.ok, true);
  assert.equal(s.bytesRecuperados, s.bytesOriginais);
  assert.equal(s.naMemoriaNoFim, 0);
  assert.equal(s.limpouPendente, true);
  assert.deepEqual(s.gravacoes, []);
});

test('offscreen: sem copia no inicio, armazem de volta na falha: a gravacao e guardada nele', opcoes, () => {
  const s = c.semCopiaArmazemVolta;
  assert.deepEqual(s.avisos, ['nao-salva']);
  assert.equal(s.guardadas.length, 1);
  assert.equal(s.guardadas[0].situacao, 'pendente');
  assert.equal(s.naMemoria, 0);
  assert.equal(s.recuperar.ok, true);
  assert.ok(s.bytes > 1000, 'arquivo recuperado vazio: ' + s.bytes);
  assert.deepEqual(s.gravacoesDepois, []);
});

test('offscreen: o aviso de nao salva so e limpo quando nao sobra nada por salvar', opcoes, () => {
  assert.deepEqual(c.limparAvisoSoNoFim, { limpouNoPrimeiro: false, limpouNoSegundo: true });
});

// ---- 3a rodada de revisao (09/11/2026) ----

test('offscreen: armazem quebrado do inicio ao fim: salvar da memoria limpa o aviso "so na memoria"', opcoes, () => {
  const a = c.armazemQuebradoDoInicioAoFim;
  assert.equal(a.naMemoria1, 1);
  assert.equal(a.recebeu, true);
  assert.deepEqual(a.limpouAoSalvar, [['nao-salva-memoria']]);
});

test('offscreen: descartar da memoria funciona com o armazem quebrado e limpa o aviso', opcoes, () => {
  const a = c.armazemQuebradoDoInicioAoFim;
  assert.equal(a.naMemoria2, 1);
  assert.deepEqual(a.descartar, { ok: true });
  assert.equal(a.naMemoriaFim, 0);
  assert.deepEqual(a.limpouAoDescartar, [['nao-salva-memoria']]);
});

test('offscreen: copia com buraco e download falhando: fica guardado o arquivo inteiro', opcoes, () => {
  const b = c.copiaComBuraco;
  assert.equal(b.furou, true, 'a fatia falsa nao chegou a falhar: o cenario nao testou nada');
  assert.equal(b.guardadas, 1);
  assert.ok(b.bytesOriginais > 1000, 'original vazio: ' + b.bytesOriginais);
  assert.equal(b.bytesRecuperados, b.bytesOriginais);
});

test('offscreen: registro sem audio e apagado; a gravacao fica so na memoria, uma vez', opcoes, () => {
  assert.deepEqual(c.registroSemAudio, { naMemoria: 1, noArmazem: [] });
});

test('offscreen: Parar duplo ao mesmo tempo salva uma vez e manda o outro aguardar', opcoes, () => {
  const p = c.pararDuplo;
  assert.deepEqual(p.respostas.map((r) => (r.ok ? 'ok' : r.motivo)).sort(), ['aguardar', 'ok']);
  assert.equal(p.fim.estado, 'parado');
});
