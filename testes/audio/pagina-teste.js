// Pagina de teste: usa os MESMOS modulos da extensao (mixer, gravador, armazem) com dois tons
// sinteticos no lugar do microfone e da aba. 440 Hz faz o papel de "voce" e 1000 Hz o de "cliente".
// O teste em Node (audio.test.js) chama as funcoes abaixo pelo protocolo DevTools e confere os
// arquivos com ffmpeg/ffprobe.
import { montarMixer } from '/extensao/lib/mixer.js';
import { criarGravador } from '/extensao/lib/gravador.js';
import { abrirArmazem } from '/extensao/lib/armazem.js';

const espera = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

const paraBase64 = (blob) =>
  new Promise((resolver, rejeitar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result).split(',')[1] || '');
    leitor.onerror = () => rejeitar(leitor.error);
    leitor.readAsDataURL(blob);
  });

function montarCena(ctx) {
  const tom = (frequencia) => {
    const oscilador = new OscillatorNode(ctx, { frequency: frequencia });
    const volume = new GainNode(ctx, { gain: 0.3 });
    oscilador.connect(volume);
    oscilador.start();
    return volume;
  };
  const voce = tom(440);
  const cliente = tom(1000);
  const monitor = new MediaStreamAudioDestinationNode(ctx);
  const mixer = montarMixer({ ctx, fonteVoce: voce, fonteCliente: cliente, saidaMonitor: monitor });
  return { monitor, mixer };
}

async function novaGravacao(armazem, id) {
  await armazem.criarGravacao({ id, nome: 'teste.m4a', origem: 'teste', inicio: Date.now(), situacao: 'gravando' });
}

// Grava 3 s: devolve o arquivo final, o que saiu no alto-falante e o estado do armazem depois de apagar.
window.testeGravacao = async () => {
  const ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.resume();
  const { monitor, mixer } = montarCena(ctx);
  const banco = 'teste-gravacao-' + crypto.randomUUID();
  const armazem = await abrirArmazem(banco);
  await novaGravacao(armazem, 'g1');
  const gravador = criarGravador({ stream: mixer.stream, armazem, idGravacao: 'g1', fatiaMs: 1000 });

  const gravadorMonitor = new MediaRecorder(monitor.stream, { mimeType: 'audio/webm;codecs=opus' });
  const partesMonitor = [];
  gravadorMonitor.ondataavailable = (e) => partesMonitor.push(e.data);

  gravador.iniciar();
  gravadorMonitor.start();
  await espera(3000);
  const niveis = mixer.medir();
  const arquivo = await gravador.parar();
  const monitorParou = new Promise((resolver) => {
    gravadorMonitor.onstop = resolver;
  });
  gravadorMonitor.stop();
  await monitorParou;

  const pedacosAntes = (await armazem.lerPedacos('g1')).length;
  await armazem.apagarGravacao('g1');
  const pedacosDepois = (await armazem.lerPedacos('g1')).length;
  const gravacoesDepois = (await armazem.listarGravacoes()).length;
  mixer.desmontar();
  await ctx.close();
  armazem.fechar();

  return {
    arquivo: await paraBase64(arquivo),
    tipo: arquivo.type,
    monitor: await paraBase64(new Blob(partesMonitor)),
    fatiasGravadas: gravador.pedacos,
    pedacosAntes,
    pedacosDepois,
    gravacoesDepois,
    niveis,
    erroArmazem: gravador.erroArmazem ? String(gravador.erroArmazem) : null,
  };
};

