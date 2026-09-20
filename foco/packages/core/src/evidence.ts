import { estimado, type Medida } from "./provenance";
import { impactoNoVendedor, problemaEncerrado } from "./problems";
import { contarInterrupcoes, resumirTempoDeclarado, type ResumoTempoDeclarado } from "./timeTracking";
import {
  AREA_RESPONSAVEL_POR_CATEGORIA,
  type CategoriaProblema,
  type EventoIdentificado,
  type Problema,
  type RegistroTempo,
} from "./types";

/**
 * MOTOR DE EVIDÊNCIAS
 *
 * Combina o que o vendedor declarou, o que as integrações identificaram e
 * os problemas registrados no FOCO — e entrega tudo isso ao gerente como
 * uma visão consolidada em que cada bloco continua sabendo de onde veio.
 *
 * O que ele deliberadamente NÃO faz: converter evento em tempo. Sete
 * e-mails do Financeiro são sete e-mails do Financeiro. Podem indicar que
 * a manhã do vendedor foi tomada por isso, mas não provam quanto tempo
 * custaram, e o painel nunca vai fingir que provam.
 */

export interface ContagemPorArea {
  area: string;
  categoria: CategoriaProblema;
  quantidade: number;
}

export interface TempoPorArea {
  area: string;
  segundos: number;
  percent: number;
}

export interface VisaoConsolidada {
  userId: string;
  periodo: { inicio: string; fim: string };

  /** Origem: DECLARADO. Vem do cronômetro. */
  tempo: ResumoTempoDeclarado;
  /** Origem: DECLARADO. Trocas de contexto de comercial para operacional. */
  interrupcoesDeclaradas: number;

  /** Origem: IDENTIFICADO. Vem das integrações autorizadas. */
  eventosPorArea: ContagemPorArea[];
  totalEventosRelevantes: number;

  /** Registrados no FOCO — fato, não inferência. */
  problemasAbertos: number;
  problemasResolvidos: number;
  /** Tempo declarado em problemas, agrupado pela área responsável. */
  tempoPorAreaDeclarado: TempoPorArea[];

  /** Origem: ESTIMADO. Sempre rotulado como hipótese. */
  tempoPotencialRecuperavel: Medida<number>;
}

function dentroDoPeriodo(iso: string, inicio: string, fim: string): boolean {
  return iso >= inicio && iso < fim;
}

/**
 * Estimativa de tempo recuperável.
 *
 * Método, explicitado porque uma estimativa sem método declarado é um
 * palpite: parte do tempo DECLARADO em problemas operacionais cuja área
 * responsável é interna (Financeiro, Logística, Crédito, Cadastro, Fiscal)
 * — isto é, obstáculos que a empresa pode remover — e aplica um fator de
 * confiança, porque nem todo minuto ali seria eliminado mesmo com o
 * processo corrigido.
 */
const AREAS_INTERNAS: readonly CategoriaProblema[] = [
  "FINANCEIRO",
  "LOGISTICA",
  "CREDITO",
  "CADASTRO",
  "FISCAL",
];
const FATOR_CONFIANCA = 0.7;

export function estimarTempoRecuperavel(
  problemas: Problema[],
  registros: RegistroTempo[],
  eventos: EventoIdentificado[] = [],
  agora: Date = new Date()
): Medida<number> {
  const elegiveis = problemas.filter((p) => AREAS_INTERNAS.includes(p.categoria));
  if (elegiveis.length === 0) {
    return estimado(0, "nenhum problema de área interna no período");
  }

  let segundosDeclarados = 0;
  for (const problema of elegiveis) {
    const impacto = impactoNoVendedor(problema, registros, eventos, agora);
    if (impacto.origem === "DECLARADO") segundosDeclarados += impacto.valor;
  }

  const recuperavel = Math.round(segundosDeclarados * FATOR_CONFIANCA);
  return estimado(
    recuperavel,
    `${Math.round(FATOR_CONFIANCA * 100)}% do tempo declarado em ${elegiveis.length} problema(s) ` +
      `de áreas internas (Financeiro, Logística, Crédito, Cadastro, Fiscal)`
  );
}

