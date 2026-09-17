import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { visibleVendorIds } from "../middleware/scope.js";
import { buildDashboardSummary } from "../services/metrics.js";
import { vendorPerformances } from "../services/vendorPerformance.js";
import { computeClientHealthForScope, summarizeRisk } from "../services/clientAnalytics.js";
import { prisma } from "../prisma.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", requireAuth, async (req, res) => {
  const scoped = await visibleVendorIds(req.user!);

  const explicitVendorIds =
    scoped ?? (await prisma.user.findMany({ where: { role: "VENDEDOR" }, select: { id: true } })).map((v) => v.id);

  const [summary, perf, healthRows] = await Promise.all([
    buildDashboardSummary(scoped),
    vendorPerformances(explicitVendorIds),
    computeClientHealthForScope(scoped),
  ]);

  const risk = summarizeRisk(healthRows);

  summary.equipe.acimaDaMeta = perf.filter((p) => p.pctGoal !== null && p.pctGoal >= 1).length;
  summary.equipe.abaixoDaMeta = perf.filter((p) => p.pctGoal !== null && p.pctGoal < 1).length;
  summary.equipe.tendenciaQueda = perf.filter((p) => p.trend === "QUEDA").length;
  summary.equipe.tendenciaCrescimento = perf.filter((p) => p.trend === "CRESCIMENTO").length;
  summary.clientes.emRisco = risk.risco + risk.altoRisco;

  res.json({
    greetingName: req.user!.name,
    summary,
    vendedores: perf,
    saudeCarteira: risk,
  });
});
