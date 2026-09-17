import { HEALTH_SCORE_RULES, type HealthStatus } from "../constants.js";
import { daysBetween } from "../utils/dates.js";

export interface OrderPoint {
  date: Date;
  total: number;
}

export interface ClientHealth {
  status: HealthStatus;
  score: number; // 0 (crítico) a 100 (saudável)
  daysSinceLastOrder: number | null;
  avgIntervalDays: number | null;
  expectedIntervalMultiple: number | null; // daysSinceLastOrder / avgIntervalDays
  revenueChangePct: number | null; // recente vs baseline anterior
  ticketChangePct: number | null;
  reasons: string[];
}

/**
 * Calcula o Customer Health Score (seção 9) a partir do histórico real de
 * pedidos do cliente. Não infere nada além do que os dados sustentam: sem
 * pedidos suficientes, o status é SAUDAVEL por padrão e as reasons
 * explicam a limitação.
 */
export function computeClientHealth(orders: OrderPoint[], referenceDate: Date): ClientHealth {
  const sorted = [...orders].sort((a, b) => a.date.getTime() - b.date.getTime());
  const reasons: string[] = [];

  if (sorted.length === 0) {
    return {
      status: "SAUDAVEL",
      score: 100,
      daysSinceLastOrder: null,
      avgIntervalDays: null,
      expectedIntervalMultiple: null,
      revenueChangePct: null,
      ticketChangePct: null,
      reasons: ["Sem histórico de pedidos para avaliar."],
    };
  }

  const lastOrder = sorted[sorted.length - 1];
  const daysSinceLastOrder = daysBetween(referenceDate, lastOrder.date);

  let avgIntervalDays: number | null = null;
  if (sorted.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i].date, sorted[i - 1].date));
    }
    avgIntervalDays = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  }

  const expectedIntervalMultiple =
    avgIntervalDays && avgIntervalDays > 0 ? daysSinceLastOrder / avgIntervalDays : null;

  // Faturamento: compara os últimos 90 dias com os 90 dias anteriores
  const cutoffRecent = referenceDate.getTime() - 90 * 86400000;
  const cutoffBaseline = referenceDate.getTime() - 180 * 86400000;
  const recent = sorted.filter((o) => o.date.getTime() >= cutoffRecent);
  const baseline = sorted.filter(
    (o) => o.date.getTime() >= cutoffBaseline && o.date.getTime() < cutoffRecent
  );

  const recentRevenue = recent.reduce((a, o) => a + o.total, 0);
  const baselineRevenue = baseline.reduce((a, o) => a + o.total, 0);
  const revenueChangePct =
    baselineRevenue > 0 ? (recentRevenue - baselineRevenue) / baselineRevenue : null;

  const recentTicket = recent.length ? recentRevenue / recent.length : null;
  const baselineTicket = baseline.length ? baselineRevenue / baseline.length : null;
  const ticketChangePct =
    recentTicket !== null && baselineTicket ? (recentTicket - baselineTicket) / baselineTicket : null;

  let status: HealthStatus = "SAUDAVEL";
  let score = 100;

  if (expectedIntervalMultiple !== null) {
    if (expectedIntervalMultiple >= HEALTH_SCORE_RULES.altoRiscoMultiplicadorIntervalo) {
      status = "ALTO_RISCO";
      score = 15;
      reasons.push(
        `Última compra há ${daysSinceLastOrder} dias, ${expectedIntervalMultiple.toFixed(1)}x acima do intervalo médio histórico (${avgIntervalDays!.toFixed(0)} dias).`
      );
    } else if (expectedIntervalMultiple >= HEALTH_SCORE_RULES.riscoMultiplicadorIntervalo) {
      status = "RISCO";
      score = 40;
      reasons.push(
        `Última compra há ${daysSinceLastOrder} dias, acima do intervalo médio histórico (${avgIntervalDays!.toFixed(0)} dias).`
      );
    }
  }

  if (revenueChangePct !== null && revenueChangePct <= -HEALTH_SCORE_RULES.quedaFaturamentoRisco) {
    if (status === "SAUDAVEL") status = "RISCO";
    score = Math.min(score, 35);
    reasons.push(`Faturamento caiu ${Math.abs(revenueChangePct * 100).toFixed(0)}% nos últimos 90 dias.`);
  } else if (
    revenueChangePct !== null &&
    revenueChangePct <= -HEALTH_SCORE_RULES.quedaFaturamentoAtencao
  ) {
    if (status === "SAUDAVEL") status = "ATENCAO";
    score = Math.min(score, 65);
    reasons.push(`Faturamento caiu ${Math.abs(revenueChangePct * 100).toFixed(0)}% nos últimos 90 dias.`);
  }

  if (reasons.length === 0) {
    reasons.push("Frequência e faturamento dentro do padrão histórico do cliente.");
  }

  return {
    status,
    score,
    daysSinceLastOrder,
    avgIntervalDays,
    expectedIntervalMultiple,
    revenueChangePct,
    ticketChangePct,
    reasons,
  };
}
