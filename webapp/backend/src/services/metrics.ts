import { prisma } from "../prisma.js";
import { startOfMonth, addDays } from "../utils/dates.js";

export interface PeriodWindow {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
}

/** Mês corrente (até agora) e o mesmo intervalo de dias no mês anterior, para comparação justa. */
export function currentMonthWindow(now: Date = new Date()): PeriodWindow {
  const start = startOfMonth(now);
  const end = now;
  const daysElapsed = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const previousStart = startOfMonth(new Date(start.getFullYear(), start.getMonth() - 1, 1));
  const previousEnd = addDays(previousStart, daysElapsed);
  return { start, end, previousStart, previousEnd };
}

/** Fim do período de referência de uma meta (fim do mês/semana/dia), limitado a "agora" quando o período ainda está em curso. */
export function goalPeriodEnd(refDate: Date, period: string, now: Date = new Date()): Date {
  let periodEnd: Date;
  if (period === "MENSAL") {
    periodEnd = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1);
  } else if (period === "SEMANAL") {
    periodEnd = addDays(refDate, 7);
  } else {
    periodEnd = addDays(refDate, 1);
  }
  return periodEnd < now ? periodEnd : now;
}

export async function ordersInRange(vendorIds: string[] | null, start: Date, end: Date) {
  return prisma.order.findMany({
    where: {
      date: { gte: start, lte: end },
      ...(vendorIds ? { vendorId: { in: vendorIds } } : {}),
    },
    include: { client: true },
  });
}

export function sumRevenue(orders: { total: number }[]): number {
  return orders.reduce((acc, o) => acc + o.total, 0);
}

export async function goalTotal(
  vendorIds: string[] | null,
  refDate: Date,
  period: string = "MENSAL"
): Promise<number> {
  const goals = await prisma.goal.findMany({
    where: {
      period,
      refDate,
      ...(vendorIds ? { vendorId: { in: vendorIds } } : {}),
    },
  });
  return goals.reduce((acc, g) => acc + g.targetValue, 0);
}

export interface DashboardSummary {
  resultado: {
    faturamentoAtual: number;
    meta: number;
    percentualAtingido: number | null;
    gap: number;
    projecaoFimPeriodo: number;
    faturamentoPeriodoAnterior: number;
    variacaoPercentual: number | null;
  };
  pedidos: {
    total: number;
    mediaDiaria: number;
    ticketMedio: number;
    pedidosPeriodoAnterior: number;
  };
  clientes: {
    ativos: number;
    novos: number;
    reativados: number;
    inativos: number;
    emRisco: number;
  };
  equipe: {
    acimaDaMeta: number;
    abaixoDaMeta: number;
    tendenciaQueda: number;
    tendenciaCrescimento: number;
  };
}

export async function buildDashboardSummary(vendorIds: string[] | null): Promise<DashboardSummary> {
  const { start, end, previousStart, previousEnd } = currentMonthWindow();

  const [orders, previousOrders, meta] = await Promise.all([
    ordersInRange(vendorIds, start, end),
    ordersInRange(vendorIds, previousStart, previousEnd),
    goalTotal(vendorIds, startOfMonth(start)),
  ]);

  const faturamentoAtual = sumRevenue(orders);
  const faturamentoPeriodoAnterior = sumRevenue(previousOrders);
  const daysElapsed = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const projecaoFimPeriodo = (faturamentoAtual / daysElapsed) * daysInMonth;

  const variacaoPercentual =
    faturamentoPeriodoAnterior > 0
      ? (faturamentoAtual - faturamentoPeriodoAnterior) / faturamentoPeriodoAnterior
      : null;

  // Clientes: ativos = compraram no período; novos = primeira compra ocorreu no período;
  // inativos/em risco calculados via health score em outro serviço (radar/reativação),
  // aqui contamos apenas a contagem simples baseada em pedidos do período.
  const clientIdsAtivos = new Set(orders.map((o) => o.clientId));
  const allClientsScope = await prisma.client.findMany({
    where: vendorIds ? { vendorId: { in: vendorIds } } : {},
    select: { id: true, createdAt: true },
  });

  const firstOrderByClient = await prisma.order.groupBy({
    by: ["clientId"],
    _min: { date: true },
    where: vendorIds ? { vendorId: { in: vendorIds } } : {},
  });
  const firstOrderMap = new Map(firstOrderByClient.map((f) => [f.clientId, f._min.date]));
  const novos = orders.filter((o) => {
    const first = firstOrderMap.get(o.clientId);
    return first && first.getTime() >= start.getTime() && clientIdsAtivos.has(o.clientId);
  });
  const novosClientesSet = new Set(novos.map((o) => o.clientId));

  const totalClientes = allClientsScope.length;
  const inativos = totalClientes - clientIdsAtivos.size;

  return {
    resultado: {
      faturamentoAtual,
      meta,
      percentualAtingido: meta > 0 ? faturamentoAtual / meta : null,
      gap: meta - faturamentoAtual,
      projecaoFimPeriodo,
      faturamentoPeriodoAnterior,
      variacaoPercentual,
    },
    pedidos: {
      total: orders.length,
      mediaDiaria: orders.length / daysElapsed,
      ticketMedio: orders.length ? faturamentoAtual / orders.length : 0,
      pedidosPeriodoAnterior: previousOrders.length,
    },
    clientes: {
      ativos: clientIdsAtivos.size,
      novos: novosClientesSet.size,
      reativados: 0, // calculado no módulo de reativação (depende de health score)
      inativos: Math.max(0, inativos),
      emRisco: 0, // calculado no módulo de reativação (depende de health score)
    },
    equipe: {
      acimaDaMeta: 0,
      abaixoDaMeta: 0,
      tendenciaQueda: 0,
      tendenciaCrescimento: 0,
    },
  };
}
