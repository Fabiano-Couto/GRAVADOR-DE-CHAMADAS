// Instalador da pasta local — Gravador v1, decisao do usuario a partir da revisao de seguranca
// (09/11/2026). Defeitos que estes testes impedem: Chrome rodando o codigo da pasta sincronizada do
// Drive; instalador apagando uma pasta que nao e dele; copia incompleta ou com arquivo velho de uma
// instalacao anterior; lixo do Drive (desktop.ini) indo para a pasta da extensao.
// Usa so pastas temporarias.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { instalar } from '../../ferramentas/instalar.js';

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

test('instalar: recusa destino dentro do Google Drive', () => {
  assert.throws(() => instalar({ origem, destino: path.join(base, 'Meu Drive', 'Gravador') }), /dentro do Google Drive/);
  assert.throws(() => instalar({ origem, destino: path.join(base, 'My Drive', 'Gravador') }), /dentro do Google Drive/);
});

test('instalar: recusa destino dentro da propria pasta da extensao', () => {
  assert.throws(() => instalar({ origem, destino: path.join(origem, 'copia') }), /dentro da propria pasta/);
});
