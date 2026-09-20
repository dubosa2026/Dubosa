import type { VisaoEquipe } from "./evidence";
import { agruparRecorrentes } from "./problems";
import { formatDuracao } from "./timeTracking";
import type { Origem } from "./provenance";
import type { Problema, RegistroTempo, User } from "./types";

/**
 * ALERTAS GERENCIAIS
 *
 * O gerente não deve precisar olhar o painel o dia inteiro. Os alertas
 * existem para puxá-lo quando há algo a fazer — e cada um diz de onde veio
 * o dado que o disparou, porque um alerta sem origem é um boato.
 *
 * Nenhum alerta aqui cobra produtividade de vendedor. Todos apontam para
 * um obstáculo que o gerente pode remover.
 */

export type Severidade = "CRITICO" | "ATENCAO" | "POSITIVO";

export const SIMBOLO_SEVERIDADE: Record<Severidade, string> = {
  CRITICO: "🔴",
  ATENCAO: "🟠",
  POSITIVO: "🟢",
};

export interface Alerta {
  id: string;
  severidade: Severidade;
  texto: string;
  origem: Origem;
  /** O que sustenta o alerta — mostrado junto, nunca escondido. */
  evidencia: string;
  /** Vendedor envolvido, quando o alerta é sobre uma pessoa específica. */
  userId?: string;
}

/**
 * Limiares configuráveis, para o gerente ajustar o volume de notificações.
 * Um alerta que dispara o tempo todo deixa de ser alerta.
 */
export interface ConfigAlertas {
  minutosPresoEmProblema: number;
  minutosProblemaOperacionalNoDia: number;
  vendedoresParaProblemaColetivo: number;
  percentConcentracaoArea: number;
  ocorrenciasParaRecorrencia: number;
  ativos: Record<string, boolean>;
}

export const CONFIG_ALERTAS_PADRAO: ConfigAlertas = {
  minutosPresoEmProblema: 45,
  minutosProblemaOperacionalNoDia: 90,
  vendedoresParaProblemaColetivo: 3,
  percentConcentracaoArea: 30,
  ocorrenciasParaRecorrencia: 3,
  ativos: {
    preso: true,
    tempoEmProblema: true,
    problemaColetivo: true,
    concentracaoArea: true,
    recorrencia: true,
    resolvidos: true,
  },
};

export interface DadosAlertas {
  visaoEquipe: VisaoEquipe;
  problemas: Problema[];
  registros: RegistroTempo[];
  usuarios: User[];
  config?: ConfigAlertas;
  agora?: Date;
}

function nomeDe(usuarios: User[], userId: string): string {
  return usuarios.find((u) => u.id === userId)?.nome ?? "Vendedor";
}

