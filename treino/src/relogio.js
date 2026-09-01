/* O cronometro do treino, sem cronometro.
 *
 * Este arquivo nao tem `setInterval`, nao tem som e nao toca na tela. Ele
 * responde uma pergunta so: "passaram X segundos desde que o treino
 * comecou — o que a pessoa esta fazendo agora?".
 *
 * Fazer assim resolve tres problemas de uma vez:
 *
 * - PAUSAR e VOLTAR viram aritmetica. Nao existe estado escondido para
 *   dessincronizar: pausou, para de somar; voltou, soma de novo.
 * - PULAR uma estacao e so mover o relogio para o comeco do passo
 *   seguinte.
 * - O CELULAR QUE DORME nao atrapalha. O navegador congela o timer quando
 *   a tela apaga, e um contador que se decrementa sozinho perderia
 *   segundos — aqui o tempo vem do relogio do sistema, entao ao voltar o
 *   app ja esta no passo certo em vez de estar atrasado dois exercicios.
 */

/* Onde cada passo comeca, em segundos desde o inicio. */
function marcos(passos) {
  const inicio = [];
  let t = 0;
  (passos || []).forEach((p) => { inicio.push(t); t += p.segundos; });
  return { inicio: inicio, total: t };
}

function total(passos) {
  return (passos || []).reduce((s, p) => s + p.segundos, 0);
}

/* O estado do treino no instante `t`. */
function em(passos, t) {
  const lista = passos || [];
  const m = marcos(lista);
  const decorrido = Math.max(0, Number(t) || 0);

  if (!lista.length || decorrido >= m.total) {
    return {
      indice: lista.length, passo: null, proximo: null, terminou: true,
      restante: 0, decorridoNoPasso: 0, restanteTotal: 0,
      total: m.total, progresso: 1, lado: 0,
    };
  }

  let i = 0;
  while (i + 1 < lista.length && m.inicio[i + 1] <= decorrido) i += 1;

  const passo = lista[i];
  const dentro = decorrido - m.inicio[i];
  const restante = passo.segundos - dentro;

  return {
    indice: i,
    passo: passo,
    proximo: lista[i + 1] || null,
    terminou: false,
    decorridoNoPasso: dentro,
    // Arredonda para cima: enquanto sobrar qualquer fracao de segundo, a
    // tela ainda mostra "1". Chegar a zero e o fim do passo, nao o ultimo
    // segundo dele.
    restante: Math.ceil(restante - 0.0001),
    restanteTotal: Math.ceil(m.total - decorrido - 0.0001),
    total: m.total,
    progresso: m.total ? decorrido / m.total : 1,
    // Exercicio de um lado so: a primeira metade e um lado, a segunda e o
    // outro. 0 quando nao ha troca.
    lado: passo.troca ? (dentro < passo.segundos / 2 ? 1 : 2) : 0,
  };
}

/* Quando comeca o passo `i` — para pular para frente ou voltar. */
function inicioDoPasso(passos, i) {
  const m = marcos(passos);
  if (i <= 0) return 0;
  if (i >= m.inicio.length) return m.total;
  return m.inicio[i];
}

/* Pular o passo atual: devolve o instante em que o proximo comeca. */
function pular(passos, t) {
  const e = em(passos, t);
  if (e.terminou) return total(passos);
  return inicioDoPasso(passos, e.indice + 1);
}

/* Voltar. Nos primeiros 2 segundos de um passo, volta para o anterior —
   se ja passou disso, volta para o comeco do proprio passo. E o mesmo
   comportamento de "faixa anterior" de qualquer tocador de musica, e
   existe pela mesma razao: quase sempre quem aperta quer repetir o que
   acabou de comecar errado. */
function voltar(passos, t) {
  const e = em(passos, t);
  if (e.terminou) return inicioDoPasso(passos, (passos || []).length - 1);
  if (e.decorridoNoPasso > 2) return inicioDoPasso(passos, e.indice);
  return inicioDoPasso(passos, Math.max(0, e.indice - 1));
}

/* Os avisos sonoros que aconteceram entre dois instantes.
 *
 * A tela chama isto a cada quadro passando o instante anterior e o atual, e
 * toca o que voltar. Calcular por intervalo (e nao por "o segundo atual e
 * 3") e o que impede o apito de sumir quando o app perde um quadro — e
 * impede o apito duplicado quando ganha dois quadros no mesmo segundo.
 */
function avisos(passos, de, ate) {
  const eventos = [];
  if (ate <= de) return eventos;
  const m = marcos(passos);
  const lista = passos || [];

  lista.forEach((p, i) => {
    const inicio = m.inicio[i];
    const fim = inicio + p.segundos;
    const cruzou = (x) => x > de && x <= ate;

    // Contagem regressiva nos 3 ultimos segundos de qualquer passo com mais
    // de 5 segundos. Em passo curto ela viraria um chiado continuo.
    if (p.segundos > 5) {
      [3, 2, 1].forEach((n) => { if (cruzou(fim - n)) eventos.push({ tipo: 'conta', passo: i, falta: n }); });
    }
    if (p.troca && cruzou(inicio + p.segundos / 2)) eventos.push({ tipo: 'troca', passo: i });
    if (cruzou(fim)) {
      const proximo = lista[i + 1];
      eventos.push({ tipo: proximo ? (proximo.tipo === 'trabalho' || proximo.tipo === 'aquecimento'
        || proximo.tipo === 'solta' ? 'comeca' : 'para') : 'fim', passo: i });
    }
  });

  return eventos;
}

/* Quanto do treino ja foi, contado em esforco e nao em relogio: a pessoa
   quer saber quantas estacoes faltam, nao quantos segundos de descanso. */
function progressoDeEsforco(passos, t) {
  const lista = (passos || []).filter((p) => p.tipo === 'trabalho');
  if (!lista.length) return { feitas: 0, totais: 0 };
  const e = em(passos, t);
  const ate = e.terminou ? (passos || []).length : e.indice;
  const feitas = (passos || []).slice(0, ate).filter((p) => p.tipo === 'trabalho').length;
  return { feitas: feitas, totais: lista.length };
}

const Relogio = { marcos, total, em, inicioDoPasso, pular, voltar, avisos, progressoDeEsforco };

if (typeof module !== 'undefined' && module.exports) module.exports = Relogio;
else window.Relogio = Relogio;
