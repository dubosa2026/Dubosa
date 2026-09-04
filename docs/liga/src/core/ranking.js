import { valueAt } from '../data/store.js';

/**
 * REGRAS DE RANKING
 * =================
 *
 * Critério principal: FATURAMENTO DO DIA (decrescente).
 * Desempates, na ordem configurada em `ranking.tiebreakers`:
 *
 *   orders        mais pedidos no dia sobe
 *   firstToReach  quem chegou primeiro ao próprio patamar de faturamento sobe
 *                 (premia quem produziu cedo em vez de quem produziu no fim)
 *   name          ordem alfabética — desempate final, puramente determinístico,
 *                 para que a mesma produção gere sempre a mesma tabela
 *
 * Vendedores sem produção continuam no ranking, nas últimas posições, marcados
 * como `semProducao` — some do ranking é pior que aparecer em último.
 *
 * IMPORTANTE: este módulo produz o ranking NOMINAL COMPLETO. Ele é matéria-prima
 * interna. Quem decide o que cada perfil pode ver é `core/access.js` — nenhuma
 * tela deve consumir a saída daqui diretamente.
 */

/** Minuto em que o vendedor atingiu pela primeira vez o faturamento informado. */
function reachedAt(timeline, revenue) {
  if (!timeline?.length || revenue <= 0) return Number.POSITIVE_INFINITY;
  for (const point of timeline) {
    if (point.revenue >= revenue) return point.m;
  }
  return Number.POSITIVE_INFINITY;
}

const COMPARATORS = {
  revenue: (a, b) => b.revenue - a.revenue,
  orders: (a, b) => b.orders - a.orders,
  firstToReach: (a, b) => a.reachedAt - b.reachedAt,
  name: (a, b) => a.sellerName.localeCompare(b.sellerName, 'pt-BR'),
};

/**
 * Ranking da equipe em um instante do dia.
 * @param {import('../data/store.js').DayState} dayState
 * @param {number} minutes
 * @param {Object} rankingConfig
 * @returns {Array} entradas ordenadas, com `position` a partir de 1
 */
export function rankAt(dayState, minutes, rankingConfig = {}) {
  const primary = rankingConfig.primary ?? 'revenue';
  const tiebreakers = rankingConfig.tiebreakers ?? ['orders', 'firstToReach', 'name'];
  const includeZero = rankingConfig.includeZeroProduction !== false;

  const entries = (dayState?.sellers ?? []).map((seller) => {
    const at = valueAt(seller.timeline, minutes);
    return {
      sellerId: seller.sellerId,
      sellerName: seller.sellerName,
      orders: at.orders,
      revenue: at.revenue,
      reachedAt: reachedAt(seller.timeline, at.revenue),
      semProducao: at.orders === 0 && at.revenue === 0,
    };
  }).filter((e) => includeZero || !e.semProducao);

  const chain = [primary, ...tiebreakers].map((k) => COMPARATORS[k]).filter(Boolean);
  entries.sort((a, b) => {
    for (const cmp of chain) {
      const r = cmp(a, b);
      if (r !== 0) return r;
    }
    return 0;
  });

  return entries.map((entry, index) => ({ ...entry, position: index + 1 }));
}

/** Ranking no instante atual — atalho de `rankAt`. */
export function rankNow(dayState, minutes, rankingConfig) {
  return rankAt(dayState, minutes, rankingConfig);
}

/**
 * Distâncias para as posições vizinhas.
 *
 * Devolve APENAS MAGNITUDES ("faltam R$ 8.500", "faltam 2 pedidos").
 * Nunca devolve o nome nem o total do vendedor vizinho — é essa separação que
 * torna possível mostrar a disputa ao vendedor sem expor ninguém.
 */
export function gapsFor(ranked, sellerId) {
  const index = ranked.findIndex((e) => e.sellerId === sellerId);
  if (index < 0) return null;

  const me = ranked[index];
  const above = index > 0 ? ranked[index - 1] : null;
  const below = index < ranked.length - 1 ? ranked[index + 1] : null;
  const leader = ranked[0] ?? null;

  return {
    position: me.position,
    total: ranked.length,
    isLeader: me.position === 1,
    isLast: me.position === ranked.length,
    toNext: above
      ? {
        revenue: Math.max(0, above.revenue - me.revenue),
        orders: Math.max(0, above.orders - me.orders),
        targetPosition: above.position,
      }
      : null,
    toPrevious: below
      ? {
        revenue: Math.max(0, me.revenue - below.revenue),
        orders: Math.max(0, me.orders - below.orders),
        chaserPosition: below.position,
      }
      : null,
    toLeader: leader && leader.sellerId !== sellerId
      ? { revenue: Math.max(0, leader.revenue - me.revenue), orders: Math.max(0, leader.orders - me.orders) }
      : null,
  };
}

/**
 * Evolução de posição ao longo do dia.
 * Alimenta "você subiu 2 posições" e a conquista "Ultrapassagem".
 * @returns {{minutes:number[], positions:number[], best:number, worst:number, opening:number|null}}
 */
export function positionHistory(dayState, sellerId, minuteMarks, rankingConfig) {
  const minutes = [];
  const positions = [];
  for (const m of minuteMarks) {
    const ranked = rankAt(dayState, m, rankingConfig);
    const found = ranked.find((e) => e.sellerId === sellerId);
    if (!found) continue;
    minutes.push(m);
    positions.push(found.position);
  }
  if (!positions.length) {
    return { minutes: [], positions: [], best: null, worst: null, opening: null, current: null };
  }
  return {
    minutes,
    positions,
    best: Math.min(...positions),
    worst: Math.max(...positions),
    opening: positions[0],
    current: positions.at(-1),
  };
}

/**
 * Variação de posição entre dois instantes.
 * Positivo = subiu (posição numérica menor).
 */
export function positionDelta(dayState, sellerId, fromMinutes, toMinutes, rankingConfig) {
  const before = rankAt(dayState, fromMinutes, rankingConfig).find((e) => e.sellerId === sellerId);
  const after = rankAt(dayState, toMinutes, rankingConfig).find((e) => e.sellerId === sellerId);
  if (!before || !after) return 0;
  return before.position - after.position;
}
