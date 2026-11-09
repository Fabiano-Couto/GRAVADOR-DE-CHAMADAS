// Grafo de audio da gravacao. Regras (decisao do usuario em 09/11/2026 e docs/gravacao.md):
// - canal ESQUERDO = microfone (voce); canal DIREITO = som da aba (cliente ou participantes);
// - o som da aba VOLTA para o alto-falante: ao capturar a aba, o Chrome tira o som dela do
//   alto-falante, e sem esta ligacao o usuario para de ouvir o cliente;
// - o microfone NUNCA vai para o alto-falante: o usuario ouviria a propria voz.
// Testado no Chrome de verdade, canal por canal: testes/audio/audio.test.js.
//
// fonteVoce / fonteCliente: qualquer AudioNode (no offscreen, MediaStreamSource do microfone e da
// aba; no teste, osciladores). saidaMonitor: onde o usuario ouve (ctx.destination no offscreen).

export function montarMixer({ ctx, fonteVoce, fonteCliente, saidaMonitor }) {
  // Cada lado vira mono antes de ir para o seu canal (a aba costuma ser estereo).
  const mono = () => new GainNode(ctx, { gain: 1, channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
  const voce = mono();
  const cliente = mono();
  const juntar = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
  const destino = new MediaStreamAudioDestinationNode(ctx, { channelCount: 2 });

  fonteVoce.connect(voce);
  fonteCliente.connect(cliente);
  voce.connect(juntar, 0, 0);
  cliente.connect(juntar, 0, 1);
  juntar.connect(destino);

  fonteCliente.connect(saidaMonitor);

  // Medidores de volume (pico do ultimo trecho), para a janelinha e para o aviso de microfone mudo.
  const medidorVoce = new AnalyserNode(ctx, { fftSize: 2048 });
  const medidorCliente = new AnalyserNode(ctx, { fftSize: 2048 });
  voce.connect(medidorVoce);
  cliente.connect(medidorCliente);
  const amostras = new Float32Array(2048);
  const pico = (medidor) => {
    medidor.getFloatTimeDomainData(amostras);
    let maior = 0;
    for (let i = 0; i < amostras.length; i++) {
      const v = Math.abs(amostras[i]);
      if (v > maior) maior = v;
    }
    return maior;
  };

  return {
    stream: destino.stream,
    medir() {
      return { voce: pico(medidorVoce), cliente: pico(medidorCliente) };
    },
    desmontar() {
      for (const no of [fonteVoce, fonteCliente, voce, cliente, juntar, medidorVoce, medidorCliente]) {
        try {
          no.disconnect();
        } catch {
          // ja desligado
        }
      }
    },
  };
}
