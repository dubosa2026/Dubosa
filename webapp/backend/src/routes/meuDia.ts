import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { visibleVendorIds } from "../middleware/scope.js";
import { generateRadarAlerts } from "../services/insightsEngine.js";
import { computeClientHealthForScope, prioritizedReactivationList } from "../services/clientAnalytics.js";
import { prisma } from "../prisma.js";

export const meuDiaRouter = Router();

/** Tela "Meu Dia" (seção 19): consolida prioridades, acompanhamento, oportunidades e tarefas do dia. */
meuDiaRouter.get("/", requireAuth, async (req, res) => {
  const scoped = await visibleVendorIds(req.user!);

  const [alerts, healthRows, tasks] = await Promise.all([
    generateRadarAlerts(scoped),
    computeClientHealthForScope(scoped),
    prisma.task.findMany({
      where: {
        assigneeId: req.user!.id,
        status: { in: ["PENDENTE", "EM_ANDAMENTO"] },
      },
      include: { client: { select: { legalName: true } } },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const prioridadeAlta = alerts.filter((a) => a.level === "ATENCAO");
  const acompanhar = alerts.filter((a) => a.level === "OPORTUNIDADE" || a.level === "INFORMACAO");
  const oportunidades = prioritizedReactivationList(healthRows).slice(0, 10);
  const destaques = alerts.filter((a) => a.level === "DESTAQUE");

  const now = new Date();
  const tarefasHoje = tasks.map((t) => ({
    ...t,
    status: t.dueDate && t.dueDate < now && t.status === "PENDENTE" ? "ATRASADA" : t.status,
  }));

  res.json({
    prioridadeAlta,
    acompanhar,
    oportunidades,
    destaques,
    tarefasHoje,
  });
});
