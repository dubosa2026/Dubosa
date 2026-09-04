import { rankAt, gapsFor, positionHistory } from './ranking.js';
import { buildPerformance } from './metrics.js';
import { tierFor, evaluateAchievements } from './gamification.js';
import { buildMessages } from './messages.js';
import {
  valueAt, teamAggregate, teamAggregateAt, measurementMinutes,
} from '../data/store.js';
import {
  elapsedBusinessMinutes, dayPhase, toMinutes,
} from './clock.js';
import { identifyingTokens, textIdentifiesOther, normalizeForScan } from './nameScan.js';

/**
 * NÚCLEO DE PRIVACIDADE
 * =====================
 *
 * Esta é a regra estrutural do sistema, não uma recomendação de interface.
 *
 * Nenhuma tela recebe `dayState` (que contém a equipe inteira). Toda tela
 * recebe um VIEW MODEL construído aqui. O view model do vendedor é montado
 * campo a campo a partir apenas dos dados dele — os registros dos colegas nunca
 * são copiados para dentro dele, nem em forma reduzida.
 *
 * Três barreiras, nesta ordem:
 *
 *   1ª  A FONTE. `DataSource.fetchDay(date, scope)` recebe o escopo. Um
 *       adaptador com servidor deve filtrar no servidor — é a única barreira
 *       que impede o dado de sair do backend. As duas seguintes protegem a
 *       exibição, não o transporte.
 *   2ª  ESTE MÓDULO. Constrói o view model do vendedor por composição, nunca
 *       por remoção de campos de um objeto maior.
 *   3ª  A VARREDURA. `assertSellerViewModelIsClean` percorre o objeto pronto
 *       procurando nome ou id de terceiros. Se achar, a tela não é renderizada.
 *
 * O que o vendedor pode saber sobre os outros: SÓ MAGNITUDES ANÔNIMAS —
 * "faltam R$ 8.500 para a próxima posição". Nunca quem, nunca quanto o outro fez.
 */

export const ROLE = Object.freeze({ SELLER: 'seller', MANAGER: 'manager' });

export const CAPABILITY = Object.freeze({
  VIEW_OWN: 'view:own',
  VIEW_TEAM_AGGREGATE: 'view:team-aggregate',
  VIEW_GAP_NEXT: 'view:gap-next',
  VIEW_GAP_PREVIOUS: 'view:gap-previous',
  VIEW_TEAM_ROSTER: 'view:team-roster',
  VIEW_NOMINAL_RANKING: 'view:nominal-ranking',
  VIEW_OTHER_SELLER: 'view:other-seller',
  COMPARE_SELLERS: 'compare:sellers',
  EXPORT_REPORTS: 'export:reports',
  CONFIGURE_APP: 'configure:app',
  MANAGE_ACCESS: 'manage:access',
});

/** Matriz de permissões. `true` = sempre; função = depende de configuração. */
const MATRIX = {
  [ROLE.MANAGER]: {
    [CAPABILITY.VIEW_OWN]: true,
    [CAPABILITY.VIEW_TEAM_AGGREGATE]: true,
    [CAPABILITY.VIEW_GAP_NEXT]: true,
    [CAPABILITY.VIEW_GAP_PREVIOUS]: true,
    [CAPABILITY.VIEW_TEAM_ROSTER]: true,
    [CAPABILITY.VIEW_NOMINAL_RANKING]: true,
    [CAPABILITY.VIEW_OTHER_SELLER]: true,
    [CAPABILITY.COMPARE_SELLERS]: true,
    [CAPABILITY.EXPORT_REPORTS]: true,
    [CAPABILITY.CONFIGURE_APP]: true,
    [CAPABILITY.MANAGE_ACCESS]: true,
  },
  [ROLE.SELLER]: {
    [CAPABILITY.VIEW_OWN]: true,
    [CAPABILITY.VIEW_TEAM_AGGREGATE]: (cfg, ctx) => Boolean(cfg?.privacy?.sellerSeesTeamAggregate)
      && (ctx?.activeCount ?? 0) >= (cfg?.privacy?.minTeamSizeForAggregate ?? 3),
    [CAPABILITY.VIEW_GAP_NEXT]: (cfg) => cfg?.privacy?.sellerSeesGapToNext !== false,
    [CAPABILITY.VIEW_GAP_PREVIOUS]: (cfg) => cfg?.privacy?.sellerSeesGapToPrevious !== false,
    // Tudo abaixo é negado ao vendedor por definição de produto. Não há
    // configuração que ligue: são as regras da seção 12 da especificação.
    [CAPABILITY.VIEW_TEAM_ROSTER]: false,
    [CAPABILITY.VIEW_NOMINAL_RANKING]: false,
    [CAPABILITY.VIEW_OTHER_SELLER]: false,
    [CAPABILITY.COMPARE_SELLERS]: false,
    [CAPABILITY.EXPORT_REPORTS]: false,
    [CAPABILITY.CONFIGURE_APP]: false,
    [CAPABILITY.MANAGE_ACCESS]: false,
  },
};

