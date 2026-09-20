/**
 * Contrato de IPC entre o processo principal (com acesso ao banco via
 * @foco/core) e o renderer. Um único arquivo para os dois lados não
 * divergirem.
 */
import type {
  CategoriaProblema,
  CategoriaTempo,
  Prioridade,
  Problema,
  RegistroTempo,
  ResultadoClassificacao,
  StatusProblema,
  User,
  VisaoConsolidada,
} from "@foco/core";

export const IPC = {
  LOGIN: "foco:login",
  LOGOUT: "foco:logout",
  GET_HOME: "foco:get-home",
  INICIAR_BLOCO: "foco:iniciar-bloco",
  PARAR_BLOCO: "foco:parar-bloco",
  ALTERAR_CATEGORIA: "foco:alterar-categoria",
  CLASSIFICAR: "foco:classificar",
  REGISTRAR_PROBLEMA: "foco:registrar-problema",
  MOVER_PROBLEMA: "foco:mover-problema",
  ESTOU_PRESO: "foco:estou-preso",
  GET_HISTORICO_TEMPO: "foco:get-historico-tempo",
} as const;

export interface LoginInput {
  email: string;
  senha: string;
}

export interface HomeData {
  user: User;
  blocoAtivo: RegistroTempo | null;
  /** Visão consolidada do dia: tempo declarado, eventos identificados, estimativas. */
  visao: VisaoConsolidada;
  chamados: Problema[];
  registrosDeHoje: RegistroTempo[];
}

export interface RegistrarProblemaInput {
  cliente?: string | null;
  descricao: string;
  categoria: CategoriaProblema;
  prioridade: Prioridade;
}

/** Respostas das perguntas rápidas do "Estou preso neste problema". */
export interface EstouPresoInput {
  problemaId: string;
  precisaAgora: boolean;
  observacao?: string;
}

export type Resposta<T> = { ok: true; data: T } | { ok: false; erro: string };

export type {
  CategoriaProblema,
  CategoriaTempo,
  Prioridade,
  Problema,
  RegistroTempo,
  ResultadoClassificacao,
  StatusProblema,
  User,
  VisaoConsolidada,
};
