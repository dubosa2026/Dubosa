import { prisma } from "../prisma.js";
import { computeClientHealth, type ClientHealth } from "./healthScore.js";

export interface ClientHealthRow extends ClientHealth {
  clientId: string;
  vendorId: string;
  legalName: string;
  classification: string;
  avgHistoricTicket: number;
  lastOrderDate: Date | null;
  monthlyAvgRevenue: number;
}

/**
 * Carrega todos os clientes do escopo com seus pedidos e calcula o
 * Customer Health Score de cada um. Base para Radar IA, Reativação e
 * páginas de cliente/vendedor.
 */
export async function computeClientHealthForScope(
  vendorIds: string[] | null,
  referenceDate: Date = new Date()
): Promise<ClientHealthRow[]> {
  const clients = await prisma.client.findMany({
    where: vendorIds ? { vendorId: { in: vendorIds } } : {},
    include: { orders: { select: { date: true, total: true } } },
  });

  return clients.map((c) => {
    const orders = c.orders.map((o) => ({ date: o.date, total: o.total }));
    const health = computeClientHealth(orders, referenceDate);
    const totalRevenue = orders.reduce((a, o) => a + o.total, 0);
    const avgHistoricTicket = orders.length ? totalRevenue / orders.length : 0;
    const sorted = [...orders].sort((a, b) => a.date.getTime() - b.date.getTime());
    const lastOrderDate = sorted.length ? sorted[sorted.length - 1].date : null;
    const firstOrderDate = sorted.length ? sorted[0].date : null;
    const monthsSpan = firstOrderDate
      ? Math.max(1, (referenceDate.getTime() - firstOrderDate.getTime()) / (30 * 86400000))
      : 1;
    const monthlyAvgRevenue = totalRevenue / monthsSpan;

    return {
      ...health,
      clientId: c.id,
      vendorId: c.vendorId,
      legalName: c.legalName,
      classification: c.classification,
      avgHistoricTicket,
      lastOrderDate,
      monthlyAvgRevenue,
    };
  });
}

export function summarizeRisk(rows: ClientHealthRow[]) {
  return {
    saudavel: rows.filter((r) => r.status === "SAUDAVEL").length,
    atencao: rows.filter((r) => r.status === "ATENCAO").length,
    risco: rows.filter((r) => r.status === "RISCO").length,
    altoRisco: rows.filter((r) => r.status === "ALTO_RISCO").length,
  };
}

export function prioritizedReactivationList(rows: ClientHealthRow[]) {
  return rows
    .filter((r) => r.status === "RISCO" || r.status === "ALTO_RISCO")
    .map((r) => {
      // Só faz sentido expressar "queda" de frequência quando o cliente está
      // de fato comprando com intervalo maior que o histórico (multiple > 1).
      // Quando o motivo do risco é queda de faturamento (não de frequência),
      // este valor fica null e a UI usa apenas o texto de `motivo`.
      const queda =
        r.expectedIntervalMultiple !== null && r.expectedIntervalMultiple > 1
          ? Math.round((1 - 1 / r.expectedIntervalMultiple) * 100)
          : null;
      return {
        clientId: r.clientId,
        vendorId: r.vendorId,
        legalName: r.legalName,
        status: r.status,
        faturamentoMedioMensal: r.monthlyAvgRevenue,
        diasSemComprar: r.daysSinceLastOrder,
        frequenciaHistoricaDias: r.avgIntervalDays,
        quedaPercentual: queda,
        motivo:
          r.reasons[0] ??
          "Cliente apresenta comportamento fora do padrão histórico de compras.",
        score: r.score,
      };
    })
    .sort((a, b) => a.score - b.score || b.faturamentoMedioMensal - a.faturamentoMedioMensal);
}
