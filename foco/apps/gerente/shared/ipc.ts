/**
 * Contrato de IPC do app do gerente. Espelha a convenção do app do
 * vendedor, mas com dados agregados da equipe — sempre carregando a
 * origem de cada número.
 */
import type {
  Alerta,
  ConfigAlertas,
  InsightGerencial,
  Problema,
  RegistroTempo,
  StatusProblema,
  User,
  VisaoConsolidada,
  VisaoEquipe,
} from "@foco/core";

export const IPC = {
  LOGIN: "focoger:login",
  LOGOUT: "focoger:logout",
  GET_PAINEL: "focoger:get-painel",
  GET_VENDEDOR: "focoger:get-vendedor",
  MOVER_PROBLEMA: "focoger:mover-problema",
  ATRIBUIR: "focoger:atribuir",
  SET_CONFIG_ALERTAS: "focoger:set-config-alertas",
} as const;

export interface LoginInput {
  email: string;
  senha: string;
}

export interface PainelData {
  gerente: User;
  equipe: User[];
  visao: VisaoEquipe;
  alertas: Alerta[];
  insights: InsightGerencial[];
  problemas: Problema[];
  config: ConfigAlertas;
  /** Quantos dias o período cobre. */
  dias: number;
}

/** Visão individual: o que o gerente vê ao clicar num vendedor. */
export interface VendedorData {
  user: User;
  visao: VisaoConsolidada;
  problemas: Problema[];
  registros: RegistroTempo[];
  alertas: Alerta[];
}

export type Resposta<T> = { ok: true; data: T } | { ok: false; erro: string };

export type {
  Alerta,
  ConfigAlertas,
  InsightGerencial,
  Problema,
  RegistroTempo,
  StatusProblema,
  User,
  VisaoConsolidada,
  VisaoEquipe,
};
