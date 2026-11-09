// Detector de silencio ABSOLUTO no microfone. Pausa na conversa ainda tem ruido de sala (pico na
// casa de 0,001); silencio absoluto (pico abaixo de 0,00001, cerca de -100 dB) por 10 s e sinal de
// captura quebrada: microfone mudo no Windows, outro dispositivo, permissao perdida.
// So o canal do microfone e vigiado: o canal da aba fica mudo de verdade quando o cliente esta
// calado ou a chamada ainda nao foi atendida, e daria alarme falso.
// Testes: testes/unidade/silencio.test.js.

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
