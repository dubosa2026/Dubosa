import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { visibleVendorIds } from "../middleware/scope.js";
import { prisma } from "../prisma.js";
import { TASK_PRIORITIES, TASK_STATUSES } from "../constants.js";

export const tasksRouter = Router();

tasksRouter.get("/", requireAuth, async (req, res) => {
  const scoped = await visibleVendorIds(req.user!);
  const tasks = await prisma.task.findMany({
    where: scoped ? { assigneeId: { in: scoped } } : {},
    include: { assignee: { select: { id: true, name: true } }, client: { select: { id: true, legalName: true } } },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  const now = new Date();
  const withComputedStatus = tasks.map((t) => {
    const status =
      t.status === "PENDENTE" && t.dueDate && t.dueDate < now ? "ATRASADA" : t.status;
    return { ...t, status };
  });

  res.json({ tarefas: withComputedStatus });
});

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(TASK_PRIORITIES).default("MEDIA"),
  dueDate: z.string().datetime().optional(),
  assigneeId: z.string().min(1),
  clientId: z.string().optional(),
  originAlertId: z.string().optional(),
});

tasksRouter.post("/", requireAuth, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados de tarefa inválidos.", details: parsed.error.flatten() });

  const scoped = await visibleVendorIds(req.user!);
  if (scoped && !scoped.includes(parsed.data.assigneeId)) {
    return res.status(403).json({ error: "Sem permissão para atribuir tarefa a este usuário." });
  }

  const task = await prisma.task.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      assigneeId: parsed.data.assigneeId,
      creatorId: req.user!.id,
      clientId: parsed.data.clientId,
      originAlertId: parsed.data.originAlertId,
    },
  });
  res.status(201).json(task);
});

const updateSchema = z.object({ status: z.enum(TASK_STATUSES) });

tasksRouter.patch("/:id", requireAuth, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Status inválido." });

  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) return res.status(404).json({ error: "Tarefa não encontrada." });

  const scoped = await visibleVendorIds(req.user!);
  if (scoped && !scoped.includes(task.assigneeId) && task.creatorId !== req.user!.id) {
    return res.status(403).json({ error: "Sem permissão para editar esta tarefa." });
  }

  const updated = await prisma.task.update({ where: { id: task.id }, data: { status: parsed.data.status } });
  res.json(updated);
});
