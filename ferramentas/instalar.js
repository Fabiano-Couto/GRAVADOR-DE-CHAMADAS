// Instala a extensao numa pasta LOCAL, fora do Google Drive, de onde o Chrome a carrega.
// Decisao do usuario (09/11/2026), a partir da revisao de seguranca: o codigo que roda com o
// microfone liberado nao pode ser o da pasta sincronizada — quem escrevesse nela (pasta
// compartilhada, conta comprometida) passaria a rodar codigo no Chrome sem aviso.
//
// Uso (dentro de codigo/): node ferramentas/instalar.js [destino] [--forcar]
//   destino padrao: C:\Extensoes\Gravador de Chamadas
//   recusa se extensao/ tem mudanca nao commitada (--forcar ignora, para teste local)
// Depois: chrome://extensions -> Gravador de Chamadas -> recarregar.
// Testes: testes/unidade/instalar.test.js.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DESTINO_PADRAO = 'C:\\Extensoes\\Gravador de Chamadas';
const NOME_DA_EXTENSAO = 'Gravador de Chamadas';
const LIXO_DO_SISTEMA = ['desktop.ini', 'thumbs.db', '.ds_store'];

const ehLixo = (arquivo) => LIXO_DO_SISTEMA.includes(path.basename(arquivo).toLowerCase());

function listar(pasta) {
  const saida = [];
  for (const item of readdirSync(pasta, { withFileTypes: true })) {
    const completo = path.join(pasta, item.name);
    if (item.isDirectory()) saida.push(...listar(completo));
    else if (!ehLixo(completo)) saida.push(completo);
  }
  return saida;
}

// Lista "caminho relativo -> sha256" de uma pasta, sem o lixo do sistema, ORDENADA pelo caminho.
// (Defeito de 09/11/2026, na primeira instalacao real: o Google Drive lista a pasta numa ordem e o
// disco C: em outra; comparar sem ordenar dizia "a copia nao bateu" com o conteudo igual.)
export function impressao(pasta) {
  return listar(pasta)
    .map((arquivo) => [
      path.relative(pasta, arquivo).split(path.sep).join('/'),
      createHash('sha256').update(readFileSync(arquivo)).digest('hex'),
    ])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

// Pasta sincronizada com a nuvem (2a rodada de revisao, 09/11/2026: antes so "Meu Drive"/"My Drive";
// drives compartilhados, OneDrive, Dropbox e iCloud passavam).
const SINCRONIZADA = /[\\/](meu drive|my drive|drives compartilhados|shared drives|onedrive[^\\/]*|dropbox|icloud ?drive)([\\/]|$)/i;

function dentroDePastaSincronizada(caminho) {
  return SINCRONIZADA.test(caminho);
}

// Destino dentro de um repositorio git (ex.: outro checkout do projeto): apagar perderia trabalho
// nao commitado (2a rodada de revisao).
function dentroDeRepositorioGit(caminho) {
  for (let pasta = caminho; ; pasta = path.dirname(pasta)) {
    if (existsSync(path.join(pasta, '.git'))) return true;
    if (path.dirname(pasta) === pasta) return false;
  }
}

export function instalar({ origem, destino }) {
  const alvo = path.resolve(destino);
  if (dentroDePastaSincronizada(alvo)) {
    throw new Error('o destino fica dentro de uma pasta sincronizada (Google Drive, OneDrive, Dropbox, iCloud): ' + alvo);
  }
  if (alvo.startsWith(path.resolve(origem) + path.sep) || alvo === path.resolve(origem)) {
    throw new Error('o destino fica dentro da propria pasta da extensao: ' + alvo);
  }
  if (dentroDeRepositorioGit(alvo)) throw new Error('o destino fica dentro de um repositorio git: ' + alvo);
  // So substitui o destino se ele estiver vazio (lixo do sistema nao conta) ou for uma instalacao
  // anterior desta extensao.
  const existe = existsSync(alvo) && readdirSync(alvo).some((nome) => !ehLixo(nome));
  if (existe) {
    let nome = null;
    try {
      nome = JSON.parse(readFileSync(path.join(alvo, 'manifest.json'), 'utf8')).name;
    } catch {
      nome = null;
    }
    if (nome !== NOME_DA_EXTENSAO) {
      throw new Error('o destino ja existe e nao e uma instalacao do ' + NOME_DA_EXTENSAO + ': ' + alvo);
    }
  }

  // Copia para uma pasta irma temporaria, confere, e so entao troca (a instalacao anterior nao some
  // se a copia falhar no meio).
  const temporaria = alvo + '.novo-' + process.pid + '-' + Date.now();
  mkdirSync(path.dirname(alvo), { recursive: true });
  try {
    cpSync(origem, temporaria, { recursive: true, filter: (fonte) => !ehLixo(fonte) });
    // Conferencia: os mesmos arquivos, com o mesmo conteudo.
    if (JSON.stringify(impressao(origem)) !== JSON.stringify(impressao(temporaria))) throw new Error('a copia nao bateu com a origem');
    rmSync(alvo, { recursive: true, force: true });
    renameSync(temporaria, alvo);
  } catch (e) {
    rmSync(temporaria, { recursive: true, force: true });
    throw e;
  }
  const noDestino = impressao(alvo);
  const assinatura = createHash('sha256').update(JSON.stringify(noDestino)).digest('hex').slice(0, 12);
  return { destino: alvo, arquivos: noDestino.length, assinatura };
}

// ---------- linha de comando ----------
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const argumentos = process.argv.slice(2);
  const forcar = argumentos.includes('--forcar');
  const destino = argumentos.find((a) => !a.startsWith('--')) || DESTINO_PADRAO;
  const git = (args) => spawnSync('git', args, { cwd: raiz, encoding: 'utf8' });
  const pendente = git(['status', '--porcelain', '--', 'extensao']).stdout.trim();
  if (pendente && !forcar) {
    console.error('extensao/ tem mudanca nao commitada; commite antes (ou use --forcar para teste local):\n' + pendente);
    process.exit(1);
  }
  try {
    const r = instalar({ origem: path.join(raiz, 'extensao'), destino });
    const commit = git(['rev-parse', '--short', 'HEAD']).stdout.trim();
    console.log('instalado em ' + r.destino);
    console.log('commit ' + commit + (pendente ? ' (+ mudancas nao commitadas, --forcar)' : '') + '; ' + r.arquivos + ' arquivos; assinatura ' + r.assinatura);
    console.log('agora: chrome://extensions -> Gravador de Chamadas -> recarregar');
  } catch (e) {
    console.error('NAO instalado: ' + e.message);
    process.exit(1);
  }
}
