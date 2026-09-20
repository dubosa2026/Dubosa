import { contextBridge, ipcRenderer } from "electron";
import { IPC, type ConfigAlertas, type LoginInput } from "../shared/ipc";

const api = {
  login: (input: LoginInput) => ipcRenderer.invoke(IPC.LOGIN, input),
  logout: () => ipcRenderer.invoke(IPC.LOGOUT),
  getPainel: (dias?: number) => ipcRenderer.invoke(IPC.GET_PAINEL, dias),
  getVendedor: (userId: string) => ipcRenderer.invoke(IPC.GET_VENDEDOR, userId),
  moverProblema: (problemaId: string, status: string, nota?: string) =>
    ipcRenderer.invoke(IPC.MOVER_PROBLEMA, { problemaId, status, nota }),
  atribuir: (problemaId: string, responsavel: string) =>
    ipcRenderer.invoke(IPC.ATRIBUIR, { problemaId, responsavel }),
  setConfigAlertas: (config: ConfigAlertas) => ipcRenderer.invoke(IPC.SET_CONFIG_ALERTAS, config),
};

contextBridge.exposeInMainWorld("focoGer", api);

export type FocoGerApi = typeof api;
