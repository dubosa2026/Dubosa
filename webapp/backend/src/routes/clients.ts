import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { visibleVendorIds } from "../middleware/scope.js";
import { prisma } from "../prisma.js";
import { computeClientHealth } from "../services/healthScore.js";
import { CLIENT_CLASSES } from "../constants.js";

export const clientsRouter = Router();

clientsRouter.get("/", requireAuth, async (req, res) => {
  const scoped = await visibleVendorIds(req.user!);
  const clients = await prisma.client.findMany({
    where: scoped ? { vendorId: { in: scoped } } : {},
    include: { state: true, vendor: { select: { id: true, name: true } }, orders: { select: { date: true, total: true } } },
    orderBy: { legalName: "asc" },
  });

  const now = new Date();
  res.json({
    clientes: clients.map((c) => {
      const health = computeClientHealth(c.orders, now);
      const totalRevenue = c.orders.reduce((a, o) => a + o.total, 0);
      return {
        id: c.id,
        legalName: c.legalName,
        cnpj: c.cnpj,
        city: c.city,
        uf: c.state?.uf ?? null,
        segment: c.segment,
        classification: c.classification,
        vendor: c.vendor,
        totalRevenue,
        pedidos: c.orders.length,
        health,
      };
    }),
  });
});

clientsRouter.get("/:id", requireAuth, async (req, res) => {
  const scoped = await visibleVendorIds(req.user!);
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      state: true,
      vendor: { select: { id: true, name: true } },
      orders: { include: { items: { include: { product: true } } }, orderBy: { date: "desc" } },
      interactions: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
      opportunities: true,
      history: { orderBy: { changedAt: "desc" } },
    },
  });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado." });
  if (scoped && !scoped.includes(client.vendorId)) {
    return res.status(403).json({ error: "Sem permissão para ver este cliente." });
  }

  const health = computeClientHealth(
    client.orders.map((o) => ({ date: o.date, total: o.total })),
    new Date()
  );

  const totalRevenue = client.orders.reduce((a, o) => a + o.total, 0);
  const avgTicket = client.orders.length ? totalRevenue / client.orders.length : 0;

  res.json({
    ...client,
    health,
    totalRevenue,
    avgTicket,
  });
});

const classificationSchema = z.object({ classification: z.enum(CLIENT_CLASSES) });

clientsRouter.patch("/:id/classificacao", requireAuth, async (req, res) => {
  const parsed = classificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Classificação inválida (use A, B ou C)." });

  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado." });

  const scoped = await visibleVendorIds(req.user!);
  if (scoped && !scoped.includes(client.vendorId)) {
    return res.status(403).json({ error: "Sem permissão para editar este cliente." });
  }

  const updated = await prisma.client.update({
    where: { id: client.id },
    data: { classification: parsed.data.classification },
  });
  await prisma.auditLog.create({
    data: {
      entity: "Client",
      entityId: client.id,
      action: "UPDATE_CLASSIFICATION",
      before: client.classification,
      after: updated.classification,
      userId: req.user!.id,
    },
  });
  res.json(updated);
});

const interactionSchema = z.object({
  type: z.enum(["LIGACAO", "VISITA", "WHATSAPP", "EMAIL", "OUTRO"]),
  notes: z.string().min(1),
});

clientsRouter.post("/:id/interacoes", requireAuth, async (req, res) => {
  const parsed = interactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados de interação inválidos." });

  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado." });
  const scoped = await visibleVendorIds(req.user!);
  if (scoped && !scoped.includes(client.vendorId)) {
    return res.status(403).json({ error: "Sem permissão para registrar interação com este cliente." });
  }

  const interaction = await prisma.interaction.create({
    data: {
      clientId: client.id,
      userId: req.user!.id,
      type: parsed.data.type,
      notes: parsed.data.notes,
    },
  });
  res.status(201).json(interaction);
});
