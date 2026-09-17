import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

/**
 * Reescreve uma resposta estruturada (já calculada sobre dados reais) em
 * linguagem mais natural, SEM introduzir números novos — o prompt instrui
 * explicitamente o modelo a não adicionar nenhum dado que não esteja no
 * JSON fornecido. Se não houver ANTHROPIC_API_KEY configurada, retorna a
 * resposta estruturada original sem chamar nenhuma API externa.
 */
export async function polishAnswer(structuredAnswer: string, dataUsed: unknown): Promise<string> {
  if (!client) return structuredAnswer;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 400,
      system:
        "Você é o Copiloto Gerencial de Vendas. Reescreva a resposta abaixo de forma clara e natural em português, " +
        "em no máximo 3 frases. NUNCA adicione números, nomes ou fatos que não estejam no texto original ou no JSON " +
        "de dados fornecido. Se a resposta original já disser que faltam dados, mantenha essa limitação explícita.",
      messages: [
        {
          role: "user",
          content: `Resposta original: ${structuredAnswer}\n\nDados usados (JSON): ${JSON.stringify(dataUsed)}`,
        },
      ],
    });
    const text = message.content.find((c) => c.type === "text");
    return text && "text" in text ? text.text : structuredAnswer;
  } catch {
    // Falha na chamada externa nunca deve quebrar a resposta baseada em dados.
    return structuredAnswer;
  }
}