export function consolidar(
  userId: string,
  periodo: { inicio: string; fim: string },
  registros: RegistroTempo[],
  problemas: Problema[],
  eventos: EventoIdentificado[] = [],
  agora: Date = new Date()
): VisaoConsolidada {
  const meusRegistros = registros.filter(
    (r) => r.userId === userId && dentroDoPeriodo(r.inicio, periodo.inicio, periodo.fim)
  );
  const meusProblemas = problemas.filter(
    (p) => p.userId === userId && dentroDoPeriodo(p.criadoEm, periodo.inicio, periodo.fim)
  );
  const meusEventos = eventos.filter(
    (e) =>
      e.userId === userId &&
      e.relevancia !== "IGNORAR" &&
      dentroDoPeriodo(e.ocorridoEm, periodo.inicio, periodo.fim)
  );

  // Eventos identificados, agrupados por área.
  const porArea = new Map<CategoriaProblema, number>();
  for (const evento of meusEventos) {
    porArea.set(evento.categoria, (porArea.get(evento.categoria) ?? 0) + 1);
  }
  const eventosPorArea: ContagemPorArea[] = Array.from(porArea.entries())
    .map(([categoria, quantidade]) => ({
      categoria,
      area: AREA_RESPONSAVEL_POR_CATEGORIA[categoria],
      quantidade,
    }))
    .sort((a, b) => b.quantidade - a.quantidade);

  // Tempo declarado em problemas, por área responsável.
  const areaPorProblema = new Map(meusProblemas.map((p) => [p.id, p.areaResponsavel]));
  const segundosPorArea = new Map<string, number>();
  let totalEmProblemas = 0;
  for (const registro of meusRegistros) {
    if (registro.categoria !== "PROBLEMA_OPERACIONAL" || !registro.problemaId) continue;
    const area = areaPorProblema.get(registro.problemaId) ?? "Outros";
    const segundos = Math.max(
      0,
      Math.round(
        ((registro.fim ? new Date(registro.fim).getTime() : agora.getTime()) -
          new Date(registro.inicio).getTime()) / 1000
      )
    );
    segundosPorArea.set(area, (segundosPorArea.get(area) ?? 0) + segundos);
    totalEmProblemas += segundos;
  }
  const tempoPorAreaDeclarado: TempoPorArea[] = Array.from(segundosPorArea.entries())
    .map(([area, segundos]) => ({
      area,
      segundos,
      percent: totalEmProblemas === 0 ? 0 : Math.round((segundos / totalEmProblemas) * 1000) / 10,
    }))
    .sort((a, b) => b.segundos - a.segundos);

  return {
    userId,
    periodo,
    tempo: resumirTempoDeclarado(meusRegistros, agora),
    interrupcoesDeclaradas: contarInterrupcoes(meusRegistros),
    eventosPorArea,
    totalEventosRelevantes: meusEventos.length,
    problemasAbertos: meusProblemas.filter((p) => !problemaEncerrado(p)).length,
    problemasResolvidos: meusProblemas.filter((p) => p.status === "RESOLVIDO").length,
    tempoPorAreaDeclarado,
    tempoPotencialRecuperavel: estimarTempoRecuperavel(meusProblemas, meusRegistros, meusEventos, agora),
  };
}

/** Consolida a equipe inteira, mantendo a visão individual de cada vendedor. */
export interface VisaoEquipe {
  periodo: { inicio: string; fim: string };
  porVendedor: VisaoConsolidada[];
  totalVendedores: number;
  /** Tempo declarado somado da equipe, por categoria. */
  tempoEquipe: ResumoTempoDeclarado;
  tempoPorAreaDeclarado: TempoPorArea[];
  eventosPorArea: ContagemPorArea[];
  problemasAbertos: number;
  tempoPotencialRecuperavel: Medida<number>;
}

export function consolidarEquipe(
  userIds: string[],
  periodo: { inicio: string; fim: string },
  registros: RegistroTempo[],
  problemas: Problema[],
  eventos: EventoIdentificado[] = [],
  agora: Date = new Date()
): VisaoEquipe {
  const porVendedor = userIds.map((id) =>
    consolidar(id, periodo, registros, problemas, eventos, agora)
  );

  const registrosEquipe = registros.filter(
    (r) => userIds.includes(r.userId) && dentroDoPeriodo(r.inicio, periodo.inicio, periodo.fim)
  );
  const problemasEquipe = problemas.filter(
    (p) => userIds.includes(p.userId) && dentroDoPeriodo(p.criadoEm, periodo.inicio, periodo.fim)
  );

  const somarAreas = (chave: (v: VisaoConsolidada) => TempoPorArea[]): TempoPorArea[] => {
    const mapa = new Map<string, number>();
    let total = 0;
    for (const visao of porVendedor) {
      for (const item of chave(visao)) {
        mapa.set(item.area, (mapa.get(item.area) ?? 0) + item.segundos);
        total += item.segundos;
      }
    }
    return Array.from(mapa.entries())
      .map(([area, segundos]) => ({
        area,
        segundos,
        percent: total === 0 ? 0 : Math.round((segundos / total) * 1000) / 10,
      }))
      .sort((a, b) => b.segundos - a.segundos);
  };

  const eventosMapa = new Map<CategoriaProblema, number>();
  for (const visao of porVendedor) {
    for (const item of visao.eventosPorArea) {
      eventosMapa.set(item.categoria, (eventosMapa.get(item.categoria) ?? 0) + item.quantidade);
    }
  }

  return {
    periodo,
    porVendedor,
    totalVendedores: userIds.length,
    tempoEquipe: resumirTempoDeclarado(registrosEquipe, agora),
    tempoPorAreaDeclarado: somarAreas((v) => v.tempoPorAreaDeclarado),
    eventosPorArea: Array.from(eventosMapa.entries())
      .map(([categoria, quantidade]) => ({
        categoria,
        area: AREA_RESPONSAVEL_POR_CATEGORIA[categoria],
        quantidade,
      }))
      .sort((a, b) => b.quantidade - a.quantidade),
    problemasAbertos: problemasEquipe.filter((p) => !problemaEncerrado(p)).length,
    tempoPotencialRecuperavel: estimarTempoRecuperavel(
      problemasEquipe,
      registrosEquipe,
      eventos,
      agora
    ),
  };
}
