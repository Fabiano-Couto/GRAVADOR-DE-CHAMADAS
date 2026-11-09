// Audio de verdade num Chrome sem cabeca — Gravador v1, 09/11/2026.
// Usa os MESMOS modulos da extensao (lib/mixer.js, lib/gravador.js, lib/armazem.js) com dois tons:
// 440 Hz no lugar do microfone ("voce") e 1000 Hz no lugar da aba ("cliente").
// Defeitos que este teste impede:
// - vozes trocadas de canal ou misturadas (decisao do usuario: esquerdo = voce, direito = cliente);
// - o usuario deixar de ouvir o cliente durante a gravacao (o Chrome emudece a aba capturada e o
//   mixer precisa devolver o som ao alto-falante);
// - o usuario ouvir a propria voz no alto-falante;
// - arquivo em outro formato que nao M4A/AAC estereo;
// - fatia perdida no caminho para o armazem; armazem que nao apaga depois de salvar;
// - Chrome que fecha no meio levando a gravacao junto (a recuperacao monta o que ficou guardado).
// Limites "presente > 0,1" e "ausente < 0,01" para tons gravados a 0,3 (AAC/Opus nao devolvem o
// valor exato); a duracao tem folga porque depende do relogio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ferramentaQueFalta, iniciarAmbiente } from './ambiente-chrome.js';
import { sondar, decodificar, amplitude, duracaoS } from './analise-audio.js';

const PRESENTE = 0.1;
const AUSENTE = 0.01;
const falta = ferramentaQueFalta();
const opcoes = { skip: falta || false, timeout: 60000 };

let ambiente;
let pasta;
let gravacao;
let recuperacao;
let lento;
let falho;
const arquivos = {};

before(async () => {
  if (falta) return;
  pasta = mkdtempSync(path.join(tmpdir(), 'gravador-audio-'));
  ambiente = await iniciarAmbiente();
  gravacao = await ambiente.avaliar('window.testeGravacao()');
  recuperacao = await ambiente.avaliar('window.testeRecuperacao()');
  lento = await ambiente.avaliar('window.testeArmazemLento()');
  falho = await ambiente.avaliar('window.testeArmazemFalho()');
  arquivos.final = path.join(pasta, 'final.m4a');
  arquivos.falho = path.join(pasta, 'falho.m4a');
  writeFileSync(arquivos.falho, Buffer.from(falho.arquivo, 'base64'));
  arquivos.monitor = path.join(pasta, 'monitor.webm');
  arquivos.recuperado = path.join(pasta, 'recuperado.m4a');
  writeFileSync(arquivos.final, Buffer.from(gravacao.arquivo, 'base64'));
  writeFileSync(arquivos.monitor, Buffer.from(gravacao.monitor, 'base64'));
  writeFileSync(arquivos.recuperado, Buffer.from(recuperacao.arquivo, 'base64'));
}, { timeout: 60000 });

after(async () => {
  await ambiente?.encerrar();
  if (pasta) rmSync(pasta, { recursive: true, force: true });
});

test('gravacao: arquivo M4A com AAC, 2 canais, cerca de 3 s', opcoes, () => {
  assert.equal(gravacao.erroArmazem, null);
  assert.equal(gravacao.tipo, 'audio/mp4');
  const info = sondar(arquivos.final);
  assert.equal(info.codec, 'aac');
  assert.equal(info.canais, 2);
  const [esquerdo] = decodificar(arquivos.final, 2);
  const segundos = duracaoS(esquerdo);
  assert.ok(segundos >= 2.5 && segundos <= 3.5, 'duracao fora de 2,5 a 3,5 s: ' + segundos);
});

test('gravacao: canal esquerdo tem a voce (440 Hz) e nao tem o cliente (1000 Hz)', opcoes, () => {
  const [esquerdo] = decodificar(arquivos.final, 2);
  const voce = amplitude(esquerdo, 440);
  const cliente = amplitude(esquerdo, 1000);
  assert.ok(voce > PRESENTE, 'voce ausente no canal esquerdo: ' + voce);
  assert.ok(cliente < AUSENTE, 'cliente vazando no canal esquerdo: ' + cliente);
});

test('gravacao: canal direito tem o cliente (1000 Hz) e nao tem a voce (440 Hz)', opcoes, () => {
  const [, direito] = decodificar(arquivos.final, 2);
  const cliente = amplitude(direito, 1000);
  const voce = amplitude(direito, 440);
  assert.ok(cliente > PRESENTE, 'cliente ausente no canal direito: ' + cliente);
  assert.ok(voce < AUSENTE, 'voce vazando no canal direito: ' + voce);
});

