import { valueAt } from '../data/store.js';
import { toMinutes, weekdayOf } from './clock.js';

/**
 * A RÉGUA PESSOAL — CADA UM CONTRA O PRÓPRIO HISTÓRICO
 * ====================================================
 *
 * A competição visível deste aplicativo sempre foi com os vizinhos de ranking.
 * Funciona, mas cobra um preço: metade da equipe passa o dia recebendo a
 * notícia de que está atrás, e a distância que separa o oitavo do sétimo não
 * depende só do oitavo.
 *
 * Aqui entra a outra régua, e é ela que passa a comandar a tela do vendedor:
 * o adversário é o próprio desempenho anterior. Ninguém é comparado a ninguém,
 * nada é exposto, e o alvo é sempre alcançável — porque foi a própria pessoa
 * que o colocou lá.
 *
 * POR QUE MÉDIA MÓVEL POR DIA DA SEMANA, E NÃO O RECORDE
 * -----------------------------------------------------
 * Recorde pessoal é um alvo que sobe a cada vitória e nunca desce: quem vai
 * bem passa a perder todo dia, e a régua vira punição do bom desempenho. A
 * média volta quando o dia é fraco e sobe quando a pessoa melhora — é um alvo
 * que acompanha, não que foge.
 *
 * E por DIA DA SEMANA porque a semana comercial não é plana: segunda e sexta
 * não se parecem. Comparar quinta com a média de todos os dias transformaria o
 * calendário em mérito.
 *
 * QUANDO NÃO HÁ HISTÓRICO SUFICIENTE
 * ----------------------------------
 * A régua não inventa base. Ela desce uma escada declarada, e a tela sempre diz
 * em qual degrau está:
 *
 *   dia-da-semana   duas ou mais quintas anteriores  ->  "sua média de quinta"
 *   dias-uteis      histórico curto demais para isso ->  "sua média dos últimos N dias"
 *   ultimo-dia      só existe um dia anterior        ->  "seu resultado de ontem"
 *   sem-historico   primeiro dia                     ->  sem comparação, e dito
 *
 * Nada disso é aproximação apresentada como certeza: `base` e `amostras` viajam
 * junto com o número, e a interface escreve a frase com eles.
 */

/** Quantos dias do MESMO dia da semana entram na média. */
export const AMOSTRAS_DO_DIA_DA_SEMANA = 4;

/** Abaixo disso, uma "média de quinta" seria uma quinta só com outro nome. */
export const MINIMO_PARA_DIA_DA_SEMANA = 2;

/** Quantos dias úteis entram na média quando o dia da semana não tem base. */
export const AMOSTRAS_GERAIS = 5;

/** Passo da curva média, em minutos. */
export const PASSO = 30;

const NOMES = Object.freeze([
  'domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado',
]);

/** 'quinta' a partir de '2026-09-10'. */
export function nomeDoDiaDaSemana(isoDate) {
  return NOMES[weekdayOf(isoDate)] ?? null;
}

/**
 * Normaliza o histórico para o formato que esta régua lê.
 *
 * O aplicativo carrega o histórico como `{state, closing, highPerformance}`;
 * o coletor monta `{date, sellers}` direto dos arquivos do repositório. As duas
 * formas entram aqui e saem iguais — a régua é a mesma nos dois lados.
 */
