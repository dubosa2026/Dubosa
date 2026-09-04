import {
  elapsedBusinessMinutes,
  remainingBusinessMinutes,
  totalBusinessMinutes,
} from './clock.js';

/**
 * REGRAS DE RITMO, PROJEÇÃO E COMPARAÇÃO
 * ======================================
 *
 * Tudo aqui deriva de dois números e só deles: PEDIDOS DO DIA e FATURAMENTO
 * DO DIA. Nenhum indicador mensal, de carteira ou de clientes entra nestes
 * cálculos.
 *
 * O tempo usado é sempre MINUTO COMERCIAL (expediente menos intervalos), para
 * que o ritmo não seja diluído pelo horário de almoço.
 */

/** Ritmo por hora comercial. */
export function pace(value, elapsedMinutes) {
  if (!Number.isFinite(value) || !Number.isFinite(elapsedMinutes) || elapsedMinutes <= 0) return 0;
  return (value / elapsedMinutes) * 60;
}

/**
 * Comparação entre dois valores: diferença absoluta e percentual.
 * Quando a base é zero, a variação percentual não existe (não é "infinito"
 * nem "100%") — devolvemos `null` e a interface mostra "—".
 */
export function compare(current, baseline, baselineAvailable = true) {
  const abs = (current ?? 0) - (baseline ?? 0);
  const pct = baseline > 0 ? abs / baseline : null;
  return {
    current: current ?? 0,
    baseline: baseline ?? 0,
    abs,
    pct,
    // Zero porque ontem não foi medido é diferente de zero porque ontem não
    // vendeu. Sem esta distinção, o primeiro dia de uso mostraria "+R$ 370.000
    // em relação a ontem" para todo mundo — crescimento que não aconteceu.
    semBase: !baselineAvailable,
    direction: abs > 0 ? 'up' : abs < 0 ? 'down' : 'flat',
  };
}

/**
 * PROJEÇÃO DE FECHAMENTO DO DIA
 * -----------------------------
 * Três modelos, escolhidos em config:
 *
 *   linear  projeta o ritmo atual sobre o tempo restante
 *           projetado = atual + ritmo × horas_restantes
 *
 *   curve   usa a forma do dia anterior: se ontem, neste mesmo ponto do
 *           expediente, o vendedor já tinha 55% do total do dia, então
 *           projetado = atual ÷ 0,55
 *
 *   blend   média ponderada dos dois (padrão). Cai para `linear` sozinho
 *           quando não há dia anterior comparável.
 *
 * Travas obrigatórias:
 *   - antes de `minElapsedMinutes` de expediente não há projeção (ruído puro);
 *   - a projeção nunca é menor que o já realizado;
 *   - a projeção nunca passa de `maxMultiplier` vezes o realizado, para que
 *     um único pedido às 8h05 não vire uma projeção fantasiosa.
 */
export function project({
  current,
  elapsedMinutes,
  remainingMinutes,
  curveFraction = null,
  config = {},
}) {
  const model = config.model ?? 'blend';
  const minElapsed = config.minElapsedMinutes ?? 30;
  const maxMultiplier = config.maxMultiplier ?? 4;

  if (!Number.isFinite(current)) return { value: null, model: 'indisponivel', reason: 'sem-dado' };
  if (elapsedMinutes < minElapsed) {
    return { value: null, model: 'aguardando', reason: 'expediente-inicial' };
  }
  if (current <= 0) {
    return { value: 0, model: 'sem-producao', reason: 'sem-producao' };
  }

  const linear = current + pace(current, elapsedMinutes) * (remainingMinutes / 60);
  const usable = Number.isFinite(curveFraction) && curveFraction >= 0.1 && curveFraction <= 1;
  const curve = usable ? current / curveFraction : null;

  let value;
  let used;
  if (model === 'linear' || curve === null) {
    value = linear;
    used = curve === null && model !== 'linear' ? 'linear-fallback' : 'linear';
  } else if (model === 'curve') {
    value = curve;
    used = 'curve';
  } else {
    const w = Math.min(1, Math.max(0, config.curveWeight ?? 0.6));
    value = curve * w + linear * (1 - w);
    used = 'blend';
  }

  const capped = Math.min(Math.max(value, current), current * maxMultiplier);
  return { value: capped, model: used, reason: null, linear, curve };
}

/**
 * Fração do dia anterior já realizada no mesmo ponto do expediente.
 * É a "forma" do dia de ontem, usada pelo modelo `curve`.
 */
