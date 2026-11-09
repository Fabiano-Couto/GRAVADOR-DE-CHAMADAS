// Instalador da pasta local — Gravador v1, decisao do usuario a partir da revisao de seguranca
// (09/11/2026). Defeitos que estes testes impedem: Chrome rodando o codigo da pasta sincronizada do
// Drive; instalador apagando uma pasta que nao e dele; copia incompleta ou com arquivo velho de uma
// instalacao anterior; lixo do Drive (desktop.ini) indo para a pasta da extensao.
// Usa so pastas temporarias.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { instalar, impressao } from '../../ferramentas/instalar.js';

let base;
let origem;
let destino;

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'gravador-instalar-'));
  origem = path.join(base, 'extensao');
  destino = path.join(base, 'Extensoes', 'Gravador de Chamadas');
  mkdirSync(path.join(origem, 'lib'), { recursive: true });
  writeFileSync(path.join(origem, 'manifest.json'), JSON.stringify({ name: 'Gravador de Chamadas' }));
  writeFileSync(path.join(origem, 'lib', 'a.js'), 'export const a = 1;\n');
  writeFileSync(path.join(origem, 'desktop.ini'), '[.ShellClassInfo]\n');
});

afterEach(() => rmSync(base, { recursive: true, force: true }));

test('instalar: copia todos os arquivos com o mesmo conteudo e deixa o desktop.ini do Drive de fora', () => {
  const r = instalar({ origem, destino });
  assert.equal(r.arquivos, 2);
  assert.equal(readFileSync(path.join(destino, 'lib', 'a.js'), 'utf8'), 'export const a = 1;\n');
  assert.equal(existsSync(path.join(destino, 'desktop.ini')), false);
});

test('instalar: reinstalar remove arquivo que saiu da extensao', () => {
  writeFileSync(path.join(origem, 'lib', 'velho.js'), '// vai sair\n');
  instalar({ origem, destino });
  rmSync(path.join(origem, 'lib', 'velho.js'));
  const r = instalar({ origem, destino });
  assert.equal(existsSync(path.join(destino, 'lib', 'velho.js')), false);
  assert.equal(r.arquivos, 2);
});

test('instalar: recusa apagar uma pasta que nao e uma instalacao do Gravador, e nao toca nela', () => {
  mkdirSync(destino, { recursive: true });
  writeFileSync(path.join(destino, 'importante.txt'), 'nao apagar');
  assert.throws(() => instalar({ origem, destino }), /nao e uma instalacao do Gravador de Chamadas/);
  assert.equal(readFileSync(path.join(destino, 'importante.txt'), 'utf8'), 'nao apagar');
});

// 2a rodada de revisao (09/11/2026): drives compartilhados, OneDrive, Dropbox e iCloud passavam.
test('instalar: recusa destino dentro de qualquer pasta sincronizada com a nuvem', () => {
  for (const pasta of ['Meu Drive', 'My Drive', 'Drives compartilhados', 'Shared drives', 'OneDrive', 'OneDrive - Empresa X', 'Dropbox', 'iCloudDrive', 'iCloud Drive']) {
    assert.throws(() => instalar({ origem, destino: path.join(base, pasta, 'Gravador') }), /pasta sincronizada/, pasta);
  }
});

// 2a rodada: um outro checkout do projeto passado como destino seria apagado com trabalho nao salvo.
test('instalar: recusa destino dentro de um repositorio git e nao toca nele', () => {
  const repo = path.join(base, 'outro-checkout');
  mkdirSync(path.join(repo, '.git'), { recursive: true });
  mkdirSync(path.join(repo, 'extensao'), { recursive: true });
  writeFileSync(path.join(repo, 'extensao', 'manifest.json'), JSON.stringify({ name: 'Gravador de Chamadas' }));
  writeFileSync(path.join(repo, 'extensao', 'trabalho.js'), '// nao commitado\n');
  assert.throws(() => instalar({ origem, destino: path.join(repo, 'extensao') }), /repositorio git/);
  assert.equal(readFileSync(path.join(repo, 'extensao', 'trabalho.js'), 'utf8'), '// nao commitado\n');
});

test('instalar: pasta que so tem desktop.ini conta como vazia', () => {
  mkdirSync(destino, { recursive: true });
  writeFileSync(path.join(destino, 'desktop.ini'), '[.ShellClassInfo]\n');
  assert.equal(instalar({ origem, destino }).arquivos, 2);
});

