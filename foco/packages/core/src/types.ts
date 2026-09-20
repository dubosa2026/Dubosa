/**
 * Tipos centrais do domínio FOCO — Gestão do Tempo Comercial.
 * Este módulo não depende de Electron, SQLite ou UI: é puro TypeScript,
 * para poder ser reutilizado tanto no app local (V1) quanto numa futura
 * API central (V2) sem reescrita.
 */

export type Role = "VENDEDOR" | "GERENTE" | "ADMIN";

export interface User {
  id: string;
  nome: string;
  email: string;
  role: Role;
  /** Para vendedores: id do gerente responsável. */
  gerenteId?: string | null;
  ativo: boolean;
}

/**
 * Categorias de tempo registradas pelo vendedor.
 * PROSPECCAO, NEGOCIACAO e FOLLOWUP contam como "atividade comercial"
 * para o Índice de Foco Comercial. As demais são consideradas tempo
 * operacional (potencialmente evitável).
 */
export type TimeCategory =
  | "PROSPECCAO"
  | "NEGOCIACAO"
  | "FOLLOWUP"
  | "PROBLEMA"
  | "COTACAO_OPERACIONAL"
  | "OUTROS";

export const COMERCIAL_CATEGORIES: readonly TimeCategory[] = [
  "PROSPECCAO",
  "NEGOCIACAO",
  "FOLLOWUP",
];

export const OPERACIONAL_CATEGORIES: readonly TimeCategory[] = [
  "PROBLEMA",
  "COTACAO_OPERACIONAL",
  "OUTROS",
];

export interface TimeEntry {
  id: string;
  userId: string;
  categoria: TimeCategory;
  inicio: string; // ISO 8601
  fim: string | null; // null enquanto em andamento
  /** Referência opcional a um problema (quando categoria === PROBLEMA). */
  problemaId?: string | null;
}

export type ProblemCategory =
  | "LOGISTICA"
  | "FINANCEIRO"
  | "CREDITO"
  | "FISCAL"
  | "CADASTRO"
  | "PRODUTO"
  | "COMERCIAL"
  | "OUTROS";

export type Priority = "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";

export type ProblemStatus = "ABERTO" | "EM_ANDAMENTO" | "RESOLVIDO";

/** Áreas internas responsáveis por resolver um problema operacional. */
export const AREA_RESPONSAVEL_POR_CATEGORIA: Record<ProblemCategory, string> = {
  LOGISTICA: "Logística",
  FINANCEIRO: "Financeiro",
  CREDITO: "Crédito",
  FISCAL: "Fiscal",
  CADASTRO: "Cadastro",
  PRODUTO: "Produto",
  COMERCIAL: "Comercial (mantém com o vendedor)",
  OUTROS: "Outros",
};

export interface Problem {
  id: string;
  protocolo: string;
  userId: string;
  cliente: string;
  descricao: string;
  categoria: ProblemCategory;
  prioridade: Priority;
  areaResponsavel: string;
  status: ProblemStatus;
  /** Marcado quando o vendedor aciona "Estou preso neste problema". */
  preso: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export type IntegratorActionType =
  | "COTACAO"
  | "PEDIDO"
  | "CONSULTA_PRECO"
  | "CONSULTA_ESTOQUE"
  | "CONSULTA_FRETE";

/** Quem de fato executou a ação: o próprio integrador (autonomia) ou o vendedor (operacional). */
export type ActionOrigin = "INTEGRADOR" | "VENDEDOR";

export interface IntegratorAction {
  id: string;
  userId: string; // vendedor responsável pela conta
  cliente: string;
  tipo: IntegratorActionType;
  origem: ActionOrigin;
  criadoEm: string;
}

export interface ClassificationResult {
  categoria: ProblemCategory;
  prioridade: Priority;
  areaResponsavel: string;
  resumo: string;
}

/** Estratégia de classificação de problemas — trocável por uma IA real (ver classifier.ts). */
export interface ProblemClassifier {
  classify(descricao: string): Promise<ClassificationResult> | ClassificationResult;
}
