import { declarado, estimado, type Medida } from "./provenance";
import { duracaoSegundos } from "./timeTracking";
import {
  STATUS_ENCERRADOS,
  type EventoIdentificado,
  type Problema,
  type RegistroTempo,
  type StatusProblema,
} from "./types";

/**
 * Transições permitidas do ciclo de vida de um problema. Um problema
 * resolvido pode voltar para análise: na prática problemas operacionais
 * reabrem, e esconder isso do gerente falsearia o indicador de recorrência.
 */
const TRANSICOES: Record<StatusProblema, readonly StatusProblema[]> = {
  NOVO: ["EM_ANALISE", "ENCAMINHADO", "CANCELADO"],
  EM_ANALISE: ["ENCAMINHADO", "AGUARDANDO_VENDEDOR", "RESOLVIDO", "CANCELADO"],
  ENCAMINHADO: ["AGUARDANDO_AREA", "AGUARDANDO_VENDEDOR", "RESOLVIDO", "CANCELADO"],
  AGUARDANDO_AREA: ["AGUARDANDO_VENDEDOR", "EM_ANALISE", "RESOLVIDO", "CANCELADO"],
  AGUARDANDO_VENDEDOR: ["AGUARDANDO_AREA", "EM_ANALISE", "RESOLVIDO", "CANCELADO"],
  RESOLVIDO: ["EM_ANALISE"],
  CANCELADO: [],
};

export function transicaoPermitida(de: StatusProblema, para: StatusProblema): boolean {
  return TRANSICOES[de].includes(para);
}

export function proximosStatusPossiveis(de: StatusProblema): readonly StatusProblema[] {
  return TRANSICOES[de];
}

export function problemaEncerrado(problema: Problema): boolean {
  return STATUS_ENCERRADOS.includes(problema.status);
}

/**
 * Move o problema, registrando no histórico. Devolve uma cópia — o domínio
 * não muta o objeto recebido, para o repositório decidir quando persistir.
 */
export function moverStatus(
  problema: Problema,
  novoStatus: StatusProblema,
  por: string,
  nota?: string,
  agora: Date = new Date()
): Problema {
  if (!transicaoPermitida(problema.status, novoStatus)) {
    throw new Error(
      `Transição inválida: ${problema.status} → ${novoStatus}. ` +
        `A partir de ${problema.status} só é possível ir para ${TRANSICOES[problema.status].join(", ") || "nenhum status"}.`
    );
  }
  const em = agora.toISOString();
  return {
    ...problema,
    status: novoStatus,
    atualizadoEm: em,
    resolvidoEm: novoStatus === "RESOLVIDO" ? em : problema.resolvidoEm,
    historico: [...problema.historico, { em, status: novoStatus, por, nota }],
  };
}

/** Tempo entre a abertura e a resolução, em segundos. Null enquanto aberto. */
export function tempoResolucaoSegundos(problema: Problema): number | null {
  if (!problema.resolvidoEm) return null;
  const inicio = new Date(problema.criadoEm).getTime();
  const fim = new Date(problema.resolvidoEm).getTime();
  return Math.max(0, Math.round((fim - inicio) / 1000));
}

/**
 * Quanto tempo do vendedor este problema consumiu.
 *
 * Quando existem blocos de cronômetro amarrados ao problema, o número é
 * DECLARADO — veio do vendedor. Quando não existem, mas as integrações
 * identificaram eventos ligados a ele, o número é ESTIMADO a partir de uma
 * régua explícita por evento. As duas coisas nunca se somam num número só.
 */
const MINUTOS_ESTIMADOS_POR_EVENTO: Record<string, number> = { ALTA: 12, MEDIA: 6, BAIXA: 2, IGNORAR: 0 };

export function impactoNoVendedor(
  problema: Problema,
  registros: RegistroTempo[],
  eventos: EventoIdentificado[] = [],
  agora: Date = new Date()
): Medida<number> {
  const blocos = registros.filter((r) => r.problemaId === problema.id);
  if (blocos.length > 0) {
    const segundos = blocos.reduce((acc, r) => acc + duracaoSegundos(r, agora), 0);
    return declarado(segundos, `${blocos.length} bloco(s) de cronômetro declarados neste problema`);
  }

  const doProblema = eventos.filter((e) => e.problemaId === problema.id && e.relevancia !== "IGNORAR");
  if (doProblema.length === 0) {
    return estimado(0, "sem tempo declarado e sem eventos identificados para este problema");
  }
  const segundos = doProblema.reduce(
    (acc, e) => acc + (MINUTOS_ESTIMADOS_POR_EVENTO[e.relevancia] ?? 0) * 60,
    0
  );
  return estimado(
    segundos,
    `estimado a partir de ${doProblema.length} evento(s) identificado(s), sem tempo declarado pelo vendedor`
  );
}

/* ------------------------------------------------------------------ */
/* Recorrência                                                         */
/* ------------------------------------------------------------------ */

export interface GrupoRecorrente {
  categoria: Problema["categoria"];
  areaResponsavel: string;
  /** Termos que aparecem na maioria das descrições do grupo. */
  termosComuns: string[];
  ocorrencias: number;
  vendedoresImpactados: number;
  problemaIds: string[];
}

const PARADAS = new Set([
  "de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em", "no", "na", "nos", "nas",
  "um", "uma", "para", "por", "com", "que", "nao", "não", "esta", "está", "foi", "ser", "cliente",
  "pedido", "problema", "ainda", "sem", "ja", "já", "mais", "muito", "the", "sobre",
]);

function termos(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 3 && !PARADAS.has(t));
}

/**
 * Agrupa problemas semelhantes por categoria e vocabulário compartilhado.
 * O objetivo não é classificar com precisão linguística, é dar ao gerente
 * o gancho: «estes N chamados são a mesma coisa acontecendo de novo».
 */
export function agruparRecorrentes(problemas: Problema[], minimoOcorrencias = 2): GrupoRecorrente[] {
  const porCategoria = new Map<string, Problema[]>();
  for (const p of problemas) {
    const lista = porCategoria.get(p.categoria) ?? [];
    lista.push(p);
    porCategoria.set(p.categoria, lista);
  }

  const grupos: GrupoRecorrente[] = [];
  for (const [, lista] of porCategoria) {
    if (lista.length < minimoOcorrencias) continue;

    const frequencia = new Map<string, number>();
    for (const p of lista) {
      for (const t of new Set(termos(p.descricao))) {
        frequencia.set(t, (frequencia.get(t) ?? 0) + 1);
      }
    }
    const termosComuns = Array.from(frequencia.entries())
      .filter(([, n]) => n >= Math.max(2, Math.ceil(lista.length * 0.5)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([t]) => t);

    grupos.push({
      categoria: lista[0].categoria,
      areaResponsavel: lista[0].areaResponsavel,
      termosComuns,
      ocorrencias: lista.length,
      vendedoresImpactados: new Set(lista.map((p) => p.userId)).size,
      problemaIds: lista.map((p) => p.id),
    });
  }

  return grupos.sort((a, b) => b.ocorrencias - a.ocorrencias);
}
