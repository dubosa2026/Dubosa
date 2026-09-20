import { describe, expect, it } from "vitest";
import { generateManagerAlerts } from "../src/alerts";
import type { Problem, TimeEntry } from "../src/types";

function entry(categoria: TimeEntry["categoria"], userId: string, minutos: number): TimeEntry {
  const inicio = new Date("2026-01-01T08:00:00Z");
  const fim = new Date(inicio.getTime() + minutos * 60_000);
  return { id: crypto.randomUUID(), userId, categoria, inicio: inicio.toISOString(), fim: fim.toISOString() };
}

function problema(overrides: Partial<Problem> = {}): Problem {
  return {
    id: crypto.randomUUID(),
    protocolo: "#1",
    userId: "v1",
    cliente: "A",
    descricao: "x",
    categoria: "FINANCEIRO",
    prioridade: "ALTA",
    areaResponsavel: "Financeiro",
    status: "ABERTO",
    preso: false,
    criadoEm: "2026-01-01T00:00:00Z",
    atualizadoEm: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("generateManagerAlerts", () => {
  const agora = new Date("2026-01-01T23:59:00Z");

  it("alerta quando vendedores passam mais de 90 minutos em problemas", () => {
    const alertas = generateManagerAlerts({
      entriesHoje: [entry("PROBLEMA", "v1", 95), entry("PROBLEMA", "v2", 30)],
      problemsHoje: [],
      mapaConsumo: [],
      horasRecuperaveisMes: 0,
      agora,
    });
    expect(alertas.some((a) => a.texto.includes("1 vendedores passaram mais de 90 minutos"))).toBe(true);
  });

  it("alerta sobre área que concentra tempo operacional", () => {
    const alertas = generateManagerAlerts({
      entriesHoje: [],
      problemsHoje: [],
      mapaConsumo: [{ area: "Financeiro", segundos: 3600, percent: 45 }],
      horasRecuperaveisMes: 0,
      agora,
    });
    expect(alertas.some((a) => a.texto.startsWith("Financeiro concentra"))).toBe(true);
  });

  it("gera oportunidade de recuperação de horas comerciais", () => {
    const alertas = generateManagerAlerts({
      entriesHoje: [],
      problemsHoje: [],
      mapaConsumo: [],
      horasRecuperaveisMes: 63,
      agora,
    });
    expect(alertas.some((a) => a.texto.includes("63 horas comerciais por mês"))).toBe(true);
  });

  it("alerta quando há vendedores presos em um problema", () => {
    const alertas = generateManagerAlerts({
      entriesHoje: [],
      problemsHoje: [problema({ preso: true })],
      mapaConsumo: [],
      horasRecuperaveisMes: 0,
      agora,
    });
    expect(alertas.some((a) => a.texto.includes("precisam de ajuda agora"))).toBe(true);
  });

  it("não gera alertas quando os dados estão dentro do esperado", () => {
    const alertas = generateManagerAlerts({
      entriesHoje: [entry("PROSPECCAO", "v1", 60)],
      problemsHoje: [],
      mapaConsumo: [],
      horasRecuperaveisMes: 0,
      agora,
    });
    expect(alertas).toHaveLength(0);
  });
});
