// A janelinha de verdade (extensao/popup.html, popup.js, popup.css) num Chrome sem cabeca, com o
// Chrome da extensao falso por fora (chrome-falso-popup.js) e sob a politica de seguranca do manifest.
// Defeitos que este teste impede:
// - barras Voce/Cliente visiveis com nada gravando (conferencia local de 09/11/2026: o atributo
//   hidden perdia para o display: grid do CSS) — por isso confere o estilo CALCULADO pelo Chrome;
// - "Salvando..." preso quando o download termina antes da resposta do Parar (revisao de 09/11/2026);
// - aviso pendente (gravacao nao salva com a janelinha fechada) que nao aparece ao abrir;
// - (2a rodada) alerta da gravacao apagando aviso pendente e ficando na tela depois de acabar;
//   download de outro site que falha virando erro nosso; Parar recusado dizendo "Gravacao salva";
//   gravacao so na memoria sem aviso de que some ao fechar o Chrome;
// - textos e botoes errados em cada situacao.
// Cada teste comeca numa pagina nova (nao depende do anterior).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ferramentaQueFalta, iniciarAmbiente } from '../audio/ambiente-chrome.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const falta = ferramentaQueFalta();
const opcoes = { skip: falta || false, timeout: 60000 };
const PRONTA = "document.getElementById('texto-estado') && document.getElementById('texto-estado').textContent.startsWith('Pronto')";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const FOTO = `(() => {
  const el = (id) => document.getElementById(id);
  const visivel = (id) => getComputedStyle(el(id)).display !== 'none';
  return {
    larguraDaJanelinha: getComputedStyle(document.body).width,
    texto: el('texto-estado').textContent,
    botao: el('botao').textContent,
    botaoDesligado: el('botao').disabled,
    medidores: visivel('medidores'),
    cronometro: visivel('cronometro') ? el('cronometro').textContent : null,
    microfone: visivel('microfone') ? el('microfone').textContent : null,
    aviso: visivel('aviso') ? el('aviso').textContent : null,
    avisoDeErro: el('aviso').classList.contains('erro'),
    recuperar: visivel('recuperar'),
    itens: [...document.querySelectorAll('#lista-recuperar .descricao')].map((e) => e.textContent),
    nivelVoce: el('nivel-voce').style.width,
    nivelCliente: el('nivel-cliente').style.width,
    atalho: el('atalho').textContent,
    enviadas: window.__falso.enviadas.filter((m) => m.alvo === 'sw').map((m) => m.tipo + (m.tabId ? ':' + m.tabId : '')),
  };
})()`;

let ambiente;
const foto = () => ambiente.avaliar(FOTO);
const pagina = (busca = '') => ambiente.navegar('/extensao/popup.html' + busca);
const definir = async (js) => {
  await ambiente.avaliar(js);
  await espera(600); // a janelinha pergunta a situacao a cada 250 ms
};
const GRAVANDO_AQUI =
  "window.__falso.estado = { ok: true, estado: 'gravando', atual: { id: 'g1', tabId: 7, origem: 'WhatsApp', nome: 'x', inicio: Date.now() - 65000, microfone: 'Headset (Fone de Teste)' }, niveis: { voce: 0.5, cliente: 0.001 }, alertas: [], emEntrega: [], naMemoria: [] }";
const PARADO = "window.__falso.estado = { ok: true, estado: 'parado', atual: null, niveis: null, alertas: [], emEntrega: [], naMemoria: [] }";
const ULTIMA_SALVA =
  "window.__falso.ouvintesStorage.forEach((fn) => fn({ ultimas: { newValue: [{ nome: 'Gravacoes de Chamadas/2026-11-09_14h30_WhatsApp.m4a', downloadId: 1 }] } }, 'local'))";

before(async () => {
  if (falta) return;
  ambiente = await iniciarAmbiente('/extensao/popup.html', { antes: readFileSync(path.join(AQUI, 'chrome-falso-popup.js'), 'utf8'), pronta: PRONTA });
}, { timeout: 60000 });

