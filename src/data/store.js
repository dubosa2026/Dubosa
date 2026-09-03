import { toMinutes } from '../core/clock.js';

/**
 * NORMALIZAÇÃO DA PRODUÇÃO DO DIA
 * ===============================
 *
 * Converte o payload de qualquer fonte numa LINHA DO TEMPO ACUMULADA por
 * vendedor. Todo o restante do sistema (ranking, ritmo, projeção, comparação
 * com ontem, conquistas) lê apenas esta estrutura.
 *
 * @typedef {Object} Snapshot
 * @property {number} m        minutos desde 00:00
 * @property {number} orders   pedidos acumulados no dia até `m`
 * @property {number} revenue  faturamento acumulado no dia até `m`
 *
 * @typedef {Object} SellerDay
 * @property {string} sellerId
 * @property {string} sellerName
 * @property {Snapshot[]} timeline  ordenada, acumulada, monotônica
 * @property {number} orders        total do dia até a última medição
 * @property {number} revenue       total do dia até a última medição
 * @property {number|null} lastMinutes
 * @property {number|null} firstOrderMinutes
 *
 * @typedef {Object} DayState
 * @property {string} date
 * @property {'ready'|'awaiting_source'|'error'} status
 * @property {boolean} isDemo
 * @property {string|null} message
 * @property {SellerDay[]} sellers
 * @property {boolean} hasData
 */

/** Estado de dia vazio — o que a interface recebe em Modo de Espera. */
export function emptyDayState(date, { status = 'awaiting_source', message = null } = {}) {
  return Object.freeze({
    date,
    status,
    isDemo: false,
    message,
    sellers: [],
    hasData: false,
    fetchedAt: null,
  });
}

/**
 * @param {import('./DataSource.js').DayPayload} payload
 * @returns {DayState}
 */
export function buildDayState(payload) {
  if (!payload || payload.status !== 'ready' || !payload.records?.length) {
    return emptyDayState(payload?.date ?? null, {
      status: payload?.status ?? 'awaiting_source',
      message: payload?.message ?? null,
    });
  }

  const semantics = payload.semantics ?? 'cumulative';
  const grouped = new Map();

  for (const rec of payload.records) {
    const m = toMinutes(rec.time);
    if (!Number.isFinite(m)) continue;
    if (!grouped.has(rec.sellerId)) {
      grouped.set(rec.sellerId, { sellerId: rec.sellerId, sellerName: rec.sellerName, points: [] });
    }
    const bucket = grouped.get(rec.sellerId);
    if (rec.sellerName) bucket.sellerName = rec.sellerName;
    bucket.points.push({ m, orders: Number(rec.orders) || 0, revenue: Number(rec.revenue) || 0 });
  }

  const sellers = [...grouped.values()].map((bucket) => {
    bucket.points.sort((a, b) => a.m - b.m);
    const timeline = semantics === 'incremental'
      ? accumulate(bucket.points)
      : dedupeCumulative(bucket.points);

    const last = timeline.at(-1) ?? null;
    const firstOrder = timeline.find((p) => p.orders > 0) ?? null;

    return {
      sellerId: bucket.sellerId,
      sellerName: bucket.sellerName,
      timeline,
      orders: last ? last.orders : 0,
      revenue: last ? last.revenue : 0,
      lastMinutes: last ? last.m : null,
      firstOrderMinutes: firstOrder ? firstOrder.m : null,
    };
  });

  sellers.sort((a, b) => a.sellerName.localeCompare(b.sellerName, 'pt-BR'));

  return Object.freeze({
    date: payload.date,
    status: 'ready',
    isDemo: Boolean(payload.meta?.isDemo),
    message: payload.message ?? null,
    sellers,
    hasData: sellers.some((s) => s.timeline.length > 0),
    fetchedAt: payload.fetchedAt ?? null,
  });
}

/** Eventos isolados -> acumulado. */
function accumulate(points) {
  let orders = 0;
  let revenue = 0;
  const out = [];
  for (const p of points) {
    orders += p.orders;
    revenue += p.revenue;
    const prev = out.at(-1);
    if (prev && prev.m === p.m) {
      prev.orders = orders;
      prev.revenue = revenue;
    } else {
      out.push({ m: p.m, orders, revenue });
    }
  }
  return out;
}

/**
 * Snapshots acumulados -> série limpa.
 * Mantém a última leitura de cada horário e força monotonicidade: uma fonte
 * ruidosa não pode fazer o acumulado do dia "andar para trás".
 */
function dedupeCumulative(points) {
  const byMinute = new Map();
  for (const p of points) byMinute.set(p.m, p);
  const out = [];
  let maxOrders = 0;
  let maxRevenue = 0;
  for (const p of [...byMinute.values()].sort((a, b) => a.m - b.m)) {
    maxOrders = Math.max(maxOrders, p.orders);
    maxRevenue = Math.max(maxRevenue, p.revenue);
    out.push({ m: p.m, orders: maxOrders, revenue: maxRevenue });
  }
  return out;
}

