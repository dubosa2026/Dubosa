import { describe, expect, it } from "vitest";
import { RuleBasedProblemClassifier } from "../src/classifier";

describe("RuleBasedProblemClassifier", () => {
  const classifier = new RuleBasedProblemClassifier();

  it("classifica problema de faturamento como Financeiro", () => {
    const resultado = classifier.classify("Cliente está reclamando que o pedido ainda não foi faturado.");
    expect(resultado.categoria).toBe("FINANCEIRO");
    expect(resultado.areaResponsavel).toBe("Financeiro");
    expect(resultado.prioridade).toBe("ALTA"); // "reclamando" eleva a prioridade
  });

  it("classifica atraso de entrega como Logística", () => {
    const resultado = classifier.classify("O pedido está atrasado, a transportadora não passa previsão de entrega.");
    expect(resultado.categoria).toBe("LOGISTICA");
    expect(resultado.areaResponsavel).toBe("Logística");
  });

  it("classifica bloqueio de limite como Crédito", () => {
    const resultado = classifier.classify("Cliente com limite de crédito bloqueado, não consegue fechar o pedido.");
    expect(resultado.categoria).toBe("CREDITO");
  });

  it("classifica pedido de desconto como Comercial", () => {
    const resultado = classifier.classify("Cliente quer negociar desconto por volume para fechar hoje.");
    expect(resultado.categoria).toBe("COMERCIAL");
    expect(resultado.areaResponsavel).toContain("vendedor");
  });

  it("eleva a prioridade para URGENTE quando há sinal de urgência explícita", () => {
    const resultado = classifier.classify("Urgente: cliente ameaçando cancelar o pedido hoje.");
    expect(resultado.prioridade).toBe("URGENTE");
  });

  it("cai em OUTROS quando não reconhece nenhuma palavra-chave", () => {
    const resultado = classifier.classify("xyz abc situação nova sem precedentes");
    expect(resultado.categoria).toBe("OUTROS");
  });

  it("é resiliente a acentuação e caixa (case-insensitive)", () => {
    const resultado = classifier.classify("PROBLEMA NO CÁLCULO DO ÍCMS, PRECISO DE AJUSTE FISCAL URGENTE");
    expect(resultado.categoria).toBe("FISCAL");
  });
});
