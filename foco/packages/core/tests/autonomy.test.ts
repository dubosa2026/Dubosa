import { describe, expect, it } from "vitest";
import {
  computeAutonomiaGeral,
  computeAutonomiaPorCliente,
  computeEvolucaoAutonomia,
} from "../src/autonomy";
import type { IntegratorAction } from "../src/types";

function acao(cliente: string, origem: "INTEGRADOR" | "VENDEDOR", criadoEm: string): IntegratorAction {
  return { id: crypto.randomUUID(), userId: "v1", cliente, tipo: "COTACAO", origem, criadoEm };
}

describe("computeAutonomiaGeral", () => {
  it("calcula o percentual do exemplo da especificação (38% -> depois 58%)", () => {
    const semana1: IntegratorAction[] = [
      ...Array.from({ length: 38 }, () => acao("Cliente X", "INTEGRADOR", "2026-01-05T10:00:00Z")),
      ...Array.from({ length: 62 }, () => acao("Cliente X", "VENDEDOR", "2026-01-05T10:00:00Z")),
    ];
    expect(computeAutonomiaGeral(semana1).percentAutonomia).toBe(38);
  });

  it("retorna 0% quando não há ações", () => {
    expect(computeAutonomiaGeral([]).percentAutonomia).toBe(0);
  });
});

describe("computeAutonomiaPorCliente", () => {
  it("identifica cliente PONTAL com baixa autonomia digital (2/10 pedidos, 1/14 cotações)", () => {
    const acoes: IntegratorAction[] = [
      ...Array.from({ length: 2 }, () => acao("PONTAL", "INTEGRADOR", "2026-01-01T10:00:00Z")),
      ...Array.from({ length: 8 }, () => acao("PONTAL", "VENDEDOR", "2026-01-01T10:00:00Z")),
      ...Array.from({ length: 1 }, () => acao("PONTAL", "INTEGRADOR", "2026-01-02T10:00:00Z")),
      ...Array.from({ length: 13 }, () => acao("PONTAL", "VENDEDOR", "2026-01-02T10:00:00Z")),
    ];
    const resultado = computeAutonomiaPorCliente(acoes);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].cliente).toBe("PONTAL");
    expect(resultado[0].baixaAutonomia).toBe(true);
    expect(resultado[0].sugestaoAbordagem).toBeDefined();
  });

  it("não marca baixa autonomia quando o cliente já tem boa adesão ao e-commerce", () => {
    const acoes: IntegratorAction[] = [
      ...Array.from({ length: 8 }, () => acao("Cliente Bom", "INTEGRADOR", "2026-01-01T10:00:00Z")),
      ...Array.from({ length: 2 }, () => acao("Cliente Bom", "VENDEDOR", "2026-01-01T10:00:00Z")),
    ];
    const [resultado] = computeAutonomiaPorCliente(acoes);
    expect(resultado.baixaAutonomia).toBe(false);
  });

  it("não avalia clientes com poucas ações (amostra insuficiente)", () => {
    const acoes: IntegratorAction[] = [acao("Cliente Novo", "VENDEDOR", "2026-01-01T10:00:00Z")];
    const [resultado] = computeAutonomiaPorCliente(acoes);
    expect(resultado.baixaAutonomia).toBe(false);
  });
});

describe("computeEvolucaoAutonomia", () => {
  it("agrupa por semana ISO e mostra evolução crescente", () => {
    const acoes: IntegratorAction[] = [
      acao("A", "INTEGRADOR", "2026-01-05T10:00:00Z"),
      acao("A", "VENDEDOR", "2026-01-05T10:00:00Z"),
      acao("A", "INTEGRADOR", "2026-01-12T10:00:00Z"),
      acao("A", "INTEGRADOR", "2026-01-12T10:00:00Z"),
    ];
    const evolucao = computeEvolucaoAutonomia(acoes);
    expect(evolucao).toHaveLength(2);
    expect(evolucao[0].percentAutonomia).toBeLessThan(evolucao[1].percentAutonomia);
  });
});
