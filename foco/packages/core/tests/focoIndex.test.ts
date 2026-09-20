import { describe, expect, it } from "vitest";
import { computeFocoComercial, formatDuracao } from "../src/focoIndex";
import type { TimeEntry } from "../src/types";

function entry(categoria: TimeEntry["categoria"], inicioISO: string, minutos: number): TimeEntry {
  const inicio = new Date(inicioISO);
  const fim = new Date(inicio.getTime() + minutos * 60_000);
  return { id: crypto.randomUUID(), userId: "u1", categoria, inicio: inicio.toISOString(), fim: fim.toISOString() };
}

describe("computeFocoComercial", () => {
  it("calcula o percentual comercial do exemplo da especificação", () => {
    // Prospecção 3h42, Negociação 1h20, Follow-up 50min, Problemas 1h05, Cotações operacionais 55min
    const entries: TimeEntry[] = [
      entry("PROSPECCAO", "2026-01-01T08:00:00Z", 3 * 60 + 42),
      entry("NEGOCIACAO", "2026-01-01T12:00:00Z", 80),
      entry("FOLLOWUP", "2026-01-01T14:00:00Z", 50),
      entry("PROBLEMA", "2026-01-01T15:00:00Z", 65),
      entry("COTACAO_OPERACIONAL", "2026-01-01T16:30:00Z", 55),
    ];

    const resumo = computeFocoComercial(entries, new Date("2026-01-01T23:59:00Z"));

    const totalMin = 3 * 60 + 42 + 80 + 50 + 65 + 55;
    const comercialMin = 3 * 60 + 42 + 80 + 50;
    const esperado = Math.round((comercialMin / totalMin) * 1000) / 10;

    expect(resumo.focoComercialPercent).toBeCloseTo(esperado, 1);
    expect(resumo.totalSegundos).toBe(totalMin * 60);
    expect(resumo.comercialSegundos).toBe(comercialMin * 60);
  });

  it("retorna 0% quando não há nenhum registro", () => {
    const resumo = computeFocoComercial([]);
    expect(resumo.focoComercialPercent).toBe(0);
    expect(resumo.totalSegundos).toBe(0);
  });

  it("retorna 100% quando só há atividade comercial", () => {
    const entries = [entry("PROSPECCAO", "2026-01-01T08:00:00Z", 60)];
    const resumo = computeFocoComercial(entries, new Date("2026-01-01T09:30:00Z"));
    expect(resumo.focoComercialPercent).toBe(100);
  });

  it("considera um registro em andamento (sem fim) até o instante 'agora'", () => {
    const entries: TimeEntry[] = [
      { id: "1", userId: "u1", categoria: "PROSPECCAO", inicio: "2026-01-01T08:00:00Z", fim: null },
    ];
    const resumo = computeFocoComercial(entries, new Date("2026-01-01T08:30:00Z"));
    expect(resumo.totalSegundos).toBe(30 * 60);
    expect(resumo.focoComercialPercent).toBe(100);
  });
});

describe("formatDuracao", () => {
  it("formata horas e minutos", () => {
    expect(formatDuracao(3 * 3600 + 42 * 60)).toBe("3h42");
  });
  it("formata só minutos quando menos de uma hora", () => {
    expect(formatDuracao(50 * 60)).toBe("50min");
  });
  it("formata só horas quando minutos são zero", () => {
    expect(formatDuracao(2 * 3600)).toBe("2h");
  });
});
