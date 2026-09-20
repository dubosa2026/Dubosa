import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import * as core from "@foco/core";
import type { Database } from "better-sqlite3";
import {
  IPC,
  type EstouPresoInput,
  type HomeData,
  type LoginInput,
  type RegistrarProblemaInput,
} from "../shared/ipc";

let db: Database;
let userRepo: core.UserRepository;
let tempoRepo: core.TimeEntryRepository;
let problemaRepo: core.ProblemRepository;
let eventoRepo: core.EventRepository;
let classificador: core.ClassificadorProblema;

let usuarioAtualId: string | null = null;

function inicioDoDia(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function fimDoDia(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function initCore(): void {
  const dbPath = process.env.FOCO_DB_PATH ?? path.join(app.getPath("userData"), "foco.db");
  db = core.openDatabase(dbPath);
  core.seedDemoData(db);

  userRepo = new core.UserRepository(db);
  tempoRepo = new core.TimeEntryRepository(db);
  problemaRepo = new core.ProblemRepository(db);
  eventoRepo = new core.EventRepository(db);
  classificador = core.criarClassificadorPadrao(process.env.ANTHROPIC_API_KEY);

  // As integrações entram aqui quando existirem. Sem elas, o FOCO opera só
  // com tempo declarado — que é exatamente o estado previsto para a V1.
  //   fontes.registrar(new core.FonteEmailLocal(leitorThunderbird));
  //   fontes.registrar(new core.FonteWhatsAppCorporativo(provedorOficial));
}

function montarHome(userId: string): HomeData {
  const periodo = { inicio: inicioDoDia(), fim: fimDoDia() };
  const registrosDeHoje = tempoRepo.listarPorUsuarioNoPeriodo(userId, periodo.inicio, periodo.fim);

  return {
    user: userRepo.buscarPorId(userId)!,
    blocoAtivo: tempoRepo.buscarEmAndamento(userId),
    visao: core.consolidar(
      userId,
      periodo,
      registrosDeHoje,
      problemaRepo.listarPorUsuario(userId),
      eventoRepo.listarPorUsuarioNoPeriodo(userId, periodo.inicio, periodo.fim)
    ),
    chamados: problemaRepo.listarPorUsuario(userId),
    registrosDeHoje,
  };
}

function registrarHandlers(): void {
  ipcMain.handle(IPC.LOGIN, (_e, input: LoginInput) => {
    const user = userRepo.autenticar(input.email, input.senha);
    if (!user) return { ok: false as const, erro: "E-mail ou senha inválidos." };
    usuarioAtualId = user.id;
    return { ok: true as const, data: montarHome(user.id) };
  });

  ipcMain.handle(IPC.LOGOUT, () => {
    usuarioAtualId = null;
    return { ok: true as const };
  });

  ipcMain.handle(IPC.GET_HOME, () => {
    if (!usuarioAtualId) return { ok: false as const, erro: "Não autenticado." };
    return { ok: true as const, data: montarHome(usuarioAtualId) };
  });

  ipcMain.handle(IPC.INICIAR_BLOCO, (_e, categoria: core.CategoriaTempo) => {
    if (!usuarioAtualId) return { ok: false as const, erro: "Não autenticado." };
    try {
      const ativo = tempoRepo.buscarEmAndamento(usuarioAtualId);
      if (ativo) tempoRepo.parar(ativo.id);
      tempoRepo.iniciar(usuarioAtualId, categoria);
      return { ok: true as const, data: montarHome(usuarioAtualId) };
    } catch (err) {
      return { ok: false as const, erro: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.PARAR_BLOCO, () => {
    if (!usuarioAtualId) return { ok: false as const, erro: "Não autenticado." };
    const ativo = tempoRepo.buscarEmAndamento(usuarioAtualId);
    if (ativo) tempoRepo.parar(ativo.id);
    return { ok: true as const, data: montarHome(usuarioAtualId) };
  });

  ipcMain.handle(
    IPC.ALTERAR_CATEGORIA,
    (_e, payload: { registroId: string; categoria: core.CategoriaTempo }) => {
      if (!usuarioAtualId) return { ok: false as const, erro: "Não autenticado." };
      tempoRepo.alterarCategoria(payload.registroId, payload.categoria);
      return { ok: true as const, data: montarHome(usuarioAtualId) };
    }
  );

  ipcMain.handle(IPC.CLASSIFICAR, async (_e, descricao: string) => {
    return { ok: true as const, data: await classificador.classificar(descricao) };
  });

  ipcMain.handle(IPC.REGISTRAR_PROBLEMA, (_e, input: RegistrarProblemaInput) => {
    if (!usuarioAtualId) return { ok: false as const, erro: "Não autenticado." };

    const problema = problemaRepo.registrar({
      userId: usuarioAtualId,
      cliente: input.cliente ?? null,
      descricao: input.descricao,
      categoria: input.categoria,
      prioridade: input.prioridade,
      areaResponsavel: core.AREA_RESPONSAVEL_POR_CATEGORIA[input.categoria],
    });

    // O tempo gasto neste problema passa a ser contado de verdade: sem
    // isso, o painel do gerente nunca enxerga o custo da interrupção.
    const ativo = tempoRepo.buscarEmAndamento(usuarioAtualId);
    if (ativo) tempoRepo.parar(ativo.id);
    tempoRepo.iniciar(usuarioAtualId, "PROBLEMA_OPERACIONAL", problema.id);

    return { ok: true as const, data: { problema, home: montarHome(usuarioAtualId) } };
  });

  ipcMain.handle(
    IPC.MOVER_PROBLEMA,
    (_e, payload: { problemaId: string; status: core.StatusProblema; nota?: string }) => {
      if (!usuarioAtualId) return { ok: false as const, erro: "Não autenticado." };
      try {
        problemaRepo.mover(payload.problemaId, payload.status, "vendedor", payload.nota);
        return { ok: true as const, data: montarHome(usuarioAtualId) };
      } catch (err) {
        return { ok: false as const, erro: (err as Error).message };
      }
    }
  );

  ipcMain.handle(IPC.ESTOU_PRESO, (_e, input: EstouPresoInput) => {
    if (!usuarioAtualId) return { ok: false as const, erro: "Não autenticado." };
    problemaRepo.marcarPreso(input.problemaId, {
      precisaAgora: input.precisaAgora,
      observacao: input.observacao,
    });
    return { ok: true as const, data: montarHome(usuarioAtualId) };
  });

  ipcMain.handle(IPC.GET_HISTORICO_TEMPO, (_e, dias: number = 7) => {
    if (!usuarioAtualId) return { ok: false as const, erro: "Não autenticado." };
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - dias);
    inicio.setHours(0, 0, 0, 0);
    return {
      ok: true as const,
      data: tempoRepo.listarPorUsuarioNoPeriodo(usuarioAtualId, inicio.toISOString(), fimDoDia()),
    };
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 860,
    minHeight: 620,
    title: "FOCO",
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