// Armazem lento (disco ocupado): cada fatia demora 400 ms para entrar. O parar() so termina depois
// que a ultima fatia entrou: logo depois dele o armazem tem tudo, e apagar a gravacao (o que o
// offscreen faz quando o download termina) nao deixa pedaco orfao chegando atrasado.
// (Com o armazem rapido, a ordem das transacoes do IndexedDB esconde essa espera; sabotagem de
// 09/11/2026 mostrou isso.)
window.testeArmazemLento = async () => {
  const ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.resume();
  const { mixer } = montarCena(ctx);
  const real = await abrirArmazem('teste-lento-' + crypto.randomUUID());
  const lento = {
    ...real,
    guardarPedaco: async (...args) => {
      await espera(400);
      return real.guardarPedaco(...args);
    },
    montarArquivo: (id) => real.montarArquivo(id),
  };
  await novaGravacao(real, 'l1');
  const gravador = criarGravador({ stream: mixer.stream, armazem: lento, idGravacao: 'l1', fatiaMs: 1000 });
  gravador.iniciar();
  await espera(3000);
  const arquivo = await gravador.parar();
  const todos = await real.lerPedacos('l1');
  const bytesGuardados = todos.reduce((soma, b) => soma + b.size, 0);
  await real.apagarGravacao('l1');
  await espera(3000); // tempo de sobra para qualquer gravacao atrasada chegar
  const orfaos = (await real.lerPedacos('l1')).length;
  await ctx.close();
  real.fechar();
  return { bytesArquivo: arquivo.size, bytesGuardados, pedacos: todos.length, orfaos };
};

// Armazem que falha em toda fatia (disco cheio, cota estourada): o arquivo final sai inteiro da
// memoria do gravador, e o erro fica registrado (achado da revisao de 09/11/2026).
window.testeArmazemFalho = async () => {
  const ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.resume();
  const { mixer } = montarCena(ctx);
  const falho = {
    guardarPedaco: async () => {
      throw new Error('cota estourada (falso)');
    },
  };
  const gravador = criarGravador({ stream: mixer.stream, armazem: falho, idGravacao: 'f1', fatiaMs: 1000 });
  gravador.iniciar();
  await espera(3000);
  const arquivo = await gravador.parar();
  await ctx.close();
  return { arquivo: await paraBase64(arquivo), erroArmazem: gravador.erroArmazem ? String(gravador.erroArmazem.message) : null };
};

// Gravacao interrompida: o gravador nunca e parado (como se o Chrome tivesse fechado no meio).
// Uma conexao NOVA ao armazem (como na proxima abertura do Chrome) monta o que ficou guardado.
// O Chrome entrega a 1a fatia so com o cabecalho do MP4 (667 bytes, medido em 09/11/2026) e o
// primeiro audio na 2a: espera ate haver cabecalho + 2 trechos de audio (com a maquina ocupada por
// outros testes, uma espera fixa pegava so o cabecalho).
window.testeRecuperacao = async () => {
  const ctx = new AudioContext({ sampleRate: 48000 });
  await ctx.resume();
  const { mixer } = montarCena(ctx);
  const banco = 'teste-recuperacao-' + crypto.randomUUID();
  const armazem = await abrirArmazem(banco);
  await novaGravacao(armazem, 'r1');
  const gravador = criarGravador({ stream: mixer.stream, armazem, idGravacao: 'r1', fatiaMs: 1000 });
  const comeco = performance.now();
  gravador.iniciar();
  const limite = comeco + 20000;
  while ((await armazem.lerPedacos('r1')).length < 3 && performance.now() < limite) await espera(100);

  const depoisDoTravamento = await abrirArmazem(banco);
  const gravacoes = await depoisDoTravamento.listarGravacoes();
  const pedacos = (await depoisDoTravamento.lerPedacos('r1')).length;
  const arquivo = await depoisDoTravamento.montarArquivo('r1');
  const decorridoS = (performance.now() - comeco) / 1000;
  depoisDoTravamento.fechar();
  await ctx.close();

  return {
    arquivo: await paraBase64(arquivo),
    gravacoes: gravacoes.map((g) => ({ id: g.id, situacao: g.situacao })),
    pedacos,
    decorridoS,
  };
};

window.paginaPronta = true;
