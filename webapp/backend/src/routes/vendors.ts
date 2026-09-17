import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { visibleVendorIds } from "../middleware/scope.js";
import { vendorPerformances } from "../services/vendorPerformance.js";
import { computeClientHealthForScope } from "../services/clientAnalytics.js";
import { analyzeVendor, weeklyEvolution } from "../services/vendorAnalysis.js";
import { prisma } from "../prisma.js";

export const vendorsRouter = Router();

async function assertVendorVisible(req: import("express").Request, vendorId: string) {
  const scoped = await visibleVendorIds(req.user!);
  if (scoped !== null && !scoped.includes(vendorId)) return false;
  return true;
}

vendorsRouter.get("/", requireAuth, async (req, res) => {
  const scoped = await visibleVendorIds(req.user!);
  const explicitVendorIds =
    scoped ?? (await prisma.user.findMany({ where: { role: "VENDEDOR" }, select: { id: true } })).map((v) => v.id);
  const perf = await vendorPerformances(explicitVendorIds);
  const healthRows = await computeClientHealthForScope(scoped);

  const byVendor = new Map<string, number>();
  for (const row of healthRows) {
    if (row.status === "RISCO" || row.status === "ALTO_RISCO") {
      byVendor.set(row.vendorId, (byVendor.get(row.vendorId) ?? 0) + 1);
    }
  }

  res.json({
    vendedores: perf.map((p) => ({
      ...p,
      clientesEmRisco: byVendor.get(p.vendorId) ?? 0,
    })),
  });
});

vendorsRouter.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!(await assertVendorVisible(req, id))) {
    return res.status(403).json({ error: "Sem permissão para ver este vendedor." });
  }
  const vendor = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
  if (!vendor) return res.status(404).json({ error: "Vendedor não encontrado." });

  const [perf, healthRows, evolution, clients] = await Promise.all([
    vendorPerformances([id]),
    computeClientHealthForScope([id]),
    weeklyEvolution(id),
    prisma.client.findMany({ where: { vendorId: id }, select: { id: true, legalName: true, classification: true } }),
  ]);

  res.json({
    vendor,
    desempenho: perf[0] ?? null,
    evolucaoSemanal: evolution,
    carteira: clients.map((c) => {
      const h = healthRows.find((r) => r.clientId === c.id);
      return { ...c, health: h ?? null };
    }),
  });
});

vendorsRouter.post("/:id/analise-ia", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!(await assertVendorVisible(req, id))) {
    return res.status(403).json({ error: "Sem permissão para ver este vendedor." });
  }
  try {
    const analysis = await analyzeVendor(id);
    const record = await prisma.aIAnalysis.create({
      data: {
        subjectType: "VENDOR",
        subjectId: id,
        answer: JSON.stringify(analysis),
        dataUsed: JSON.stringify(analysis.dadosUsados),
        requestedById: req.user!.id,
      },
    });
    res.json({ id: record.id, ...analysis });
  } catch (e) {
    res.status(404).json({ error: (e as Error).message });
  }
});
