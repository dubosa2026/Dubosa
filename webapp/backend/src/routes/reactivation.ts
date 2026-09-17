import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { visibleVendorIds } from "../middleware/scope.js";
import { computeClientHealthForScope, prioritizedReactivationList } from "../services/clientAnalytics.js";
import { prisma } from "../prisma.js";

export const reactivationRouter = Router();

reactivationRouter.get("/", requireAuth, async (req, res) => {
  const scoped = await visibleVendorIds(req.user!);
  const rows = await computeClientHealthForScope(scoped);
  res.json({ lista: prioritizedReactivationList(rows) });
});

reactivationRouter.post("/:clientId/estrategia-ia", requireAuth, async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.clientId },
    include: { orders: { select: { date: true, total: true }, orderBy: { date: "desc" } } },
  });
  if (!client) return res.status(404).json({ error: "Cliente não encontrado." });

  const scoped = await visibleVendorIds(req.user!);
  if (scoped && !scoped.includes(client.vendorId)) {
    return res.status(403).json({ error: "Sem permissão para este cliente." });
  }

  const lastOrder = client.orders[0];
  const totalRevenue = client.orders.reduce((a, o) => a + o.total, 0);
  const avgTicket = client.orders.length ? totalRevenue / client.orders.length : 0;

  const passos = [
    lastOrder
      ? `Retomar contato citando a última compra (${lastOrder.date.toISOString().slice(0, 10)}, R$ ${lastOrder.total.toFixed(2)}).`
      : "Fazer contato de apresentação, sem histórico de compras registrado.",
    `Oferecer condição alinhada ao ticket médio histórico (R$ ${avgTicket.toFixed(2)}) para reduzir o risco de objeção por preço.`,
    "Registrar o contato na Central de Reativação e agendar follow-up em 7 dias caso não haja retorno.",
  ];

  const analysis = await prisma.aIAnalysis.create({
    data: {
      subjectType: "CLIENT",
      subjectId: client.id,
      answer: JSON.stringify({ passos }),
      dataUsed: JSON.stringify({ totalRevenue, avgTicket, pedidos: client.orders.length }),
      requestedById: req.user!.id,
    },
  });

  res.json({ id: analysis.id, clientId: client.id, passos });
});
