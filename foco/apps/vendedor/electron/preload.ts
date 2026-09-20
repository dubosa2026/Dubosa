import { contextBridge, ipcRenderer } from "electron";
import { IPC, type LoginInput, type RegisterIntegratorActionInput, type RegisterProblemInput } from "../shared/ipc";

const api = {
  login: (input: LoginInput) => ipcRenderer.invoke(IPC.LOGIN, input),
  logout: () => ipcRenderer.invoke(IPC.LOGOUT),
  getHomeData: () => ipcRenderer.invoke(IPC.GET_HOME_DATA),
  startTime: (categoria: string) => ipcRenderer.invoke(IPC.START_TIME, categoria),
  stopTime: () => ipcRenderer.invoke(IPC.STOP_TIME),
  classifyProblem: (descricao: string) => ipcRenderer.invoke(IPC.CLASSIFY_PROBLEM, descricao),
  registerProblem: (input: RegisterProblemInput) => ipcRenderer.invoke(IPC.REGISTER_PROBLEM, input),
  markStuck: (problemaId: string) => ipcRenderer.invoke(IPC.MARK_STUCK, problemaId),
  registerIntegratorAction: (input: RegisterIntegratorActionInput) =>
    ipcRenderer.invoke(IPC.REGISTER_INTEGRATOR_ACTION, input),
  getHistorico: () => ipcRenderer.invoke(IPC.GET_HISTORICO),
  getAutonomia: () => ipcRenderer.invoke(IPC.GET_AUTONOMIA),
};

contextBridge.exposeInMainWorld("foco", api);

export type FocoApi = typeof api;
