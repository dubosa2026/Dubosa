import type { VisaoEquipe } from "./evidence";
import { agruparRecorrentes } from "./problems";
import type { Origem } from "./provenance";
import { formatDuracao } from "./timeTracking";
import type { Problema, User } from "./types";

/**
 * INSIGHTS GERENCIAIS
 *
 * Camada de interpretação: identifica assuntos recorrentes, áreas que mais
 * interrompem a equipe e gargalos internos, e sugere onde o gerente deve
 * atuar. Todo insight carrega as evidências que o sustentam — sem isso, é
 * só uma frase bonita que o gerente não tem como conferir.
 *
 * Nenhum insight aqui avalia pessoas. Todos avaliam processos.
 */

export interface InsightGerencial {
  id: string;
  titulo: string;
  corpo: string;
  origem: Origem;
  evidencias: string[];
  sugestao: string;
}

export interface DadosInsights {
  visaoEquipe: VisaoEquipe;
  problemas: Problema[];
  usuarios: User[];
  /** Quantos dias o período cobre — usado para falar de tendência. */
  diasNoPeriodo?: number;
}

function nomeDe(usuarios: User[], userId: string): string {
  return usuarios.find((u) => u.id === userId)?.nome ?? "Vendedor";
}

export function gerarInsights(dados: DadosInsights): InsightGerencial[] {
  const insights: InsightGerencial[] = [];
  const dias = dados.diasNoPeriodo ?? 1;
  const janela = dias === 1 ? "hoje" : `nos últimos ${dias} dias`;

  // 1. Área que mais consome tempo declarado da equipe.
  const areaTopo = dados.visaoEquipe.tempoPorAreaDeclarado[0];
  if (areaTopo && areaTopo.percent > 0) {
    const problemasDaArea = dados.problemas.filter((p) => p.areaResponsavel === areaTopo.area);
    const impactados = new Set(problemasDaArea.map((p) => p.userId)).size;
    insights.push({
      id: `area:${areaTopo.area}`,
      titulo: `${areaTopo.area} é a maior fonte de tempo operacional da equipe`,
      corpo:
        `${janela}, problemas de ${areaTopo.area} concentraram ${areaTopo.percent}% de todo o tempo que a ` +
        `equipe declarou em problemas operacionais, impactando ${impactados} vendedor(es).`,
      origem: "DECLARADO",
      evidencias: [
        `${formatDuracao(areaTopo.segundos)} declarados em problemas de ${areaTopo.area}`,
        `${problemasDaArea.length} chamado(s) registrados nesta área`,
        `${impactados} vendedor(es) impactados`,
      ],
      sugestao: `Levar os ${problemasDaArea.length} chamados de ${areaTopo.area} para a área responsável e investigar o processo que os origina.`,
    });
  }

  // 2. Problemas recorrentes — o gancho mais acionável para o gerente.
  const recorrentes = agruparRecorrentes(dados.problemas, 3);
  for (const grupo of recorrentes.slice(0, 2)) {
    const termos = grupo.termosComuns.length ? grupo.termosComuns.join(", ") : "sem termo dominante";
    insights.push({
      id: `recorrencia:${grupo.categoria}`,
      titulo: `Padrão recorrente em ${grupo.areaResponsavel}`,
      corpo:
        `${grupo.ocorrencias} chamados de ${grupo.areaResponsavel} ${janela} compartilham o mesmo vocabulário ` +
        `(${termos}), o que sugere um processo único falhando repetidamente — e não casos isolados.`,
      origem: "DECLARADO",
      evidencias: [
        `${grupo.ocorrencias} chamados na categoria ${grupo.categoria}`,
        `${grupo.vendedoresImpactados} vendedor(es) diferentes afetados`,
        `termos em comum: ${termos}`,
      ],
      sugestao: `Investigar com ${grupo.areaResponsavel} a causa comum desses ${grupo.ocorrencias} chamados, em vez de tratá-los um a um.`,
    });
  }

  // 3. Vendedor com carga operacional fora da curva — para ajudar, não cobrar.
  const comCarga = dados.visaoEquipe.porVendedor
    .map((v) => ({
      userId: v.userId,
      segundos: v.tempo.porCategoria.find((c) => c.categoria === "PROBLEMA_OPERACIONAL")?.segundos ?? 0,
      interrupcoes: v.interrupcoesDeclaradas,
      abertos: v.problemasAbertos,
    }))
    .sort((a, b) => b.segundos - a.segundos);

  const media =
    comCarga.length > 0 ? comCarga.reduce((acc, v) => acc + v.segundos, 0) / comCarga.length : 0;
  const foraDaCurva = comCarga[0];
  if (foraDaCurva && media > 0 && foraDaCurva.segundos > media * 1.8) {
    insights.push({
      id: `carga:${foraDaCurva.userId}`,
      titulo: `${nomeDe(dados.usuarios, foraDaCurva.userId)} está absorvendo mais operação que a equipe`,
      corpo:
        `${formatDuracao(foraDaCurva.segundos)} declarados em problemas operacionais, contra uma média de ` +
        `${formatDuracao(Math.round(media))} na equipe. Vale entender o que está caindo no colo dele.`,
      origem: "DECLARADO",
      evidencias: [
        `${formatDuracao(foraDaCurva.segundos)} declarados em problema operacional`,
        `${foraDaCurva.interrupcoes} interrupção(ões) declaradas no período`,
        `${foraDaCurva.abertos} problema(s) ainda aberto(s)`,
      ],
      sugestao: "Conversar sobre quais casos podem ser assumidos pela área responsável ou redistribuídos.",
    });
  }

  // 4. Estimativa de tempo recuperável — sempre rotulada como hipótese.
  const recuperavel = dados.visaoEquipe.tempoPotencialRecuperavel;
  if (recuperavel.valor > 0) {
    insights.push({
      id: "recuperavel",
      titulo: `Há cerca de ${formatDuracao(recuperavel.valor)} potencialmente recuperáveis`,
      corpo:
        `Se os obstáculos internos por trás dos chamados do período fossem removidos, essa é a ordem de ` +
        `grandeza de tempo que voltaria para a equipe. É uma estimativa, não uma medição.`,
      origem: "ESTIMADO",
      evidencias: [recuperavel.base, "cálculo aplicado apenas sobre tempo declarado, nunca sobre eventos"],
      sugestao: "Usar o número como ordem de grandeza para priorizar qual processo atacar primeiro.",
    });
  }

  // 5. Subnotificação: eventos identificados sem problema correspondente.
  const eventosTotais = dados.visaoEquipe.eventosPorArea.reduce((acc, e) => acc + e.quantidade, 0);
  if (eventosTotais > 0 && dados.problemas.length * 3 < eventosTotais) {
    insights.push({
      id: "subnotificacao",
      titulo: "Há mais movimento operacional do que chamados registrados",
      corpo:
        `As integrações identificaram ${eventosTotais} mensagens operacionais ${janela}, mas só ` +
        `${dados.problemas.length} problema(s) foram registrados no FOCO. Muita coisa está sendo resolvida ` +
        `no silêncio, sem virar dado que o gerente possa acompanhar.`,
      origem: "IDENTIFICADO",
      evidencias: [
        `${eventosTotais} eventos identificados nas integrações`,
        `${dados.problemas.length} problemas registrados no período`,
        "eventos identificados não representam tempo medido",
      ],
      sugestao: "Reforçar com a equipe que registrar o problema é o que permite a você removê-lo.",
    });
  }

  return insights;
}
