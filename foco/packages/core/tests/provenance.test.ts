import { describe, expect, it } from "vitest";
import { declarado, estimado, identificado, somarMesmaOrigem } from "../src/provenance";

describe("proveniência", () => {
  it("rotula a origem de cada medida", () => {
    expect(declarado(3600, "cronômetro").origem).toBe("DECLARADO");
    expect(identificado(7, "e-mails").origem).toBe("IDENTIFICADO");
    expect(estimado(1200, "inferência").origem).toBe("ESTIMADO");
  });

  it("soma medidas da mesma origem", () => {
    const soma = somarMesmaOrigem(
      [declarado(600, "bloco 1"), declarado(1200, "bloco 2")],
      "total declarado"
    );
    expect(soma.valor).toBe(1800);
    expect(soma.origem).toBe("DECLARADO");
  });

  it("RECUSA somar tempo declarado com estimativa — é o erro que o modelo existe para impedir", () => {
    expect(() =>
      somarMesmaOrigem([declarado(600, "cronômetro"), estimado(300, "inferido")], "total")
    ).toThrow(/origens diferentes/);
  });

  it("recusa somar tempo declarado com evento identificado", () => {
    expect(() =>
      somarMesmaOrigem([declarado(600, "cronômetro"), identificado(3, "e-mails")], "total")
    ).toThrow();
  });

  it("exige ao menos uma medida", () => {
    expect(() => somarMesmaOrigem([], "vazio")).toThrow();
  });
});