export function gerarAlertas(dados: DadosAlertas): Alerta[] {
  const config = dados.config ?? CONFIG_ALERTAS_PADRAO;
  const agora = dados.agora ?? new Date();
  const alertas: Alerta[] = [];

  // 🔴 Vendedor preso há tempo demais no mesmo problema.
  if (config.ativos.preso) {
    for (const problema of dados.problemas.filter((p) => p.preso && p.status !== "RESOLVIDO" && p.status !== "CANCELADO")) {
      const blocos = dados.registros.filter((r) => r.problemaId === problema.id);
      const segundos = blocos.reduce((acc, r) => {
        const fim = r.fim ? new Date(r.fim).getTime() : agora.getTime();
        return acc + Math.max(0, Math.round((fim - new Date(r.inicio).getTime()) / 1000));
      }, 0);
      if (segundos >= config.minutosPresoEmProblema * 60) {
        alertas.push({
          id: `preso:${problema.id}`,
          severidade: "CRITICO",
          texto: `${nomeDe(dados.usuarios, problema.userId)} está há ${formatDuracao(segundos)} no problema ${problema.protocolo} e pediu ajuda.`,
          origem: "DECLARADO",
          evidencia: `${problema.areaResponsavel} · ${problema.protocolo} · tempo declarado no cronômetro`,
          userId: problema.userId,
        });
      }
    }
  }

  // 🟠 Vendedor com muito tempo declarado em problema operacional no dia.
  if (config.ativos.tempoEmProblema) {
    for (const visao of dados.visaoEquipe.porVendedor) {
      const segundos =
        visao.tempo.porCategoria.find((c) => c.categoria === "PROBLEMA_OPERACIONAL")?.segundos ?? 0;
      if (segundos >= config.minutosProblemaOperacionalNoDia * 60) {
        alertas.push({
          id: `tempoProblema:${visao.userId}`,
          severidade: "ATENCAO",
          texto: `${nomeDe(dados.usuarios, visao.userId)} declarou ${formatDuracao(segundos)} em problemas operacionais no período.`,
          origem: "DECLARADO",
          evidencia: `${visao.problemasAbertos} problema(s) aberto(s) · ${visao.interrupcoesDeclaradas} interrupção(ões) declaradas`,
          userId: visao.userId,
        });
      }
    }
  }

  // 🔴 Mesmo problema atingindo vários vendedores ao mesmo tempo.
  if (config.ativos.problemaColetivo) {
    for (const grupo of agruparRecorrentes(dados.problemas, config.ocorrenciasParaRecorrencia)) {
      if (grupo.vendedoresImpactados >= config.vendedoresParaProblemaColetivo) {
        alertas.push({
          id: `coletivo:${grupo.categoria}`,
          severidade: "CRITICO",
          texto: `${grupo.vendedoresImpactados} vendedores foram impactados por problemas de ${grupo.areaResponsavel} no período.`,
          origem: "DECLARADO",
          evidencia:
            `${grupo.ocorrencias} chamados registrados` +
            (grupo.termosComuns.length ? ` · termos recorrentes: ${grupo.termosComuns.join(", ")}` : ""),
        });
      }
    }
  }

  // 🟠 Uma área concentrando o tempo operacional da equipe.
  if (config.ativos.concentracaoArea) {
    const topo = dados.visaoEquipe.tempoPorAreaDeclarado[0];
    if (topo && topo.percent >= config.percentConcentracaoArea) {
      alertas.push({
        id: `concentracao:${topo.area}`,
        severidade: "ATENCAO",
        texto: `${topo.area} concentra ${topo.percent}% do tempo que a equipe declarou em problemas.`,
        origem: "DECLARADO",
        evidencia: `${formatDuracao(topo.segundos)} declarados em problemas desta área`,
      });
    }
  }

  // 🟠 Área gerando muitos eventos identificados nas integrações.
  const topoEventos = dados.visaoEquipe.eventosPorArea[0];
  if (topoEventos && topoEventos.quantidade >= 5) {
    alertas.push({
      id: `eventos:${topoEventos.categoria}`,
      severidade: "ATENCAO",
      texto: `${topoEventos.quantidade} mensagens relacionadas a ${topoEventos.area} chegaram à equipe no período.`,
      origem: "IDENTIFICADO",
      evidencia: "eventos identificados nas integrações autorizadas — não representam tempo medido",
    });
  }

  // 🟢 Problema recorrente que foi resolvido.
  if (config.ativos.resolvidos) {
    const resolvidos = dados.problemas.filter((p) => p.status === "RESOLVIDO");
    if (resolvidos.length > 0) {
      alertas.push({
        id: "resolvidos",
        severidade: "POSITIVO",
        texto: `${resolvidos.length} problema(s) resolvido(s) no período.`,
        origem: "DECLARADO",
        evidencia: "chamados encerrados com status Resolvido no FOCO",
      });
    }
  }

  const ordem: Record<Severidade, number> = { CRITICO: 0, ATENCAO: 1, POSITIVO: 2 };
  return alertas.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
}
