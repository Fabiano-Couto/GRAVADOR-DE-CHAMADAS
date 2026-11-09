// Guardas — Gravador v1, 09/11/2026. Leem os arquivos do projeto e listam os culpados.
// Regras que nao podem voltar, rodando ou nao o caminho do codigo:
// - nada sai do computador. A BARREIRA e a politica de seguranca do manifest (connect-src 'none':
//   o proprio Chrome bloqueia qualquer conexao das paginas da extensao); a guarda de texto abaixo e
//   um alarme contra descuido, nao contra codigo malicioso escrito para escapar dela (revisao de
//   seguranca de 09/11/2026 provou 10 formas que escapavam da versao anterior);
// - gravacao de audio nunca entra no git (voz e dado de cliente — LGPD);
// - permissoes do manifest sao exatamente a lista aprovada (permissao nova = decisao do usuario);
// - nenhum arquivo ou pasta da extensao comeca com "_" (o Chrome recusa carregar a extensao);
// - todo motivo de erro usado no codigo tem mensagem para o usuario;
// - a documentacao nao cita caminho que nao existe e cobre todo arquivo de lib/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOTIVOS, CODIGOS_DE_ALERTA, CODIGOS_PENDENTES } from '../../extensao/lib/mensagens.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXT = path.join(RAIZ, 'extensao');
const DOCS = path.join(RAIZ, 'docs');

function listar(pasta) {
  const saida = [];
  for (const item of readdirSync(pasta, { withFileTypes: true })) {
    const completo = path.join(pasta, item.name);
    if (item.isDirectory()) saida.push(...listar(completo));
    else saida.push(completo);
  }
  return saida;
}

const rel = (arquivo) => path.relative(RAIZ, arquivo).split(path.sep).join('/');
const texto = (arquivo) => readFileSync(arquivo, 'utf8');
// Todo arquivo de texto da pasta, qualquer que seja a extensao do nome (.mjs, .svg, .htm...):
// so os PNG dos icones ficam de fora.
const arquivosDeTexto = (pasta) => listar(pasta).filter((f) => !f.endsWith('.png'));
const manifest = () => JSON.parse(texto(path.join(EXT, 'manifest.json')));

// A barreira de verdade: o Chrome aplica esta politica a todas as paginas da extensao (janelinha,
// offscreen, permissao, service worker). connect-src 'none' bloqueia fetch, XHR, WebSocket,
// EventSource e sendBeacon; script-src 'self' bloqueia script de fora e eval.
const CSP_APROVADA =
  "default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'";

test('guarda: permissoes do manifest sao exatamente as aprovadas', () => {
  const m = manifest();
  assert.deepEqual([...m.permissions].sort(), ['activeTab', 'downloads', 'offscreen', 'storage', 'tabCapture']);
  const naoAprovadas = [
    'host_permissions',
    'optional_permissions',
    'optional_host_permissions',
    'content_scripts',
    'externally_connectable',
    'web_accessible_resources',
    'sandbox',
  ].filter((chave) => m[chave] !== undefined);
  assert.deepEqual(naoAprovadas, []);
});

test('guarda: o manifest tem a politica de seguranca que bloqueia qualquer conexao', () => {
  assert.deepEqual(manifest().content_security_policy, { extension_pages: CSP_APROVADA });
});

test('guarda: gravacao de audio nunca entra no git', () => {
  const ignorados = texto(path.join(RAIZ, '.gitignore')).split(/\r?\n/).map((l) => l.trim());
  const AUDIO = ['m4a', 'mp4', 'webm', 'ogg', 'opus', 'wav', 'mp3', 'aac', 'flac', 'wma', 'amr', 'm4b', '3gp'];
  assert.deepEqual(AUDIO.filter((ext) => !ignorados.includes('*.' + ext)), []);
  const r = spawnSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8' });
  assert.equal(r.status, 0, 'git ls-files falhou');
  const versionados = r.stdout.split('\n').filter((f) => new RegExp('\\.(' + AUDIO.join('|') + ')$', 'i').test(f));
  assert.deepEqual(versionados, []);
});

test('guarda: o atalho combinado e Alt+Shift+G', () => {
  assert.equal(manifest().commands['alternar-gravacao'].suggested_key.default, 'Alt+Shift+G');
});

