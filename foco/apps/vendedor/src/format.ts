import type { TimeCategory } from "../shared/ipc";

/**
 * Pequenas funções de apresentação usadas só pelo renderer. Duplicadas
 * (em vez de importadas de @foco/core) de propósito: o renderer roda no
 * Chromium sem Node integration, então não pode empacotar o pacote core
 * (que depende de better-sqlite3, um módulo nativo). Toda a lógica de
 * negócio de verdade mora no processo principal; aqui é só rótulo/formato.
 */
export function formatDuracao(totalSegundos: number): string {
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.round((totalSegundos % 3600) / 60);
  if (horas === 0) return `${minutos}min`;
  if (minutos === 0) return `${horas}h`;
  return `${horas}h${String(minutos).padStart(2, "0")}`;
}

export const CATEGORIA_LABEL: Record<TimeCategory, string> = {
  PROSPECCAO: "Prospecção",
  NEGOCIACAO: "Negociação",
  FOLLOWUP: "Follow-up",
  PROBLEMA: "Problemas",
  COTACAO_OPERACIONAL: "Cotações operacionais",
  OUTROS: "Outras tarefas",
};

export const CATEGORIA_COR: Record<TimeCategory, string> = {
  PROSPECCAO: "#1f9d55",
  NEGOCIACAO: "#2b6cb0",
  FOLLOWUP: "#6b46c1",
  PROBLEMA: "#c53030",
  COTACAO_OPERACIONAL: "#dd6b20",
  OUTROS: "#718096",
};
