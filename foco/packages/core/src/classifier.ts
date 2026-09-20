import {
  AREA_RESPONSAVEL_POR_CATEGORIA,
  type CategoriaProblema,
  type ClassificadorEvento,
  type ClassificadorProblema,
  type Prioridade,
  type Relevancia,
  type ResultadoClassificacao,
  type ResultadoRelevancia,
} from "./types";

/**
 * Classificação por regras/palavras-chave — o padrão da V1: funciona
 * offline, é determinístico e testável. A mesma interface é implementada
 * por um classificador via modelo de linguagem (mais abaixo), então trocar
 * a estratégia é injeção de dependência, sem tocar no resto do sistema.
 */
const PALAVRAS_CHAVE: Array<{ categoria: CategoriaProblema; palavras: string[] }> = [
  {
    categoria: "FINANCEIRO",
    palavras: [
      "faturado", "faturamento", "boleto", "cobranca", "cobrança", "pagamento",
      "financeiro", "duplicata", "fatura", "reembolso", "estorno",
    ],
  },
  {
    categoria: "LOGISTICA",
    palavras: [
      "atrasad", "entrega", "transportadora", "frete", "coleta", "prazo de entrega",
      "rastreio", "rastreamento", "logistica", "logística", "expedicao", "expedição", "extravio",
    ],
  },
  {
    categoria: "CREDITO",
    palavras: ["credito", "crédito", "limite", "bloqueado", "análise de crédito", "analise de credito", "serasa"],
  },
  {
    categoria: "FISCAL",
    palavras: ["imposto", "icms", "fiscal", "tributo", "nf-e", "nfe", "substituicao tributaria", "substituição tributária", "cfop"],
  },
  {
    categoria: "CADASTRO",
    palavras: ["cadastro", "cnpj", "dados cadastrais", "atualizar cadastro", "endereco de entrega", "endereço de entrega", "inscricao estadual", "inscrição estadual"],
  },
  {
    categoria: "PRODUTO",
    palavras: ["defeito", "avaria", "produto errado", "garantia", "não funciona", "nao funciona", "quebrado", "assistencia tecnica", "assistência técnica"],
  },
  {
    categoria: "COMERCIAL",
    palavras: ["desconto", "condicao comercial", "condição comercial", "negociar", "negociação", "preco especial", "preço especial", "proposta"],
  },
];

const PALAVRAS_URGENTE = ["urgente", "parou a obra", "cliente ameacando", "cliente ameaçando", "cancelar o pedido", "cancelamento"];
const PALAVRAS_ALTA = ["reclamando", "atrasad", "bloqueado", "sem previsao", "sem previsão", "perdendo o cliente", "parado"];

/** Assuntos que não representam interrupção de trabalho e não podem entrar na conta. */
const PADROES_IGNORAR = [
  "newsletter", "unsubscribe", "descadastrar", "promocao", "promoção", "marketing",
  "no-reply", "noreply", "nao responda", "não responda", "spam", "webinar", "convite para evento",
];

/** Sinais de que a pessoa está apenas em cópia, sem ação esperada. */
const PADROES_BAIXA = ["em copia", "em cópia", "fyi", "para conhecimento", "confirmacao automatica", "confirmação automática", "relatorio automatico", "relatório automático"];

