// Detector de silencio ABSOLUTO (pico abaixo de 0,00001, cerca de -100 dB) por um tempo seguido.
// Pausa na conversa ainda tem ruido de sala (pico na casa de 0,001) e nao conta.
// O offscreen usa dois: microfone (10 s: captura quebrada, microfone mudo no Windows) e aba (30 s:
// a chamada pode estar noutra janela — janela maior porque o cliente calado tambem emudece a aba).
// Testes: testes/unidade/silencio.test.js e o cenario de avisos em testes/audio/offscreen.test.js.

export function criarDetectorSilencio({ limiar = 0.00001, duracaoMs = 10000 } = {}) {
  let inicioSilencio = null;
  let alertando = false;
  return {
    get alertando() {
      return alertando;
    },
    // Recebe o pico do intervalo e a hora (ms). Devolve 'alerta' ao entrar no aviso, 'normal' ao
    // sair dele, e null quando nada muda.
    alimentar(pico, agoraMs) {
      if (pico < limiar) {
        if (inicioSilencio === null) inicioSilencio = agoraMs;
        if (!alertando && agoraMs - inicioSilencio >= duracaoMs) {
          alertando = true;
          return 'alerta';
        }
        return null;
      }
      inicioSilencio = null;
      if (alertando) {
        alertando = false;
        return 'normal';
      }
      return null;
    },
  };
}
