import { contextBridge, ipcRenderer } from "electron";
import { IPC, type EstouPresoInput, type LoginInput, type RegistrarProblemaInput } from "../shared/ipc";

const api = {
  login: (input: LoginInput) => ipcRenderer.invoke(IPC.LOGIN, input),
  logout: () => ipcRenderer.invoke(IPC.LOGOUT),
  getHome: () => ipcRenderer.invoke(IPC.GET_HOME),
  iniciarBloco: (categoria: string) => ipcRenderer.invoke(IPC.INICIAR_BLOCO, categoria),
  pararBloco: () => ipcRenderer.invoke(IPC.PARAR_BLOCO),
  alterarCategoria: (registroId: string, categoria: string) =>
    ipcRenderer.invoke(IPC.ALTERAR_CATEGORIA, { registroId, categoria }),
  classificar: (descricao: string) => ipcRenderer.invoke(IPC.CLASSIFICAR, descricao),
  registrarProblema: (input: RegistrarProblemaInput) => ipcRenderer.invoke(IPC.REGISTRAR_PROBLEMA, input),
  moverProblema: (problemaId: string, status: string, nota?: string) =>
    ipcRenderer.invoke(IPC.MOVER_PROBLEMA, { problemaId, status, nota }),
  estouPreso: (input: EstouPresoInput) => ipcRenderer.invoke(IPC.ESTOU_PRESO, input),
  getHistoricoTempo: (dias?: number) => ipcRenderer.invoke(IPC.GET_HISTORICO_TEMPO, dias),
};

contextBridge.exposeInMainWorld("foco", api);

export type FocoApi = typeof api;
