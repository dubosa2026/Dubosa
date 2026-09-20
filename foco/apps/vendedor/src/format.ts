import type { CategoriaTempo, StatusProblema } from "../shared/ipc";

/**
 * Apresentação do renderer. Duplicado de propósito em vez de importado de
 * @foco/core: o renderer roda no Chromium sem Node, então não pode
 * empacotar o núcleo (que depende de better-sqlite3, módulo nativo). Toda
 * a lógica de negócio de verdade mora no processo principal.
 */
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

export const CATEGORIA_LABEL: Record<CategoriaTempo, string> = {
  COMERCIAL: "Comercial",
  ATENDIMENTO: "Atendimento a cliente",
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

export const CATEGORIAS_ORDEM: CategoriaTempo[] = [
  "COMERCIAL",
  "ATENDIMENTO",
  "PROBLEMA_OPERACIONAL",
  "REUNIAO",
  "ADMINISTRATIVO",
  "PAUSA",
];

export const STATUS_LABEL: Record<StatusProblema, string> = {
  NOVO: "Novo",
  EM_ANALISE: "Em análise",
  ENCAMINHADO: "Encaminhado",
  AGUARDANDO_AREA: "Aguardando área",
  AGUARDANDO_VENDEDOR: "Aguardando você",
  RESOLVIDO: "Resolvido",
  CANCELADO: "Cancelado",
};

export function statusEncerrado(status: StatusProblema): boolean {
  return status === "RESOLVIDO" || status === "CANCELADO";
}
