import { describe, expect, it } from "vitest";
import {
  agruparRecorrentes,
  impactoNoVendedor,
  moverStatus,
  problemaEncerrado,
  tempoResolucaoSegundos,
  transicaoPermitida,
} from "../src/problems";
import type { EventoIdentificado, Problema, RegistroTempo } from "../src/types";

function problema(over: Partial<Problema> = {}): Problema {
  return {
    id: over.id ?? crypto.randomUUID(),
    protocolo: "#1",
    userId: "v1",
    cliente: "Cliente A",
    descricao: "Pedido não foi faturado",
    categoria: "FINANCEIRO",
    prioridade: "ALTA",
    areaResponsavel: "Financeiro",
    responsavel: null,
    status: "NOVO",
    origem: "REGISTRO_VENDEDOR",
    preso: false,
    pedidoAjuda: null,
    criadoEm: "2026-01-01T08:00:00Z",
    atualizadoEm: "2026-01-01T08:00:00Z",
    resolvidoEm: null,
    historico: [],
    ...over,
  };
}

describe("ciclo de vida do problema", () => {
  it("permite as transições do fluxo operacional", () => {
    expect(transicaoPermitida("NOVO", "ENCAMINHADO")).toBe(true);
    expect(transicaoPermitida("ENCAMINHADO", "AGUARDANDO_AREA")).toBe(true);
    expect(transicaoPermitida("AGUARDANDO_AREA", "RESOLVIDO")).toBe(true);
  });

  it("recusa transições que pulam o fluxo", () => {
    expect(transicaoPermitida("NOVO", "RESOLVIDO")).toBe(false);
    expect(transicaoPermitida("CANCELADO", "EM_ANALISE")).toBe(false);
  });

  it("permite reabrir um problema resolvido — problemas operacionais voltam", () => {
    expect(transicaoPermitida("RESOLVIDO", "EM_ANALISE")).toBe(true);
  });

  it("registra cada movimentação no histórico", () => {
    const p = problema();
    const movido = moverStatus(p, "EM_ANALISE", "gerente", "assumido", new Date("2026-01-01T09:00:00Z"));
    expect(movido.status).toBe("EM_ANALISE");
    expect(movido.historico).toHaveLength(1);
    expect(movido.historico[0].por).toBe("gerente");
    expect(movido.historico[0].nota).toBe("assumido");
  });

  it("não muta o problema original", () => {
    const p = problema();
    moverStatus(p, "EM_ANALISE", "gerente");
    expect(p.status).toBe("NOVO");
    expect(p.historico).toHaveLength(0);
  });

  it("lança em transição inválida", () => {
    expect(() => moverStatus(problema(), "RESOLVIDO", "gerente")).toThrow(/Transição inválida/);
  });

  it("marca resolvidoEm ao resolver e calcula o tempo de resolução", () => {
    const p = moverStatus(problema(), "EM_ANALISE", "gerente", undefined, new Date("2026-01-01T08:30:00Z"));
    const resolvido = moverStatus(p, "RESOLVIDO", "financeiro", undefined, new Date("2026-01-01T10:00:00Z"));
    expect(resolvido.resolvidoEm).toBe("2026-01-01T10:00:00.000Z");
    expect(tempoResolucaoSegundos(resolvido)).toBe(2 * 3600);
  });

  it("considera resolvido e cancelado como encerrados", () => {
    expect(problemaEncerrado(problema({ status: "RESOLVIDO" }))).toBe(true);
    expect(problemaEncerrado(problema({ status: "CANCELADO" }))).toBe(true);
    expect(problemaEncerrado(problema({ status: "AGUARDANDO_AREA" }))).toBe(false);
  });
});

describe("impactoNoVendedor", () => {
  const p = problema({ id: "p1" });

  it("usa tempo DECLARADO quando existem blocos de cronômetro", () => {
    const registros: RegistroTempo[] = [
      {
        id: "r1",
        userId: "v1",
        categoria: "PROBLEMA_OPERACIONAL",
        inicio: "2026-01-01T08:00:00Z",
        fim: "2026-01-01T08:45:00Z",
        problemaId: "p1",
      },
    ];
    const impacto = impactoNoVendedor(p, registros);
    expect(impacto.origem).toBe("DECLARADO");
    expect(impacto.valor).toBe(45 * 60);
  });

  it("cai para ESTIMADO quando só há eventos identificados", () => {
    const eventos: EventoIdentificado[] = [
      {
        id: "e1", userId: "v1", fonte: "EMAIL", ocorridoEm: "2026-01-01T08:00:00Z",
        assunto: "Faturamento", categoria: "FINANCEIRO", relevancia: "ALTA", problemaId: "p1",
      },
    ];
    const impacto = impactoNoVendedor(p, [], eventos);
    expect(impacto.origem).toBe("ESTIMADO");
    expect(impacto.valor).toBe(12 * 60);
    expect(impacto.base).toContain("sem tempo declarado");
  });

  it("ignora eventos marcados como IGNORAR", () => {
    const eventos: EventoIdentificado[] = [
      {
        id: "e1", userId: "v1", fonte: "EMAIL", ocorridoEm: "2026-01-01T08:00:00Z",
        assunto: "Newsletter", categoria: "OUTROS", relevancia: "IGNORAR", problemaId: "p1",
      },
    ];
    expect(impactoNoVendedor(p, [], eventos).valor).toBe(0);
  });

  it("nunca soma tempo declarado com estimativa — declarado vence", () => {
    const registros: RegistroTempo[] = [
      {
        id: "r1", userId: "v1", categoria: "PROBLEMA_OPERACIONAL",
        inicio: "2026-01-01T08:00:00Z", fim: "2026-01-01T08:30:00Z", problemaId: "p1",
      },
    ];
    const eventos: EventoIdentificado[] = [
      {
        id: "e1", userId: "v1", fonte: "EMAIL", ocorridoEm: "2026-01-01T08:00:00Z",
        assunto: "Faturamento", categoria: "FINANCEIRO", relevancia: "ALTA", problemaId: "p1",
      },
    ];
    const impacto = impactoNoVendedor(p, registros, eventos);
    expect(impacto.origem).toBe("DECLARADO");
    expect(impacto.valor).toBe(30 * 60); // só o declarado, sem os 12min do evento
  });
});

describe("agruparRecorrentes", () => {
  it("agrupa chamados da mesma categoria que compartilham vocabulário", () => {
    const problemas = [
      problema({ id: "1", descricao: "Pedido faturado e boleto não chegou para o cliente", userId: "v1" }),
      problema({ id: "2", descricao: "Cliente cobrando boleto do pedido faturado ontem", userId: "v2" }),
      problema({ id: "3", descricao: "Boleto do pedido faturado segue pendente", userId: "v3" }),
    ];
    const grupos = agruparRecorrentes(problemas, 2);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].ocorrencias).toBe(3);
    expect(grupos[0].vendedoresImpactados).toBe(3);
    expect(grupos[0].termosComuns).toContain("boleto");
  });

  it("respeita o mínimo de ocorrências", () => {
    expect(agruparRecorrentes([problema()], 2)).toHaveLength(0);
  });
});
