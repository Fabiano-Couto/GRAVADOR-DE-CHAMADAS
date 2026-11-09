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
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
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

const UMA_HORA = 60 * 60 * 1000;
const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function ehInstalacaoDoGravador(pasta) {
  try {
    return JSON.parse(readFileSync(path.join(pasta, 'manifest.json'), 'utf8')).name === NOME_DA_EXTENSAO;
  } catch {
    return false;
  }
}

// Sobras de execucoes anteriores interrompidas: so as pastas irmas com o nome EXATO que o instalador
// gera (<alvo>.novo-<pid>-<hora> / <alvo>.anterior-<pid>-<hora>). Uma .anterior- so sai se for
// instalacao do Gravador; uma .novo- so se tiver mais de 1 hora (pode ser de outra execucao em
// andamento). Roda so DEPOIS de uma troca bem-sucedida: antes dela, uma .anterior- pode ser a unica
// instalacao inteira. 4a rodada de revisao, 09/11/2026: antes, apagava qualquer irma com o prefixo
// (ate backup do usuario) e rodava antes da copia (falha na copia = sem extensao nenhuma).
function limparSobras(alvo, apagar) {
  const pasta = path.dirname(alvo);
  const padrao = new RegExp('^' + escaparRegex(path.basename(alvo)) + '\\.(novo|anterior)-\\d+-\\d+$');
  for (const nome of readdirSync(pasta)) {
    const achado = nome.match(padrao);
    if (!achado) continue;
    const sobra = path.join(pasta, nome);
    const pode = achado[1] === 'anterior' ? ehInstalacaoDoGravador(sobra) : Date.now() - statSync(sobra).mtimeMs > UMA_HORA;
    if (!pode) continue;
    try {
      apagar(sobra, { recursive: true, force: true });
    } catch {
      // sobra presa: fica para a proxima
    }
  }
}

// operacoes: renomear/apagar trocaveis so para o teste simular arquivo preso (antivirus, indexador).
export function instalar({ origem, destino, operacoes = {} }) {
  const renomear = operacoes.renomear || renameSync;
  const apagar = operacoes.apagar || rmSync;
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
  if (existe && !ehInstalacaoDoGravador(alvo)) {
    throw new Error('o destino ja existe e nao e uma instalacao do ' + NOME_DA_EXTENSAO + ': ' + alvo);
  }

  mkdirSync(path.dirname(alvo), { recursive: true });
  const carimbo = process.pid + '-' + Date.now();
  const temporaria = alvo + '.novo-' + carimbo;
  const anterior = alvo + '.anterior-' + carimbo;
  const tirar = (pasta) => {
    try {
      apagar(pasta, { recursive: true, force: true });
    } catch {
      // sobra: a proxima execucao limpa
    }
  };

  // 1) copia para a pasta irma temporaria e confere: a instalacao anterior nem e tocada.
  try {
    cpSync(origem, temporaria, { recursive: true, filter: (fonte) => !ehLixo(fonte) });
    if (JSON.stringify(impressao(origem)) !== JSON.stringify(impressao(temporaria))) throw new Error('a copia nao bateu com a origem');
  } catch (e) {
    tirar(temporaria);
    throw e;
  }

  // 2) troca por renomeacao (3a rodada de revisao, 09/11/2026: antes, apagar a anterior podia falhar
  //    no meio — arquivo preso — e a copia nova, ja conferida, era jogada fora):
  //    anterior -> de lado; nova -> no lugar; so entao apaga a anterior.
  const tinhaAnterior = existsSync(alvo);
  if (tinhaAnterior) {
    try {
      renomear(alvo, anterior);
    } catch (e) {
      tirar(temporaria);
      throw new Error('nao consegui tirar a instalacao anterior do lugar (arquivo em uso?); nada foi mudado: ' + e.message);
    }
  }
  try {
    renomear(temporaria, alvo);
  } catch (e) {
    let devolvida = false;
    if (tinhaAnterior) {
      try {
        renomear(anterior, alvo);
        devolvida = true;
      } catch {
        // fica em "anterior"; a mensagem diz onde
      }
    }
    tirar(temporaria);
    throw new Error(
      'nao consegui por a instalacao nova no lugar: ' + e.message +
        (tinhaAnterior ? (devolvida ? '; a anterior foi devolvida' : '; a anterior ficou em ' + anterior) : ''),
    );
  }
  let aviso = null;
  if (tinhaAnterior) {
    try {
      apagar(anterior, { recursive: true, force: true });
    } catch {
      aviso = 'a instalacao anterior ficou em ' + anterior + ' (apague depois; a nova ja esta no lugar)';
    }
  }
  limparSobras(alvo, apagar); // so agora: a troca deu certo
  const noDestino = impressao(alvo);
  const assinatura = createHash('sha256').update(JSON.stringify(noDestino)).digest('hex').slice(0, 12);
  return { destino: alvo, arquivos: noDestino.length, assinatura, aviso };
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
    if (r.aviso) console.log('ATENCAO: ' + r.aviso);
    console.log('agora: chrome://extensions -> Gravador de Chamadas -> recarregar');
  } catch (e) {
    console.error('NAO instalado: ' + e.message);
    process.exit(1);
  }
}
