import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { visibleVendorIds } from "../middleware/scope.js";
import { prisma } from "../prisma.js";
import { GOAL_PERIODS, GOAL_SCOPES } from "../constants.js";
import { ordersInRange, currentMonthWindow, goalPeriodEnd } from "../services/metrics.js";

export const goalsRouter = Router();

goalsRouter.get("/", requireAuth, async (req, res) => {
  const scoped = await visibleVendorIds(req.user!);
  const goals = await prisma.goal.findMany({
    where: scoped ? { vendorId: { in: scoped } } : {},
    include: { vendor: { select: { id: true, name: true } } },
    orderBy: { refDate: "desc" },
  });

  const { start, end } = currentMonthWindow();
  const withRealized = await Promise.all(
    goals.map(async (g) => {
      const vendorIds = g.vendorId ? [g.vendorId] : scoped;
      const periodEnd = goalPeriodEnd(g.refDate, g.period);
      const orders = await ordersInRange(vendorIds, g.refDate, periodEnd > g.refDate ? periodEnd : g.refDate);
      const realizado = orders.reduce((a, o) => a + o.total, 0);
      return {
        ...g,
        realizado,
        gap: g.targetValue - realizado,
        percentual: g.targetValue > 0 ? realizado / g.targetValue : null,
      };
    })
  );

  res.json({ metas: withRealized, janela: { start, end } });
});

const createSchema = z.object({
  scope: z.enum(GOAL_SCOPES),
  period: z.enum(GOAL_PERIODS),
  refDate: z.string().datetime(),
  targetValue: z.number().positive(),
  vendorId: z.string().optional(),
});

goalsRouter.post("/", requireAuth, requireRole("ADMIN", "GERENTE"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados de meta inválidos.", details: parsed.error.flatten() });

  const goal = await prisma.goal.create({
    data: {
      scope: parsed.data.scope,
      period: parsed.data.period,
      refDate: new Date(parsed.data.refDate),
      targetValue: parsed.data.targetValue,
      vendorId: parsed.data.vendorId,
      isDemo: false,
    },
  });
  res.status(201).json(goal);
});
