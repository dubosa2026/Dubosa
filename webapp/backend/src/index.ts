import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { vendorsRouter } from "./routes/vendors.js";
import { clientsRouter } from "./routes/clients.js";
import { goalsRouter } from "./routes/goals.js";
import { radarRouter } from "./routes/radar.js";
import { reactivationRouter } from "./routes/reactivation.js";
import { tasksRouter } from "./routes/tasks.js";
import { importRouter } from "./routes/import.js";
import { aiChatRouter } from "./routes/aiChat.js";
import { meuDiaRouter } from "./routes/meuDia.js";
import { usersRouter } from "./routes/users.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/vendedores", vendorsRouter);
app.use("/api/clientes", clientsRouter);
app.use("/api/metas", goalsRouter);
app.use("/api/radar", radarRouter);
app.use("/api/reativacao", reactivationRouter);
app.use("/api/tarefas", tasksRouter);
app.use("/api/importacao", importRouter);
app.use("/api/ia", aiChatRouter);
app.use("/api/meu-dia", meuDiaRouter);
app.use("/api/usuarios", usersRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Copiloto Gerencial IA — backend rodando em http://localhost:${port}`);
});
