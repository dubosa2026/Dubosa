import { prisma } from "../prisma.js";
import { currentMonthWindow, ordersInRange, sumRevenue, goalTotal } from "./metrics.js";
import { startOfMonth } from "../utils/dates.js";

export interface VendorPerformance {
  vendorId: string;
  name: string;
  revenue: number;
  previousRevenue: number;
  variacaoPercentual: number | null;
  goal: number;
  pctGoal: number | null;
  orders: number;
  avgTicket: number;
  previousAvgTicket: number;
  ticketVariacaoPercentual: number | null;
  trend: "CRESCIMENTO" | "QUEDA" | "ESTAVEL";
}

const TREND_THRESHOLD = 0.05;

export async function vendorPerformances(vendorIds: string[]): Promise<VendorPerformance[]> {
  if (vendorIds.length === 0) return [];
  const { start, end, previousStart, previousEnd } = currentMonthWindow();

  const vendors = await prisma.user.findMany({
    where: { id: { in: vendorIds } },
    select: { id: true, name: true },
  });

  const results: VendorPerformance[] = [];
  for (const vendor of vendors) {
    const [orders, previousOrders, goal] = await Promise.all([
      ordersInRange([vendor.id], start, end),
      ordersInRange([vendor.id], previousStart, previousEnd),
      goalTotal([vendor.id], startOfMonth(start)),
    ]);
    const revenue = sumRevenue(orders);
    const previousRevenue = sumRevenue(previousOrders);
    const variacaoPercentual = previousRevenue > 0 ? (revenue - previousRevenue) / previousRevenue : null;

    let trend: VendorPerformance["trend"] = "ESTAVEL";
    if (variacaoPercentual !== null) {
      if (variacaoPercentual >= TREND_THRESHOLD) trend = "CRESCIMENTO";
      else if (variacaoPercentual <= -TREND_THRESHOLD) trend = "QUEDA";
    }

    const avgTicket = orders.length ? revenue / orders.length : 0;
    const previousAvgTicket = previousOrders.length ? previousRevenue / previousOrders.length : 0;
    const ticketVariacaoPercentual =
      previousAvgTicket > 0 ? (avgTicket - previousAvgTicket) / previousAvgTicket : null;

    results.push({
      vendorId: vendor.id,
      name: vendor.name,
      revenue,
      previousRevenue,
      variacaoPercentual,
      goal,
      pctGoal: goal > 0 ? revenue / goal : null,
      orders: orders.length,
      avgTicket,
      previousAvgTicket,
      ticketVariacaoPercentual,
      trend,
    });
  }
  return results;
}
