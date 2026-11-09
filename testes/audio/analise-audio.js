// Analise dos arquivos gravados: ffprobe (codec, canais) e ffmpeg (amostras), e a amplitude de uma
// frequencia pelo algoritmo de Goertzel. Sem dependencias.
import { spawnSync } from 'node:child_process';

export const TAXA = 48000;

export function sondar(arquivo) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', arquivo], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ffprobe falhou: ' + r.stderr);
  const fluxo = JSON.parse(r.stdout).streams.find((s) => s.codec_type === 'audio');
  return { codec: fluxo.codec_name, canais: fluxo.channels };
}

// Devolve um Float32Array por canal (canais = 2 mantem esquerdo e direito; 1 junta em mono).
export function decodificar(arquivo, canais) {
  const args = ['-v', 'error', '-i', arquivo, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', String(TAXA), '-ac', String(canais), 'pipe:1'];
  const r = spawnSync('ffmpeg', args, { maxBuffer: 200 * 1024 * 1024 });
  if (r.status !== 0) throw new Error('ffmpeg falhou: ' + String(r.stderr));
  const bytes = new Uint8Array(r.stdout);
  const todas = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const porCanal = Array.from({ length: canais }, () => new Float32Array(todas.length / canais));
  for (let i = 0; i < todas.length; i++) porCanal[i % canais][Math.floor(i / canais)] = todas[i];
  return porCanal;
}

// Amplitude do tom de 'frequencia' no trecho de 1 s que comeca em 'inicioS' (janela de 1 s: 440 Hz e
// 1000 Hz caem exatamente num ponto da analise). Tom puro de amplitude A devolve ~A.
export function amplitude(amostras, frequencia, inicioS = 1) {
  const n = TAXA;
  const de = Math.round(inicioS * TAXA);
  if (amostras.length < de + n) throw new Error('trecho curto demais: ' + amostras.length + ' amostras');
  const k = 2 * Math.cos((2 * Math.PI * frequencia) / TAXA);
  let s1 = 0;
  let s2 = 0;
  for (let i = de; i < de + n; i++) {
    const s0 = amostras[i] + k * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const potencia = s1 * s1 + s2 * s2 - k * s1 * s2;
  return (2 * Math.sqrt(Math.max(potencia, 0))) / n;
}

export const duracaoS = (amostras) => amostras.length / TAXA;
