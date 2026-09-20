import {
  AREA_RESPONSAVEL_POR_CATEGORIA,
  type ClassificationResult,
  type Priority,
  type ProblemCategory,
  type ProblemClassifier,
} from "./types";

/**
 * Classificador baseado em regras/palavras-chave. É o padrão da V1: funciona
 * 100% offline, sem depender de nenhum serviço externo, e já entrega o
 * comportamento pedido na especificação (classificar categoria, prioridade
 * e área responsável, gerando texto amigável ao vendedor).
 *
 * Implementa a mesma interface `ProblemClassifier` que uma IA real (ex.: um
 * classificador via API da Anthropic) implementaria — ver `AnthropicProblemClassifier`
 * mais abaixo. Trocar a estratégia usada pelo app é uma questão de injeção de
 * dependência, sem tocar no restante do sistema.
 */
const PALAVRAS_CHAVE: Array<{ categoria: ProblemCategory; palavras: string[] }> = [
  {
    categoria: "FINANCEIRO",
    palavras: [
      "faturado",
      "faturamento",
      "boleto",
      "nota fiscal",
      "cobranca",
      "cobrança",
      "pagamento",
      "financeiro",
      "duplicata",
      "fatura",
    ],
  },
  {
    categoria: "LOGISTICA",
    palavras: [
      "atrasad",
      "entrega",
      "transportadora",
      "frete",
      "coleta",
      "prazo de entrega",
      "rastreio",
      "rastreamento",
      "logistica",
      "logística",
      "expedicao",
      "expedição",
    ],
  },
  {
    categoria: "CREDITO",
    palavras: ["credito", "crédito", "limite", "bloqueado", "análise de crédito", "analise de credito"],
  },
  {
    categoria: "FISCAL",
    palavras: ["imposto", "icms", "fiscal", "tributo", "nf-e", "nfe", "substituicao tributaria", "substituição tributária"],
  },
  {
    categoria: "CADASTRO",
    palavras: ["cadastro", "cnpj", "dados cadastrais", "atualizar cadastro", "endereco de entrega", "endereço de entrega"],
  },
  {
    categoria: "PRODUTO",
    palavras: ["defeito", "avaria", "produto errado", "garantia", "não funciona", "nao funciona", "quebrado"],
  },
  {
    categoria: "COMERCIAL",
    palavras: [
      "desconto",
      "condicao comercial",
      "condição comercial",
      "negociar",
      "negociação",
      "preco especial",
      "preço especial",
      "renovacao",
      "renovação",
      "proposta",
    ],
  },
];

const PALAVRAS_URGENTE = ["urgente", "hoje", "parou a obra", "cliente ameacando", "cliente ameaçando", "cancelar"];
const PALAVRAS_ALTA = ["reclamando", "atrasad", "bloqueado", "sem previsao", "sem previsão", "perdendo o cliente"];

function normaliza(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function detectaCategoria(descricaoNormalizada: string): ProblemCategory {
  for (const { categoria, palavras } of PALAVRAS_CHAVE) {
    if (palavras.some((p) => descricaoNormalizada.includes(normaliza(p)))) {
      return categoria;
    }
  }
  return "OUTROS";
}

function detectaPrioridade(descricaoNormalizada: string): Priority {
  if (PALAVRAS_URGENTE.some((p) => descricaoNormalizada.includes(normaliza(p)))) return "URGENTE";
  if (PALAVRAS_ALTA.some((p) => descricaoNormalizada.includes(normaliza(p)))) return "ALTA";
  if (descricaoNormalizada.length < 25) return "BAIXA";
  return "MEDIA";
}

function resumo(categoria: ProblemCategory, prioridade: Priority, cliente: string): string {
  return `${cliente}: problema classificado como ${categoria.toLowerCase()} (prioridade ${prioridade.toLowerCase()}).`;
}

export class RuleBasedProblemClassifier implements ProblemClassifier {
  classify(descricao: string): ClassificationResult {
    const normalizada = normaliza(descricao);
    const categoria = detectaCategoria(normalizada);
    const prioridade = detectaPrioridade(normalizada);
    const areaResponsavel = AREA_RESPONSAVEL_POR_CATEGORIA[categoria];
    return {
      categoria,
      prioridade,
      areaResponsavel,
      resumo: resumo(categoria, prioridade, "Cliente"),
    };
  }
}

/**
 * Estratégia opcional que usa a API da Anthropic para classificar o problema
 * com um modelo de linguagem, quando `ANTHROPIC_API_KEY` estiver configurada.
 * Mantém exatamente a mesma interface do classificador por regras, então o
 * app pode alternar entre as duas sem qualquer outra mudança — e cai de volta
 * para o classificador por regras se a chamada falhar (rede indisponível,
 * chave ausente etc.), garantindo que o vendedor nunca fique bloqueado.
 */
export class AnthropicProblemClassifier implements ProblemClassifier {
  private fallback = new RuleBasedProblemClassifier();

  constructor(
    private readonly apiKey: string,
    private readonly model = "claude-sonnet-5"
  ) {}

  async classify(descricao: string): Promise<ClassificationResult> {
    try {
      const categorias = Object.keys(AREA_RESPONSAVEL_POR_CATEGORIA).join(", ");
      const resposta = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 300,
          system:
            "Você classifica problemas relatados por vendedores de uma distribuidora B2B. " +
            `Responda SOMENTE com um JSON: {"categoria": uma de [${categorias}], ` +
            '"prioridade": uma de [BAIXA, MEDIA, ALTA, URGENTE], "resumo": string curta}.',
          messages: [{ role: "user", content: descricao }],
        }),
      });
      if (!resposta.ok) throw new Error(`Anthropic API respondeu ${resposta.status}`);
      const dados = (await resposta.json()) as { content: Array<{ text?: string }> };
      const texto = dados.content?.[0]?.text ?? "";
      const parsed = JSON.parse(texto) as { categoria: ProblemCategory; prioridade: Priority; resumo: string };
      return {
        categoria: parsed.categoria,
        prioridade: parsed.prioridade,
        areaResponsavel: AREA_RESPONSAVEL_POR_CATEGORIA[parsed.categoria] ?? "Outros",
        resumo: parsed.resumo,
      };
    } catch {
      return this.fallback.classify(descricao);
    }
  }
}

/** Fábrica: usa IA (Anthropic) se houver chave configurada, senão regras locais. */
export function createDefaultClassifier(apiKey?: string): ProblemClassifier {
  if (apiKey && apiKey.trim().length > 0) {
    return new AnthropicProblemClassifier(apiKey);
  }
  return new RuleBasedProblemClassifier();
}
