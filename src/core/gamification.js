import { toMinutes } from './clock.js';

/**
 * NÍVEIS E CONQUISTAS
 * ===================
 *
 * Todos os níveis e todas as conquistas são derivados exclusivamente de
 * PEDIDOS DO DIA e FATURAMENTO DO DIA. As faixas são configuráveis pelo gestor
 * em `config/app.config.json` -> `tiers` e `achievements`.
 */

/** Nível atual e progresso até o próximo, a partir da produção do dia. */
export function tierFor(orders, revenue, tiers = []) {
  const sorted = [...tiers].sort((a, b) => a.minRevenue - b.minRevenue);
  let current = sorted[0] ?? { id: 'bronze', name: 'BRONZE', minRevenue: 0, minOrders: 0 };
  let index = 0;

  sorted.forEach((tier, i) => {
    if (revenue >= tier.minRevenue && orders >= (tier.minOrders ?? 0)) {
      current = tier;
      index = i;
    }
  });

  const next = sorted[index + 1] ?? null;
  let progress = 1;
  if (next) {
    const revSpan = next.minRevenue - current.minRevenue;
    const revProgress = revSpan > 0 ? (revenue - current.minRevenue) / revSpan : 1;
    const ordSpan = (next.minOrders ?? 0) - (current.minOrders ?? 0);
    const ordProgress = ordSpan > 0 ? (orders - (current.minOrders ?? 0)) / ordSpan : 1;
    progress = Math.min(1, Math.max(0, Math.min(revProgress, ordProgress)));
  }

  return {
    current,
    next,
    index,
    total: sorted.length,
    progress,
    missingRevenue: next ? Math.max(0, next.minRevenue - revenue) : 0,
    missingOrders: next ? Math.max(0, (next.minOrders ?? 0) - orders) : 0,
  };
}

/** Catálogo — a ordem aqui é a ordem de exibição no perfil do vendedor. */
export const ACHIEVEMENTS = Object.freeze([
  { id: 'primeiro-pedido', name: 'Primeiro Pedido do Dia', icon: '🥇', hint: 'Abrir o placar antes de todo mundo.' },
  { id: 'arrancada', name: 'Arrancada', icon: '🚀', hint: 'Começar o dia forte, cedo.' },
  { id: 'meta-diaria', name: 'Meta Diária', icon: '🎯', hint: 'Bater a meta do dia.' },
  { id: 'recorde-pedidos', name: 'Recorde de Pedidos', icon: '📈', hint: 'Superar seu melhor dia em pedidos.' },
  { id: 'recorde-faturamento', name: 'Recorde de Faturamento', icon: '💰', hint: 'Superar seu melhor dia em faturamento.' },
  { id: 'virada', name: 'Virada', icon: '🔄', hint: 'Estava atrás de ontem e virou.' },
  { id: 'ultrapassagem', name: 'Ultrapassagem', icon: '⚔️', hint: 'Ganhar posição durante o dia.' },
  { id: 'alta-performance', name: 'Alta Performance', icon: '🔥', hint: 'Ritmo bem acima do necessário.' },
  { id: 'sequencia-alta-performance', name: 'Sequência de Alta Performance', icon: '⚡', hint: 'Alta performance vários dias seguidos.' },
]);

/**
 * Avalia as conquistas do dia para UM vendedor.
 *
 * @param {Object} ctx
 * @param {Object} ctx.sellerDay      linha do tempo do vendedor
 * @param {Object} ctx.performance    saída de metrics.buildPerformance
 * @param {Object} ctx.positions      saída de ranking.positionHistory
 * @param {Object} ctx.team           { firstOrderMinutes, activeCount, minTeamSize }
 * @param {Object} ctx.history        { bestOrders, bestRevenue, highPerformanceStreak }
 * @param {Object} ctx.config         bloco `achievements` + `goals`
 */
