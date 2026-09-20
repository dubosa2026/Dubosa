import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import * as core from "@foco/core";
import type { Database } from "better-sqlite3";
import { IPC, type HomeData, type LoginInput, type RegisterIntegratorActionInput, type RegisterProblemInput } from "../shared/ipc";

let db: Database;
let userRepo: core.UserRepository;
let timeEntryRepo: core.TimeEntryRepository;
let problemRepo: core.ProblemRepository;
let integratorActionRepo: core.IntegratorActionRepository;
let classifier: core.ProblemClassifier;

let currentUserId: string | null = null;

function inicioDoDiaISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fimDoDiaISO(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function initCore(): void {
  const dbPath = path.join(app.getPath("userData"), "foco.db");
  db = core.openDatabase(dbPath);
  core.seedDemoData(db);

  userRepo = new core.UserRepository(db);
  timeEntryRepo = new core.TimeEntryRepository(db);
  problemRepo = new core.ProblemRepository(db);
  integratorActionRepo = new core.IntegratorActionRepository(db);
  classifier = core.createDefaultClassifier(process.env.ANTHROPIC_API_KEY);
}

function buildHomeData(userId: string): HomeData {
  const user = userRepo.buscarPorId(userId)!;
  const emAndamento = timeEntryRepo.buscarEmAndamento(userId);
  const entriesHoje = timeEntryRepo.listarPorUsuarioNoPeriodo(userId, inicioDoDiaISO(), fimDoDiaISO());
  const focoComercial = core.computeFocoComercial(entriesHoje);
  const historicoChamados = problemRepo.listarPorUsuario(userId);
  return { user, emAndamento, focoComercial, historicoChamados };
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.LOGIN, (_e, input: LoginInput) => {
    const user = userRepo.autenticar(input.email, input.senha);
    if (!user) return { ok: false as const, erro: "E-mail ou senha inválidos." };
    currentUserId = user.id;
    return { ok: true as const, data: buildHomeData(user.id) };
  });

  ipcMain.handle(IPC.LOGOUT, () => {
    currentUserId = null;
    return { ok: true as const };
  });

  ipcMain.handle(IPC.GET_HOME_DATA, () => {
    if (!currentUserId) return { ok: false as const, erro: "Não autenticado." };
    return { ok: true as const, data: buildHomeData(currentUserId) };
  });

  ipcMain.handle(IPC.START_TIME, (_e, categoria: import("@foco/core").TimeCategory) => {
    if (!currentUserId) return { ok: false as const, erro: "Não autenticado." };
    try {
      timeEntryRepo.iniciar(currentUserId, categoria);
      return { ok: true as const, data: buildHomeData(currentUserId) };
    } catch (err) {
      return { ok: false as const, erro: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.STOP_TIME, () => {
    if (!currentUserId) return { ok: false as const, erro: "Não autenticado." };
    const emAndamento = timeEntryRepo.buscarEmAndamento(currentUserId);
    if (emAndamento) timeEntryRepo.parar(emAndamento.id);
    return { ok: true as const, data: buildHomeData(currentUserId) };
  });

  ipcMain.handle(IPC.CLASSIFY_PROBLEM, async (_e, descricao: string) => {
    const resultado = await classifier.classify(descricao);
    return { ok: true as const, data: resultado };
  });

  ipcMain.handle(IPC.REGISTER_PROBLEM, async (_e, input: RegisterProblemInput) => {
    if (!currentUserId) return { ok: false as const, erro: "Não autenticado." };
    const classificacao = input.categoria
      ? {
          categoria: input.categoria,
          prioridade: input.prioridade ?? "MEDIA",
          areaResponsavel: core.AREA_RESPONSAVEL_POR_CATEGORIA[input.categoria],
        }
      : await classifier.classify(input.descricao);

    // Encerra automaticamente qualquer bloco em andamento e inicia a contagem
    // do tempo gasto neste problema, para o índice de foco refletir a realidade.
    const emAndamento = timeEntryRepo.buscarEmAndamento(currentUserId);
    if (emAndamento) timeEntryRepo.parar(emAndamento.id);

    const problema = problemRepo.registrar({
      userId: currentUserId,
      cliente: input.cliente,
      descricao: input.descricao,
      categoria: classificacao.categoria,
      prioridade: classificacao.prioridade,
      areaResponsavel: classificacao.areaResponsavel,
    });
    timeEntryRepo.iniciar(currentUserId, "PROBLEMA", problema.id);

    return { ok: true as const, data: { problema, home: buildHomeData(currentUserId) } };
  });

  ipcMain.handle(IPC.MARK_STUCK, (_e, problemaId: string) => {
    const problema = problemRepo.marcarPreso(problemaId);
    return { ok: true as const, data: problema };
  });

  ipcMain.handle(IPC.REGISTER_INTEGRATOR_ACTION, (_e, input: RegisterIntegratorActionInput) => {
    if (!currentUserId) return { ok: false as const, erro: "Não autenticado." };
    const acao = integratorActionRepo.registrar({ userId: currentUserId, ...input });
    return { ok: true as const, data: acao };
  });

  ipcMain.handle(IPC.GET_HISTORICO, () => {
    if (!currentUserId) return { ok: false as const, erro: "Não autenticado." };
    return { ok: true as const, data: problemRepo.listarPorUsuario(currentUserId) };
  });

  ipcMain.handle(IPC.GET_AUTONOMIA, () => {
    if (!currentUserId) return { ok: false as const, erro: "Não autenticado." };
    const acoes = integratorActionRepo.listarPorUsuario(currentUserId);
    return {
      ok: true as const,
      data: { geral: core.computeAutonomiaGeral(acoes), porCliente: core.computeAutonomiaPorCliente(acoes) },
    };
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    minWidth: 820,
    minHeight: 600,
    title: "FOCO — Gestão do Tempo Comercial",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  initCore();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
