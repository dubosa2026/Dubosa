import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { visibleVendorIds } from "../middleware/scope.js";
import { generateRadarAlerts } from "../services/insightsEngine.js";
import { prisma } from "../prisma.js";

export const radarRouter = Router();

radarRouter.get("/", requireAuth, async (req, res) => {
  const scoped = await visibleVendorIds(req.user!);
  const alerts = await generateRadarAlerts(scoped);

  // Persistimos os alertas gerados nesta consulta para permitir histórico e
  // o link "ver detalhes" apontar para um registro estável.
  const saved = await Promise.all(
    alerts.map((a) =>
      prisma.alert.create({
        data: {
          level: a.level,
          title: a.title,
          message: a.message,
          entityType: a.entityType,
          entityId: a.entityId,
          evidence: JSON.stringify(a.evidence),
          targetUserId: req.user!.id,
        },
      })
    )
  );

  res.json({
    alerts: saved.map((s) => ({ ...s, evidence: JSON.parse(s.evidence) })),
  });
});

radarRouter.get("/:id", requireAuth, async (req, res) => {
  const alert = await prisma.alert.findUnique({ where: { id: req.params.id } });
  if (!alert) return res.status(404).json({ error: "Alerta não encontrado." });
  res.json({ ...alert, evidence: JSON.parse(alert.evidence) });
});