/**
 * Valor acumulado em um instante — função em degraus.
 * Não interpola: um acumulado só muda quando existe medição. Interpolar
 * inventaria produção que não foi registrada.
 */
export function valueAt(timeline, minutes) {
  if (!timeline?.length) return { orders: 0, revenue: 0, found: false };
  let lo = 0;
  let hi = timeline.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].m <= minutes) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return { orders: 0, revenue: 0, found: false };
  return { orders: timeline[idx].orders, revenue: timeline[idx].revenue, found: true };
}

/**
 * COMPLETA O DIA COM A EQUIPE CADASTRADA.
 *
 * A base de produção da empresa lista apenas quem já vendeu: quem está zerado
 * não vem na resposta. Sem este passo, o vendedor sem pedido sumiria do
 * ranking — e é exatamente ele que precisa se ver de fora da disputa.
 *
 * Também identifica, para o gestor, quem veio na base sem estar no cadastro.
 *
 * @param {DayState} dayState
 * @param {{byId: Map, byShort: Map}} index  saída de core/team.js indexTeam()
 * @returns {DayState}
 */
export function mergeTeam(dayState, index, resolveSeller) {
  if (!index || index.size === 0) return dayState;

  const merged = new Map();
  const foraDoCadastro = [];

  for (const seller of dayState?.sellers ?? []) {
    const match = resolveSeller(seller.sellerName, index);
    const id = match.sellerId;
    if (!match.matched) foraDoCadastro.push(seller.sellerName);
    const existing = merged.get(id);
    merged.set(id, existing
      // Duas linhas da base caíram no mesmo vendedor: fica a de maior produção.
      ? (seller.revenue > existing.revenue ? { ...seller, sellerId: id } : existing)
      : {
        ...seller,
        sellerId: id,
        sellerName: match.person?.name ?? seller.sellerName,
        foraDoCadastro: !match.matched,
      });
  }

  for (const [id, person] of index.byId) {
    if (merged.has(id)) continue;
    merged.set(id, {
      sellerId: id,
      sellerName: person.name,
      uf: person.uf ?? null,
      timeline: [],
      orders: 0,
      revenue: 0,
      lastMinutes: null,
      firstOrderMinutes: null,
      semProducaoNaBase: true,
    });
  }

  const sellers = [...merged.values()]
    .sort((a, b) => a.sellerName.localeCompare(b.sellerName, 'pt-BR'));

  return Object.freeze({
    ...dayState,
    sellers,
    hasData: sellers.some((s) => s.timeline.length > 0),
    foraDoCadastro,
  });
}

/**
 * Horários em que existe medição no dia, em ordem.
 *
 * É a régua honesta para falar de movimento no ranking. Com uma única medição
 * não houve movimento nenhum: comparar contra um instante em que todo mundo
 * estava zerado produziria "subiu 15 posições" para quem apenas apareceu
 * primeiro na ordem alfabética.
 */
export function measurementMinutes(dayState) {
  const marcas = new Set();
  for (const seller of dayState?.sellers ?? []) {
    for (const ponto of seller.timeline ?? []) marcas.add(ponto.m);
  }
  return [...marcas].sort((a, b) => a - b);
}

/** Total do dia (última medição disponível). */
export function dayTotal(sellerDay) {
  return { orders: sellerDay?.orders ?? 0, revenue: sellerDay?.revenue ?? 0 };
}

/** Procura um vendedor no estado do dia. */
export function findSeller(dayState, sellerId) {
  return dayState?.sellers?.find((s) => s.sellerId === sellerId) ?? null;
}

/** Agregado da equipe — apenas somas, nunca valores individuais. */
export function teamAggregate(dayState) {
  const sellers = dayState?.sellers ?? [];
  const active = sellers.filter((s) => s.orders > 0 || s.revenue > 0);
  const orders = sellers.reduce((sum, s) => sum + s.orders, 0);
  const revenue = sellers.reduce((sum, s) => sum + s.revenue, 0);
  return {
    sellerCount: sellers.length,
    activeCount: active.length,
    orders,
    revenue,
    avgOrders: sellers.length ? orders / sellers.length : 0,
    avgRevenue: sellers.length ? revenue / sellers.length : 0,
  };
}

/** Agregado da equipe em um horário específico (para comparar com ontem). */
export function teamAggregateAt(dayState, minutes) {
  const sellers = dayState?.sellers ?? [];
  let orders = 0;
  let revenue = 0;
  for (const s of sellers) {
    const v = valueAt(s.timeline, minutes);
    orders += v.orders;
    revenue += v.revenue;
  }
  return { orders, revenue, sellerCount: sellers.length };
}