function normaliza(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function detectaCategoria(textoNormalizado: string): CategoriaProblema {
  for (const { categoria, palavras } of PALAVRAS_CHAVE) {
    if (palavras.some((p) => textoNormalizado.includes(normaliza(p)))) return categoria;
  }
  return "OUTROS";
}

function detectaPrioridade(textoNormalizado: string): Prioridade {
  if (PALAVRAS_URGENTE.some((p) => textoNormalizado.includes(normaliza(p)))) return "URGENTE";
  if (PALAVRAS_ALTA.some((p) => textoNormalizado.includes(normaliza(p)))) return "ALTA";
  if (textoNormalizado.length < 25) return "BAIXA";
  return "MEDIA";
}

export class ClassificadorPorRegras implements ClassificadorProblema {
  classificar(descricao: string): ResultadoClassificacao {
    const texto = normaliza(descricao);
    const categoria = detectaCategoria(texto);
    const prioridade = detectaPrioridade(texto);
    return {
      categoria,
      prioridade,
      areaResponsavel: AREA_RESPONSAVEL_POR_CATEGORIA[categoria],
      resumo: `Classificado como ${categoria.toLowerCase()}, prioridade ${prioridade.toLowerCase()}.`,
    };
  }
}

/**
 * Triagem de eventos de e-mail e WhatsApp corporativo. Existe para impedir
 * que o motor de evidências trate toda mensagem como interrupção: uma
 * newsletter é ruído, uma cópia sem ação é baixa relevância, e só o que
 * realmente demanda o vendedor conta como evento operacional.
 */
export class TriadorPorRegras implements ClassificadorEvento {
  triar(assunto: string, remetente?: string): ResultadoRelevancia {
    const texto = normaliza(`${assunto} ${remetente ?? ""}`);

    if (PADROES_IGNORAR.some((p) => texto.includes(normaliza(p)))) {
      return { categoria: "OUTROS", relevancia: "IGNORAR", motivo: "Newsletter, automático ou marketing." };
    }

    const categoria = detectaCategoria(texto);

    if (PADROES_BAIXA.some((p) => texto.includes(normaliza(p)))) {
      return { categoria, relevancia: "BAIXA", motivo: "Cópia ou aviso automático, sem ação esperada." };
    }
    if (categoria === "OUTROS") {
      return { categoria, relevancia: "BAIXA", motivo: "Assunto não reconhecido como problema operacional." };
    }

    const prioridade = detectaPrioridade(texto);
    const relevancia: Relevancia = prioridade === "URGENTE" || prioridade === "ALTA" ? "ALTA" : "MEDIA";
    return {
      categoria,
      relevancia,
      motivo: `Assunto relacionado a ${AREA_RESPONSAVEL_POR_CATEGORIA[categoria]}.`,
    };
  }
}

/**
 * Classificação por modelo de linguagem, usada quando houver chave
 * configurada. Cai de volta para as regras em qualquer falha — o vendedor
 * nunca fica bloqueado esperando uma API responder.
 */
export class ClassificadorIA implements ClassificadorProblema {
  private fallback = new ClassificadorPorRegras();

  constructor(
    private readonly apiKey: string,
    private readonly model = "claude-sonnet-5"
  ) {}

  async classificar(descricao: string): Promise<ResultadoClassificacao> {
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
            "Você classifica problemas operacionais relatados por vendedores de uma distribuidora B2B. " +
            `Responda SOMENTE com JSON: {"categoria": uma de [${categorias}], ` +
            '"prioridade": uma de [BAIXA, MEDIA, ALTA, URGENTE], "resumo": string curta em português}.',
          messages: [{ role: "user", content: descricao }],
        }),
      });
      if (!resposta.ok) throw new Error(`API respondeu ${resposta.status}`);
      const dados = (await resposta.json()) as { content: Array<{ text?: string }> };
      const parsed = JSON.parse(dados.content?.[0]?.text ?? "") as {
        categoria: CategoriaProblema;
        prioridade: Prioridade;
        resumo: string;
      };
      return {
        categoria: parsed.categoria,
        prioridade: parsed.prioridade,
        areaResponsavel: AREA_RESPONSAVEL_POR_CATEGORIA[parsed.categoria] ?? "Outros",
        resumo: parsed.resumo,
      };
    } catch {
      return this.fallback.classificar(descricao);
    }
  }
}

export function criarClassificadorPadrao(apiKey?: string): ClassificadorProblema {
  if (apiKey && apiKey.trim().length > 0) return new ClassificadorIA(apiKey);
  return new ClassificadorPorRegras();
}
