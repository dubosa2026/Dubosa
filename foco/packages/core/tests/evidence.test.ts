import { describe, expect, it } from "vitest";
import { consolidar, consolidarEquipe, estimarTempoRecuperavel } from "../src/evidence";
import type { EventoIdentificado, Problema, RegistroTempo } from "../src/types";

const PERIODO = { inicio: "2026-01-01T00:00:00Z", fim: "2026-01-02T00:00:00Z" };
const AGORA = new Date("2026-01-01T18:00:00Z");

function bloco(
  categoria: RegistroTempo["categoria"],
  minutos: number,
  userId = "v1",
  problemaId?: string,
  horaInicio = 8
): RegistroTempo {
  const inicio = new Date(`2026-01-01T${String(horaInicio).padStart(2, "0")}:00:00Z`);
  return {
    id: crypto.randomUUID(),
    userId,
    categoria,
    inicio: inicio.toISOString(),
    fim: new Date(inicio.getTime() + minutos * 60_000).toISOString(),
    problemaId,
  };
}

function problema(over: Partial<Problema> = {}): Problema {
  return {
    id: over.id ?? crypto.randomUUID(),
    protocolo: "#1",
    userId: "v1",
    cliente: "Cliente A",
    descricao: "Pedido não faturado",
    categoria: "FINANCEIRO",
    prioridade: "ALTA",
    areaResponsavel: "Financeiro",
    responsavel: null,
    status: "ENCAMINHADO",
    origem: "REGISTRO_VENDEDOR",
    preso: false,
    pedidoAjuda: null,
    criadoEm: "2026-01-01T09:00:00Z",
    atualizadoEm: "2026-01-01T09:00:00Z",
    resolvidoEm: null,
    historico: [],
    ...over,
  };
}

function evento(over: Partial<EventoIdentificado> = {}): EventoIdentificado {
  return {
    id: over.id ?? crypto.randomUUID(),
    userId: "v1",
    fonte: "EMAIL",
    ocorridoEm: "2026-01-01T10:00:00Z",
    assunto: "Pendência de faturamento",
    categoria: "FINANCEIRO",
    relevancia: "ALTA",
    ...over,
  };
}

describe("consolidar", () => {
  it("mantém tempo declarado e eventos identificados em campos separados", () => {
    const visao = consolidar(
      "v1",
      PERIODO,
      [bloco("COMERCIAL", 130), bloco("PROBLEMA_OPERACIONAL", 48, "v1", "p1", 11)],
      [problema({ id: "p1" })],
      [evento(), evento({ id: "e2" })],
      AGORA
    );

    expect(visao.tempo.comercialDeclarado.origem).toBe("DECLARADO");
    expect(visao.totalEventosRelevantes).toBe(2);
    expect(visao.eventosPorArea[0].area).toBe("Financeiro");
    expect(visao.eventosPorArea[0].quantidade).toBe(2);
    // O número de eventos jamais vira segundos no tempo declarado.
    expect(visao.tempo.totalDeclarado.valor).toBe((130 + 48) * 60);
  });

  it("descarta eventos irrelevantes da contagem", () => {
    const visao = consolidar(
      "v1",
      PERIODO,
      [],
      [],
      [evento({ relevancia: "IGNORAR" }), evento({ id: "e2", relevancia: "ALTA" })],
      AGORA
    );
    expect(visao.totalEventosRelevantes).toBe(1);
  });

  it("agrupa o tempo declarado em problemas pela área responsável", () => {
    const visao = consolidar(
      "v1",
      PERIODO,
      [bloco("PROBLEMA_OPERACIONAL", 60, "v1", "p1", 9), bloco("PROBLEMA_OPERACIONAL", 20, "v1", "p2", 14)],
      [
        problema({ id: "p1", areaResponsavel: "Financeiro" }),
        problema({ id: "p2", categoria: "LOGISTICA", areaResponsavel: "Logística" }),
      ],
      [],
      AGORA
    );
    expect(visao.tempoPorAreaDeclarado[0]).toEqual({ area: "Financeiro", segundos: 3600, percent: 75 });
    expect(visao.tempoPorAreaDeclarado[1].area).toBe("Logística");
  });

  it("ignora dados de outros vendedores e de fora do período", () => {
    const visao = consolidar(
      "v1",
      PERIODO,
      [bloco("COMERCIAL", 60, "v2")],
      [problema({ userId: "v2" }), problema({ criadoEm: "2025-12-30T09:00:00Z" })],
      [],
      AGORA
    );
    expect(visao.tempo.totalDeclarado.valor).toBe(0);
    expect(visao.problemasAbertos).toBe(0);
  });

  it("conta problemas abertos e resolvidos", () => {
    const visao = consolidar(
      "v1",
      PERIODO,
      [],
      [problema({ status: "RESOLVIDO" }), problema({ status: "AGUARDANDO_AREA" }), problema({ status: "CANCELADO" })],
      [],
      AGORA
    );
    expect(visao.problemasResolvidos).toBe(1);
    expect(visao.problemasAbertos).toBe(1); // cancelado não conta como aberto
  });
});

describe("estimarTempoRecuperavel", () => {
  it("é sempre ESTIMADO e explica o método", () => {
    const medida = estimarTempoRecuperavel(
      [problema({ id: "p1" })],
      [bloco("PROBLEMA_OPERACIONAL", 60, "v1", "p1")],
      [],
      AGORA
    );
    expect(medida.origem).toBe("ESTIMADO");
    expect(medida.base).toContain("70%");
    expect(medida.valor).toBe(Math.round(3600 * 0.7));
  });

  it("só considera áreas internas que o gerente pode destravar", () => {
    const medida = estimarTempoRecuperavel(
      [problema({ id: "p1", categoria: "COMERCIAL", areaResponsavel: "Comercial" })],
      [bloco("PROBLEMA_OPERACIONAL", 60, "v1", "p1")],
      [],
      AGORA
    );
    expect(medida.valor).toBe(0);
  });

  it("não transforma evento identificado em tempo recuperável", () => {
    const medida = estimarTempoRecuperavel(
      [problema({ id: "p1" })],
      [], // nenhum tempo declarado
      [evento({ problemaId: "p1", relevancia: "ALTA" })],
      AGORA
    );
    expect(medida.valor).toBe(0);
  });
});

describe("consolidarEquipe", () => {
  it("consolida a equipe preservando a visão individual", () => {
    const registros = [
      bloco("COMERCIAL", 120, "v1"),
      bloco("PROBLEMA_OPERACIONAL", 60, "v2", "p1", 10),
    ];
    const problemas = [problema({ id: "p1", userId: "v2" })];
    const equipe = consolidarEquipe(["v1", "v2"], PERIODO, registros, problemas, [], AGORA);

    expect(equipe.totalVendedores).toBe(2);
    expect(equipe.porVendedor).toHaveLength(2);
    expect(equipe.tempoEquipe.totalDeclarado.valor).toBe(180 * 60);
    expect(equipe.problemasAbertos).toBe(1);
    expect(equipe.tempoPotencialRecuperavel.origem).toBe("ESTIMADO");
  });
});
