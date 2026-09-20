import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import * as core from "@foco/core";
import type { Database } from "better-sqlite3";
import { IPC, type LoginInput, type PainelData, type VendedorData } from "../shared/ipc";

let db: Database;
let userRepo: core.UserRepository;
let tempoRepo: core.TimeEntryRepository;
let problemaRepo: core.ProblemRepository;
let eventoRepo: core.EventRepository;

let gerenteId: string | null = null;
let diasDoPeriodo = 1;
let configAlertas: core.ConfigAlertas = core.CONFIG_ALERTAS_PADRAO;

function periodo(dias: number): { inicio: string; fim: string } {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - (dias - 1));
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date();
  fim.setHours(23, 59, 59, 999);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

function initCore(): void {
  // V1 é local. Numa instalação real com vendedores em máquinas separadas,
  // isto passa a apontar para a API central — a interface dos repositórios
  // não muda, que é justamente o ponto da arquitetura.
  const dbPath = process.env.FOCO_DB_PATH ?? path.join(app.getPath("userData"), "foco.db");
  db = core.openDatabase(dbPath);
  core.seedDemoData(db);

  userRepo = new core.UserRepository(db);
  tempoRepo = new core.TimeEntryRepository(db);
  problemaRepo = new core.ProblemRepository(db);
  eventoRepo = new core.EventRepository(db);
}

function equipeDoGerente(): core.User[] {
  if (!gerenteId) return [];
  const doGerente = userRepo.listarVendedoresDoGerente(gerenteId);
  return doGerente.length > 0 ? doGerente : userRepo.listarTodosVendedores();
}

function montarPainel(): PainelData {
  const p = periodo(diasDoPeriodo);
  const equipe = equipeDoGerente();
  const ids = equipe.map((v) => v.id);

  const registros = tempoRepo.listarNoPeriodo(p.inicio, p.fim).filter((r) => ids.includes(r.userId));
  const problemas = problemaRepo.listarNoPeriodo(p.inicio, p.fim).filter((x) => ids.includes(x.userId));
  const eventos = eventoRepo.listarNoPeriodo(p.inicio, p.fim).filter((e) => ids.includes(e.userId));

  const visao = core.consolidarEquipe(ids, p, registros, problemas, eventos);
  const usuarios = [...equipe, ...(gerenteId ? [userRepo.buscarPorId(gerenteId)!] : [])];

  return {
    gerente: userRepo.buscarPorId(gerenteId!)!,
    equipe,
    visao,
    alertas: core.gerarAlertas({ visaoEquipe: visao, problemas, registros, usuarios, config: configAlertas }),
    insights: core.gerarInsights({ visaoEquipe: visao, problemas, usuarios, diasNoPeriodo: diasDoPeriodo }),
    problemas,
    config: configAlertas,
    dias: diasDoPeriodo,
  };
}

function montarVendedor(userId: string): VendedorData {
  const p = periodo(diasDoPeriodo);
  const registros = tempoRepo.listarPorUsuarioNoPeriodo(userId, p.inicio, p.fim);
  const problemas = problemaRepo.listarPorUsuario(userId);
  const eventos = eventoRepo.listarPorUsuarioNoPeriodo(userId, p.inicio, p.fim);
  const user = userRepo.buscarPorId(userId)!;

  const visao = core.consolidar(userId, p, registros, problemas, eventos);
  const visaoEquipe = core.consolidarEquipe([userId], p, registros, problemas, eventos);

  return {
    user,
    visao,
    problemas,
    registros,
    alertas: core.gerarAlertas({
      visaoEquipe,
      problemas,
      registros,
      usuarios: [user],
      config: configAlertas,
    }),
  };
}

function registrarHandlers(): void {
  ipcMain.handle(IPC.LOGIN, (_e, input: LoginInput) => {
    const user = userRepo.autenticar(input.email, input.senha);
    if (!user) return { ok: false as const, erro: "E-mail ou senha inválidos." };
    if (user.role !== "GERENTE" && user.role !== "ADMIN") {
      return { ok: false as const, erro: "Esta conta não tem acesso ao painel gerencial." };
    }
    gerenteId = user.id;
    return { ok: true as const, data: montarPainel() };
  });

  ipcMain.handle(IPC.LOGOUT, () => {
    gerenteId = null;
    return { ok: true as const };
  });

  ipcMain.handle(IPC.GET_PAINEL, (_e, dias?: number) => {
    if (!gerenteId) return { ok: false as const, erro: "Não autenticado." };
    if (typeof dias === "number" && dias > 0) diasDoPeriodo = dias;
    return { ok: true as const, data: montarPainel() };
  });

  ipcMain.handle(IPC.GET_VENDEDOR, (_e, userId: string) => {
    if (!gerenteId) return { ok: false as const, erro: "Não autenticado." };
    return { ok: true as const, data: montarVendedor(userId) };
  });

  ipcMain.handle(
    IPC.MOVER_PROBLEMA,
    (_e, payload: { problemaId: string; status: core.StatusProblema; nota?: string }) => {
      if (!gerenteId) return { ok: false as const, erro: "Não autenticado." };
      try {
        problemaRepo.mover(payload.problemaId, payload.status, "gerente", payload.nota);
        return { ok: true as const, data: montarPainel() };
      } catch (err) {
        return { ok: false as const, erro: (err as Error).message };
      }
    }
  );

  ipcMain.handle(IPC.ATRIBUIR, (_e, payload: { problemaId: string; responsavel: string }) => {
    if (!gerenteId) return { ok: false as const, erro: "Não autenticado." };
    problemaRepo.atribuirResponsavel(payload.problemaId, payload.responsavel);
    return { ok: true as const, data: montarPainel() };
  });

  ipcMain.handle(IPC.SET_CONFIG_ALERTAS, (_e, config: core.ConfigAlertas) => {
    if (!gerenteId) return { ok: false as const, erro: "Não autenticado." };
    configAlertas = config;
    return { ok: true as const, data: montarPainel() };
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
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
  if (devServerUrl) win.loadURL(devServerUrl);
  else win.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  initCore();
  registrarHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
