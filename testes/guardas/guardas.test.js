// Guardas — Gravador v1, 09/11/2026. Leem os arquivos do projeto e listam os culpados.
// Regras que nao podem voltar, rodando ou nao o caminho do codigo:
// - nada sai do computador: a extensao nao usa rede nem codigo de fora (gravacao tem voz e dado de
//   cliente — LGPD);
// - permissoes do manifest sao exatamente a lista aprovada (permissao nova = decisao do usuario);
// - nenhum arquivo ou pasta da extensao comeca com "_" (o Chrome recusa carregar a extensao);
// - todo motivo de erro usado no codigo tem mensagem para o usuario;
// - a documentacao nao cita caminho que nao existe e cobre todo arquivo de lib/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MOTIVOS } from '../../extensao/lib/mensagens.js';

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
const codigoDaExtensao = () => listar(EXT).filter((f) => /\.(js|html|css|json)$/.test(f));
const manifest = () => JSON.parse(texto(path.join(EXT, 'manifest.json')));

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
    'content_security_policy',
  ].filter((chave) => m[chave] !== undefined);
  assert.deepEqual(naoAprovadas, []);
});

test('guarda: o atalho combinado e Alt+Shift+G', () => {
  assert.equal(manifest().commands['alternar-gravacao'].suggested_key.default, 'Alt+Shift+G');
});

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
];

test('guarda: nenhum codigo da extensao usa rede ou codigo de fora', () => {
  const culpados = [];
  for (const arquivo of codigoDaExtensao()) {
    texto(arquivo)
      .split('\n')
      .forEach((linha, i) => {
        for (const [regra, nome] of PROIBIDOS) if (regra.test(linha)) culpados.push(rel(arquivo) + ':' + (i + 1) + ' ' + nome);
      });
  }
  assert.deepEqual(culpados, []);
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

test('guarda: todo link dos documentos aponta para um caminho que existe', () => {
  const documentos = [path.join(RAIZ, 'CLAUDE.md'), ...listar(DOCS).filter((f) => f.endsWith('.md') && !rel(f).startsWith('docs/_modelos/'))];
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
