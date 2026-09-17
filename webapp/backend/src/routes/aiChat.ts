import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { visibleVendorIds } from "../middleware/scope.js";
import { answerQuestion } from "../services/aiChat.js";
import { polishAnswer } from "../services/llmClient.js";
import { prisma } from "../prisma.js";

export const aiChatRouter = Router();

const schema = z.object({ question: z.string().min(2) });

aiChatRouter.post("/perguntar", requireAuth, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Envie uma pergunta no campo 'question'." });

  const scoped = await visibleVendorIds(req.user!);
  const result = await answerQuestion(parsed.data.question, scoped);
  const finalAnswer = await polishAnswer(result.answer, result.dataUsed);

  const record = await prisma.aIAnalysis.create({
    data: {
      subjectType: "GERAL",
      question: parsed.data.question,
      answer: finalAnswer,
      dataUsed: JSON.stringify(result.dataUsed),
      requestedById: req.user!.id,
    },
  });

  res.json({ id: record.id, question: parsed.data.question, answer: finalAnswer, intent: result.intent, dataUsed: result.dataUsed });
});

aiChatRouter.get("/historico", requireAuth, async (req, res) => {
  const history = await prisma.aIAnalysis.findMany({
    where: { requestedById: req.user!.id, subjectType: "GERAL" },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  res.json({ historico: history });
});
