import { describe, expect, it } from "vitest";
import {
  contarInterrupcoes,
  formatDuracao,
  resumirTempoDeclarado,
} from "../src/timeTracking";
import type { CategoriaTempo, RegistroTempo } from "../src/types";

function bloco(categoria: CategoriaTempo, inicioISO: string, minutos: number): RegistroTempo {
  const inicio = new Date(inicioISO);
  return {
    id: crypto.randomUUID(),
    userId: "v1",
    categoria,
    inicio: inicio.toISOString(),
    fim: new Date(inicio.getTime() + minutos * 60_000).toISOString(),
  };
}

describe("resumirTempoDeclarado", () => {
  it("devolve todos os totais marcados como DECLARADO, nunca como fato", () => {
    const resumo = resumirTempoDeclarado([bloco("COMERCIAL", "2026-01-01T08:00:00Z", 240)]);
    expect(resumo.totalDeclarado.origem).toBe("DECLARADO");
    expect(resumo.comercialDeclarado.origem).toBe("DECLARADO");
    expect(resumo.operacionalDeclarado.origem).toBe("DECLARADO");
    expect(resumo.comercialDeclarado.base).toContain("declarados");
  });

  it("soma comercial como Comercial + Atendimento a cliente", () => {
    const resumo = resumirTempoDeclarado([
      bloco("COMERCIAL", "2026-01-01T08:00:00Z", 120),
      bloco("ATENDIMENTO", "2026-01-01T10:00:00Z", 60),
      bloco("REUNIAO", "2026-01-01T11:00:00Z", 30),
    ]);
    expect(resumo.comercialDeclarado.valor).toBe(180 * 60);
  });

  it("soma operacional como Problema operacional + Administrativo", () => {
    const resumo = resumirTempoDeclarado([
      bloco("PROBLEMA_OPERACIONAL", "2026-01-01T08:00:00Z", 45),
      bloco("ADMINISTRATIVO", "2026-01-01T09:00:00Z", 15),
      bloco("COMERCIAL", "2026-01-01T10:00:00Z", 60),
    ]);
    expect(resumo.operacionalDeclarado.valor).toBe(60 * 60);
  });

  it("não conta PAUSA na base do percentual — o FOCO não cobra pausa de ninguém", () => {
    const semPausa = resumirTempoDeclarado([bloco("COMERCIAL", "2026-01-01T08:00:00Z", 120)]);
    const comPausa = resumirTempoDeclarado([
      bloco("COMERCIAL", "2026-01-01T08:00:00Z", 120),
      bloco("PAUSA", "2026-01-01T12:00:00Z", 60),
    ]);
    expect(semPausa.percentComercialDeclarado).toBe(100);
    expect(comPausa.percentComercialDeclarado).toBe(100);
  });

  it("calcula o percentual comercial sobre o tempo de trabalho declarado", () => {
    const resumo = resumirTempoDeclarado([
      bloco("COMERCIAL", "2026-01-01T08:00:00Z", 180),
      bloco("PROBLEMA_OPERACIONAL", "2026-01-01T11:00:00Z", 60),
    ]);
    expect(resumo.percentComercialDeclarado).toBe(75);
  });

  it("conta um bloco em andamento até agora", () => {
    const emAndamento: RegistroTempo = {
      id: "1",
      userId: "v1",
      categoria: "COMERCIAL",
      inicio: "2026-01-01T08:00:00Z",
      fim: null,
    };
    const resumo = resumirTempoDeclarado([emAndamento], new Date("2026-01-01T08:30:00Z"));
    expect(resumo.totalDeclarado.valor).toBe(30 * 60);
  });

  it("devolve 0% sem nenhum registro", () => {
    expect(resumirTempoDeclarado([]).percentComercialDeclarado).toBe(0);
  });
});

describe("contarInterrupcoes", () => {
  it("conta trocas de comercial para operacional", () => {
    const registros = [
      bloco("COMERCIAL", "2026-01-01T08:00:00Z", 60),
      bloco("PROBLEMA_OPERACIONAL", "2026-01-01T09:00:00Z", 30),
      bloco("COMERCIAL", "2026-01-01T09:30:00Z", 60),
      bloco("PROBLEMA_OPERACIONAL", "2026-01-01T10:30:00Z", 20),
    ];
    expect(contarInterrupcoes(registros)).toBe(2);
  });

  it("não conta ida para pausa como interrupção", () => {
    const registros = [
      bloco("COMERCIAL", "2026-01-01T08:00:00Z", 60),
      bloco("PAUSA", "2026-01-01T12:00:00Z", 60),
    ];
    expect(contarInterrupcoes(registros)).toBe(0);
  });
});

describe("formatDuracao", () => {
  it("formata horas e minutos", () => {
    expect(formatDuracao(3 * 3600 + 42 * 60)).toBe("3h42");
    expect(formatDuracao(50 * 60)).toBe("50min");
    expect(formatDuracao(2 * 3600)).toBe("2h");
  });
});
