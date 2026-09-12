import { reguaDe, compararComARegua, comoChamarABase } from './regua.js';

/**
 * DESAFIOS DO GESTOR — SEMPRE CONTRA O PRÓPRIO HISTÓRICO
 * ======================================================
 *
 * O quadro de conquistas é permanente e igual para todo mundo. O desafio é o
 * contrário: o gestor escreve, tem prazo, e vale só enquanto dura.
 *
 * TRÊS REGRAS FECHAM O DESENHO, e nenhuma delas é decoração:
 *
 *   1. O ALVO É SEMPRE A PRÓPRIA MARCA. Não existe desafio que compare uma
 *      pessoa com outra, nem que dependa do que os outros fizeram. Por isso o
 *      catálogo abaixo é fechado: não há como escrever, por engano, um desafio
 *      que exponha alguém.
 *
 *   2. O APLICATIVO VERIFICA SOZINHO. Nada de "mandar print para o gestor".
 *      Cada regra se resolve com o que a base já traz — pedidos do dia,
 *      faturamento do dia e o histórico da própria pessoa. Um desafio que
 *      precisasse de julgamento humano viraria discussão.
 *
 *   3. NÃO HÁ PRÊMIO AQUI. O desafio marca o placar e o quadro; o que se faz
 *      com isso é assunto de quem dirige a equipe, fora do aplicativo.
 *
 * O RESULTADO COLETIVO do desafio é uma contagem — "12 de 19 cumpriram" —, a
 * mesma forma anônima da barra coletiva. Nunca uma lista, nunca uma ordem.
 */

/** Catálogo fechado. Cada regra se mede contra o histórico de quem a cumpre. */
export const REGRAS = Object.freeze({
  media: {
    id: 'media',
    nome: 'Superar a própria média',
    ajuda: 'No mesmo horário do dia, ficar acima da própria média — todo dia do prazo.',
    unidade: 'pedidos',
    alvoPadrao: 1,
  },
  fechamento: {
    id: 'fechamento',
    nome: 'Fechar acima da própria média',
    ajuda: 'Terminar o dia acima do próprio fechamento médio.',
    unidade: 'pedidos',
    alvoPadrao: 1,
  },
  sequencia: {
    id: 'sequencia',
    nome: 'Sequência de dias acima da própria média',
    ajuda: 'Fechar acima da própria média em vários dias dentro do prazo.',
    unidade: 'dias',
    alvoPadrao: 3,
  },
});

/** Normaliza o que veio da configuração, sem confiar no que foi digitado. */
export function normalizar(desafio) {
  if (!desafio || typeof desafio !== 'object') return null;
  const regra = REGRAS[desafio.regra] ? desafio.regra : null;
  if (!regra) return null;
  const alvo = Number(desafio.alvo);
  return {
    id: String(desafio.id ?? `${regra}-${desafio.de ?? ''}`),
    titulo: String(desafio.titulo ?? REGRAS[regra].nome).trim() || REGRAS[regra].nome,
    regra,
    alvo: Number.isFinite(alvo) && alvo > 0 ? Math.round(alvo) : REGRAS[regra].alvoPadrao,
    de: typeof desafio.de === 'string' ? desafio.de : null,
    ate: typeof desafio.ate === 'string' ? desafio.ate : null,
    metaColetiva: Number.isFinite(Number(desafio.metaColetiva)) && Number(desafio.metaColetiva) > 0
      ? Math.round(Number(desafio.metaColetiva))
      : null,
  };
}

/** Está valendo hoje? Sem prazo, não vale: desafio sem fim vira paisagem. */
export function valeEm(desafio, hoje) {
  const d = normalizar(desafio);
  if (!d || !d.de || !d.ate || !hoje) return false;
  return d.de <= hoje && hoje <= d.ate;
}

/**
 * O desafio em vigor.
 *
 * Um por vez, e de propósito: dois alvos ao mesmo tempo não são o dobro de
 * foco, são metade. Havendo mais de um no prazo, vale o último escrito — que é
 * o que o gestor acabou de decidir.
 */
