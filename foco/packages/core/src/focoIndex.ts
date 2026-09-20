import {
  COMERCIAL_CATEGORIES,
  type TimeCategory,
  type TimeEntry,
} from "./types";

export interface FocoBreakdown {
  categoria: TimeCategory;
  segundos: number;
}

export interface FocoComercialResumo {
  /** Segundos totais por categoria, incluindo categorias sem registro (0). */
  porCategoria: FocoBreakdown[];
  totalSegundos: number;
  comercialSegundos: number;
  operacionalSegundos: number;
  /** 0..100 */
  focoComercialPercent: number;
}

const TODAS_CATEGORIAS: TimeCategory[] = [
  "PROSPECCAO",
  "NEGOCIACAO",
  "FOLLOWUP",
  "PROBLEMA",
  "COTACAO_OPERACIONAL",
  "OUTROS",
];

function duracaoSegundos(entry: TimeEntry, agora: Date): number {
  const inicio = new Date(entry.inicio).getTime();
  const fim = entry.fim ? new Date(entry.fim).getTime() : agora.getTime();
  return Math.max(0, Math.round((fim - inicio) / 1000));
}

/**
 * Calcula o Índice de Foco Comercial: tempo em atividades comerciais
 * (prospecção + negociação + follow-up) dividido pelo tempo total registrado.
 *
 * «Cada minuto do vendedor deve estar o mais próximo possível de uma
 * atividade que gere venda.»
 */
export function computeFocoComercial(
  entries: TimeEntry[],
  agora: Date = new Date()
): FocoComercialResumo {
  const totals = new Map<TimeCategory, number>(TODAS_CATEGORIAS.map((c) => [c, 0]));

  for (const entry of entries) {
    const atual = totals.get(entry.categoria) ?? 0;
    totals.set(entry.categoria, atual + duracaoSegundos(entry, agora));
  }

  const porCategoria = TODAS_CATEGORIAS.map((categoria) => ({
    categoria,
    segundos: totals.get(categoria) ?? 0,
  }));

  const totalSegundos = porCategoria.reduce((acc, c) => acc + c.segundos, 0);
  const comercialSegundos = porCategoria
    .filter((c) => (COMERCIAL_CATEGORIES as TimeCategory[]).includes(c.categoria))
    .reduce((acc, c) => acc + c.segundos, 0);
  const operacionalSegundos = totalSegundos - comercialSegundos;

  const focoComercialPercent =
    totalSegundos === 0 ? 0 : Math.round((comercialSegundos / totalSegundos) * 1000) / 10;

  return {
    porCategoria,
    totalSegundos,
    comercialSegundos,
    operacionalSegundos,
    focoComercialPercent,
  };
}

/** Formata segundos como "3h42" ou "50min", no estilo usado nas telas do FOCO. */
export function formatDuracao(totalSegundos: number): string {
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.round((totalSegundos % 3600) / 60);
  if (horas === 0) return `${minutos}min`;
  if (minutos === 0) return `${horas}h`;
  return `${horas}h${String(minutos).padStart(2, "0")}`;
}
