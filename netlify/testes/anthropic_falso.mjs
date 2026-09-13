/* Stub do @anthropic-ai/sdk para teste local.
 *
 * Nao chama a API de verdade -- o que precisa ser exercitado aqui e o
 * contador de uso e a recusa quando o teto e atingido, nao a qualidade do
 * texto. Devolve uma resposta no formato do esquema PEDIDO (reconhecido
 * pelo nome de um campo obrigatorio do esquema, ja que duas funcoes diferentes
 * usam este mesmo stub — duvida.mjs e abordagem.mjs, cada uma com o proprio
 * formato), e conta quantas vezes foi chamado, para o teste conferir que o
 * modelo NAO e chamado depois do limite.
 *
 * Reconhece a variavel FALHAR_IA=1 para simular erro da API.
 */

export const __chamadas = { total: 0, perguntas: [] };

function corpoDuvida(pergunta) {
  // Quando a pergunta pede dado que o modelo nao tem, a instrucao manda
  // recusar. O stub imita isso para o teste conseguir verificar.
  const pedeDado = /prazo|frete|pre[cç]o|estoque|quanto custa|pagamento|prêmio|premio/i
    .test(pergunta);

  return pedeDado
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
}

function corpoAbordagem() {
  return {
    tipo_abordagem: 'fria',
    perfil_provavel: 'Integrador na região informada, sem histórico de compras conhecido.',
    hipotese_comercial: 'Resposta simulada para teste — hipótese de interesse.',
    abertura: 'Abertura simulada para teste. Vocês têm projeto em andamento agora?',
    pergunta: 'Hoje vocês compram direto de distribuidor ou trabalham com mais de um?',
    possiveis_respostas: [
      { resposta_cliente: 'Já tenho fornecedor.', resposta_vendedor: 'Resposta simulada A.' },
      { resposta_cliente: 'Manda o preço.', resposta_vendedor: 'Resposta simulada B.' },
    ],
    proximo_passo: 'Conseguir o telefone do comprador.',
    qualificacao: { temperatura: 'morno', potencial: 40, intencao: 30, urgencia: 20 },
    proxima_acao: {
      acao: 'Fazer follow-up', prazo: 'em 7 dias',
      objetivo: 'Confirmar se há projeto novo', mensagem: 'Mensagem simulada de follow-up.',
    },
  };
}

export default class Anthropic {
  constructor(opcoes) {
    this.apiKey = opcoes && opcoes.apiKey;
    this.messages = {
      create: async (params) => {
        __chamadas.total += 1;
        const conteudo = String(params?.messages?.[0]?.content || '');
        __chamadas.perguntas.push(conteudo);

        if (process.env.FALHAR_IA === '1') {
          throw new Error('erro simulado da API');
        }

        // As duas funcoes que usam este stub tem esquemas diferentes; o nome
        // de um campo obrigatorio do esquema pedido diz qual delas chamou.
        const campos = params?.output_config?.format?.schema?.required || [];
        const corpo = campos.includes('tipo_abordagem')
          ? corpoAbordagem()
          : corpoDuvida(conteudo);

        return {
          content: [{ type: 'text', text: JSON.stringify(corpo) }],
          stop_reason: 'end_turn',
        };
      },
    };
  }
}
