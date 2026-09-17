import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { prisma } from "../prisma.js";
import { ROLES } from "../constants.js";

export const usersRouter = Router();

usersRouter.get("/", requireAuth, requireRole("ADMIN", "GERENTE"), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, teamId: true, team: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  res.json({ usuarios: users });
});

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(ROLES),
  teamId: z.string().optional(),
});

usersRouter.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados de usuário inválidos.", details: parsed.error.flatten() });

  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return res.status(409).json({ error: "Já existe um usuário com este e-mail." });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: parsed.data.role,
      teamId: parsed.data.teamId,
      isDemo: false,
    },
    select: { id: true, name: true, email: true, role: true },
  });
  await prisma.auditLog.create({
    data: { entity: "User", entityId: user.id, action: "CREATE", after: JSON.stringify(user), userId: req.user!.id },
  });
  res.status(201).json(user);
});

usersRouter.patch("/:id/status", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const schema = z.object({ active: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Campo 'active' obrigatório." });

  const user = await prisma.user.update({ where: { id: req.params.id }, data: { active: parsed.data.active } });
  res.json({ id: user.id, active: user.active });
});
