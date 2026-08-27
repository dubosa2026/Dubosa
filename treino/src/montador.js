/* Monta o treino de hoje.
 *
 * Entra: quanto tempo a pessoa tem, o que ela tem em casa, o foco e o
 * nivel. Sai: aquecimento, blocos de circuito e a volta a calma, com tempo
 * de trabalho e de descanso ja decididos.
 *
 * Duas regras que valem mais que o resto:
 *
 * 1. O TEMPO PEDIDO E UMA PROMESSA. Se a pessoa disse 20 minutos, o treino
 *    tem que caber em 20 minutos — incluindo aquecimento, descanso entre
 *    rodadas e alongamento. Um app que promete 20 e entrega 34 e um app que
 *    a pessoa desinstala na terceira vez.
 *
 * 2. NUNCA DOIS PADROES IGUAIS SEGUIDOS. Agachamento e afundo tem nomes
 *    diferentes e cansam a mesma perna. Trocar o padrao entre uma estacao e
 *    a seguinte e o que deixa terminar o circuito inteiro sem parar.
 *
 * O sorteio e semeado: a mesma semente devolve exatamente o mesmo treino.
 * E isso que faz "o treino de hoje" continuar o mesmo se a pessoa fechar e
 * abrir o app no meio da tarde — e e isso que deixa os testes conferirem a
 * montagem sem depender de sorte.
 */

/* eslint-disable no-undef */
const X = (typeof require !== 'undefined' && typeof module !== 'undefined')
  ? require('./exercicios.js') : window.Exercicios;

/* ------------------------------------------------------------------ *
 * Sorteio com semente                                                 *
 * ------------------------------------------------------------------ */