export function can(role, capability, config = {}, ctx = {}) {
  const rule = MATRIX[role]?.[capability];
  if (rule === true) return true;
  if (typeof rule === 'function') return Boolean(rule(config, ctx));
  return false;
}

export function assertCan(role, capability, config = {}, ctx = {}) {
  if (!can(role, capability, config, ctx)) {
    throw new Error(`Acesso negado: perfil "${role}" não pode "${capability}".`);
  }
}

/**
 * Critério do ranking, ajustado ao que a origem realmente entrega.
 *
 * Quando o faturamento por vendedor não existe — o sistema de pedidos dá
 * faturamento por carteira, não por pessoa — ranquear por faturamento daria
 * empate zerado para a equipe inteira. Nesse caso o critério passa a ser
 * pedidos, que é o dado que existe de verdade.
 */
export function regrasDeRanking(dayState, config) {
  const base = config?.ranking ?? {};
  if (dayState?.revenueAvailable === false) {
    return {
      ...base,
      primary: 'orders',
      tiebreakers: ['revenue', 'firstToReach', 'name'],
    };
  }
  return base;
}

/** Congelamento profundo — o view model do vendedor é imutável. */
function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const value of Object.values(obj)) deepFreeze(value);
  }
  return obj;
}

/**
 * TERCEIRA BARREIRA — varredura do objeto pronto.
 *
 * Procurar qualquer pedaço de nome alheio não funciona numa equipe real:
 * sobrenomes se repetem. "Leonardo Costa Oliveira" e "Erica Oliveira" dividem
 * "Oliveira"; bloquear o painel do primeiro porque a palavra aparece no
 * próprio nome dele seria um alarme falso — e um alarme falso que derruba a
 * tela é tão ruim quanto um vazamento.
 *
 * A varredura procura, então, apenas o que de fato IDENTIFICA alguém:
 *
 *   - o nome completo de um colega, literal;
 *   - o id de um colega;
 *   - um termo que pertença a UM único colega, não apareça no nome de mais
 *     ninguém e nem no nome de quem está olhando.
 *
 * Um sobrenome compartilhado por duas ou mais pessoas não aponta para ninguém
 * e, por isso, não é tratado como vazamento.
 *
 * @throws quando encontra identificação de terceiro no painel do vendedor.
 */
export function assertSellerViewModelIsClean(viewModel, ownSellerId, allSellers = []) {
  const strangers = allSellers.filter((s) => s.sellerId !== ownSellerId);
  if (!strangers.length) return viewModel;

  const tokens = identifyingTokens(allSellers, ownSellerId);
  const found = textIdentifiesOther(JSON.stringify(viewModel), strangers, tokens);
  if (found) {
    throw new Error(`Vazamento de privacidade: identificação de terceiro no painel do vendedor ("${found}").`);
  }
  return viewModel;
}

/** Estado de "nenhum movimento": a posição atual, sem histórico inventado. */
function semMovimento(position) {
  return {
    minutes: [], positions: [], best: position, worst: position, opening: position, current: position,
  };
}

function historyContextFor(sellerId, historyDays) {
  let bestOrders = 0;
  let bestRevenue = 0;
  let streak = 0;
  let streakBroken = false;
  for (const day of historyDays ?? []) {
    const seller = day.state?.sellers?.find((s) => s.sellerId === sellerId);
    if (!seller) { streakBroken = true; continue; }
    bestOrders = Math.max(bestOrders, seller.orders);
    bestRevenue = Math.max(bestRevenue, seller.revenue);
    if (!streakBroken && day.highPerformance?.has?.(sellerId)) streak += 1;
    else streakBroken = true;
  }
  return { bestOrders, bestRevenue, highPerformanceStreak: streak };
}

