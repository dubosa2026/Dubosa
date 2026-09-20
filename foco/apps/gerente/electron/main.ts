import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import * as core from "@foco/core";
import type { Database } from "better-sqlite3";
import {
  IPC,
  type DashboardData,
  type LoginInput,
  type StatusVendedor,
  type VendedorStatus,
} from "../shared/ipc";

let db: Database;
let userRepo: core.UserRepository;
let timeEntryRepo: core.TimeEntryRepository;
let problemRepo: core.ProblemRepository;
let integratorActionRepo: core.IntegratorActionRepository;

let currentGerenteId: string | null = null;

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
  // V1 é local por máquina; para o app do gerente enxergar a mesma equipe
  // do app do vendedor no mesmo posto de demonstração, o caminho do banco
  // pode ser sobrescrito por FOCO_DB_PATH. Numa instalação real com
  // vendedores em máquinas separadas, isso será substituído pela API
  // central (ver README/roadmap V2) — a interface dos repositórios não muda.
  const dbPath = process.env.FOCO_DB_PATH ?? path.join(app.getPath("userData"), "foco.db");
  db = core.openDatabase(dbPath);
  core.seedDemoData(db);

  userRepo = new core.UserRepository(db);
  timeEntryRepo = new core.TimeEntryRepository(db);
  problemRepo = new core.ProblemRepository(db);
  integratorActionRepo = new core.IntegratorActionRepository(db);
}

function vendedoresDaEquipe(): core.User[] {
  if (!currentGerenteId) return [];
  const doGerente = userRepo.listarVendedoresDoGerente(currentGerenteId);
  return doGerente.length > 0 ? doGerente : userRepo.listarTodosVendedores();
}

function statusDoVendedor(vendedor: core.User, presos: Set<string>): VendedorStatus {
  const emAndamento = timeEntryRepo.buscarEmAndamento(vendedor.id);
  const entriesHoje = timeEntryRepo.listarPorUsuarioNoPeriodo(vendedor.id, inicioDoDiaISO(), fimDoDiaISO());
  const foco = core.computeFocoComercial(entriesHoje);

  let status: StatusVendedor = "SEM_ATIVIDADE";
  if (emAndamento) {
    if (emAndamento.categoria === "PROBLEMA") status = "PROBLEMA";
    else if (emAndamento.categoria === "PROSPECCAO") status = "PROSPECCAO";
    else if (emAndamento.categoria === "NEGOCIACAO" || emAndamento.categoria === "FOLLOWUP")
      status = "ATIVIDADE_COMERCIAL";
    else status = "OPERACIONAL";
  }

  return {
    user: vendedor,
    status,
    categoriaAtual: emAndamento?.categoria ?? null,
    precisaAjuda: presos.has(vendedor.id),
    focoComercialPercentHoje: foco.focoComercialPercent,
  };
}

function buildDashboardData(): DashboardData {
  const gerente = userRepo.buscarPorId(currentGerenteId!)!;
  const vendedores = vendedoresDaEquipe();
  const idsEquipe = new Set(vendedores.map((v) => v.id));

  const entriesHoje = timeEntryRepo
    .listarNoPeriodo(inicioDoDiaISO(), fimDoDiaISO())
    .filter((e) => idsEquipe.has(e.userId));
  const problemsHoje = problemRepo
    .listarNoPeriodo(inicioDoDiaISO(), fimDoDiaISO())
    .filter((p) => idsEquipe.has(p.userId));

  const focoEquipe = core.computeFocoComercial(entriesHoje);
  const tempoOperacional = core.computeTempoOperacionalEvitavel(entriesHoje);
  const mapaConsumo = core.computeMapaConsumoPorArea(entriesHoje, problemsHoje);
  const horasRecuperaveisMes = core.projetarHorasMensais(tempoOperacional.evitavelSegundos / 3600, 1, 22);

  const emProspeccao = vendedores.filter((v) => timeEntryRepo.buscarEmAndamento(v.id)?.categoria === "PROSPECCAO")
    .length;

  const alertas = core.generateManagerAlerts({
    entriesHoje,
    problemsHoje,
    mapaConsumo,
    horasRecuperaveisMes,
  });

  return {
    gerente,
    totalVendedores: vendedores.length,
    emProspeccao,
    focoComercialPercentEquipe: focoEquipe.focoComercialPercent,
    chamadosOperacionaisAbertos: problemsHoje.filter((p) => p.status !== "RESOLVIDO").length,
    tempoOperacionalPercent: tempoOperacional.percentEvitavel,
    horasRecuperaveisMes,
    alertas,
  };
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC.LOGIN, (_e, input: LoginInput) => {
    const user = userRepo.autenticar(input.email, input.senha);
    if (!user) return { ok: false as const, erro: "E-mail ou senha inválidos." };
    if (user.role !== "GERENTE" && user.role !== "ADMIN") {
      return { ok: false as const, erro: "Esta conta não tem acesso ao painel gerencial." };
    }
    currentGerenteId = user.id;
    return { ok: true as const, data: buildDashboardData() };
  });

  ipcMain.handle(IPC.LOGOUT, () => {
    currentGerenteId = null;
    return { ok: true as const };
  });

  ipcMain.handle(IPC.GET_DASHBOARD, () => {
    if (!currentGerenteId) return { ok: false as const, erro: "Não autenticado." };
    return { ok: true as const, data: buildDashboardData() };
  });

  ipcMain.handle(IPC.GET_EQUIPE, () => {
    if (!currentGerenteId) return { ok: false as const, erro: "Não autenticado." };
    const presos = new Set(problemRepo.listarPresos().map((p) => p.userId));
    const vendedores = vendedoresDaEquipe().map((v) => statusDoVendedor(v, presos));
    return { ok: true as const, data: vendedores };
  });

  ipcMain.handle(IPC.GET_MAPA_CONSUMO, () => {
    if (!currentGerenteId) return { ok: false as const, erro: "Não autenticado." };
    const idsEquipe = new Set(vendedoresDaEquipe().map((v) => v.id));
    const entries = timeEntryRepo
      .listarNoPeriodo(inicioDoDiaISO(), fimDoDiaISO())
      .filter((e) => idsEquipe.has(e.userId));
    const problems = problemRepo
      .listarNoPeriodo(inicioDoDiaISO(), fimDoDiaISO())
      .filter((p) => idsEquipe.has(p.userId));
    return { ok: true as const, data: core.computeMapaConsumoPorArea(entries, problems) };
  });

  ipcMain.handle(IPC.GET_AUTONOMIA, () => {
    if (!currentGerenteId) return { ok: false as const, erro: "Não autenticado." };
    const idsEquipe = new Set(vendedoresDaEquipe().map((v) => v.id));
    const acoes = integratorActionRepo.listarTodas().filter((a) => idsEquipe.has(a.userId));
    return {
      ok: true as const,
      data: {
        geral: core.computeAutonomiaGeral(acoes),
        porCliente: core.computeAutonomiaPorCliente(acoes),
        evolucaoSemanal: core.computeEvolucaoAutonomia(acoes),
      },
    };
  });

  ipcMain.handle(IPC.GET_HISTORICO, () => {
    if (!currentGerenteId) return { ok: false as const, erro: "Não autenticado." };
    const idsEquipe = new Set(vendedoresDaEquipe().map((v) => v.id));
    const chamados = problemRepo.listarTodos().filter((p) => idsEquipe.has(p.userId));
    return { ok: true as const, data: chamados };
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "FOCO Gerenciador",
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
