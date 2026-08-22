/* Stub do @anthropic-ai/sdk para teste local.
 *
 * Nao chama a API de verdade -- o que precisa ser exercitado aqui e o
 * contador de uso e a recusa quando o teto e atingido, nao a qualidade do
 * texto. Devolve uma resposta no mesmo formato do esquema pedido em
 * duvida.mjs, e conta quantas vezes foi chamado, para o teste conferir que
 * o modelo NAO e chamado depois do limite.
 *
 * Reconhece a variavel FALHAR_IA=1 para simular erro da API.
 */

export const __chamadas = { total: 0, perguntas: [] };

export default class Anthropic {
  constructor(opcoes) {
    this.apiKey = opcoes && opcoes.apiKey;
    this.messages = {
      create: async (params) => {
        __chamadas.total += 1;
        const pergunta = String(params?.messages?.[0]?.content || '');
        __chamadas.perguntas.push(pergunta);

        if (process.env.FALHAR_IA === '1') {
          throw new Error('erro simulado da API');
        }

        // Quando a pergunta pede dado que o modelo nao tem, a instrucao manda
        // recusar. O stub imita isso para o teste conseguir verificar.
        const pedeDado = /prazo|frete|pre[cç]o|estoque|quanto custa|pagamento|prêmio|premio/i
          .test(pergunta);

        const corpo = pedeDado
          ? {
              por_tras: 'Ele quer um número que eu não tenho como saber.',
              fala: 'Não sei esse dado e não vou chutar. Confirme com o seu gestor antes de ' +
                    'responder ao cliente. Quando ele precisa do material na obra?',
              por_que: 'Número inventado dito ao cliente custa mais caro que uma resposta ' +
                       'incompleta.',
              cuidado: 'Vale sempre que a pergunta depender de preço, prazo, estoque ou ' +
                       'condição do mês.',
            }
          : {
              por_tras: 'Resposta simulada para teste.',
              fala: 'Entendo, e concordo com você. Me conta uma coisa: o que pesou mais ' +
                    'nessa decisão?',
              por_que: 'Concordar antes de argumentar desarma.',
              cuidado: '',
            };

        return {
          content: [{ type: 'text', text: JSON.stringify(corpo) }],
          stop_reason: 'end_turn',
        };
      },
    };
  }
}
