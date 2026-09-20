import type { StatusProblema } from "../shared/ipc";

export function formatDuracao(totalSegundos: number): string {
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.round((totalSegundos % 3600) / 60);
  if (horas === 0) return `${minutos}min`;
  if (minutos === 0) return `${horas}h`;
  return `${horas}h${String(minutos).padStart(2, "0")}`;
}

export function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export type CategoriaTempo =
  | "COMERCIAL" | "ATENDIMENTO" | "PROBLEMA_OPERACIONAL"
  | "REUNIAO" | "ADMINISTRATIVO" | "PAUSA";

export const CATEGORIA_LABEL: Record<CategoriaTempo, string> = {
  COMERCIAL: "Comercial",
  ATENDIMENTO: "Atendimento",
  PROBLEMA_OPERACIONAL: "Problema operacional",
  REUNIAO: "Reunião",
  ADMINISTRATIVO: "Administrativo",
  PAUSA: "Pausa",
};

export const CATEGORIA_COR: Record<CategoriaTempo, string> = {
  COMERCIAL: "var(--verde)",
  ATENDIMENTO: "var(--azul)",
  PROBLEMA_OPERACIONAL: "var(--terra)",
  REUNIAO: "var(--roxo)",
  ADMINISTRATIVO: "var(--ambar)",
  PAUSA: "var(--cinza-cat)",
};

export const STATUS_LABEL: Record<StatusProblema, string> = {
  NOVO: "Novo",
  EM_ANALISE: "Em análise",
  ENCAMINHADO: "Encaminhado",
  AGUARDANDO_AREA: "Aguardando área",
  AGUARDANDO_VENDEDOR: "Aguardando vendedor",
  RESOLVIDO: "Resolvido",
  CANCELADO: "Cancelado",
};

/** Rótulo visível da proveniência — nenhum número aparece sem ele. */
export const SELO_ORIGEM: Record<string, { texto: string; classe: string }> = {
  DECLARADO: { texto: "tempo declarado", classe: "selo-declarado" },
  IDENTIFICADO: { texto: "identificado", classe: "selo-identificado" },
  ESTIMADO: { texto: "estimativa", classe: "selo-estimado" },
};

export const SIMBOLO_SEVERIDADE: Record<string, string> = {
  CRITICO: "🔴",
  ATENCAO: "🟠",
  POSITIVO: "🟢",
};
