import { OPERACIONAL_CATEGORIES, type Problem, type TimeEntry } from "./types";

function duracaoSegundos(entry: TimeEntry, agora: Date): number {
  const inicio = new Date(entry.inicio).getTime();
  const fim = entry.fim ? new Date(entry.fim).getTime() : agora.getTime();
  return Math.max(0, Math.round((fim - inicio) / 1000));
}

export interface TempoOperacionalEvitavelResumo {
  totalSegundos: number;
  evitavelSegundos: number;
  /** 0..100 */
  percentEvitavel: number;
  porUsuario: Array<{ userId: string; evitavelSegundos: number }>;
}

/**
 * TEMPO OPERACIONAL EVITÁVEL: tempo que o vendedor gastou em tarefas que
 * poderiam ser feitas pelo integrador, automatizadas, ou encaminhadas para
 * outra área (categorias PROBLEMA, COTACAO_OPERACIONAL e OUTROS).
 */
export function computeTempoOperacionalEvitavel(
  entries: TimeEntry[],
  agora: Date = new Date()
): TempoOperacionalEvitavelResumo {
  const porUsuarioMap = new Map<string, number>();
  let totalSegundos = 0;
  let evitavelSegundos = 0;

  for (const entry of entries) {
    const segundos = duracaoSegundos(entry, agora);
    totalSegundos += segundos;
    if ((OPERACIONAL_CATEGORIES as string[]).includes(entry.categoria)) {
      evitavelSegundos += segundos;
      porUsuarioMap.set(entry.userId, (porUsuarioMap.get(entry.userId) ?? 0) + segundos);
    }
  }

  const percentEvitavel = totalSegundos === 0 ? 0 : Math.round((evitavelSegundos / totalSegundos) * 1000) / 10;
  const porUsuario = Array.from(porUsuarioMap.entries())
    .map(([userId, s]) => ({ userId, evitavelSegundos: s }))
    .sort((a, b) => b.evitavelSegundos - a.evitavelSegundos);

  return { totalSegundos, evitavelSegundos, percentEvitavel, porUsuario };
}

export interface ConsumoPorArea {
  area: string;
  segundos: number;
  /** 0..100 */
  percent: number;
}

/**
 * MAPA DE CONSUMO DO TEMPO: para onde vai o tempo comercial perdido em
 * problemas, agrupado pela área interna responsável (Financeiro, Logística,
 * Crédito, Cadastro/Fiscal, Outros...). Usa os registros de tempo da
 * categoria PROBLEMA cruzados com a área responsável de cada chamado.
 */
export function computeMapaConsumoPorArea(
  entries: TimeEntry[],
  problems: Problem[],
  agora: Date = new Date()
): ConsumoPorArea[] {
  const areaPorProblema = new Map(problems.map((p) => [p.id, p.areaResponsavel]));
  const segundosPorArea = new Map<string, number>();
  let total = 0;

  for (const entry of entries) {
    if (entry.categoria !== "PROBLEMA" || !entry.problemaId) continue;
    const area = areaPorProblema.get(entry.problemaId) ?? "Outros";
    const segundos = duracaoSegundos(entry, agora);
    segundosPorArea.set(area, (segundosPorArea.get(area) ?? 0) + segundos);
    total += segundos;
  }

  return Array.from(segundosPorArea.entries())
    .map(([area, segundos]) => ({
      area,
      segundos,
      percent: total === 0 ? 0 : Math.round((segundos / total) * 1000) / 10,
    }))
    .sort((a, b) => b.segundos - a.segundos);
}

/**
 * Projeta horas recuperáveis por mês a partir de uma amostra de dias já
 * observados (ex.: 63 horas/mês a partir de uma semana de dados).
 */
export function projetarHorasMensais(
  horasNoPeriodo: number,
  diasUteisNoPeriodo: number,
  diasUteisMes = 22
): number {
  if (diasUteisNoPeriodo <= 0) return 0;
  return Math.round((horasNoPeriodo / diasUteisNoPeriodo) * diasUteisMes * 10) / 10;
}