export function curveFractionOf(previousValueAtSameTime, previousDayTotal) {
  if (!(previousDayTotal > 0)) return null;
  const frac = previousValueAtSameTime / previousDayTotal;
  if (!Number.isFinite(frac) || frac <= 0) return null;
  return Math.min(1, frac);
}

/** Ritmo necessário, por hora, para alcançar uma meta no tempo que resta. */
export function requiredPace(goal, current, remainingMinutes) {
  const missing = Math.max(0, (goal ?? 0) - (current ?? 0));
  if (missing === 0) return 0;
  if (remainingMinutes <= 0) return Infinity;
  return (missing / remainingMinutes) * 60;
}

/**
 * Situação do ritmo em relação ao necessário para bater a meta do dia.
 * ratio > 1 => acima do necessário.
 */
export function paceStatus(currentPace, needed) {
  if (needed === 0) return { status: 'meta-atingida', ratio: null };
  if (!Number.isFinite(needed)) return { status: 'sem-tempo', ratio: null };
  if (currentPace <= 0) return { status: 'parado', ratio: 0 };
  const ratio = currentPace / needed;
  if (ratio >= 1.15) return { status: 'acima', ratio };
  if (ratio >= 0.95) return { status: 'no-ritmo', ratio };
  return { status: 'abaixo', ratio };
}

/**
 * Painel completo de um vendedor num instante — o objeto que alimenta tanto a
 * tela do vendedor quanto a linha do gestor no ranking.
 */
export function buildPerformance({
  orders,
  revenue,
  ordersYesterdaySameTime,
  revenueYesterdaySameTime,
  ordersYesterdayTotal,
  revenueYesterdayTotal,
  atMinutes,
  businessHours,
  projectionConfig,
  goals,
  baselineAvailable = true,
}) {
  const elapsed = elapsedBusinessMinutes(businessHours, atMinutes);
  const remaining = remainingBusinessMinutes(businessHours, atMinutes);
  const total = totalBusinessMinutes(businessHours);

  const ordersPace = pace(orders, elapsed);
  const revenuePace = pace(revenue, elapsed);

  const ordersProjection = project({
    current: orders,
    elapsedMinutes: elapsed,
    remainingMinutes: remaining,
    curveFraction: curveFractionOf(ordersYesterdaySameTime, ordersYesterdayTotal),
    config: projectionConfig,
  });
  const revenueProjection = project({
    current: revenue,
    elapsedMinutes: elapsed,
    remainingMinutes: remaining,
    curveFraction: curveFractionOf(revenueYesterdaySameTime, revenueYesterdayTotal),
    config: projectionConfig,
  });

  const ordersNeeded = requiredPace(goals?.dailyOrders, orders, remaining);
  const revenueNeeded = requiredPace(goals?.dailyRevenue, revenue, remaining);

  return {
    orders,
    revenue,
    elapsedMinutes: elapsed,
    remainingMinutes: remaining,
    totalMinutes: total,
    elapsedFraction: total > 0 ? elapsed / total : 0,
    pace: {
      orders: ordersPace,
      revenue: revenuePace,
      ordersRequired: ordersNeeded,
      revenueRequired: revenueNeeded,
      ordersStatus: paceStatus(ordersPace, ordersNeeded),
      revenueStatus: paceStatus(revenuePace, revenueNeeded),
    },
    projection: {
      orders: ordersProjection.value === null
        ? null
        : Math.round(ordersProjection.value),
      revenue: revenueProjection.value === null
        ? null
        : Math.round(revenueProjection.value / 100) * 100,
      ordersModel: ordersProjection.model,
      revenueModel: revenueProjection.model,
    },
    vsYesterdaySameTime: {
      orders: compare(orders, ordersYesterdaySameTime, baselineAvailable),
      revenue: compare(revenue, revenueYesterdaySameTime, baselineAvailable),
    },
    vsYesterdayTotal: {
      orders: compare(orders, ordersYesterdayTotal, baselineAvailable),
      revenue: compare(revenue, revenueYesterdayTotal, baselineAvailable),
    },
    goals: {
      orders: goals?.dailyOrders ?? null,
      revenue: goals?.dailyRevenue ?? null,
      ordersProgress: goals?.dailyOrders > 0 ? orders / goals.dailyOrders : null,
      revenueProgress: goals?.dailyRevenue > 0 ? revenue / goals.dailyRevenue : null,
    },
  };
}
