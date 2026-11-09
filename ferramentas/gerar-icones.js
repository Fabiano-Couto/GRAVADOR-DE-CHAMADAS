// Gera os icones da extensao (extensao/icones/icone-16/48/128.png): circulo vermelho com miolo
// branco e ponto vermelho (simbolo de gravar). PNG montado a mao com o zlib do Node, sem dependencias.
// Uso (dentro de codigo/): node ferramentas/gerar-icones.js
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'extensao', 'icones');
const VERMELHO = [217, 48, 37];
const BRANCO = [255, 255, 255];
const AMOSTRAS = 4; // 4 x 4 amostras por pixel: borda suave

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo) >>> 0);
  return Buffer.concat([tamanho, corpo, crc]);
}

// Cor de um ponto (x, y em 0..1): anel vermelho, miolo branco, ponto vermelho no centro.
function corDoPonto(x, y) {
  const r = Math.hypot(x - 0.5, y - 0.5);
  if (r > 0.48) return null;
  if (r > 0.36) return VERMELHO;
  if (r > 0.22) return BRANCO;
  return VERMELHO;
}

function gerar(lado) {
  const linhas = [];
  for (let py = 0; py < lado; py++) {
    const linha = Buffer.alloc(1 + lado * 4); // byte de filtro 0 + RGBA
    for (let px = 0; px < lado; px++) {
      let soma = [0, 0, 0];
      let cobertura = 0;
      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const cor = corDoPonto((px + (sx + 0.5) / AMOSTRAS) / lado, (py + (sy + 0.5) / AMOSTRAS) / lado);
          if (cor) {
            soma = soma.map((v, i) => v + cor[i]);
            cobertura++;
          }
        }
      }
      const o = 1 + px * 4;
      if (cobertura) {
        linha[o] = Math.round(soma[0] / cobertura);
        linha[o + 1] = Math.round(soma[1] / cobertura);
        linha[o + 2] = Math.round(soma[2] / cobertura);
      }
      linha[o + 3] = Math.round((cobertura / (AMOSTRAS * AMOSTRAS)) * 255);
    }
    linhas.push(linha);
  }
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(lado, 0);
  cabecalho.writeUInt32BE(lado, 4);
  cabecalho[8] = 8; // bits por canal
  cabecalho[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(Buffer.concat(linhas))),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

for (const lado of [16, 48, 128]) {
  const arquivo = path.join(PASTA, 'icone-' + lado + '.png');
  writeFileSync(arquivo, gerar(lado));
  console.log('gerado', arquivo);
}