/**
 * PAINEL DO VENDEDOR — só os próprios dados.
 *
 * @param {Object} args
 * @param {import('../data/store.js').DayState} args.today
 * @param {import('../data/store.js').DayState|null} args.yesterday
 * @param {string} args.sellerId
 * @param {number} args.atMinutes
 * @param {Object} args.config
 * @param {Array} [args.historyDays]
 */
export function buildSellerView({
  today, yesterday, sellerId, sellerName, atMinutes, config, historyDays = [],
  competitive = null, teamFromSource = null, origemConectada = false,
}) {
  const businessHours = config.businessHours;
  const me = today?.sellers?.find((s) => s.sellerId === sellerId) ?? null;
  const meYesterday = yesterday?.sellers?.find((s) => s.sellerId === sellerId) ?? null;

  // Dois estados diferentes, que antes estavam confundidos num só:
  //   awaitingData  -> a BASE não está conectada. Nada pode ser afirmado.
  //   semProducao   -> a base está conectada e o vendedor está zerado.
  //                    Ele tem posição real, comparação real e disputa real —
  //                    e é justamente quem mais precisa ver isso.
  const awaitingData = today?.status !== 'ready';
  const aggregate = teamFromSource ?? teamAggregate(today);
  const permCtx = { activeCount: aggregate.activeCount };

  const yAtSameTime = valueAt(meYesterday?.timeline, atMinutes);
  const performance = buildPerformance({
    orders: me?.orders ?? 0,
    revenue: me?.revenue ?? 0,
    ordersYesterdaySameTime: yAtSameTime.orders,
    revenueYesterdaySameTime: yAtSameTime.revenue,
    ordersYesterdayTotal: meYesterday?.orders ?? 0,
    revenueYesterdayTotal: meYesterday?.revenue ?? 0,
    atMinutes,
    businessHours,
    projectionConfig: config.projection,
    goals: config.goals,
    baselineAvailable: Boolean(meYesterday?.timeline?.length),
  });

  // Quando a ORIGEM já calculou a posição (adaptador com `scopedRanking`), o
  // aplicativo usa o que veio pronto: ele não recebeu — e não precisa receber —
  // os dados dos colegas para saber onde o vendedor está.
  //
  // Sem isso, o ranking nominal é calculado aqui, mas NUNCA sai desta função:
  // dela saem apenas a posição do próprio vendedor e magnitudes anônimas.
  const ranked = competitive ? [] : rankAt(today, atMinutes, regrasDeRanking(today, config));
  const rawGaps = competitive ?? gapsFor(ranked, sellerId);
  // Só falamos em movimento quando existe mais de uma medição no dia.
  const medicoes = measurementMinutes(today).filter((m) => m <= atMinutes);
  const marks = medicoes.length >= 2 ? medicoes : [];
  const positions = competitive
    ? { minutes: [], positions: [], best: competitive.position, worst: competitive.position, opening: competitive.position, current: competitive.position }
    : marks.length
      ? positionHistory(today, sellerId, marks, regrasDeRanking(today, config))
      : semMovimento(rawGaps?.position ?? null);

  const gaps = rawGaps
    ? {
      position: rawGaps.position,
      total: config.privacy?.sellerSeesPositionOutOfTotal === false ? null : rawGaps.total,
      isLeader: rawGaps.isLeader,
      isLast: rawGaps.isLast,
      toNext: can(ROLE.SELLER, CAPABILITY.VIEW_GAP_NEXT, config, permCtx) && rawGaps.toNext
        ? { revenue: rawGaps.toNext.revenue, orders: rawGaps.toNext.orders }
        : null,
      toPrevious: can(ROLE.SELLER, CAPABILITY.VIEW_GAP_PREVIOUS, config, permCtx) && rawGaps.toPrevious
        ? { revenue: rawGaps.toPrevious.revenue, orders: rawGaps.toPrevious.orders }
        : null,
      toLeader: rawGaps.toLeader
        ? { revenue: rawGaps.toLeader.revenue, orders: rawGaps.toLeader.orders }
        : null,
    }
    : null;

  const tier = tierFor(performance.orders, performance.revenue, config.tiers,
    { temFaturamento: today?.revenueAvailable !== false });

  const teamFirstOrder = (today?.sellers ?? [])
    .map((s) => s.firstOrderMinutes)
    .filter((m) => m !== null && m !== undefined)
    .sort((a, b) => a - b)[0] ?? null;

  const history = historyContextFor(sellerId, historyDays);
  const yBefore = valueAt(meYesterday?.timeline, Math.max(0, atMinutes - 120));
  history.wasBehindYesterday = yBefore.revenue > 0
    && valueAt(me?.timeline, Math.max(0, atMinutes - 120)).revenue < yBefore.revenue;

  const achievements = evaluateAchievements({
    sellerDay: me,
    performance,
    positions,
    team: {
      firstOrderMinutes: teamFirstOrder,
      activeCount: aggregate.activeCount,
      minTeamSize: config.privacy?.minTeamSizeForAggregate ?? 3,
    },
    history,
    config: config.achievements,
    goals: config.goals,
  });

  const others = (today?.sellers ?? [])
    .filter((s) => s.sellerId !== sellerId)
    .map((s) => ({ sellerId: s.sellerId, sellerName: s.sellerName }));
  const identifying = identifyingTokens(today?.sellers ?? [], sellerId);

  const messages = buildMessages({
    performance,
    gaps,
    positions,
    tier,
    phase: dayPhase(businessHours, atMinutes),
    temFaturamento: today?.revenueAvailable !== false,
    origemConectada,
    businessHours,
    config: config.messages,
    others,
    identifyingTokens: identifying,
    awaitingData,
  });

  // Agregado da equipe: apenas somas e médias, e somente quando a equipe é
  // grande o bastante para que uma soma não revele o número de ninguém.
  const canSeeAggregate = can(ROLE.SELLER, CAPABILITY.VIEW_TEAM_AGGREGATE, config, permCtx);
  const yAggregate = yesterday ? teamAggregateAt(yesterday, atMinutes) : null;
  const team = canSeeAggregate
    ? {
      visible: true,
      sellerCount: aggregate.sellerCount,
      activeCount: aggregate.activeCount,
      orders: aggregate.orders,
      revenue: aggregate.revenue,
      avgOrders: aggregate.avgOrders,
      avgRevenue: aggregate.avgRevenue,
      revenueInformadaPelaOrigem: Boolean(aggregate.revenueInformadaPelaOrigem),
      // A fatia individual precisa de faturamento POR VENDEDOR. Com o total
      // vindo da carteira e o individual não existindo, a divisão não tem
      // numerador — e um número aqui seria inventado.
      myShareOfRevenue: aggregate.revenue > 0 && !aggregate.revenueInformadaPelaOrigem
        ? performance.revenue / aggregate.revenue
        : null,
      vsYesterdaySameTime: yAggregate
        ? { orders: aggregate.orders - yAggregate.orders, revenue: aggregate.revenue - yAggregate.revenue }
        : null,
    }
    : {
      visible: false,
      reason: awaitingData
        ? 'aguardando-base'
        : config.privacy?.sellerSeesTeamAggregate === false
          ? 'desativado'
          : 'equipe-pequena',
    };

  const viewModel = {
    role: ROLE.SELLER,
    identity: { sellerId, sellerName: sellerName ?? me?.sellerName ?? null },
    date: today?.date ?? null,
    atMinutes,
    phase: dayPhase(businessHours, atMinutes),
    status: today?.status ?? 'awaiting_source',
    sourceMessage: today?.message ?? null,
    origemConectada,
    lidaEm: today?.fetchedAt ?? null,
    isDemo: Boolean(today?.isDemo),
    hasData: Boolean(me && me.timeline.length),
    revenueAvailable: today?.revenueAvailable !== false,
    awaitingData,
    semProducao: !awaitingData && !(me && me.timeline.length),
    performance,
    gaps,
    positions: { opening: positions.opening, current: positions.current, best: positions.best, series: positions.positions, marks: positions.minutes },
    tier,
    achievements,
    messages,
    team,
    charts: {
      mine: me?.timeline ?? [],
      yesterday: meYesterday?.timeline ?? [],
    },
  };

  assertSellerViewModelIsClean(viewModel, sellerId, today?.sellers ?? []);
  return deepFreeze(viewModel);
}

