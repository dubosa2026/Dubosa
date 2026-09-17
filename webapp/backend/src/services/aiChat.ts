import { prisma } from "../prisma.js";
import { buildDashboardSummary } from "./metrics.js";
import { vendorPerformances } from "./vendorPerformance.js";
import { computeClientHealthForScope, prioritizedReactivationList } from "./clientAnalytics.js";
import { generateRadarAlerts } from "./insightsEngine.js";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export interface ChatAnswer {
  answer: string;
  dataUsed: Record<string, unknown>;
  intent: string;
}

/**
 * Central "Pergunte à IA" (seção 18). Interpreta a pergunta por
 * palavras-chave e responde SOMENTE com base em dados reais calculados
 * pelos mesmos serviços usados no dashboard/radar — nunca inventa números.
 * Quando nenhum padrão é reconhecido ou faltam dados, diz isso
 * explicitamente (regra 28.3 do briefing).
 */
export async function answerQuestion(question: string, vendorIds: string[] | null): Promise<ChatAnswer> {
  const q = normalize(question);
  const explicitVendorIds =
    vendorIds ?? (await prisma.user.findMany({ where: { role: "VENDEDOR" }, select: { id: true } })).map((v) => v.id);

  if (/(quanto vendemos|faturamento|quanto foi a venda|resultado de hoje|resultado do mes)/.test(q)) {
    const summary = await buildDashboardSummary(vendorIds);
    const r = summary.resultado;
    const answer =
      `Faturamento do mês até agora: R$ ${r.faturamentoAtual.toFixed(2)}` +
      (r.meta > 0 ? ` (${((r.percentualAtingido ?? 0) * 100).toFixed(0)}% da meta de R$ ${r.meta.toFixed(2)}).` : ".") +
      (r.variacaoPercentual !== null
        ? ` Isso é ${r.variacaoPercentual >= 0 ? "+" : ""}${(r.variacaoPercentual * 100).toFixed(0)}% em relação ao mesmo período do mês anterior.`
        : "");
    return { answer, dataUsed: r, intent: "faturamento" };
  }

  if (/(vendedor.*atencao|quem precisa de atencao|vendedores.*queda)/.test(q)) {
    const perf = await vendorPerformances(explicitVendorIds);
    const atencao = perf.filter((p) => p.trend === "QUEDA" || (p.pctGoal !== null && p.pctGoal < 0.7));
    if (atencao.length === 0) {
      return {
        answer: "Nenhum vendedor apresenta queda relevante ou está muito abaixo da meta no momento.",
        dataUsed: { perf },
        intent: "vendedores_atencao",
      };
    }
    const answer = atencao
      .map(
        (p) =>
          `${p.name}: ${p.variacaoPercentual !== null ? (p.variacaoPercentual * 100).toFixed(0) + "% vs mês anterior" : "sem comparação"}${p.pctGoal !== null ? `, ${(p.pctGoal * 100).toFixed(0)}% da meta` : ""}.`
      )
      .join(" ");
    return { answer, dataUsed: { atencao }, intent: "vendedores_atencao" };
  }

  if (/(quem cresceu mais|melhor vendedor|maior crescimento)/.test(q)) {
    const perf = await vendorPerformances(explicitVendorIds);
    const withGrowth = perf.filter((p) => p.variacaoPercentual !== null);
    if (withGrowth.length === 0) {
      return {
        answer: "Não tenho dados suficientes do período anterior para comparar crescimento.",
        dataUsed: {},
        intent: "maior_crescimento",
      };
    }
    const top = withGrowth.sort((a, b) => (b.variacaoPercentual ?? 0) - (a.variacaoPercentual ?? 0))[0];
    return {
      answer: `${top.name} teve o maior crescimento: ${(top.variacaoPercentual! * 100).toFixed(0)}% em relação ao mesmo período do mês anterior (R$ ${top.revenue.toFixed(2)}).`,
      dataUsed: { top },
      intent: "maior_crescimento",
    };
  }

  if (/(cliente.*risco|clientes em risco)/.test(q)) {
    const rows = await computeClientHealthForScope(vendorIds);
    const risk = rows.filter((r) => r.status === "RISCO" || r.status === "ALTO_RISCO");
    if (risk.length === 0) {
      return { answer: "Nenhum cliente classificado em risco no momento.", dataUsed: {}, intent: "clientes_risco" };
    }
    const top = risk.sort((a, b) => a.score - b.score).slice(0, 5);
    const answer = `${risk.length} clientes em risco. Principais: ${top.map((r) => `${r.legalName} (${r.daysSinceLastOrder} dias sem comprar)`).join(", ")}.`;
    return { answer, dataUsed: { total: risk.length, top }, intent: "clientes_risco" };
  }

  if (/(priorizar hoje|devo priorizar|prioridade)/.test(q)) {
    const rows = await computeClientHealthForScope(vendorIds);
    const list = prioritizedReactivationList(rows).slice(0, 5);
    if (list.length === 0) {
      return { answer: "Não há clientes prioritários para reativação no momento.", dataUsed: {}, intent: "prioridade" };
    }
    const answer = `Priorize: ${list.map((c) => `${c.legalName} — ${c.motivo}`).join("; ")}.`;
    return { answer, dataUsed: { list }, intent: "prioridade" };
  }

  if (/(pararam de comprar|compravam.*pararam|reduziram a frequencia)/.test(q)) {
    const rows = await computeClientHealthForScope(vendorIds);
    const list = prioritizedReactivationList(rows);
    if (list.length === 0) {
      return { answer: "Não identifiquei clientes que pararam de comprar fora do padrão histórico.", dataUsed: {}, intent: "clientes_pararam" };
    }
    const answer = `${list.length} clientes compravam com regularidade e pararam: ${list
      .slice(0, 8)
      .map((c) => c.legalName)
      .join(", ")}${list.length > 8 ? "..." : ""}.`;
    return { answer, dataUsed: { total: list.length, list: list.slice(0, 20) }, intent: "clientes_pararam" };
  }

  if (/(estado.*(puxando|abaixo|queda)|qual estado)/.test(q)) {
    const alerts = await generateRadarAlerts(vendorIds);
    const stateAlert = alerts.find((a) => a.entityType === "STATE");
    if (!stateAlert) {
      return {
        answer: "Não tenho dados suficientes de estados com desempenho destacado neste período.",
        dataUsed: {},
        intent: "estado",
      };
    }
    return { answer: stateAlert.message, dataUsed: stateAlert.evidence, intent: "estado" };
  }

  const recoverMatch = q.match(/recuperar\s*r?\$?\s*([\d.,]+)\s*(mil|milhao|milhoes|milhões)?/);
  if (recoverMatch) {
    let value = Number(recoverMatch[1].replace(/\./g, "").replace(",", "."));
    if (/mil/.test(recoverMatch[2] ?? "")) value *= 1_000;
    if (/milh/.test(recoverMatch[2] ?? "")) value *= 1_000_000;

    const rows = await computeClientHealthForScope(vendorIds);
    const list = prioritizedReactivationList(rows).filter((c) => c.faturamentoMedioMensal > 0);
    const avgMonthly =
      list.length > 0 ? list.reduce((a, c) => a + c.faturamentoMedioMensal, 0) / list.length : 0;

    if (avgMonthly === 0) {
      return {
        answer: `Não tenho dados suficientes de faturamento médio dos clientes em risco para estimar quantas reativações seriam necessárias para recuperar R$ ${value.toFixed(2)}.`,
        dataUsed: {},
        intent: "plano_recuperacao",
      };
    }
    const necessarios = Math.ceil(value / avgMonthly);
    const answer =
      `Considerando o faturamento médio mensal dos ${list.length} clientes em risco (R$ ${avgMonthly.toFixed(2)}/cliente), ` +
      `seriam necessárias aproximadamente ${necessarios} reativações para recuperar R$ ${value.toFixed(2)}/mês. ` +
      `Esta é uma estimativa baseada no histórico, não uma garantia.`;
    return {
      answer,
      dataUsed: { valorAlvo: value, faturamentoMedioMensalPorCliente: avgMonthly, clientesDisponiveis: list.length, necessarios },
      intent: "plano_recuperacao",
    };
  }

  return {
    answer:
      "Não tenho dados suficientes para responder com precisão a essa pergunta. Tente perguntar sobre faturamento, vendedores em queda, clientes em risco, prioridades do dia ou o estado que mais cresceu.",
    dataUsed: {},
    intent: "desconhecido",
  };
}
