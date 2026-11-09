// Gravador: MediaRecorder em M4A (AAC), fatias de 5 s.
// Cada fatia vai para DOIS lugares: a memoria (de onde sai o arquivo final, sempre inteiro) e o
// armazem (copia de seguranca para recuperar se o Chrome fechar no meio). Uma falha do armazem nao
// estraga o arquivo final (achado da revisao de 09/11/2026: antes, fatia que falhava no armazem
// virava buraco no arquivo e o backup era apagado depois do download).
// Testado no Chrome de verdade: testes/audio/audio.test.js.
import { FORMATO_GRAVACAO, TIPO_ARQUIVO, BITS_POR_SEGUNDO } from './formato.js';

export class ErroGravador extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

// aoFalhar: chamado se o MediaRecorder der erro no meio (codificador). Sem isso a gravacao seguia
// "gravando" com o REC aceso e saia truncada sem aviso (revisao de 09/11/2026).
export function criarGravador({ stream, armazem, idGravacao, fatiaMs = 5000, aoFalhar = null }) {
  if (!MediaRecorder.isTypeSupported(FORMATO_GRAVACAO)) {
    throw new ErroGravador('formato', 'Este Chrome nao grava ' + FORMATO_GRAVACAO);
  }
  const gravador = new MediaRecorder(stream, { mimeType: FORMATO_GRAVACAO, audioBitsPerSecond: BITS_POR_SEGUNDO });
  gravador.onerror = (evento) => {
    if (aoFalhar) aoFalhar(evento.error || evento);
  };
  const memoria = [];
  let seq = 0;
  // Fila das gravacoes no armazem: o parar() so termina depois que a ultima fatia entrou, para que
  // apagar a gravacao depois do download nao deixe pedaco orfao chegando atrasado.
  let fila = Promise.resolve();
  let erroArmazem = null;

  gravador.ondataavailable = (evento) => {
    if (!evento.data || evento.data.size === 0) return;
    memoria.push(evento.data);
    const n = seq++;
    fila = fila
      .then(() => armazem.guardarPedaco(idGravacao, n, evento.data))
      .catch((e) => {
        erroArmazem = e;
      });
  };

  return {
    iniciar() {
      gravador.start(fatiaMs);
    },
    get pedacos() {
      return seq;
    },
    get erroArmazem() {
      return erroArmazem;
    },
    // Para, espera a ultima fatia entrar no armazem e devolve o arquivo inteiro (da memoria).
    async parar() {
      if (gravador.state !== 'inactive') {
        const parou = new Promise((resolver) => {
          gravador.onstop = () => resolver();
        });
        gravador.stop();
        await parou;
      }
      await fila;
      return new Blob(memoria, { type: TIPO_ARQUIVO });
    },
  };
}
