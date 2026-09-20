import { describe, expect, it } from "vitest";
import { computeMapaConsumoPorArea, computeTempoOperacionalEvitavel, projetarHorasMensais } from "../src/operationalTime";
import type { Problem, TimeEntry } from "../src/types";

function entry(
  categoria: TimeEntry["categoria"],
  userId: string,
  minutos: number,
  problemaId?: string
): TimeEntry {
  const inicio = new Date("2026-01-01T08:00:00Z");
  const fim = new Date(inicio.getTime() + minutos * 60_000);
  return { id: crypto.randomUUID(), userId, categoria, inicio: inicio.toISOString(), fim: fim.toISOString(), problemaId };
}

describe("computeTempoOperacionalEvitavel", () => {
  it("soma apenas categorias operacionais (PROBLEMA, COTACAO_OPERACIONAL, OUTROS)", () => {
    const entries: TimeEntry[] = [
      entry("PROSPECCAO", "v1", 60),
      entry("PROBLEMA", "v1", 30),
      entry("COTACAO_OPERACIONAL", "v2", 20),
      entry("OUTROS", "v2", 10),
    ];
    const resumo = computeTempoOperacionalEvitavel(entries);
    expect(resumo.evitavelSegundos).toBe((30 + 20 + 10) * 60);
    expect(resumo.totalSegundos).toBe((60 + 30 + 20 + 10) * 60);
    expect(resumo.porUsuario).toEqual(
      expect.arrayContaining([
        { userId: "v1", evitavelSegundos: 30 * 60 },
        { userId: "v2", evitavelSegundos: 30 * 60 },
      ])
    );
  });
});

describe("computeMapaConsumoPorArea", () => {
  it("agrupa o tempo perdido em problemas pela área responsável", () => {
    const problems: Problem[] = [
      {
        id: "p1",
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
      },
      {
        id: "p2",
        protocolo: "#2",
        userId: "v1",
        cliente: "B",
        descricao: "y",
        categoria: "LOGISTICA",
        prioridade: "MEDIA",
        areaResponsavel: "Logística",
        status: "ABERTO",
        preso: false,
        criadoEm: "2026-01-01T00:00:00Z",
        atualizadoEm: "2026-01-01T00:00:00Z",
      },
    ];
    const entries: TimeEntry[] = [entry("PROBLEMA", "v1", 30, "p1"), entry("PROBLEMA", "v1", 30, "p2")];
    const mapa = computeMapaConsumoPorArea(entries, problems);
    expect(mapa).toHaveLength(2);
    expect(mapa.find((m) => m.area === "Financeiro")?.percent).toBe(50);
    expect(mapa.find((m) => m.area === "Logística")?.percent).toBe(50);
  });
});

describe("projetarHorasMensais", () => {
  it("projeta horas de uma amostra de dias úteis para um mês inteiro", () => {
    expect(projetarHorasMensais(20, 5, 22)).toBeCloseTo(88, 1);
  });
  it("retorna 0 quando não há dias na amostra", () => {
    expect(projetarHorasMensais(20, 0)).toBe(0);
  });
});
