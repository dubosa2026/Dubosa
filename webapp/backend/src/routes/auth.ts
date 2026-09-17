import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import type { Role } from "../constants.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return res.status(401).json({ error: "Credenciais inválidas." });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Credenciais inválidas." });
  }

  const authUser = {
    id: user.id,
    role: user.role as Role,
    teamId: user.teamId,
    name: user.name,
    email: user.email,
  };
  const token = signToken(authUser);
  res.json({ token, user: authUser });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: req.user });
});