after(async () => {
  await ambiente?.encerrar();
});

test('janelinha parada: pronta para gravar, sem barras, sem cronometro, sem aviso', opcoes, async () => {
  await pagina();
  const f = await foto();
  assert.equal(f.larguraDaJanelinha, '320px', 'o popup.css nao carregou: o teste estaria cego para o estilo');
  assert.equal(f.texto, 'Pronto para gravar: WhatsApp');
  assert.equal(f.botao, 'Gravar esta aba');
  assert.equal(f.botaoDesligado, false);
  assert.equal(f.medidores, false);
  assert.equal(f.cronometro, null);
  assert.equal(f.microfone, null);
  assert.equal(f.aviso, null);
  assert.equal(f.recuperar, false);
  assert.equal(f.atalho, 'Alt+Shift+G');
});

test('janelinha gravando esta aba: barras, cronometro, microfone e botao de parar', opcoes, async () => {
  await pagina();
  await definir(GRAVANDO_AQUI);
  const f = await foto();
  assert.equal(f.texto, 'Gravando: WhatsApp');
  assert.equal(f.botao, 'Parar e salvar');
  assert.equal(f.medidores, true);
  assert.ok(f.cronometro.startsWith('00:01:0'), 'cronometro: ' + f.cronometro);
  assert.equal(f.microfone, 'Microfone: Headset (Fone de Teste)');
  assert.equal(f.nivelVoce, '90%'); // pico 0,5 = -6 dB
  assert.equal(f.nivelCliente, '0%'); // pico 0,001 = -60 dB
});

test('janelinha gravando com aviso de aba muda mostra o texto do aviso', opcoes, async () => {
  await pagina();
  await definir(GRAVANDO_AQUI + "; window.__falso.estado.alertas = ['aba-muda']");
  assert.equal(
    (await foto()).aviso,
    'Nenhum som vem da aba gravada há mais de 30 segundos. Se a chamada abriu numa janela separada, pare aqui e use o atalho com a janela da chamada em foco. Se só ninguém está falando, ignore.',
  );
});

test('janelinha com outra aba gravando: sem barras e sem como gravar esta', opcoes, async () => {
  await pagina();
  await definir(
    "window.__falso.estado = { ok: true, estado: 'gravando', atual: { id: 'g2', tabId: 9, origem: 'Meet', nome: 'y', inicio: Date.now() }, niveis: { voce: 0.5, cliente: 0.5 }, alertas: [], emEntrega: [], naMemoria: [] }",
  );
  const f = await foto();
  assert.equal(f.texto, 'Gravando outra aba: Meet');
  assert.equal(f.botaoDesligado, true);
  assert.equal(f.medidores, false);
});

test('janelinha: Parar com o download terminando antes da resposta mostra "Gravacao salva"', opcoes, async () => {
  await pagina();
  await definir(GRAVANDO_AQUI);
  await ambiente.avaliar(
    "window.__falso.respostaAlternar = new Promise((r) => { window.__falso.liberar = () => r({ ok: true }); }); document.getElementById('botao').click()",
  );
  await espera(100);
  // o download termina (o service worker grava 'ultimas') ANTES da resposta do Parar chegar
  await ambiente.avaliar(ULTIMA_SALVA + '; window.__falso.liberar()');
  await definir(PARADO);
  const f = await foto();
  assert.ok(f.enviadas.includes('alternar:7'), 'nao pediu alternar: ' + f.enviadas);
  assert.equal(f.aviso, 'Gravação salva: 2026-11-09_14h30_WhatsApp.m4a');
});

test('janelinha: Parar recusado nao fica esperando e nao diz "Gravacao salva" depois', opcoes, async () => {
  await pagina();
  await definir(GRAVANDO_AQUI);
  await ambiente.avaliar("window.__falso.respostaAlternar = { ok: false, motivo: 'aguardar' }; document.getElementById('botao').click()");
  await espera(400);
  await ambiente.avaliar(ULTIMA_SALVA); // um download qualquer termina depois
  await espera(300);
  assert.equal((await foto()).aviso, 'Aguarde um instante: a gravação anterior ainda está sendo salva.');
});

