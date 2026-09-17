import { prisma } from "../prisma.js";
import { vendorPerformances, type VendorPerformance } from "./vendorPerformance.js";
import { computeClientHealthForScope, type ClientHealthRow } from "./clientAnalytics.js";
import { currentMonthWindow, ordersInRange, sumRevenue } from "./metrics.js";
import type { AlertLevel } from "../constants.js";

export interface RadarAlert {
  level: AlertLevel;
  title: string;
  message: string;
  entityType: "VENDOR" | "CLIENT" | "STATE" | null;
  entityId: string | null;
  evidence: Record<string, unknown>;
}

const QUEDA_VENDEDOR_LIMIAR = -0.15; // -15%
const CRESCIMENTO_TICKET_LIMIAR = 0.1; // +10%
const CLIENTES_RISCO_LIMIAR = 3; // nº mínimo de clientes em risco na carteira para virar alerta

/**
 * Gera o Radar IA (seção 5): cada alerta carrega os indicadores usados
 * ("evidence"), nunca uma opinião sem lastro nos dados. Toda a lógica é
 * determinística sobre dados reais — não há geração de texto livre por LLM
 * aqui (isso fica reservado à Central "Pergunte à IA").
 */
export async function generateRadarAlerts(vendorIds: string[] | null): Promise<RadarAlert[]> {
  const explicitVendorIds =
    vendorIds ?? (await prisma.user.findMany({ where: { role: "VENDEDOR" }, select: { id: true } })).map((v) => v.id);

  const [perf, healthRows] = await Promise.all([
    vendorPerformances(explicitVendorIds),
    computeClientHealthForScope(vendorIds),
  ]);

  const alerts: RadarAlert[] = [];

  alerts.push(...vendorRevenueDropAlerts(perf));
  alerts.push(...vendorTicketGrowthAlerts(perf));
  alerts.push(...clientFrequencyDropAlerts(perf, healthRows));
  alerts.push(...(await stateComparisonAlerts(explicitVendorIds)));

  return alerts;
}

function vendorRevenueDropAlerts(perf: VendorPerformance[]): RadarAlert[] {
  return perf
    .filter((p) => p.variacaoPercentual !== null && p.variacaoPercentual <= QUEDA_VENDEDOR_LIMIAR)
    .map((p) => ({
      level: "ATENCAO" as AlertLevel,
      title: `Queda de faturamento: ${p.name}`,
      message: `${p.name} apresenta queda de ${Math.abs(p.variacaoPercentual! * 100).toFixed(0)}% no faturamento em relação ao mesmo período do mês anterior.`,
      entityType: "VENDOR" as const,
      entityId: p.vendorId,
      evidence: {
        faturamentoAtual: p.revenue,
        faturamentoAnterior: p.previousRevenue,
        variacaoPercentual: p.variacaoPercentual,
        pedidosAtual: p.orders,
      },
    }));
}

function vendorTicketGrowthAlerts(perf: VendorPerformance[]): RadarAlert[] {
  return perf
    .filter(
      (p) => p.ticketVariacaoPercentual !== null && p.ticketVariacaoPercentual >= CRESCIMENTO_TICKET_LIMIAR
    )
    .map((p) => ({
      level: "DESTAQUE" as AlertLevel,
      title: `Ticket médio em alta: ${p.name}`,
      message: `${p.name} aumentou o ticket médio em ${(p.ticketVariacaoPercentual! * 100).toFixed(0)}% em relação ao mês anterior.`,
      entityType: "VENDOR" as const,
      entityId: p.vendorId,
      evidence: {
        ticketMedioAtual: p.avgTicket,
        ticketMedioAnterior: p.previousAvgTicket,
        variacaoPercentual: p.ticketVariacaoPercentual,
      },
    }));
}

function clientFrequencyDropAlerts(
  perf: VendorPerformance[],
  healthRows: ClientHealthRow[]
): RadarAlert[] {
  const byVendor = new Map<string, ClientHealthRow[]>();
  for (const row of healthRows) {
    const list = byVendor.get(row.vendorId) ?? [];
    list.push(row);
    byVendor.set(row.vendorId, list);
  }

  const alerts: RadarAlert[] = [];
  for (const p of perf) {
    const rows = byVendor.get(p.vendorId) ?? [];
    const emRisco = rows.filter((r) => r.status === "RISCO" || r.status === "ALTO_RISCO");
    if (emRisco.length >= CLIENTES_RISCO_LIMIAR) {
      alerts.push({
        level: "OPORTUNIDADE",
        title: `Clientes reduzindo frequência: ${p.name}`,
        message: `${emRisco.length} clientes da carteira de ${p.name} reduziram a frequência de compra em relação ao padrão histórico.`,
        entityType: "VENDOR",
        entityId: p.vendorId,
        evidence: {
          totalClientesCarteira: rows.length,
          clientesEmRisco: emRisco.length,
          clientes: emRisco.slice(0, 10).map((r) => ({
            clientId: r.clientId,
            nome: r.legalName,
            diasSemComprar: r.daysSinceLastOrder,
            status: r.status,
          })),
        },
      });
    }
  }
  return alerts;
}

async function stateComparisonAlerts(vendorIds: string[]): Promise<RadarAlert[]> {
  const { start, end, previousStart, previousEnd } = currentMonthWindow();
  const [orders, previousOrders] = await Promise.all([
    ordersInRange(vendorIds, start, end),
    ordersInRange(vendorIds, previousStart, previousEnd),
  ]);

  const clients = await prisma.client.findMany({
    where: { vendorId: { in: vendorIds } },
    select: { id: true, stateId: true, state: { select: { uf: true } } },
  });
  const stateByClient = new Map(clients.map((c) => [c.id, c.state?.uf ?? "N/D"]));

  const revenueByState = new Map<string, number>();
  const previousRevenueByState = new Map<string, number>();
  for (const o of orders) {
    const uf = stateByClient.get(o.clientId) ?? "N/D";
    revenueByState.set(uf, (revenueByState.get(uf) ?? 0) + o.total);
  }
  for (const o of previousOrders) {
    const uf = stateByClient.get(o.clientId) ?? "N/D";
    previousRevenueByState.set(uf, (previousRevenueByState.get(uf) ?? 0) + o.total);
  }

  const totalCurrent = sumRevenue(orders);
  const totalPrevious = sumRevenue(previousOrders);
  const teamGrowth = totalPrevious > 0 ? (totalCurrent - totalPrevious) / totalPrevious : null;
  if (teamGrowth === null) return [];

  const growthByState: { uf: string; growth: number }[] = [];
  for (const [uf, current] of revenueByState.entries()) {
    const previous = previousRevenueByState.get(uf) ?? 0;
    if (previous <= 0) continue;
    growthByState.push({ uf, growth: (current - previous) / previous });
  }

  const aboveAverage = growthByState.filter((s) => s.growth > teamGrowth + 0.05);
  if (aboveAverage.length === 0) return [];

  return [
    {
      level: "INFORMACAO",
      title: "Estados acima da média da equipe",
      message: `${aboveAverage.map((s) => s.uf).join(", ")} apresentaram crescimento acima da média da equipe (${(teamGrowth * 100).toFixed(0)}%).`,
      entityType: "STATE",
      entityId: null,
      evidence: {
        crescimentoMedioEquipe: teamGrowth,
        estados: aboveAverage,
      },
    },
  ];
}
