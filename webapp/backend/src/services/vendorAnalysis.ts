import { prisma } from "../prisma.js";
import { startOfWeek, addDays } from "../utils/dates.js";
import { computeClientHealthForScope } from "./clientAnalytics.js";
import { vendorPerformances } from "./vendorPerformance.js";

export async function weeklyEvolution(vendorId: string, weeks = 8) {
  const now = new Date();
  const currentWeekStart = startOfWeek(now);
  const firstWeekStart = addDays(currentWeekStart, -7 * (weeks - 1));

  const orders = await prisma.order.findMany({
    where: { vendorId, date: { gte: firstWeekStart } },
    select: { date: true, total: true },
  });

  const buckets: { weekStart: string; revenue: number; orders: number }[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStart = addDays(firstWeekStart, i * 7);
    const weekEnd = addDays(weekStart, 7);
    const weekOrders = orders.filter((o) => o.date >= weekStart && o.date < weekEnd);
    buckets.push({
      weekStart: weekStart.toISOString().slice(0, 10),
      revenue: weekOrders.reduce((a, o) => a + o.total, 0),
      orders: weekOrders.length,
    });
  }
  return buckets;
}

/**
 * Gera a análise determinística por trás do botão "Analise este vendedor"
 * (seção 7). Usa apenas dados reais: desempenho vs meta/mês anterior e
 * saúde da carteira de clientes.
 */
export async function analyzeVendor(vendorId: string) {
  const [perf, healthRows, evolution] = await Promise.all([
    vendorPerformances([vendorId]),
    computeClientHealthForScope([vendorId]),
    weeklyEvolution(vendorId),
  ]);
  const p = perf[0];
  if (!p) throw new Error("Vendedor não encontrado ou sem dados.");

  const emRisco = healthRows.filter((r) => r.status === "RISCO" || r.status === "ALTO_RISCO");
  const oportunidadesAumento = healthRows.filter(
    (r) => r.status === "SAUDAVEL" && r.classification !== "C" && (r.revenueChangePct ?? 0) > 0
  );

  const pontosAtencao: string[] = [];
  if (p.variacaoPercentual !== null && p.variacaoPercentual < 0) {
    pontosAtencao.push(
      `Faturamento ${(p.variacaoPercentual * 100).toFixed(0)}% em relação ao mesmo período do mês anterior.`
    );
  }
  if (p.pctGoal !== null && p.pctGoal < 1) {
    pontosAtencao.push(`Atingiu ${(p.pctGoal * 100).toFixed(0)}% da meta do mês até o momento.`);
  }
  if (emRisco.length > 0) {
    pontosAtencao.push(`${emRisco.length} clientes da carteira estão em risco ou alto risco de churn.`);
  }
  if (pontosAtencao.length === 0) {
    pontosAtencao.push("Nenhum ponto crítico identificado nos dados disponíveis.");
  }

  const oportunidades: string[] = [];
  if (emRisco.length > 0) {
    oportunidades.push(`Priorizar reativação de ${emRisco.length} clientes em risco (ver Central de Reativação).`);
  }
  if (oportunidadesAumento.length > 0) {
    oportunidades.push(
      `${oportunidadesAumento.length} clientes A/B com faturamento em crescimento — potencial para aumento de ticket.`
    );
  }
  if (p.ticketVariacaoPercentual !== null && p.ticketVariacaoPercentual > 0) {
    oportunidades.push(
      `Ticket médio cresceu ${(p.ticketVariacaoPercentual * 100).toFixed(0)}% — investigar o que está funcionando e replicar.`
    );
  }
  if (oportunidades.length === 0) {
    oportunidades.push("Nenhuma oportunidade adicional identificada com os dados atuais.");
  }

  const prioridades = [...emRisco]
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((r) => `Contatar ${r.legalName} (${r.daysSinceLastOrder} dias sem comprar).`);

  return {
    vendorId,
    nome: p.name,
    desempenho: p,
    evolucaoSemanal: evolution,
    pontosDeAtencao: pontosAtencao,
    oportunidades,
    prioridades: prioridades.length ? prioridades : ["Nenhuma ação urgente identificada."],
    dadosUsados: {
      faturamentoAtual: p.revenue,
      faturamentoAnterior: p.previousRevenue,
      meta: p.goal,
      clientesEmRisco: emRisco.length,
      totalClientes: healthRows.length,
    },
  };
}