// 3a rodada de revisao (09/11/2026): apagar a instalacao anterior podia falhar no meio (arquivo preso
// por antivirus/indexador/Chrome), deixando-a meio apagada, e a copia nova ja conferida era jogada
// fora. Agora a troca e por renomeacao. As falhas sao simuladas trocando renomear/apagar.
const conteudo = (rel) => readFileSync(path.join(destino, rel), 'utf8');
const versaoNova = () => writeFileSync(path.join(origem, 'lib', 'a.js'), 'export const a = 2;\n');

test('instalar: anterior presa (nao sai do lugar): nada muda e nao sobra temporaria', () => {
  instalar({ origem, destino });
  versaoNova();
  const renomear = () => {
    throw new Error('EPERM falso');
  };
  assert.throws(() => instalar({ origem, destino, operacoes: { renomear } }), /nada foi mudado/);
  assert.equal(conteudo('lib/a.js'), 'export const a = 1;\n');
  assert.deepEqual(readdirSync(path.dirname(destino)), ['Gravador de Chamadas']);
});

test('instalar: nova nao entra no lugar: a anterior e devolvida inteira', () => {
  instalar({ origem, destino });
  versaoNova();
  let chamada = 0;
  const renomear = (de, para) => {
    chamada++;
    if (chamada === 2) throw new Error('EBUSY falso'); // 1a: anterior para o lado; 2a: nova no lugar
    return renameSync(de, para);
  };
  assert.throws(() => instalar({ origem, destino, operacoes: { renomear } }), /a anterior foi devolvida/);
  assert.equal(conteudo('lib/a.js'), 'export const a = 1;\n');
  assert.equal(conteudo('manifest.json'), JSON.stringify({ name: 'Gravador de Chamadas' }));
  assert.deepEqual(readdirSync(path.dirname(destino)), ['Gravador de Chamadas']);
});

test('instalar: anterior nao se deixa apagar: a nova ja esta no lugar e o aviso diz onde a anterior ficou', () => {
  instalar({ origem, destino });
  versaoNova();
  const apagar = (alvo, opcoes) => {
    if (alvo.includes('.anterior-')) throw new Error('EPERM falso');
    return rmSync(alvo, opcoes);
  };
  const r = instalar({ origem, destino, operacoes: { apagar } });
  assert.equal(conteudo('lib/a.js'), 'export const a = 2;\n');
  assert.match(r.aviso, /a instalacao anterior ficou em .*Gravador de Chamadas\.anterior-/);
});

// 4a rodada de revisao (09/11/2026): a limpeza apagava qualquer irma com o prefixo (ate backup do
// usuario) e rodava antes da copia (falha na copia depois de uma troca falha = sem extensao).
const irma = (nome) => path.join(path.dirname(destino), nome);
const plantarInstalacao = (pasta, nome = 'Gravador de Chamadas') => {
  mkdirSync(pasta, { recursive: true });
  writeFileSync(path.join(pasta, 'manifest.json'), JSON.stringify({ name: nome }));
};
const envelhecer = (pasta) => {
  const duasHorasAtras = new Date(Date.now() - 2 * 60 * 60 * 1000);
  utimesSync(pasta, duasHorasAtras, duasHorasAtras);
};

test('instalar: limpa so as sobras com o nome exato que ele gera (anterior do Gravador, temporaria velha)', () => {
  plantarInstalacao(irma('Gravador de Chamadas.anterior-3-4'));
  mkdirSync(irma('Gravador de Chamadas.novo-1-2'), { recursive: true });
  envelhecer(irma('Gravador de Chamadas.novo-1-2'));
  mkdirSync(irma('Outra Coisa'), { recursive: true });
  instalar({ origem, destino });
  assert.deepEqual(readdirSync(path.dirname(destino)).sort(), ['Gravador de Chamadas', 'Outra Coisa']);
});

test('instalar: nao apaga pasta do usuario com nome parecido, anterior de outra extensao nem temporaria recente', () => {
  plantarInstalacao(irma('Gravador de Chamadas.anterior-backup-manual'));
  mkdirSync(irma('Gravador de Chamadas.novo-projeto-do-usuario'), { recursive: true });
  plantarInstalacao(irma('Gravador de Chamadas.anterior-5-6'), 'Outra Extensao');
  mkdirSync(irma('Gravador de Chamadas.novo-7-8'), { recursive: true }); // recente: outra execucao em andamento
  instalar({ origem, destino });
  assert.deepEqual(readdirSync(path.dirname(destino)).sort(), [
    'Gravador de Chamadas',
    'Gravador de Chamadas.anterior-5-6',
    'Gravador de Chamadas.anterior-backup-manual',
    'Gravador de Chamadas.novo-7-8',
    'Gravador de Chamadas.novo-projeto-do-usuario',
  ]);
});