/**
 * PAINEL DO GESTOR — visão completa da operação.
 * O gestor vê o ranking nominal, cada vendedor individualmente e os agregados.
 */
export function buildManagerView({
  today, yesterday, atMinutes, config, historyDays = [], origemConectada = false,
}) {
  const businessHours = config.businessHours;
  const ranked = rankAt(today, atMinutes, regrasDeRanking(today, config));
  // Mesma régua do painel do vendedor: sem duas medições não houve movimento.
  const medicoes = measurementMinutes(today).filter((m) => m <= atMinutes);
  const openingMark = medicoes.length >= 2 ? medicoes[0] : null;

  const rows = ranked.map((entry) => {
    const seller = today.sellers.find((s) => s.sellerId === entry.sellerId);
    const sellerYesterday = yesterday?.sellers?.find((s) => s.sellerId === entry.sellerId) ?? null;
    const yAt = valueAt(sellerYesterday?.timeline, atMinutes);

    const performance = buildPerformance({
      orders: entry.orders,
      revenue: entry.revenue,
      ordersYesterdaySameTime: yAt.orders,
      revenueYesterdaySameTime: yAt.revenue,
      ordersYesterdayTotal: sellerYesterday?.orders ?? 0,
      revenueYesterdayTotal: sellerYesterday?.revenue ?? 0,
      atMinutes,
      businessHours,
      projectionConfig: config.projection,
      goals: config.goals,
      baselineAvailable: Boolean(sellerYesterday?.timeline?.length),
    });

    const openingEntry = openingMark === null
      ? null
      : rankAt(today, openingMark, regrasDeRanking(today, config)).find((e) => e.sellerId === entry.sellerId);
    const gaps = gapsFor(ranked, entry.sellerId);
    const tier = tierFor(entry.orders, entry.revenue, config.tiers,
      { temFaturamento: today?.revenueAvailable !== false });

    return {
      sellerId: entry.sellerId,
      sellerName: entry.sellerName,
      uf: seller?.uf ?? null,
      foraDoCadastro: Boolean(seller?.foraDoCadastro),
      semProducaoNaBase: Boolean(seller?.semProducaoNaBase),
      position: entry.position,
      positionOpening: openingEntry?.position ?? null,
      positionDelta: openingEntry ? openingEntry.position - entry.position : 0,
      semProducao: entry.semProducao,
      performance,
      gaps,
      tier,
      timeline: seller?.timeline ?? [],
      yesterdayTimeline: sellerYesterday?.timeline ?? [],
      lastMinutes: seller?.lastMinutes ?? null,
    };
  });

  const aggregate = teamAggregate(today);
  const yAggregate = yesterday ? teamAggregateAt(yesterday, atMinutes) : null;
  const teamPerformance = buildPerformance({
    orders: aggregate.orders,
    revenue: aggregate.revenue,
    ordersYesterdaySameTime: yAggregate?.orders ?? 0,
    revenueYesterdaySameTime: yAggregate?.revenue ?? 0,
    ordersYesterdayTotal: yesterday ? teamAggregate(yesterday).orders : 0,
    revenueYesterdayTotal: yesterday ? teamAggregate(yesterday).revenue : 0,
    atMinutes,
    businessHours,
    projectionConfig: config.projection,
    goals: {
      dailyOrders: (config.goals?.dailyOrders ?? 0) * aggregate.sellerCount,
      dailyRevenue: (config.goals?.dailyRevenue ?? 0) * aggregate.sellerCount,
    },
    baselineAvailable: Boolean(yesterday?.hasData),
  });

  return {
    role: ROLE.MANAGER,
    date: today?.date ?? null,
    atMinutes,
    phase: dayPhase(businessHours, atMinutes),
    status: today?.status ?? 'awaiting_source',
    sourceMessage: today?.message ?? null,
    origemConectada,
    lidaEm: today?.fetchedAt ?? null,
    isDemo: Boolean(today?.isDemo),
    hasData: Boolean(today?.hasData),
    revenueAvailable: today?.revenueAvailable !== false,
    elapsedMinutes: elapsedBusinessMinutes(businessHours, atMinutes),
    rows,
    foraDoCadastro: today?.foraDoCadastro ?? [],
    team: { ...aggregate, performance: teamPerformance, vsYesterdaySameTime: yAggregate },
    historyDays,
  };
}

/** Marca, por dia do histórico, quem esteve em alta performance (para a sequência). */
export function markHighPerformance(dayState, config) {
  const set = new Set();
  const closing = toMinutes(config.businessHours?.end ?? '18:00');
  for (const seller of dayState?.sellers ?? []) {
    const goal = config.goals?.dailyRevenue ?? 0;
    if (goal > 0 && seller.revenue >= goal * (config.achievements?.altaPerformancePaceRatio ?? 1.2)) {
      set.add(seller.sellerId);
    }
  }
  return { state: dayState, closing, highPerformance: set };
}