function semente(texto) {
  let h = 2166136261;
  const s = String(texto);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* mulberry32: pequeno, sem dependencia e sempre igual em qualquer
   navegador — que e o unico requisito aqui. */
function sorteador(sem) {
  let a = sem >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar(lista, rnd) {
  const l = lista.slice();
  for (let i = l.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const t = l[i]; l[i] = l[j]; l[j] = t;
  }
  return l;
}

/* ------------------------------------------------------------------ *
 * Ritmo por nivel                                                     *
 * ------------------------------------------------------------------ */
/* Quem esta comecando precisa de descanso igual ao esforco; quem ja treina
   aguenta 45 e 15. Nao e capricho: com pouco descanso a tecnica cai, e
   exercicio com tecnica ruim e onde as pessoas se machucam. */
const RITMO = {
  1: { trabalho: 30, descanso: 30, entreRodadas: 60, estacoes: 4 },
  2: { trabalho: 40, descanso: 20, entreRodadas: 45, estacoes: 5 },
  3: { trabalho: 45, descanso: 15, entreRodadas: 30, estacoes: 6 },
};

const PREPARAR = 10;      // a contagem antes de cada bloco comecar
const TEMPO_AQUECIMENTO = 40;
const TEMPO_SOLTA = 30;

function limitar(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/* ------------------------------------------------------------------ *
 * Escolher os exercicios de um bloco                                  *
 * ------------------------------------------------------------------ */

/* O poco de onde as estacoes saem. Se o filtro apertado nao rende gente
   suficiente, ele afrouxa em ordem — primeiro o nivel, depois o foco. O
   que ele NUNCA afrouxa e equipamento e impacto: prescrever um exercicio
   com halter para quem nao tem halter, ou um polichinelo para quem pediu
   silencio, e pior do que repetir exercicio. */
function poco(op, minimo) {
  const base = {
    tipo: 'principal',
    equipamentos: op.equipamentos,
    semImpacto: op.semImpacto,
    nivel: op.nivel,
    foco: op.foco,
  };
  let lista = X.filtrar(base);
  if (lista.length >= minimo) return lista;

  lista = X.filtrar(Object.assign({}, base, { nivel: Math.min(3, (op.nivel || 1) + 1) }));
  if (lista.length >= minimo) return lista;

  lista = X.filtrar(Object.assign({}, base, { nivel: 3, foco: 'corpo-todo' }));
  return lista;
}

/* Sequencia de estacoes sem dois padroes iguais seguidos e, quando da,
   sem dois grupos iguais seguidos.

   O algoritmo e ganancioso de proposito: percorre a lista embaralhada e
   pega o primeiro que serve. Uma busca perfeita gastaria tempo para
   resolver um problema que ninguem tem — com 46 exercicios no catalogo
   sempre sobra candidato. Quando nao sobra (poucos equipamentos, sem
   impacto, nivel 1), ele afrouxa a exigencia em vez de travar. */
function sequenciar(candidatos, quantidade, rnd, evitar) {
  const evitados = evitar || [];
  const baralho = embaralhar(candidatos, rnd);

  // Quem foi treinado nos ultimos dias vai para o fim da fila. Nao some do
  // catalogo — so perde a vez para quem ainda nao apareceu esta semana.
  const novos = baralho.filter((e) => evitados.indexOf(e.id) < 0);
  const repetidos = baralho.filter((e) => evitados.indexOf(e.id) >= 0);
  const fila = novos.concat(repetidos);

  const escolhidos = [];
  const usados = {};

  while (escolhidos.length < quantidade) {
    const anterior = escolhidos[escolhidos.length - 1];
    const livres = fila.filter((e) => !usados[e.id]);
    if (!livres.length) break;

    // O circuito da voltas: a ultima estacao emenda na PRIMEIRA da rodada
    // seguinte. Entao, ao escolher a ultima, ela tem que ser diferente das
    // duas pontas — senao a pessoa faz prancha, descansa 20 segundos e cai
    // noutra prancha, que e exatamente o que esta regra existe para
    // impedir.
    const primeiro = escolhidos[0];
    const ultima = escolhidos.length === quantidade - 1 && primeiro;

    function serve(e, exigirGrupo) {
      if (anterior && e.padrao === anterior.padrao) return false;
      if (ultima && e.padrao === primeiro.padrao) return false;
      if (!exigirGrupo) return true;
      if (anterior && e.grupo === anterior.grupo) return false;
      if (ultima && e.grupo === primeiro.grupo) return false;
      return true;
    }

    let alvo = null;
    if (anterior) {
      alvo = livres.find((e) => serve(e, true)) || livres.find((e) => serve(e, false));
    }
    alvo = alvo || livres[0];

    escolhidos.push(alvo);
    usados[alvo.id] = true;
  }

  // Catalogo pequeno demais para o tamanho do bloco: repete do comeco, que
  // e o que qualquer professor faria com um aluno sem equipamento nenhum.
  let i = 0;
  while (escolhidos.length < quantidade && escolhidos.length) {
    escolhidos.push(escolhidos[i % escolhidos.length]);
    i += 1;
  }
  return escolhidos;
}

/* Nome do bloco a partir do que ele treina: "Bloco 2 · pernas e core".
   Melhor que "Bloco 2" sozinho — a pessoa olha a lista e sabe o que vem. */
const APELIDO = {
  inferior: 'pernas', superior: 'braços e costas', core: 'core', 'corpo-todo': 'corpo todo',
};

function nomearBloco(n, exercicios) {
  const vistos = [];
  exercicios.forEach((e) => { if (vistos.indexOf(e.grupo) < 0) vistos.push(e.grupo); });
  const partes = vistos.slice(0, 2).map((g) => APELIDO[g]);
  return 'Bloco ' + n + (partes.length ? ' · ' + partes.join(' e ') : '');
}

/* ------------------------------------------------------------------ *
 * Encaixar o circuito no tempo que sobrou                              *
 * ------------------------------------------------------------------ */

/* Quanto custa, em segundos, um bloco de `estacoes` estacoes repetido
   `rodadas` vezes. Tem que bater com o que `passos()` gera, senao o app
   promete um tempo e executa outro: dentro da rodada ha descanso entre
   estacoes (uma a menos que o numero de estacoes, porque a ultima emenda
   no intervalo), e entre rodadas ha o descanso maior. */
function custoDoBloco(estacoes, rodadas, ritmo) {
  const rodada = estacoes * ritmo.trabalho + (estacoes - 1) * ritmo.descanso;
  return PREPARAR + rodadas * rodada + (rodadas - 1) * ritmo.entreRodadas;
}

/* A promessa de tempo, resolvida na forca bruta.

   Sao tres numeros para escolher — blocos, estacoes e rodadas — e umas
   duzias de combinacoes possiveis. Em vez de uma formula fechada que erra
   por arredondamento (a primeira versao prometia 20 minutos e montava 25),
   o app testa todas e fica com a que menos afasta do tempo pedido,
   preferindo, no empate, o desenho normal do nivel. */
function melhorPlano(sobra, ritmo, minutos) {
  const maxBlocos = minutos <= 15 ? 1 : (minutos <= 35 ? 2 : 3);
  let melhor = null;
  for (let nb = 1; nb <= maxBlocos; nb += 1) {
    for (let est = 3; est <= 6; est += 1) {
      for (let rod = 2; rod <= 8; rod += 1) {
        const custo = nb * custoDoBloco(est, rod, ritmo);
        // Alem do tempo, o erro pesa o desenho: 3 estacoes repetidas 8
        // vezes cabem no relogio e sao um treino chato e desequilibrado.
        // Circuito bom fica entre 4 e 6 estacoes e entre 3 e 5 rodadas —
        // fora disso, o plano paga pedagio.
        const pedagioRodadas = rod < 3 ? (3 - rod) * 12 : (rod > 5 ? (rod - 5) * 22 : 0);
        const erro = Math.abs(custo - sobra)
          + Math.abs(est - ritmo.estacoes) * 10
          + pedagioRodadas
          + (nb === maxBlocos ? 0 : 25);
        if (!melhor || erro < melhor.erro) melhor = { nb: nb, est: est, rod: rod, custo: custo, erro: erro };
      }
    }
  }
  return melhor;
}

/* ------------------------------------------------------------------ *
 * A montagem                                                          *
 * ------------------------------------------------------------------ */
function montar(opcoes) {
  const op = Object.assign({
    minutos: 20,
    foco: 'corpo-todo',
    equipamentos: [],
    nivel: 2,
    semImpacto: false,
    semente: 'padrao',
    evitar: [],
  }, opcoes || {});

  const rnd = sorteador(semente(op.semente));
  const ritmo = RITMO[op.nivel] || RITMO[2];
  const total = Math.max(5, Number(op.minutos) || 20) * 60;

  // As pontas primeiro: elas nao sao negociaveis. Treino curto encolhe o
  // aquecimento, mas nunca fica sem — entrar frio num circuito e o jeito
  // mais rapido de terminar o mes machucado.
  const nAquecimento = limitar(Math.floor((total * 0.16) / TEMPO_AQUECIMENTO), 3, 6);
  const nSolta = limitar(Math.floor((total * 0.10) / TEMPO_SOLTA), 2, 5);
  const tempoAquecimento = nAquecimento * TEMPO_AQUECIMENTO;
  const tempoSolta = nSolta * TEMPO_SOLTA;

  const aquecimento = sequenciar(X.filtrar({ tipo: 'aquecimento', semImpacto: op.semImpacto }),
    nAquecimento, rnd, []);
  const solta = sequenciar(X.filtrar({ tipo: 'solta' }), nSolta, rnd, []);

  // O que sobra e o circuito.
  const sobra = total - tempoAquecimento - tempoSolta;

  const plano = melhorPlano(sobra, ritmo, op.minutos);
  const nBlocos = plano.nb;
  const estacoes = plano.est;
  const rodadas = plano.rod;

  const disponiveis = poco(op, estacoes);
  const blocos = [];
  const jaUsados = (op.evitar || []).slice();

  for (let b = 0; b < nBlocos; b += 1) {
    const escolhidos = sequenciar(disponiveis, estacoes, rnd, jaUsados);
    escolhidos.forEach((e) => { if (jaUsados.indexOf(e.id) < 0) jaUsados.push(e.id); });
    blocos.push({
      nome: nomearBloco(b + 1, escolhidos),
      rodadas,
      trabalho: ritmo.trabalho,
      descanso: ritmo.descanso,
      entreRodadas: ritmo.entreRodadas,
      exercicios: escolhidos.map((e) => e.id),
    });
  }

  const treino = {
    versao: 1,
    semente: String(op.semente),
    minutos: op.minutos,
    foco: op.foco,
    nivel: op.nivel,
    semImpacto: !!op.semImpacto,
    equipamentos: (op.equipamentos || []).slice(),
    aquecimento: aquecimento.map((e) => e.id),
    tempoAquecimento: TEMPO_AQUECIMENTO,
    blocos,
    solta: solta.map((e) => e.id),
    tempoSolta: TEMPO_SOLTA,
  };
  treino.duracao = duracao(treino);
  return treino;
}

/* ------------------------------------------------------------------ *
 * O treino virado em passos — e o que o cronometro executa             *
 * ------------------------------------------------------------------ */

/* Cada passo e uma tela: um tipo, um tempo e o que aparece escrito. O
   cronometro nao sabe o que e bloco nem rodada; ele so anda nesta lista.
   Separar assim e o que deixa testar o tempo do treino inteiro sem abrir
   navegador. */
function passos(treino) {
  const lista = [];
  const t = treino || {};

  function nome(id) {
    const e = X.porId(id);
    return e ? e.nome : id;
  }

  if ((t.aquecimento || []).length) {
    lista.push({ tipo: 'preparar', segundos: PREPARAR, titulo: 'Aquecimento',
      bloco: 'Aquecimento', exercicio: t.aquecimento[0] });
    t.aquecimento.forEach((id) => {
      const ex = X.porId(id);
      lista.push({ tipo: 'aquecimento', segundos: t.tempoAquecimento || TEMPO_AQUECIMENTO,
        exercicio: id, titulo: nome(id), bloco: 'Aquecimento',
        troca: !!(ex && ex.unilateral) });
    });
  }

  (t.blocos || []).forEach((bloco, ib) => {
    lista.push({ tipo: 'preparar', segundos: PREPARAR, titulo: bloco.nome, bloco: bloco.nome,
      exercicio: bloco.exercicios[0], indiceBloco: ib });
    for (let r = 1; r <= bloco.rodadas; r += 1) {
      bloco.exercicios.forEach((id, ie) => {
        const ex = X.porId(id);
        lista.push({
          tipo: 'trabalho', segundos: bloco.trabalho, exercicio: id, titulo: nome(id),
          bloco: bloco.nome, indiceBloco: ib, rodada: r, rodadas: bloco.rodadas,
          estacao: ie + 1, estacoes: bloco.exercicios.length,
          troca: !!(ex && ex.unilateral),
        });
        const ultimaEstacao = ie === bloco.exercicios.length - 1;
        // O descanso tambem carrega a rodada e o total dela: a tela de
        // execucao escreve "rodada 2/3" no cabecalho o tempo todo, e sem o
        // total ela escrevia "rodada 2/undefined" justamente no descanso,
        // que e quando a pessoa tem tempo de ler o cabecalho.
        if (!ultimaEstacao) {
          lista.push({ tipo: 'descanso', segundos: bloco.descanso, titulo: 'Descanso',
            bloco: bloco.nome, indiceBloco: ib, rodada: r, rodadas: bloco.rodadas });
        } else if (r < bloco.rodadas) {
          lista.push({ tipo: 'intervalo', segundos: bloco.entreRodadas,
            titulo: 'Fim da rodada ' + r, bloco: bloco.nome, indiceBloco: ib,
            rodada: r, rodadas: bloco.rodadas });
        }
      });
    }
  });

  if ((t.solta || []).length) {
    lista.push({ tipo: 'preparar', segundos: PREPARAR, titulo: 'Volta à calma',
      bloco: 'Volta à calma', exercicio: t.solta[0] });
    t.solta.forEach((id) => {
      const ex = X.porId(id);
      lista.push({ tipo: 'solta', segundos: t.tempoSolta || TEMPO_SOLTA, exercicio: id,
        titulo: nome(id), bloco: 'Volta à calma', troca: !!(ex && ex.unilateral) });
    });
  }

  // O que vem depois, para a tela poder mostrar "a seguir: prancha" antes
  // de chegar la. Sem isso a pessoa descansa sem saber para o que se
  // preparar, e a primeira repeticao da estacao seguinte sai torta.
  //
  // Sao duas perguntas diferentes: o proximo PASSO (que pode ser um
  // descanso) e o proximo EXERCICIO. Avisar "a seguir: descanso" no meio
  // de um agachamento nao ajuda ninguem — quem esta trabalhando quer saber
  // qual e a proxima estacao, nao que vai descansar antes dela.
  lista.forEach((p, i) => {
    const prox = lista[i + 1];
    p.proximo = prox ? (prox.exercicio || prox.titulo) : null;
    p.proximoNome = prox ? (prox.exercicio ? nome(prox.exercicio) : prox.titulo) : null;
    p.indice = i;
    let j = i + 1;
    while (j < lista.length && !lista[j].exercicio) j += 1;
    p.proximoExercicio = j < lista.length ? lista[j].exercicio : null;
    p.proximoExercicioNome = p.proximoExercicio ? nome(p.proximoExercicio) : null;
  });
  return lista;
}

function duracao(treino) {
  return passos(treino).reduce((s, p) => s + p.segundos, 0);
}

/* Quantos segundos de esforco de verdade — o que conta para o volume da
   semana. Descanso nao entra: somar descanso no "tempo treinado" e
   inflar o numero que a pessoa usa para se avaliar. */
function tempoDeEsforco(treino) {
  return passos(treino)
    .filter((p) => p.tipo === 'trabalho' || p.tipo === 'aquecimento')
    .reduce((s, p) => s + p.segundos, 0);
}

/* Tudo que o treino pede que nao seja o proprio corpo. A tela de Hoje
   mostra isso antes de comecar: nada pior que descobrir no meio do bloco
   que faltava o halter. */
function equipamentoNecessario(treino) {
  const vistos = [];
  const ids = (treino.aquecimento || [])
    .concat((treino.blocos || []).reduce((a, b) => a.concat(b.exercicios), []))
    .concat(treino.solta || []);
  ids.forEach((id) => {
    const e = X.porId(id);
    if (e) e.equipamento.forEach((q) => { if (vistos.indexOf(q) < 0) vistos.push(q); });
  });
  return vistos;
}

/* Lista dos exercicios diferentes do treino, sem repetir — para o cartao
   de Hoje e para o registro do historico. */
function exerciciosDoTreino(treino) {
  const vistos = [];
  (treino.blocos || []).forEach((b) => b.exercicios.forEach((id) => {
    if (vistos.indexOf(id) < 0) vistos.push(id);
  }));
  return vistos;
}

const Montador = {
  montar, passos, duracao, tempoDeEsforco, equipamentoNecessario, exerciciosDoTreino,
  semente, sorteador, RITMO, PREPARAR,
};

if (typeof module !== 'undefined' && module.exports) module.exports = Montador;
else window.Montador = Montador;
