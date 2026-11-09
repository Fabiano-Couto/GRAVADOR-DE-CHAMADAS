// Formato da gravacao. M4A (AAC) foi escolhido em 09/11/2026 porque o Chrome 156 grava nativo
// (MediaRecorder.isTypeSupported = true) e o arquivo abre em qualquer player e no celular.
// MP3 nao e gravado pelo Chrome sem biblioteca embutida.
export const FORMATO_GRAVACAO = 'audio/mp4;codecs=mp4a.40.2';
export const TIPO_ARQUIVO = 'audio/mp4';
export const EXTENSAO = 'm4a';
export const BITS_POR_SEGUNDO = 96000;