test('janelinha: gravacao recusada mostra o motivo como erro', opcoes, async () => {
  await pagina();
  await ambiente.avaliar("window.__falso.respostaAlternar = { ok: false, motivo: 'outra-aba', origem: 'Meet' }; document.getElementById('botao').click()");
  await espera(600);
  const f = await foto();
  assert.equal(f.aviso, 'Já existe uma gravação em andamento (Meet) em outra aba. Pare aquela antes de começar outra.');
  assert.equal(f.avisoDeErro, true);
});

test('janelinha: download de outro site que falha nao vira erro nosso; o nosso vira', opcoes, async () => {
  await pagina();
  await definir(GRAVANDO_AQUI);
  await ambiente.avaliar('document.getElementById(\'botao\').click()');
  await espera(400);
  await ambiente.avaliar(
    "window.__falso.itensDownload[5] = { url: 'https://outro.site/arquivo.pdf' }; window.__falso.ouvintesDownloads.forEach((fn) => fn({ id: 5, state: { current: 'interrupted' } }))",
  );
  await definir(PARADO);
  assert.equal((await foto()).aviso, 'Salvando em Downloads > Gravacoes de Chamadas...');
  await ambiente.avaliar(
    "window.__falso.itensDownload[6] = { url: 'blob:chrome-extension://teste/1b4e' }; window.__falso.ouvintesDownloads.forEach((fn) => fn({ id: 6, state: { current: 'interrupted' } }))",
  );
  await espera(300);
  const f = await foto();
  assert.equal(f.aviso, 'Não consegui salvar o arquivo em Downloads. A gravação ficou guardada: use "Salvar" na lista de gravações não salvas.');
  assert.equal(f.avisoDeErro, true);
});

test('janelinha: gravacao interrompida e gravacao so na memoria aparecem em "Gravacoes nao salvas"', opcoes, async () => {
  await pagina('?recuperavel=gravando');
  await espera(400);
  let f = await foto();
  assert.equal(f.recuperar, true);
  assert.deepEqual(f.itens, ['09/11 14:30 · WhatsApp · interrompida no meio']);
  await pagina('?recuperavel=memoria');
  await espera(400);
  f = await foto();
  assert.deepEqual(f.itens, ['09/11 14:30 · WhatsApp · não salva — só até fechar o Chrome']);
});

test('janelinha: avisos pendentes aparecem todos ao abrir e sao dados como vistos', opcoes, async () => {
  await pagina('?pendentes=nao-salva,gravador-parou');
  await espera(400);
  const f = await foto();
  assert.equal(
    f.aviso,
    'Uma gravação NÃO foi salva em Downloads. Ela está em "Gravações não salvas": clique em Salvar. A gravação parou sozinha por um erro do Chrome. O que foi gravado até ali foi mandado para Downloads.',
  );
  assert.equal(f.avisoDeErro, true);
  assert.ok(f.enviadas.includes('pendente-visto'), 'nao avisou que viu: ' + f.enviadas);
});

test('janelinha: alerta da gravacao aparece por cima do pendente e, quando acaba, o pendente volta', opcoes, async () => {
  await pagina('?pendentes=nao-salva');
  await espera(400);
  await definir(GRAVANDO_AQUI + "; window.__falso.estado.alertas = ['microfone-mudo']");
  assert.equal((await foto()).aviso, 'Seu microfone está sem som há mais de 10 segundos. Confira se ele não está mudo no Windows.');
  await definir(GRAVANDO_AQUI);
  assert.equal((await foto()).aviso, 'Uma gravação NÃO foi salva em Downloads. Ela está em "Gravações não salvas": clique em Salvar.');
});
