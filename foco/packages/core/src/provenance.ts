/**
 * PROVENIÊNCIA — a correção fundamental da lógica de medição do FOCO.
 *
 * O FOCO nunca deve apresentar um número sem dizer de onde ele veio. Um
 * cronômetro que ficou 4 horas em "Comercial" produz «4h declaradas como
 * Comercial», e não «4h comprovadamente produtivas». Essa distinção não é
 * cosmética: ela é o que separa uma ferramenta de gestão de uma ferramenta
 * de vigilância, e é o que permite ao gerente confiar no painel.
 *
 * As três origens nunca se somam nem se misturam sem rótulo.
 */

export type Origem =
  /** Informado pelo vendedor através do cronômetro. É autodeclaração. */
  | "DECLARADO"
  /** Obtido automaticamente de uma integração autorizada (e-mail, WhatsApp corporativo). */
  | "IDENTIFICADO"
  /** Inferência do sistema. Nunca é fato: é hipótese sustentada por evidências. */
  | "ESTIMADO";

export const ROTULO_ORIGEM: Record<Origem, string> = {
  DECLARADO: "declarado",
  IDENTIFICADO: "identificado",
  ESTIMADO: "estimativa",
};

/**
 * Qualquer número que o FOCO mostre ao gerente. Carrega a origem e a base
 * que o sustenta, para a interface poder rotular sem adivinhar.
 */
export interface Medida<T = number> {
  valor: T;
  origem: Origem;
  /** Em uma frase: o que sustenta este número. Obrigatório para estimativas. */
  base: string;
}

export function declarado<T>(valor: T, base: string): Medida<T> {
  return { valor, origem: "DECLARADO", base };
}

export function identificado<T>(valor: T, base: string): Medida<T> {
  return { valor, origem: "IDENTIFICADO", base };
}

export function estimado<T>(valor: T, base: string): Medida<T> {
  return { valor, origem: "ESTIMADO", base };
}

/**
 * Soma medidas apenas quando compartilham a mesma origem. Tentar somar
 * tempo declarado com tempo estimado é exatamente o erro que esta
 * refatoração existe para impedir, então isso lança em vez de silenciar.
 */
export function somarMesmaOrigem(medidas: Array<Medida<number>>, base: string): Medida<number> {
  if (medidas.length === 0) {
    throw new Error("somarMesmaOrigem precisa de ao menos uma medida.");
  }
  const origem = medidas[0].origem;
  const divergente = medidas.find((m) => m.origem !== origem);
  if (divergente) {
    throw new Error(
      `Não é possível somar medidas de origens diferentes (${origem} + ${divergente.origem}). ` +
        `O FOCO nunca mistura tempo declarado, evento identificado e estimativa no mesmo número.`
    );
  }
  return { valor: medidas.reduce((acc, m) => acc + m.valor, 0), origem, base };
}
