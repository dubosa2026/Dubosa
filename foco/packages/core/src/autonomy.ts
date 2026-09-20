import type { IntegratorAction, IntegratorActionType } from "./types";

export interface AutonomiaGeral {
  totalAcoes: number;
  acoesIntegrador: number;
  acoesVendedor: number;
  /** 0..100 — percentual das ações feitas pelo próprio integrador. */
  percentAutonomia: number;
}

export interface AutonomiaPorCliente extends AutonomiaGeral {
  cliente: string;
  /** true quando a autonomia digital do cliente está abaixo do limiar. */
  baixaAutonomia: boolean;
  sugestaoAbordagem?: string;
}

const LIMIAR_BAIXA_AUTONOMIA_PERCENT = 30;
const MINIMO_ACOES_PARA_AVALIAR = 3;

function resumoAcoes(acoes: IntegratorAction[]): AutonomiaGeral {
  const totalAcoes = acoes.length;
  const acoesIntegrador = acoes.filter((a) => a.origem === "INTEGRADOR").length;
  const acoesVendedor = totalAcoes - acoesIntegrador;
  const percentAutonomia = totalAcoes === 0 ? 0 : Math.round((acoesIntegrador / totalAcoes) * 1000) / 10;
  return { totalAcoes, acoesIntegrador, acoesVendedor, percentAutonomia };
}

export function computeAutonomiaGeral(acoes: IntegratorAction[]): AutonomiaGeral {
  return resumoAcoes(acoes);
}

export function sugerirAbordagem(cliente: string): string {
  return (
    `Para você ganhar tempo, vou te passar o acesso direto à cotação. ` +
    `Você consegue montar o kit, consultar preço, estoque e frete. ` +
    `Se precisar de ajuda na negociação, eu entro junto.`
  );
}

/**
 * Agrupa ações por cliente e identifica quais dependem excessivamente do
 * vendedor para tarefas que o próprio integrador poderia executar sozinho
 * no e-commerce (cotação, pedido, consultas).
 */
export function computeAutonomiaPorCliente(acoes: IntegratorAction[]): AutonomiaPorCliente[] {
  const porCliente = new Map<string, IntegratorAction[]>();
  for (const acao of acoes) {
    const lista = porCliente.get(acao.cliente) ?? [];
    lista.push(acao);
    porCliente.set(acao.cliente, lista);
  }

  return Array.from(porCliente.entries())
    .map(([cliente, acoesDoCliente]) => {
      const resumo = resumoAcoes(acoesDoCliente);
      const baixaAutonomia =
        resumo.totalAcoes >= MINIMO_ACOES_PARA_AVALIAR && resumo.percentAutonomia < LIMIAR_BAIXA_AUTONOMIA_PERCENT;
      return {
        cliente,
        ...resumo,
        baixaAutonomia,
        sugestaoAbordagem: baixaAutonomia ? sugerirAbordagem(cliente) : undefined,
      };
    })
    .sort((a, b) => a.percentAutonomia - b.percentAutonomia);
}

export interface EvolucaoSemanal {
  semana: string; // ex.: "2026-W01"
  percentAutonomia: number;
  totalAcoes: number;
}

function chaveSemana(dataISO: string): string {
  const data = new Date(dataISO);
  const primeiroDeJaneiro = new Date(Date.UTC(data.getUTCFullYear(), 0, 1));
  const dias = Math.floor((data.getTime() - primeiroDeJaneiro.getTime()) / 86400000);
  const semana = Math.ceil((dias + primeiroDeJaneiro.getUTCDay() + 1) / 7);
  return `${data.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

/** Evolução semana a semana do percentual de autonomia — para mostrar a curva de cultura (ex.: 38% → 58%). */
export function computeEvolucaoAutonomia(acoes: IntegratorAction[]): EvolucaoSemanal[] {
  const porSemana = new Map<string, IntegratorAction[]>();
  for (const acao of acoes) {
    const semana = chaveSemana(acao.criadoEm);
    const lista = porSemana.get(semana) ?? [];
    lista.push(acao);
    porSemana.set(semana, lista);
  }
  return Array.from(porSemana.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([semana, acoesDaSemana]) => {
      const resumo = resumoAcoes(acoesDaSemana);
      return { semana, percentAutonomia: resumo.percentAutonomia, totalAcoes: resumo.totalAcoes };
    });
}

export function computeAutonomiaPorTipo(
  acoes: IntegratorAction[]
): Record<IntegratorActionType, AutonomiaGeral> {
  const tipos: IntegratorActionType[] = ["COTACAO", "PEDIDO", "CONSULTA_PRECO", "CONSULTA_ESTOQUE", "CONSULTA_FRETE"];
  const resultado = {} as Record<IntegratorActionType, AutonomiaGeral>;
  for (const tipo of tipos) {
    resultado[tipo] = resumoAcoes(acoes.filter((a) => a.tipo === tipo));
  }
  return resultado;
}