export function diasDoHistorico(dias = []) {
  return dias
    .map((d) => (d?.state ? d.state : d))
    .filter((d) => d && d.date && Array.isArray(d.sellers))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** Escolhe os dias que formam a base, e diz qual degrau da escada é esse. */
export function amostrasPara(hoje, dias) {
  const ordenados = diasDoHistorico(dias).filter((d) => d.date < hoje);
  if (!ordenados.length) return { base: 'sem-historico', dias: [] };

  const mesmoDia = ordenados
    .filter((d) => weekdayOf(d.date) === weekdayOf(hoje))
    .slice(0, AMOSTRAS_DO_DIA_DA_SEMANA);
  if (mesmoDia.length >= MINIMO_PARA_DIA_DA_SEMANA) {
    return { base: 'dia-da-semana', dias: mesmoDia };
  }

  const recentes = ordenados.slice(0, AMOSTRAS_GERAIS);
  if (recentes.length === 1) return { base: 'ultimo-dia', dias: recentes };
  return { base: 'dias-uteis', dias: recentes };
}

/** Fechamento do dia depois do corte — o último ponto que sobrou. */
function fecho(timeline) {
  const ultimo = timeline.at(-1);
  return { orders: ultimo?.orders ?? 0, revenue: ultimo?.revenue ?? 0 };
}

/** Grade de minutos da curva média: do início do expediente à última medição. */
function grade(businessHours, dias, sellerId) {
  const inicio = toMinutes(businessHours?.start ?? '08:00');
  const fim = toMinutes(businessHours?.end ?? '18:00');
  let ultimo = fim;
  for (const dia of dias) {
    const eu = dia.sellers.find((s) => s.sellerId === sellerId);
    const m = eu?.timeline?.at(-1)?.m;
    if (Number.isFinite(m) && m > ultimo) ultimo = m;
  }
  const pontos = [];
  for (let m = inicio; m <= ultimo; m += PASSO) pontos.push(m);
  if (pontos.at(-1) !== ultimo) pontos.push(ultimo);
  return pontos;
}

/**
 * A régua de UMA pessoa.
 *
 * Devolve a curva média (acumulado médio a cada meia hora) e o fechamento
 * médio. A curva existe porque a comparação honesta é no MESMO ponto do dia:
 * às dez da manhã ninguém está acima de uma média de dia inteiro, e dizer que
 * está atrasado nesse instante seria mentira aritmética.
 *
 * @param {Object} args
 * @param {string} args.sellerId
 * @param {string} args.hoje        data de hoje, ISO
 * @param {Array}  args.dias        histórico (qualquer das duas formas)
 * @param {Object} args.businessHours
 * @returns {{base:string, amostras:number, desde:string|null, nomeDoDia:string|null,
 *            pontos:{m:number,orders:number,revenue:number}[],
 *            fechamento:{orders:number,revenue:number}}}
 */
export function reguaDe({ sellerId, hoje, dias = [], businessHours = null }) {
  const { base, dias: amostra } = amostrasPara(hoje, dias);
  const vazia = {
    base: 'sem-historico',
    amostras: 0,
    desde: null,
    nomeDoDia: nomeDoDiaDaSemana(hoje),
    pontos: [],
    fechamento: { orders: 0, revenue: 0 },
  };
  if (!amostra.length) return vazia;

  // Só entram dias em que a pessoa APARECE na base. Um dia de férias contado
  // como zero puxaria a média para baixo e entregaria uma vitória falsa.
  //
  // E só conta o que foi medido DEPOIS DA ABERTURA. Uma leitura de madrugada
  // carrega o fechamento do dia anterior: deixada na curva, ela faria a régua
  // começar às oito da manhã já com os pedidos de ontem dentro, e a pessoa
  // abriria o aplicativo devendo uma corrida que ninguém correu.
  const abertura = toMinutes(businessHours?.start ?? '08:00');
  const meus = amostra
    .map((dia) => {
      const eu = dia.sellers.find((s) => s.sellerId === sellerId);
      if (!eu?.timeline?.length) return null;
      const timeline = eu.timeline.filter((p) => p.m >= abertura);
      if (!timeline.length) return null;
      return { date: dia.date, eu: { ...eu, timeline, ...fecho(timeline) } };
    })
    .filter(Boolean);
  if (!meus.length) return vazia;

  const marcas = grade(businessHours, meus.map((d) => ({ sellers: [d.eu] })), sellerId);
  const pontos = marcas.map((m) => {
    let orders = 0;
    let revenue = 0;
    for (const { eu } of meus) {
      const v = valueAt(eu.timeline, m);
      orders += v.orders;
      revenue += v.revenue;
    }
    return { m, orders: orders / meus.length, revenue: revenue / meus.length };
  });

  const fechamento = meus.reduce((acc, { eu }) => ({
    orders: acc.orders + (eu.orders ?? 0),
    revenue: acc.revenue + (eu.revenue ?? 0),
  }), { orders: 0, revenue: 0 });

  // A pessoa pode faltar em parte das amostras escolhidas. Nesse caso o degrau
  // real da escada é mais baixo do que o pretendido, e quem diz qual é são os
  // dias que sobraram — não os que foram procurados.
  const degrau = meus.length === 1
    ? 'ultimo-dia'
    : base === 'dia-da-semana' && meus.length < MINIMO_PARA_DIA_DA_SEMANA
      ? 'dias-uteis'
      : base;

  return {
    base: degrau,
    amostras: meus.length,
    desde: meus.at(-1).date,
    nomeDoDia: nomeDoDiaDaSemana(hoje),
    pontos,
    fechamento: {
      orders: fechamento.orders / meus.length,
      revenue: fechamento.revenue / meus.length,
    },
  };
}

/**
 * A régua no mesmo ponto do dia — em degraus, como toda curva acumulada deste
 * sistema. Interpolar aqui inventaria produção média que nunca existiu.
 */
export function reguaEm(regua, atMinutes) {
  const pontos = regua?.pontos ?? [];
  if (!pontos.length) return { orders: 0, revenue: 0 };
  let escolhido = null;
  for (const p of pontos) {
    if (p.m <= atMinutes) escolhido = p;
    else break;
  }
  if (!escolhido) return { orders: 0, revenue: 0 };
  return { orders: escolhido.orders, revenue: escolhido.revenue };
}

/**
 * Você contra você, neste instante.
 *
 * O indicador é PEDIDOS quando a origem não informa faturamento por vendedor —
 * a mesma regra que já governa o ranking e as mensagens. A comparação sai
 * arredondada em pedidos inteiros: "0,4 pedido acima" não é uma frase.
 */
export function compararComARegua({
  regua, orders = 0, revenue = 0, atMinutes = 0, temFaturamento = false,
}) {
  if (!regua || regua.base === 'sem-historico' || !regua.amostras) {
    return {
      estado: 'sem-regua',
      base: 'sem-historico',
      amostras: 0,
      nomeDoDia: regua?.nomeDoDia ?? null,
      marca: null,
      diferenca: 0,
      unidade: temFaturamento ? 'revenue' : 'orders',
    };
  }

  const marca = reguaEm(regua, atMinutes);
  const unidade = temFaturamento ? 'revenue' : 'orders';
  const meu = unidade === 'revenue' ? revenue : orders;
  const dele = unidade === 'revenue' ? marca.revenue : marca.orders;
  const bruta = meu - dele;
  const diferenca = unidade === 'revenue' ? bruta : Math.round(bruta);

  return {
    estado: diferenca > 0 ? 'acima' : diferenca < 0 ? 'abaixo' : 'igual',
    base: regua.base,
    amostras: regua.amostras,
    desde: regua.desde,
    nomeDoDia: regua.nomeDoDia,
    marca: { orders: marca.orders, revenue: marca.revenue },
    fechamento: regua.fechamento,
    diferenca,
    unidade,
  };
}

/** Como a base deve ser chamada na tela, sem prometer mais do que ela é. */
export function comoChamarABase(cmp) {
  if (!cmp || cmp.estado === 'sem-regua') return null;
  switch (cmp.base) {
    case 'dia-da-semana': return `sua média de ${cmp.nomeDoDia}`;
    case 'dias-uteis': return `sua média dos últimos ${cmp.amostras} dias`;
    case 'ultimo-dia': return 'seu último dia';
    default: return 'sua marca anterior';
  }
}

/** As réguas de todo mundo, para o cálculo coletivo. Nunca sai daqui por inteiro. */
export function reguasDaEquipe({ sellers = [], hoje, dias = [], businessHours = null }) {
  const mapa = new Map();
  for (const seller of sellers) {
    mapa.set(seller.sellerId, reguaDe({ sellerId: seller.sellerId, hoje, dias, businessHours }));
  }
  return mapa;
}

/**
 * ITEM COLETIVO — "X de N superaram a própria marca hoje".
 *
 * A única frase sobre a equipe que o vendedor recebe, e ela é a mesma para
 * todo mundo: uma contagem, sem nome, sem posição, sem ordem. Quem está dentro
 * do X não é revelado nem para quem está dentro dele.
 *
 * `de` conta apenas quem TEM régua. Dizer "5 de 22" quando só doze pessoas têm
 * histórico seria transformar a falta de base em fracasso alheio.
 */
export function superaramAPropriaMarca({
  sellers = [], reguas = new Map(), atMinutes = 0, temFaturamento = false,
}) {
  let n = 0;
  let de = 0;
  let semRegua = 0;
  for (const seller of sellers) {
    const regua = reguas.get ? reguas.get(seller.sellerId) : reguas?.[seller.sellerId];
    if (!regua || !regua.amostras) { semRegua += 1; continue; }
    de += 1;
    const cmp = compararComARegua({
      regua,
      orders: seller.orders ?? 0,
      revenue: seller.revenue ?? 0,
      atMinutes,
      temFaturamento,
    });
    if (cmp.estado === 'acima') n += 1;
  }
  return { n, de, semRegua, fracao: de > 0 ? n / de : 0 };
}