export function desafioAtivo(desafios = [], hoje = null) {
  const validos = (Array.isArray(desafios) ? desafios : [])
    .map(normalizar)
    .filter((d) => d && valeEm(d, hoje));
  return validos.at(-1) ?? null;
}

/** Dias que faltam para o prazo acabar, contando hoje. */
export function diasRestantes(desafio, hoje) {
  if (!desafio?.ate || !hoje) return null;
  const [ay, am, ad] = desafio.ate.split('-').map(Number);
  const [hy, hm, hd] = hoje.split('-').map(Number);
  const fim = Date.UTC(ay, am - 1, ad);
  const agora = Date.UTC(hy, hm - 1, hd);
  return Math.max(0, Math.round((fim - agora) / 86400000) + 1);
}

/** A frase que o vendedor lê — e que o gestor vê antes de publicar. */
export function frase(desafio) {
  const d = normalizar(desafio);
  if (!d) return null;
  const p = (n) => `${n} ${n === 1 ? 'pedido' : 'pedidos'}`;
  switch (d.regra) {
    case 'media':
      return `Ficar ${p(d.alvo)} acima da sua própria média, no mesmo horário do dia.`;
    case 'fechamento':
      return `Fechar o dia ${p(d.alvo)} acima do seu próprio fechamento médio.`;
    case 'sequencia':
      return `Fechar acima da sua própria média em ${d.alvo} ${d.alvo === 1 ? 'dia' : 'dias'} dentro do prazo.`;
    default:
      return null;
  }
}

/**
 * O desafio de UMA pessoa, medido só com os dados dela.
 *
 * @param {Object} args
 * @param {Object} args.desafio
 * @param {Object} args.regua          régua de hoje, de core/regua.js
 * @param {number} args.orders         pedidos de hoje
 * @param {number} args.revenue        faturamento de hoje
 * @param {number} args.atMinutes
 * @param {boolean} args.temFaturamento
 * @param {string} args.sellerId
 * @param {string} args.hoje
 * @param {Array} args.dias            histórico, para a regra de sequência
 * @param {Object} args.businessHours
 * @returns {{feito:number, alvo:number, progresso:number, cumprido:boolean,
 *            unidade:string, detalhe:string}|null}
 */
export function avaliarDesafio({
  desafio, regua, orders = 0, revenue = 0, atMinutes = 0, temFaturamento = false,
  sellerId = null, hoje = null, dias = [], businessHours = null,
}) {
  const d = normalizar(desafio);
  if (!d) return null;

  if (d.regra === 'sequencia') {
    return avaliarSequencia({ desafio: d, sellerId, hoje, dias, businessHours, orders, revenue, temFaturamento });
  }

  const cmp = compararComARegua({ regua, orders, revenue, atMinutes, temFaturamento });
  if (cmp.estado === 'sem-regua') {
    return {
      feito: 0,
      alvo: d.alvo,
      progresso: 0,
      cumprido: false,
      unidade: REGRAS[d.regra].unidade,
      semRegua: true,
      detalhe: 'Sua régua ainda está se formando — ela nasce do seu próprio histórico.',
    };
  }

  const bar = d.regra === 'fechamento'
    ? (temFaturamento ? regua.fechamento.revenue : regua.fechamento.orders)
    : (temFaturamento ? cmp.marca.revenue : cmp.marca.orders);
  const meu = temFaturamento ? revenue : orders;
  const acima = temFaturamento ? meu - bar : Math.round(meu - bar);

  const feito = Math.max(0, acima);
  return {
    feito,
    alvo: d.alvo,
    progresso: d.alvo > 0 ? Math.min(1, feito / d.alvo) : 0,
    cumprido: acima >= d.alvo,
    unidade: REGRAS[d.regra].unidade,
    semRegua: false,
    detalhe: d.regra === 'fechamento'
      ? `Seu fechamento médio é ${formatarMarca(regua.fechamento, temFaturamento)}.`
      : `${maiuscula(comoChamarABase(cmp))} neste horário: ${formatarMarca(cmp.marca, temFaturamento)}.`,
  };
}

