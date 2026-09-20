import type { TimeCategory } from "../shared/ipc";

export const CATEGORIA_LABEL: Record<TimeCategory, string> = {
  PROSPECCAO: "Prospecção",
  NEGOCIACAO: "Negociação",
  FOLLOWUP: "Follow-up",
  PROBLEMA: "Problemas",
  COTACAO_OPERACIONAL: "Cotações operacionais",
  OUTROS: "Outras tarefas",
};

export const STATUS_LABEL: Record<string, string> = {
  PROSPECCAO: "🟢 Em prospecção",
  ATIVIDADE_COMERCIAL: "🔵 Atividade comercial",
  PROBLEMA: "🟠 Em problema",
  OPERACIONAL: "🟡 Tempo operacional",
  SEM_ATIVIDADE: "⚪ Sem atividade ativa",
};

export function formatHoras(horas: number): string {
  return `${horas}h`;
}
