/**
 * Contrato de IPC do app do gerente. Espelha a convenção de apps/vendedor,
 * mas com dados agregados de toda a equipe em vez de um único usuário.
 */
import type {
  Alerta,
  AutonomiaGeral,
  AutonomiaPorCliente,
  ConsumoPorArea,
  EvolucaoSemanal,
  Problem,
  TimeCategory,
  User,
} from "@foco/core";

export const IPC = {
  LOGIN: "focoger:login",
  LOGOUT: "focoger:logout",
  GET_DASHBOARD: "focoger:get-dashboard",
  GET_EQUIPE: "focoger:get-equipe",
  GET_MAPA_CONSUMO: "focoger:get-mapa-consumo",
  GET_AUTONOMIA: "focoger:get-autonomia",
  GET_HISTORICO: "focoger:get-historico",
} as const;

export interface LoginInput {
  email: string;
  senha: string;
}

export type StatusVendedor =
  | "PROSPECCAO"
  | "ATIVIDADE_COMERCIAL"
  | "PROBLEMA"
  | "OPERACIONAL"
  | "SEM_ATIVIDADE";

export interface VendedorStatus {
  user: User;
  status: StatusVendedor;
  categoriaAtual: TimeCategory | null;
  precisaAjuda: boolean;
  focoComercialPercentHoje: number;
}

export interface DashboardData {
  gerente: User;
  totalVendedores: number;
  emProspeccao: number;
  focoComercialPercentEquipe: number;
  chamadosOperacionaisAbertos: number;
  tempoOperacionalPercent: number;
  horasRecuperaveisMes: number;
  alertas: Alerta[];
}

export interface AutonomiaEquipeData {
  geral: AutonomiaGeral;
  porCliente: AutonomiaPorCliente[];
  evolucaoSemanal: EvolucaoSemanal[];
}

export type {
  Alerta,
  AutonomiaGeral,
  AutonomiaPorCliente,
  ConsumoPorArea,
  EvolucaoSemanal,
  Problem,
  TimeCategory,
  User,
};