test('alto-falante: toca o cliente (o usuario continua ouvindo a chamada)', opcoes, () => {
  const [mono] = decodificar(arquivos.monitor, 1);
  const cliente = amplitude(mono, 1000);
  assert.ok(cliente > PRESENTE, 'o cliente nao sai no alto-falante: ' + cliente);
});

test('alto-falante: nunca toca a voce (o usuario nao ouve a propria voz)', opcoes, () => {
  const [mono] = decodificar(arquivos.monitor, 1);
  const voce = amplitude(mono, 440);
  assert.ok(voce < AUSENTE, 'a voce sai no alto-falante: ' + voce);
});

test('medidores: cada lado mede o seu tom (pico perto de 0,3)', opcoes, () => {
  assert.ok(gravacao.niveis.voce > 0.25 && gravacao.niveis.voce < 0.35, 'medidor voce: ' + gravacao.niveis.voce);
  assert.ok(gravacao.niveis.cliente > 0.25 && gravacao.niveis.cliente < 0.35, 'medidor cliente: ' + gravacao.niveis.cliente);
});

test('armazem: toda fatia entregue chega ao armazem, e apagar remove tudo', opcoes, () => {
  // Fatias pedidas a cada 1 s durante 3 s. O empacotador de MP4 do Chrome nao respeita o intervalo a
  // risca (medido em 09/11/2026: 2 fatias numa rodada, 3 noutra), entao a prova e "mais de uma":
  // o arquivo valido saiu da soma de pedacos.
  assert.ok(gravacao.fatiasGravadas >= 2, 'fatias: ' + gravacao.fatiasGravadas);
  assert.equal(gravacao.pedacosAntes, gravacao.fatiasGravadas);
  assert.equal(gravacao.pedacosDepois, 0);
  assert.equal(gravacao.gravacoesDepois, 0);
});

test('gravador: com o armazem lento, o parar so termina com todas as fatias guardadas e apagar nao deixa orfao', opcoes, () => {
  assert.ok(lento.pedacos >= 2, 'pedacos: ' + lento.pedacos);
  assert.equal(lento.bytesGuardados, lento.bytesArquivo);
  assert.equal(lento.orfaos, 0);
});

test('gravador: armazem falhando em toda fatia nao estraga o arquivo final', opcoes, () => {
  assert.equal(falho.erroArmazem, 'cota estourada (falso)');
  const info = sondar(arquivos.falho);
  assert.equal(info.codec, 'aac');
  assert.equal(info.canais, 2);
  const [esquerdo, direito] = decodificar(arquivos.falho, 2);
  const segundos = duracaoS(esquerdo);
  assert.ok(segundos >= 2.5 && segundos <= 3.5, 'duracao fora de 2,5 a 3,5 s: ' + segundos);
  assert.ok(amplitude(esquerdo, 440) > PRESENTE, 'voce ausente');
  assert.ok(amplitude(direito, 1000) > PRESENTE, 'cliente ausente');
});

test('recuperacao: gravacao interrompida fica marcada como gravando e o que foi guardado abre', opcoes, () => {
  assert.deepEqual(recuperacao.gravacoes, [{ id: 'r1', situacao: 'gravando' }]);
  assert.ok(recuperacao.pedacos >= 3, 'pedacos guardados antes do "travamento": ' + recuperacao.pedacos);
  const info = sondar(arquivos.recuperado);
  assert.equal(info.codec, 'aac');
  assert.equal(info.canais, 2);
  const [esquerdo, direito] = decodificar(arquivos.recuperado, 2);
  const segundos = duracaoS(esquerdo);
  // Cabecalho + 2 trechos de audio = pelo menos ~2 s; e nunca mais do que o tempo que gravou.
  assert.ok(segundos >= 1.5, 'duracao recuperada abaixo de 1,5 s: ' + segundos);
  assert.ok(segundos <= recuperacao.decorridoS + 0.5, 'recuperou mais (' + segundos + ' s) do que gravou (' + recuperacao.decorridoS + ' s)');
  assert.ok(amplitude(esquerdo, 440, 0.25) > PRESENTE, 'voce ausente no arquivo recuperado');
  assert.ok(amplitude(direito, 1000, 0.25) > PRESENTE, 'cliente ausente no arquivo recuperado');
});
