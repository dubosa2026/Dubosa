/**
 * Contrato de IPC entre o processo principal (Electron/main, com acesso ao
 * banco via @foco/core) e o renderer (React). Mantido num único arquivo
 * para os dois lados não divergirem.
 */
import type {
  AutonomiaGeral,
  AutonomiaPorCliente,
  ClassificationResult,
  FocoComercialResumo,
  IntegratorActionType,
  Problem,
  ProblemCategory,
  Priority,
  TimeCategory,
  TimeEntry,
  User,
} from "@foco/core";

export const IPC = {
  LOGIN: "foco:login",
  LOGOUT: "foco:logout",
  CURRENT_USER: "foco:current-user",
  GET_HOME_DATA: "foco:get-home-data",
  START_TIME: "foco:start-time",
  STOP_TIME: "foco:stop-time",
  CLASSIFY_PROBLEM: "foco:classify-problem",
  REGISTER_PROBLEM: "foco:register-problem",
  MARK_STUCK: "foco:mark-stuck",
  REGISTER_INTEGRATOR_ACTION: "foco:register-integrator-action",
  GET_HISTORICO: "foco:get-historico",
  GET_AUTONOMIA: "foco:get-autonomia",
} as const;

export interface LoginInput {
  email: string;
  senha: string;
}

export interface HomeData {
  user: User;
  emAndamento: TimeEntry | null;
  focoComercial: FocoComercialResumo;
  historicoChamados: Problem[];
}

export interface AutonomiaData {
  geral: AutonomiaGeral;
  porCliente: AutonomiaPorCliente[];
}

export interface RegisterProblemInput {
  cliente: string;
  descricao: string;
  categoria?: ProblemCategory;
  prioridade?: Priority;
}

export interface RegisterIntegratorActionInput {
  cliente: string;
  tipo: IntegratorActionType;
  origem: "INTEGRADOR" | "VENDEDOR";
}

export type {
  ClassificationResult,
  TimeCategory,
  TimeEntry,
  Problem,
  User,
  AutonomiaGeral,
  AutonomiaPorCliente,
  IntegratorActionType,
};
