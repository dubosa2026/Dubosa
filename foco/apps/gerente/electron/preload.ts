import { contextBridge, ipcRenderer } from "electron";
import { IPC, type LoginInput } from "../shared/ipc";

const api = {
  login: (input: LoginInput) => ipcRenderer.invoke(IPC.LOGIN, input),
  logout: () => ipcRenderer.invoke(IPC.LOGOUT),
  getDashboard: () => ipcRenderer.invoke(IPC.GET_DASHBOARD),
  getEquipe: () => ipcRenderer.invoke(IPC.GET_EQUIPE),
  getMapaConsumo: () => ipcRenderer.invoke(IPC.GET_MAPA_CONSUMO),
  getAutonomia: () => ipcRenderer.invoke(IPC.GET_AUTONOMIA),
  getHistorico: () => ipcRenderer.invoke(IPC.GET_HISTORICO),
};

contextBridge.exposeInMainWorld("focoGer", api);

export type FocoGerApi = typeof api;
