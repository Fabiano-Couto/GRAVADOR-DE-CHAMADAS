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
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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

// Mapa "caminho relativo -> sha256" de uma pasta, sem o lixo do sistema.
function impressao(pasta) {
  const mapa = {};
  for (const arquivo of listar(pasta)) {
    const relativo = path.relative(pasta, arquivo).split(path.sep).join('/');
    mapa[relativo] = createHash('sha256').update(readFileSync(arquivo)).digest('hex');
  }
  return mapa;
}

function dentroDoGoogleDrive(caminho) {
  return /[\\/](meu drive|my drive)([\\/]|$)/i.test(caminho);
}

export function instalar({ origem, destino }) {
  const alvo = path.resolve(destino);
  if (dentroDoGoogleDrive(alvo)) throw new Error('o destino fica dentro do Google Drive: ' + alvo);
  if (alvo.startsWith(path.resolve(origem) + path.sep) || alvo === path.resolve(origem)) {
    throw new Error('o destino fica dentro da propria pasta da extensao: ' + alvo);
  }
  // So apaga o destino se ele estiver vazio ou for uma instalacao anterior desta extensao.
  if (existsSync(alvo) && readdirSync(alvo).length > 0) {
    const manifesto = path.join(alvo, 'manifest.json');
    let nome = null;
    try {
      nome = JSON.parse(readFileSync(manifesto, 'utf8')).name;
    } catch {
      nome = null;
    }
    if (nome !== NOME_DA_EXTENSAO) {
      throw new Error('o destino ja existe e nao e uma instalacao do ' + NOME_DA_EXTENSAO + ': ' + alvo);
    }
    rmSync(alvo, { recursive: true, force: true });
  }
  mkdirSync(alvo, { recursive: true });
  cpSync(origem, alvo, { recursive: true, filter: (fonte) => !ehLixo(fonte) });

  // Conferencia: os mesmos arquivos, com o mesmo conteudo.
  const deOrigem = impressao(origem);
  const noDestino = impressao(alvo);
  if (JSON.stringify(deOrigem) !== JSON.stringify(noDestino)) throw new Error('a copia nao bateu com a origem');
  const assinatura = createHash('sha256').update(JSON.stringify(noDestino)).digest('hex').slice(0, 12);
  return { destino: alvo, arquivos: Object.keys(noDestino).length, assinatura };
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
