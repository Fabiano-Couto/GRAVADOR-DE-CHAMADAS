// Ambiente do teste de audio: um servidor local (so 127.0.0.1) servindo a pasta codigo/ e um Chrome
// sem cabeca controlado pelo protocolo DevTools com o WebSocket nativo do Node. Sem dependencias.
// Nada sai da maquina: o servidor escuta so no endereco local e a pagina nao chama a internet.
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME_PADRAO = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
// Tipo certo para cada arquivo: o Chrome recusa folha de estilo servida com outro tipo, e a janelinha
// rodava no teste SEM CSS (sabotagem de 09/11/2026 mostrou: o teste das barras ficava cego).
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
};

const espera = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

export function caminhoChrome() {
  return process.env.CHROME_PATH || CHROME_PADRAO;
}

// Devolve o motivo para pular o teste (falta ferramenta) ou null.
export function ferramentaQueFalta() {
  if (!existsSync(caminhoChrome())) return 'Chrome nao encontrado em ' + caminhoChrome() + ' (defina CHROME_PATH)';
  for (const programa of ['ffmpeg', 'ffprobe']) {
    const r = spawnSync(programa, ['-version'], { encoding: 'utf8' });
    if (r.error || r.status !== 0) return programa + ' nao encontrado no PATH';
  }
  return null;
}

// As paginas de teste rodam sob a MESMA politica de seguranca do manifest da extensao: prova que a
// gravacao funciona com ela e que ela bloqueia conexao de verdade no Chrome.
function cspDaExtensao() {
  const manifest = JSON.parse(readFileSync(path.join(RAIZ, 'extensao', 'manifest.json'), 'utf8'));
  return manifest.content_security_policy.extension_pages;
}

function iniciarServidor() {
  const csp = cspDaExtensao();
  const servidor = createServer(async (req, res) => {
    try {
      const pedido = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
      const arquivo = path.resolve(RAIZ, '.' + pedido);
      if (!arquivo.startsWith(RAIZ + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const corpo = await readFile(arquivo);
      const cabecalhos = { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' };
      if (arquivo.endsWith('.html')) cabecalhos['Content-Security-Policy'] = csp;
      res.writeHead(200, cabecalhos);
      res.end(corpo);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolver) => {
    servidor.listen(0, '127.0.0.1', () => resolver(servidor));
  });
}

async function conectar(urlWs) {
  const ws = new WebSocket(urlWs);
  await new Promise((resolver, rejeitar) => {
    ws.onopen = resolver;
    ws.onerror = () => rejeitar(new Error('nao conectou ao DevTools em ' + urlWs));
  });
  let proximo = 0;
  const pendentes = new Map();
  ws.onmessage = (evento) => {
    const msg = JSON.parse(evento.data);
    if (msg.id && pendentes.has(msg.id)) {
      const { resolver, rejeitar } = pendentes.get(msg.id);
      pendentes.delete(msg.id);
      if (msg.error) rejeitar(new Error(msg.error.message));
      else resolver(msg.result);
    }
  };
  return {
    enviar(metodo, params = {}) {
      const id = ++proximo;
      ws.send(JSON.stringify({ id, method: metodo, params }));
      return new Promise((resolver, rejeitar) => pendentes.set(id, { resolver, rejeitar }));
    },
    fechar() {
      ws.close();
    },
  };
}

async function esperarPorta(pastaPerfil, limiteMs) {
  const arquivo = path.join(pastaPerfil, 'DevToolsActivePort');
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (existsSync(arquivo)) {
      // O Chrome pode estar escrevendo o arquivo neste instante: no Windows a leitura falha com
      // EBUSY (visto em 09/11/2026 com a suite em paralelo). Tenta de novo na proxima volta.
      let porta = '';
      try {
        porta = readFileSync(arquivo, 'utf8').split('\n')[0].trim();
      } catch (e) {
        if (e.code !== 'EBUSY' && e.code !== 'EPERM') throw e;
      }
      if (porta) return porta;
    }
    await espera(100);
  }
  throw new Error('o Chrome nao abriu a porta do DevTools a tempo');
}

// opcoes.antes: codigo que roda ANTES de qualquer script da pagina (ex.: o Chrome da extensao falso
//   para abrir a janelinha de verdade). opcoes.pronta: expressao que fica true quando a pagina esta
//   pronta para o teste.
export async function iniciarAmbiente(paginaRelativa = '/testes/audio/pagina-teste.html', opcoes = {}) {
  const { antes = null, pronta = 'window.paginaPronta === true' } = opcoes;
  const servidor = await iniciarServidor();
  const base = 'http://127.0.0.1:' + servidor.address().port;
  const pastaPerfil = mkdtempSync(path.join(tmpdir(), 'gravador-teste-'));
  const chrome = spawn(
    caminhoChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--autoplay-policy=no-user-gesture-required',
      '--remote-debugging-port=0',
      '--user-data-dir=' + pastaPerfil,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const encerrar = async (navegador) => {
    try {
      if (navegador) await navegador.enviar('Browser.close');
    } catch {
      // ja fechado
    }
    navegador?.fechar();
    await Promise.race([new Promise((r) => chrome.once('exit', r)), espera(5000)]);
    if (chrome.exitCode === null) chrome.kill();
    servidor.close();
    for (let i = 0; i < 10; i++) {
      try {
        rmSync(pastaPerfil, { recursive: true, force: true });
        break;
      } catch {
        await espera(300);
      }
    }
  };

  try {
    const porta = await esperarPorta(pastaPerfil, 15000);
    const devtools = 'http://127.0.0.1:' + porta;
    const versao = await (await fetch(devtools + '/json/version')).json();
    const navegador = await conectar(versao.webSocketDebuggerUrl);

    let alvo = null;
    for (let i = 0; i < 100 && !alvo; i++) {
      const lista = await (await fetch(devtools + '/json/list')).json();
      alvo = lista.find((t) => t.type === 'page');
      if (!alvo) await espera(100);
    }
    if (!alvo) throw new Error('o Chrome nao abriu nenhuma pagina');
    const pagina = await conectar(alvo.webSocketDebuggerUrl);
    await pagina.enviar('Page.enable');
    if (antes) await pagina.enviar('Page.addScriptToEvaluateOnNewDocument', { source: antes });
    await pagina.enviar('Page.navigate', { url: base + paginaRelativa });

    const avaliar = async (expressao) => {
      const r = await pagina.enviar('Runtime.evaluate', { expression: expressao, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        const detalhe = r.exceptionDetails.exception?.description || r.exceptionDetails.text;
        throw new Error('erro na pagina de teste: ' + detalhe);
      }
      return r.result.value;
    };

    const estaPronta = async () => {
      try {
        return (await avaliar(pronta)) === true;
      } catch {
        return false; // pagina ainda navegando
      }
    };
    for (let i = 0; i < 100 && !(await estaPronta()); i++) await espera(100);
    if (!(await estaPronta())) throw new Error('a pagina de teste nao ficou pronta: ' + pronta);

    return {
      avaliar,
      // Abre outra pagina na mesma aba (o codigo de "antes" roda de novo) e espera ficar pronta.
      navegar: async (relativa) => {
        await pagina.enviar('Page.navigate', { url: base + relativa });
        await espera(200);
        for (let i = 0; i < 100 && !(await estaPronta()); i++) await espera(100);
        if (!(await estaPronta())) throw new Error('a pagina nao ficou pronta: ' + relativa);
      },
      encerrar: async () => {
        pagina.fechar();
        await encerrar(navegador);
      },
    };
  } catch (erro) {
    await encerrar(null);
    throw erro;
  }
}