/**
 * Sequência — cada dia do prazo medido contra a régua DAQUELE dia.
 *
 * Usar a régua de hoje para julgar segunda-feira seria circular: segunda está
 * dentro da média de hoje. Então cada dia é comparado com o histórico que
 * existia antes dele, que é a única régua que ele poderia ter tentado bater.
 */
function avaliarSequencia({
  desafio, sellerId, hoje, dias, businessHours, orders, revenue, temFaturamento,
}) {
  const janela = (dias ?? [])
    .map((d) => (d?.state ? d.state : d))
    .filter((d) => d?.date && d.date >= desafio.de && d.date <= desafio.ate && d.date < hoje);

  let feito = 0;
  let medidos = 0;
  for (const dia of janela) {
    const eu = dia.sellers?.find((s) => s.sellerId === sellerId);
    if (!eu) continue;
    const regua = reguaDe({ sellerId, hoje: dia.date, dias, businessHours });
    if (!regua.amostras) continue;
    medidos += 1;
    const bar = temFaturamento ? regua.fechamento.revenue : regua.fechamento.orders;
    const meu = temFaturamento ? (eu.revenue ?? 0) : (eu.orders ?? 0);
    if (meu > bar) feito += 1;
  }

  // Hoje entra na conta só depois de fechado — durante o dia o número ainda
  // pode virar, e marcar cedo demais seria dar por ganho o que não terminou.
  const hojeConta = hoje >= desafio.de && hoje <= desafio.ate;
  const reguaDeHoje = hojeConta ? reguaDe({ sellerId, hoje, dias, businessHours }) : null;
  const hojeAcima = reguaDeHoje?.amostras
    ? (temFaturamento ? revenue : orders) > (temFaturamento
      ? reguaDeHoje.fechamento.revenue
      : reguaDeHoje.fechamento.orders)
    : false;

  const total = feito + (hojeAcima ? 1 : 0);
  return {
    feito: total,
    alvo: desafio.alvo,
    progresso: desafio.alvo > 0 ? Math.min(1, total / desafio.alvo) : 0,
    cumprido: total >= desafio.alvo,
    unidade: 'dias',
    semRegua: medidos === 0 && !reguaDeHoje?.amostras,
    detalhe: hojeAcima
      ? 'Hoje já está acima da sua média — se fechar assim, o dia conta.'
      : `${medidos} ${medidos === 1 ? 'dia medido' : 'dias medidos'} no prazo até agora.`,
  };
}

/** Quantas pessoas cumpriram — contagem, nunca lista. */
export function desafioDaEquipe({
  desafio, sellers = [], reguas = new Map(), atMinutes = 0, temFaturamento = false,
  hoje = null, dias = [], businessHours = null,
}) {
  const d = normalizar(desafio);
  if (!d) return null;
  let n = 0;
  let de = 0;
  for (const seller of sellers) {
    const regua = reguas.get ? reguas.get(seller.sellerId) : reguas?.[seller.sellerId];
    const resultado = avaliarDesafio({
      desafio: d,
      regua,
      orders: seller.orders ?? 0,
      revenue: seller.revenue ?? 0,
      atMinutes,
      temFaturamento,
      sellerId: seller.sellerId,
      hoje,
      dias,
      businessHours,
    });
    if (!resultado || resultado.semRegua) continue;
    de += 1;
    if (resultado.cumprido) n += 1;
  }
  const meta = d.metaColetiva ?? de;
  return { n, de, meta, fracao: meta > 0 ? Math.min(1, n / meta) : 0 };
}

function maiuscula(texto) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
}

function formatarMarca(marca, temFaturamento) {
  if (temFaturamento) {
    return marca.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  }
  const n = Math.round(marca.orders * 10) / 10;
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? 'pedido' : 'pedidos'}`;
}
