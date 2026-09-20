import { formatDuracao } from "./focoIndex";
import type { ConsumoPorArea } from "./operationalTime";
import type { Problem, TimeEntry } from "./types";

export type AlertaTipo = "ALERTA" | "OPORTUNIDADE";

export interface Alerta {
  tipo: AlertaTipo;
  texto: string;
}

export interface DadosParaAlertas {
  entriesHoje: TimeEntry[];
  problemsHoje: Problem[];
  mapaConsumo: ConsumoPorArea[];
  horasRecuperaveisMes: number;
  agora?: Date;
}

const LIMIAR_PROBLEMA_SEGUNDOS = 90 * 60; // 90 minutos
const LIMIAR_CONCENTRACAO_AREA_PERCENT = 30;

function duracaoSegundos(entry: TimeEntry, agora: Date): number {
  const inicio = new Date(entry.inicio).getTime();
  const fim = entry.fim ? new Date(entry.fim).getTime() : agora.getTime();
  return Math.max(0, Math.round((fim - inicio) / 1000));
}

/**
 * Gera os alertas gerenciais descritos na especificação: identifica onde a
 * equipe está perdendo capacidade comercial, sem função de vigilância —
 * o foco é apontar processos internos que "roubam" tempo de venda.
 */
export function generateManagerAlerts(dados: DadosParaAlertas): Alerta[] {
  const agora = dados.agora ?? new Date();
  const alertas: Alerta[] = [];

  const segundosEmProblemaPorUsuario = new Map<string, number>();
  for (const entry of dados.entriesHoje) {
    if (entry.categoria !== "PROBLEMA") continue;
    const atual = segundosEmProblemaPorUsuario.get(entry.userId) ?? 0;
    segundosEmProblemaPorUsuario.set(entry.userId, atual + duracaoSegundos(entry, agora));
  }
  const vendedoresComMuitoTempoEmProblemas = Array.from(segundosEmProblemaPorUsuario.values()).filter(
    (s) => s > LIMIAR_PROBLEMA_SEGUNDOS
  ).length;
  if (vendedoresComMuitoTempoEmProblemas > 0) {
    alertas.push({
      tipo: "ALERTA",
      texto: `${vendedoresComMuitoTempoEmProblemas} vendedores passaram mais de 90 minutos em problemas hoje.`,
    });
  }

  const areaMaisConcentrada = dados.mapaConsumo[0];
  if (areaMaisConcentrada && areaMaisConcentrada.percent >= LIMIAR_CONCENTRACAO_AREA_PERCENT) {
    alertas.push({
      tipo: "ALERTA",
      texto: `${areaMaisConcentrada.area} concentra grande parte do tempo operacional (${areaMaisConcentrada.percent}%).`,
    });
  }

  const segundosCotacaoOperacional = dados.entriesHoje
    .filter((e) => e.categoria === "COTACAO_OPERACIONAL")
    .reduce((acc, e) => acc + duracaoSegundos(e, agora), 0);
  if (segundosCotacaoOperacional > 0) {
    alertas.push({
      tipo: "ALERTA",
      texto: `${formatDuracao(segundosCotacaoOperacional)} foram gastos hoje em cotações que poderiam ter sido feitas pelos integradores.`,
    });
  }

  const chamadosAbertosNaoComerciais = dados.problemsHoje.filter(
    (p) => p.status === "ABERTO" && p.categoria !== "COMERCIAL"
  ).length;
  if (chamadosAbertosNaoComerciais > 0) {
    alertas.push({
      tipo: "OPORTUNIDADE",
      texto: `${chamadosAbertosNaoComerciais} chamados poderiam ser encaminhados automaticamente para a área responsável.`,
    });
  }

  if (dados.horasRecuperaveisMes > 0) {
    alertas.push({
      tipo: "OPORTUNIDADE",
      texto: `Existe potencial de recuperação de ${dados.horasRecuperaveisMes} horas comerciais por mês.`,
    });
  }

  const vendedoresPresos = dados.problemsHoje.filter((p) => p.preso).length;
  if (vendedoresPresos > 0) {
    alertas.push({
      tipo: "ALERTA",
      texto: `${vendedoresPresos} vendedor(es) sinalizaram estar presos em um problema e precisam de ajuda agora.`,
    });
  }

  return alertas;
}