// [regra, nome, exemplo]. O exemplo e o que o autoteste planta: cada regra tem de pegar o seu.
const PROIBIDOS = [
  [/\bfetch\s*\(/, 'fetch'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/sendBeacon/, 'sendBeacon'],
  [/\bEventSource\b/, 'EventSource'],
  [/\beval\s*\(/, 'eval'],
  [/new\s+Function\s*\(/, 'new Function'],
  [/importScripts\s*\(/, 'importScripts'],
  [/\b(src|href)\s*=\s*["']\s*(https?:)?\/\//i, 'recurso de fora'],
  [/\bimport\b[^;]*["']https?:/, 'import de fora'],
  [/url\(\s*["']?https?:/i, 'url() de fora'],
  [/https?:\/\//i, 'endereco http escrito no codigo'],
  [/RTCPeerConnection/, 'RTCPeerConnection'],
  [/WebTransport/, 'WebTransport'],
  [/\.share\s*\(/, 'navigator.share'],
  [/sendNativeMessage|connectNative/, 'mensagem nativa'],
  [/runtime\.connect\s*\(/, 'runtime.connect'],
  [/sendMessage\s*\(\s*["'`]/, 'mensagem para outra extensao'],
  [/new\s+Image\b/, 'new Image'],
  [/\.src\s*=/, 'atribuicao de src'],
  [/location\.(assign|replace|href)/, 'navegacao por location'],
  [/window\.open\s*\(/, 'window.open'],
];

// Plantas do autoteste, ESCRITAS A MAO e separadas das regras: se elas viessem da propria lista de
// regras, apagar uma regra apagaria a planta junto e o autoteste continuaria verde (teste-espelho —
// sabotagem de 09/11/2026 mostrou). Nome da regra -> exemplo que ela tem de pegar.
const PLANTAS = {
  fetch: "fetch('/x');",
  XMLHttpRequest: 'const x = new XMLHttpRequest();',
  WebSocket: "const s = new WebSocket('wss:x');",
  sendBeacon: "navigator.sendBeacon('/x');",
  EventSource: "const e = new EventSource('/x');",
  eval: "eval('1');",
  'new Function': "const f = new Function('return 1');",
  importScripts: "importScripts('/x.js');",
  'recurso de fora': '<img src="//exemplo.invalid/x.png">',
  'import de fora': "import x from 'https:x';",
  'url() de fora': 'a { background: url(https:x); }',
  'endereco http escrito no codigo': "const destino = 'http://exemplo.invalid/';",
  RTCPeerConnection: 'const p = new RTCPeerConnection({});',
  WebTransport: "const t = new WebTransport('/x');",
  'navigator.share': 'navigator.share({});',
  'mensagem nativa': "chrome.runtime.connectNative('x');",
  'runtime.connect': 'chrome.runtime.connect();',
  'mensagem para outra extensao': "chrome.runtime.sendMessage('outra-extensao', {});",
  'new Image': 'const i = new Image();',
  'atribuicao de src': 'imagem.src = destino;',
  'navegacao por location': "location.assign('/x');",
  'window.open': "window.open('/x');",
};

function culpadosDeRede(pasta) {
  const culpados = [];
  for (const arquivo of arquivosDeTexto(pasta)) {
    texto(arquivo)
      .split('\n')
      .forEach((linha, i) => {
        for (const [regra, nome] of PROIBIDOS) {
          if (regra.test(linha)) culpados.push(path.relative(pasta, arquivo).split(path.sep).join('/') + ':' + (i + 1) + ' ' + nome);
        }
      });
  }
  return culpados;
}

test('guarda: nenhum codigo da extensao usa rede ou codigo de fora', () => {
  assert.deepEqual(culpadosDeRede(EXT), []);
});

// Autoteste da guarda (revisao de seguranca de 09/11/2026: a versao anterior so lia .js/.html/
// .css/.json e deixou passar 10 formas reais; 2a rodada: o autoteste cobria 11 das 22 regras).
// Uma planta POR REGRA (escrita a mao, em PLANTAS), em tipos de arquivo variados, e cada uma tem de
// ser pega PELA SUA regra. Formas que um alarme de texto nao pega (nome montado em pedacos, escape
// unicode, quebra de linha antes do parentese) ficam para a politica de seguranca do manifest — que
// bloqueia o que governa.
test('guarda (autoteste): cada regra pega a sua planta, em todo tipo de arquivo', () => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'gravador-guarda-'));
  const tipos = ['mjs', 'svg', 'htm', 'txt', 'js', 'css', 'html', 'json'];
  try {
    const esperado = Object.entries(PLANTAS).map(([nome, exemplo], i) => {
      const arquivo = 'regra-' + String(i).padStart(2, '0') + '.' + tipos[i % tipos.length];
      writeFileSync(path.join(pasta, arquivo), exemplo + '\n');
      return arquivo + ' ' + nome;
    });
    const pegos = new Set(culpadosDeRede(pasta).map((c) => c.replace(/:\d+ /, ' ')));
    assert.deepEqual(esperado.filter((e) => !pegos.has(e)), []);
    // Toda regra tem planta (regra nova sem planta nao passa despercebida).
    assert.deepEqual(PROIBIDOS.map(([, nome]) => nome).filter((nome) => !(nome in PLANTAS)), []);
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});

test('guarda: nenhum arquivo ou pasta da extensao comeca com sublinhado', () => {
  const culpados = [];
  const varrer = (pasta) => {
    for (const item of readdirSync(pasta, { withFileTypes: true })) {
      if (item.name.startsWith('_')) culpados.push(rel(path.join(pasta, item.name)));
      if (item.isDirectory()) varrer(path.join(pasta, item.name));
    }
  };
  varrer(EXT);
  assert.deepEqual(culpados, []);
});

test('guarda: todo motivo de erro usado no codigo tem mensagem para o usuario', () => {
  const usados = new Set();
  for (const arquivo of listar(EXT).filter((f) => f.endsWith('.js'))) {
    for (const linha of texto(arquivo).split('\n')) {
      for (const [, codigo] of linha.matchAll(/motivo:\s*'([a-z-]+)'/g)) usados.add(codigo);
      if (linha.includes('ErroGravador(')) for (const [, codigo] of linha.matchAll(/'([a-z-]+)'/g)) usados.add(codigo);
    }
  }
  assert.ok(usados.size >= 10, 'a guarda nao achou os motivos (achou ' + usados.size + ')');
  assert.deepEqual([...usados].filter((m) => !MOTIVOS.includes(m)), []);
});

// 2a rodada de revisao (09/11/2026): CODIGOS_DE_ALERTA era exportado e nao usado; nada conferia que
// todo aviso tem texto e que todo texto ainda tem uso.
test('guarda: todo aviso usado no offscreen tem texto, e todo texto de aviso tem uso', () => {
  const offscreen = texto(path.join(EXT, 'offscreen.js'));
  const alertasUsados = new Set([
    ...[...offscreen.matchAll(/aplicar\('([a-z-]+)'/g)].map((m) => m[1]),
    ...[...offscreen.matchAll(/alertas\.add\('([a-z-]+)'\)/g)].map((m) => m[1]),
    ...[...offscreen.matchAll(/new Set\(semCopia \? \['([a-z-]+)'\]/g)].map((m) => m[1]),
  ]);
  const pendentesUsados = new Set([...offscreen.matchAll(/'(nao-salva[a-z-]*|gravador-parou)'/g)].map((m) => m[1]));
  assert.ok(alertasUsados.size >= 3, 'a guarda nao achou os alertas (achou ' + alertasUsados.size + ')');
  assert.deepEqual([...alertasUsados].filter((c) => !CODIGOS_DE_ALERTA.includes(c)), []);
  assert.deepEqual(CODIGOS_DE_ALERTA.filter((c) => !alertasUsados.has(c)), []);
  assert.deepEqual([...pendentesUsados].filter((c) => !CODIGOS_PENDENTES.includes(c)), []);
  assert.deepEqual(CODIGOS_PENDENTES.filter((c) => !pendentesUsados.has(c)), []);
});

test('guarda: todo link dos documentos aponta para um caminho que existe', () => {
  const documentos = [
    path.join(RAIZ, 'CLAUDE.md'),
    path.join(RAIZ, 'README.md'),
    ...listar(DOCS).filter((f) => f.endsWith('.md') && !rel(f).startsWith('docs/_modelos/')),
  ];
  const mortos = [];
  for (const doc of documentos) {
    for (const [, alvo] of texto(doc).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(alvo)) continue;
      const caminho = path.resolve(path.dirname(doc), decodeURIComponent(alvo.split('#')[0]));
      if (!existsSync(caminho)) mortos.push(rel(doc) + ' -> ' + alvo);
    }
  }
  assert.deepEqual(mortos, []);
});

test('guarda: todo arquivo de extensao/lib e citado em docs/gravacao.md', () => {
  const doc = texto(path.join(DOCS, 'gravacao.md'));
  const faltando = readdirSync(path.join(EXT, 'lib')).filter((nome) => !doc.includes('lib/' + nome));
  assert.deepEqual(faltando, []);
});

test('guarda: todo registro de trabalho esta na lista de docs/trabalhos/README.md', () => {
  const pasta = path.join(DOCS, 'trabalhos');
  const lista = texto(path.join(pasta, 'README.md'));
  const fora = readdirSync(pasta).filter((nome) => nome.endsWith('.md') && nome !== 'README.md' && !lista.includes('(' + nome + ')'));
  assert.deepEqual(fora, []);
});
