// Smoke (segundos): a extensao esta inteira para o Chrome carregar.
// - sintaxe de todo .js (node --check);
// - manifest.json valido e todo arquivo citado nele existe;
// - toda pagina citada no service worker, todo script/estilo das paginas e todo import existe;
// - CONTROLE que tem de falhar: um .js quebrado de proposito numa pasta temporaria tem de ser
//   reprovado pela mesma conferencia de sintaxe (prova que o smoke nao esta cego).
// Uso (dentro de codigo/): node ferramentas/smoke.js
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(RAIZ, 'extensao');
const rel = (f) => path.relative(RAIZ, f).split(path.sep).join('/');

function listar(pasta) {
  const saida = [];
  for (const item of readdirSync(pasta, { withFileTypes: true })) {
    const completo = path.join(pasta, item.name);
    if (item.isDirectory()) saida.push(...listar(completo));
    else saida.push(completo);
  }
  return saida;
}

const sintaxeOk = (arquivo) => spawnSync(process.execPath, ['--check', arquivo]).status === 0;

const conferencias = [];
const conferir = (nome, ok) => conferencias.push({ nome, ok: Boolean(ok) });

// 1) sintaxe
for (const pasta of ['extensao', 'testes', 'ferramentas']) {
  for (const arquivo of listar(path.join(RAIZ, pasta)).filter((f) => f.endsWith('.js'))) {
    conferir('sintaxe ' + rel(arquivo), sintaxeOk(arquivo));
  }
}

// 2) manifest
let m = null;
try {
  m = JSON.parse(readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
  conferir('manifest.json e JSON valido', true);
} catch {
  conferir('manifest.json e JSON valido', false);
}
if (m) {
  const citados = new Set([
    m.background?.service_worker,
    m.action?.default_popup,
    ...Object.values(m.icons || {}),
    ...Object.values(m.action?.default_icon || {}),
  ]);
  for (const c of citados) conferir('manifest cita ' + c, c && existsSync(path.join(EXT, c)));
}

// 3) paginas citadas no service worker (offscreen.html, permissao.html)
const sw = readFileSync(path.join(EXT, 'service-worker.js'), 'utf8');
for (const [, pagina] of sw.matchAll(/['"]([\w-]+\.html)['"]/g)) conferir('service worker cita ' + pagina, existsSync(path.join(EXT, pagina)));

// 4) script e estilo de cada pagina, e cada import dos modulos
for (const arquivo of listar(EXT)) {
  const conteudo = readFileSync(arquivo, 'utf8');
  if (arquivo.endsWith('.html')) {
    for (const [, alvo] of conteudo.matchAll(/<(?:script[^>]*\bsrc|link[^>]*\bhref)="([^"]+)"/g)) {
      conferir(rel(arquivo) + ' carrega ' + alvo, existsSync(path.resolve(path.dirname(arquivo), alvo)));
    }
  }
  if (arquivo.endsWith('.js')) {
    for (const [, alvo] of conteudo.matchAll(/from\s+'(\.[^']+)'/g)) {
      conferir(rel(arquivo) + ' importa ' + alvo, existsSync(path.resolve(path.dirname(arquivo), alvo)));
    }
  }
}

// 5) controle que tem de falhar
const temporaria = mkdtempSync(path.join(tmpdir(), 'gravador-smoke-'));
const quebrado = path.join(temporaria, 'quebrado.js');
writeFileSync(quebrado, 'function (\n');
conferir('controle: arquivo quebrado de proposito e reprovado', !sintaxeOk(quebrado));
rmSync(temporaria, { recursive: true, force: true });

const falhas = conferencias.filter((c) => !c.ok);
for (const c of falhas) console.log('FALHOU  ' + c.nome);
console.log('smoke ' + (conferencias.length - falhas.length) + '/' + conferencias.length);
process.exit(falhas.length ? 1 : 0);