// 5a rodada de revisao (09/11/2026): o padrao tem de ser o nome EXATO (caracteres especiais do
// destino escapados; nada antes nem depois).
test('instalar: o padrao das sobras e o nome exato (destino com ponto e parenteses; nada antes nem depois)', () => {
  const especial = path.join(base, 'Extensoes', 'Gravador v1.2 (teste)');
  plantarInstalacao(path.join(base, 'Extensoes', 'Gravador v1.2 (teste).anterior-3-4'));
  plantarInstalacao(path.join(base, 'Extensoes', 'Gravador v1X2 (teste).anterior-3-4')); // "." nao e curinga
  plantarInstalacao(path.join(base, 'Extensoes', 'X Gravador v1.2 (teste).anterior-3-4')); // algo antes
  plantarInstalacao(path.join(base, 'Extensoes', 'Gravador v1.2 (teste).anterior-3-4.bak')); // algo depois
  instalar({ origem, destino: especial });
  assert.deepEqual(readdirSync(path.join(base, 'Extensoes')).sort(), [
    'Gravador v1.2 (teste)',
    'Gravador v1.2 (teste).anterior-3-4.bak',
    'Gravador v1X2 (teste).anterior-3-4',
    'X Gravador v1.2 (teste).anterior-3-4',
  ]);
});

test('instalar: sobra que nao da para ler nao derruba a instalacao que ja deu certo', () => {
  mkdirSync(irma('Gravador de Chamadas.novo-1-2'), { recursive: true });
  const estado = (alvo) => {
    if (alvo.includes('.novo-1-2')) throw new Error('ENOENT falso (atalho quebrado)');
    return statSync(alvo);
  };
  const r = instalar({ origem, destino, operacoes: { estado } });
  assert.equal(r.arquivos, 2);
  assert.equal(existsSync(irma('Gravador de Chamadas.novo-1-2')), true);
});

test('instalar: se a limpeza apagou a anterior que tinha resistido, o aviso nao manda apagar depois', () => {
  instalar({ origem, destino });
  versaoNova();
  let resistiu = false;
  const apagar = (alvo, opcoes) => {
    if (alvo.includes('.anterior-') && !resistiu) {
      resistiu = true; // falha so na primeira vez
      throw new Error('EPERM falso');
    }
    return rmSync(alvo, opcoes);
  };
  const r = instalar({ origem, destino, operacoes: { apagar } });
  assert.equal(r.aviso, null);
  assert.deepEqual(readdirSync(path.dirname(destino)), ['Gravador de Chamadas']);
});

test('instalar: com a copia falhando, nao apaga a anterior que ficou de lado (pode ser a unica inteira)', () => {
  plantarInstalacao(irma('Gravador de Chamadas.anterior-3-4'));
  assert.throws(() => instalar({ origem: path.join(base, 'nao-existe'), destino }));
  assert.equal(existsSync(path.join(irma('Gravador de Chamadas.anterior-3-4'), 'manifest.json')), true);
});

test('instalar: nao deixa pasta temporaria para tras', () => {
  instalar({ origem, destino });
  instalar({ origem, destino });
  assert.deepEqual(readdirSync(path.dirname(destino)), ['Gravador de Chamadas']);
});

// Defeito de 09/11/2026 (primeira instalacao real, do Drive para o C:): a conferencia comparava na
// ordem em que cada disco lista a pasta, e o Drive lista diferente. A impressao sai ordenada pelo
// caminho, nao importa a ordem em que os arquivos foram criados.
// O NTFS lista sem diferenciar maiuscula (a.js antes de B.js); a ordem pelo codigo do caractere poe
// B.js antes. Se a impressao dependesse da ordem do disco, este teste cairia.
test('instalar: a conferencia nao depende da ordem em que o disco lista os arquivos', () => {
  const outra = path.join(base, 'outra');
  mkdirSync(path.join(outra, 'lib'), { recursive: true });
  writeFileSync(path.join(outra, 'a.js'), '1\n');
  writeFileSync(path.join(outra, 'B.js'), '2\n');
  writeFileSync(path.join(outra, 'lib', 'c.js'), '3\n');
  assert.deepEqual(
    impressao(outra).map(([caminho]) => caminho),
    ['B.js', 'a.js', 'lib/c.js'],
  );
});

test('instalar: recusa destino dentro da propria pasta da extensao', () => {
  assert.throws(() => instalar({ origem, destino: path.join(origem, 'copia') }), /dentro da propria pasta/);
});
