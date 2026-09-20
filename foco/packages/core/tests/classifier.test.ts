import { describe, expect, it } from "vitest";
import { ClassificadorPorRegras, TriadorPorRegras } from "../src/classifier";

describe("ClassificadorPorRegras", () => {
  const c = new ClassificadorPorRegras();

  it("classifica faturamento como Financeiro", () => {
    const r = c.classificar("Cliente está reclamando que o pedido ainda não foi faturado.");
    expect(r.categoria).toBe("FINANCEIRO");
    expect(r.areaResponsavel).toBe("Financeiro");
    expect(r.prioridade).toBe("ALTA");
  });

  it("classifica atraso de entrega como Logística", () => {
    expect(c.classificar("O pedido está atrasado, transportadora sem previsão.").categoria).toBe("LOGISTICA");
  });

  it("classifica limite bloqueado como Crédito", () => {
    expect(c.classificar("Cliente com limite de crédito bloqueado.").categoria).toBe("CREDITO");
  });

  it("classifica ICMS como Fiscal", () => {
    expect(c.classificar("Problema no cálculo do ICMS, preciso de ajuste fiscal.").categoria).toBe("FISCAL");
  });

  it("eleva para URGENTE quando há sinal explícito", () => {
    expect(c.classificar("Urgente: cliente ameaçando cancelar o pedido.").prioridade).toBe("URGENTE");
  });

  it("cai em OUTROS sem palavra-chave reconhecida", () => {
    expect(c.classificar("situação nova sem precedente algum aqui").categoria).toBe("OUTROS");
  });

  it("é indiferente a acento e caixa", () => {
    expect(c.classificar("PEDIDO ATRASADO NA TRANSPORTADORA").categoria).toBe("LOGISTICA");
  });
});

describe("TriadorPorRegras", () => {
  const t = new TriadorPorRegras();

  it("descarta newsletter — não é interrupção de trabalho", () => {
    expect(t.triar("Newsletter Setembro — novidades", "marketing@fornecedor.com").relevancia).toBe("IGNORAR");
  });

  it("descarta remetente automático", () => {
    expect(t.triar("Confirmação", "no-reply@sistema.com").relevancia).toBe("IGNORAR");
  });

  it("rebaixa cópia sem ação esperada", () => {
    expect(t.triar("Você está em cópia: alteração cadastral").relevancia).toBe("BAIXA");
  });

  it("marca cobrança do financeiro como alta relevância", () => {
    const r = t.triar("Pendência de faturamento — cliente reclamando", "financeiro@empresa.com.br");
    expect(r.categoria).toBe("FINANCEIRO");
    expect(r.relevancia).toBe("ALTA");
  });

  it("dá baixa relevância a assunto não reconhecido", () => {
    expect(t.triar("Almoço de sexta").relevancia).toBe("BAIXA");
  });
});