export function evaluateAchievements(ctx) {
  const {
    sellerDay, performance, positions, team = {}, history = {}, config = {}, goals = {},
  } = ctx;

  const orders = performance?.orders ?? 0;
  const revenue = performance?.revenue ?? 0;
  const unlocked = new Map();

  const unlock = (id, atMinutes = null, detail = null) => {
    unlocked.set(id, { atMinutes, detail });
  };

  // 1. Primeiro Pedido do Dia — o primeiro da equipe a abrir o placar.
  //    Só vale como "primeiro da equipe" quando a equipe é grande o bastante
  //    para que isso não identifique ninguém. Em equipe pequena, vira o
  //    primeiro pedido do próprio vendedor.
  const myFirst = sellerDay?.firstOrderMinutes ?? null;
  if (myFirst !== null) {
    const teamFirstIsMine = team.firstOrderMinutes !== null
      && team.firstOrderMinutes !== undefined
      && myFirst <= team.firstOrderMinutes;
    const teamBigEnough = (team.activeCount ?? 0) >= (team.minTeamSize ?? 3);
    if (!teamBigEnough || teamFirstIsMine) unlock('primeiro-pedido', myFirst);
  }

  // 2. Arrancada — atingiu uma fatia da meta antes do horário configurado.
  const arrancadaLimit = toMinutes(config.arrancadaBefore ?? '10:00');
  const arrancadaTarget = (goals.dailyRevenue ?? 0) * (config.arrancadaGoalPct ?? 0.3);
  if (arrancadaTarget > 0 && sellerDay?.timeline?.length) {
    const hit = sellerDay.timeline.find((p) => p.revenue >= arrancadaTarget);
    if (hit && hit.m <= arrancadaLimit) unlock('arrancada', hit.m);
  }

  // 3. Meta Diária.
  const mode = config.metaDiariaMode ?? 'revenue';
  const metaOrders = goals.dailyOrders > 0 && orders >= goals.dailyOrders;
  const metaRevenue = goals.dailyRevenue > 0 && revenue >= goals.dailyRevenue;
  const metaHit = mode === 'orders' ? metaOrders : mode === 'both' ? (metaOrders && metaRevenue) : metaRevenue;
  if (metaHit) unlock('meta-diaria', sellerDay?.lastMinutes ?? null);

  // 4/5. Recordes — exigem histórico; sem histórico, não se afirma recorde.
  if (Number.isFinite(history.bestOrders) && history.bestOrders > 0 && orders > history.bestOrders) {
    unlock('recorde-pedidos', sellerDay?.lastMinutes ?? null, { anterior: history.bestOrders });
  }
  if (Number.isFinite(history.bestRevenue) && history.bestRevenue > 0 && revenue > history.bestRevenue) {
    unlock('recorde-faturamento', sellerDay?.lastMinutes ?? null, { anterior: history.bestRevenue });
  }

  // 6. Virada — esteve atrás do próprio ritmo de ontem e passou à frente.
  if (history.wasBehindYesterday && performance?.vsYesterdaySameTime?.revenue?.abs > 0) {
    unlock('virada', sellerDay?.lastMinutes ?? null);
  }

  // 7. Ultrapassagem — ganhou pelo menos uma posição no dia.
  if (positions?.opening != null && positions?.current != null && positions.opening > positions.current) {
    unlock('ultrapassagem', sellerDay?.lastMinutes ?? null, { ganho: positions.opening - positions.current });
  }

  // 8. Alta Performance — ritmo acima do exigido para a meta.
  const ratio = performance?.pace?.revenueStatus?.ratio ?? null;
  const threshold = config.altaPerformancePaceRatio ?? 1.2;
  const metaAlreadyHit = performance?.pace?.revenueStatus?.status === 'meta-atingida';
  if (metaAlreadyHit || (Number.isFinite(ratio) && ratio >= threshold)) {
    unlock('alta-performance', sellerDay?.lastMinutes ?? null);
  }

  // 9. Sequência de Alta Performance.
  //    É uma conquista do DIA: só conta se hoje também for de alta performance.
  //    Sem esta condição, quem tivesse uma boa sequência apareceria premiado
  //    às 8h da manhã com o placar zerado.
  const streak = history.highPerformanceStreak ?? 0;
  const streakNeeded = config.altaPerformanceStreakDays ?? 3;
  if (unlocked.has('alta-performance') && streak >= streakNeeded - 1) {
    unlock('sequencia-alta-performance', null, { dias: streak + 1 });
  }

  return ACHIEVEMENTS.map((a) => {
    const hit = unlocked.get(a.id);
    return {
      ...a,
      unlocked: Boolean(hit),
      atMinutes: hit?.atMinutes ?? null,
      detail: hit?.detail ?? null,
    };
  });
}

/** Resumo curto para o cabeçalho do perfil. */
export function achievementSummary(list) {
  const total = list.length;
  const unlocked = list.filter((a) => a.unlocked).length;
  return { unlocked, total, latest: list.filter((a) => a.unlocked).at(-1) ?? null };
}
