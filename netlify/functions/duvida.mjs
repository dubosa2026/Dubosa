/* POST /api/duvida
 *
 * O campo "pergunte a IA", para a objecao que nao esta entre as 17.
 *
 * Duas coisas mandam neste arquivo.
 *
 * 1. O ORCAMENTO. Todo teto e verificado aqui, ANTES de chamar o modelo, e a
 *    contagem sobe com escrita condicional -- cinquenta disparos ao mesmo
 *    tempo viram cinquenta tentativas de gravar, e so uma passa por vez. O
 *    contador da tela e enfeite; quem decide e este arquivo. O dia vem do
 *    relogio do servidor, e a conta e presa ao NOME do vendedor, nao ao
 *    token: trocar de link nao devolve perguntas.
 *
 * 2. NAO INVENTAR. O modelo nao conhece o frete, o prazo, o estoque, a
 *    condicao do mes nem o nome do premio. A instrucao manda recusar esses
 *    numeros e devolver a pergunta ao gestor. Uma resposta incompleta custa
 *    menos que um numero errado dito ao cliente.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  lojaUso, vendedorDoToken, diaDeHoje, somarUso, lerUso, json,
} from '../lib/loja.mjs';

export const config = { path: '/api/duvida' };

/* Tetos. Os tres primeiros saem de variaveis de ambiente do site, entao
   apertar ou afrouxar o gasto e mexer numa configuracao do Netlify -- sem
   editar codigo e sem novo deploy do app. Os valores abaixo sao o padrao. */
function teto(nome, padrao) {
  const v = parseInt(process.env[nome] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : padrao;
}
const POR_VENDEDOR_DIA = teto('IA_POR_VENDEDOR_DIA', 20);
const GLOBAL_DIA = teto('IA_GLOBAL_DIA', 200);
const POR_MINUTO = teto('IA_POR_MINUTO', 5);
const MAX_PERGUNTA = 600;   // caracteres
const MAX_RESPOSTA = 700;   // tokens de saida

const MODELO = 'claude-haiku-4-5';

const INSTRUCAO = `Você ajuda vendedores da BelEnergy, distribuidora de energia solar, a responder objeções ao telefone.

Contexto fixo da operação:
- A equipe fica em São Paulo e vende para integradores do Norte do Brasil.
- O frete é maior que o de concorrentes com centro de distribuição na região, e isso é verdade — nunca negue.
- A política da empresa nunca foi ter o menor preço. Ela ganha em estoque, variedade, financiamento, atendimento, pós-venda e estrutura de fixação bem avaliada.
- A força é kit fotovoltaico fechado, não item avulso.
- O concorrente do integrador é outro integrador. Ajudar o integrador a ganhar a obra dele é o melhor caminho.

REGRA ABSOLUTA — você NÃO conhece e NUNCA inventa:
preço, valor de frete, prazo de entrega, disponibilidade de estoque, condição de pagamento, limite de crédito, nome ou ano de prêmio, nome de marca que a empresa vende.
Se a resposta depender de algum desses dados, diga com todas as letras que não sabe e mande o vendedor confirmar com o gestor antes de responder ao cliente. Não estime, não dê faixa, não dê exemplo numérico.

Como responder:
- Português do Brasil, direto, sem jargão.
- "por_tras": em uma ou duas frases, o que está por trás do que o cliente falou.
- "fala": o que o vendedor deve dizer, no máximo 4 frases, terminando SEMPRE numa pergunta.
- "por_que": em uma frase, por que isso funciona.
- "cuidado": só quando houver risco real (prometer o que não pode, inventar dado, brigar com o cliente). Caso contrário, string vazia.
- Concorde com o que for verdade antes de contra-argumentar.
- Nunca sugira que o integrador corte a própria mão de obra.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    por_tras: { type: 'string' },
    fala: { type: 'string' },
    por_que: { type: 'string' },
    cuidado: { type: 'string' },
  },
  required: ['por_tras', 'fala', 'por_que', 'cuidado'],
  additionalProperties: false,
};

export default async function duvida(req) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  const chaveApi = process.env.ANTHROPIC_API_KEY;

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Corpo da requisição não é JSON válido.' }, 400);
  }

  const dono = await vendedorDoToken(corpo?.token);
  if (!dono) return json({ erro: 'Link inválido.' }, 404);

  const loja = lojaUso();
  const dia = diaDeHoje();
  const chaveVend = `${dia}/${dono.chave}`;
  const chaveGlobal = `${dia}/__global__`;

  // Consulta do saldo: a tela pergunta isto ao abrir, e nao gasta nada.
  if (corpo.acao === 'saldo') {
    const usados = await lerUso(loja, chaveVend);
    return json({
      restantes: Math.max(0, POR_VENDEDOR_DIA - usados),
      limite: POR_VENDEDOR_DIA,
      ligado: !!chaveApi,
    });
  }

  if (!chaveApi) {
    return json({
      erro: 'A pergunta à IA ainda não está ligada neste site. ' +
            'Falta a variável ANTHROPIC_API_KEY em Site settings → Environment variables.',
    }, 503);
  }

  const pergunta = String(corpo.pergunta || '').trim().slice(0, MAX_PERGUNTA);
  if (pergunta.length < 5) return json({ erro: 'Escreva o que o cliente falou.' }, 400);

  // Freio de arranco: impede rajada de um vendedor so, mesmo dentro da cota.
  const minuto = new Date().toISOString().slice(0, 16);
  const rajada = await somarUso(loja, `min/${minuto}/${dono.chave}`, POR_MINUTO);
  if (!rajada.ok) {
    return json({ erro: 'Muitas perguntas seguidas. Espere um minuto.' }, 429);
  }

  // Teto da equipe inteira: o limite duro da conta do mes.
  const global = await somarUso(loja, chaveGlobal, GLOBAL_DIA);
  if (!global.ok) {
    return json({
      erro: 'A equipe atingiu o limite de perguntas de hoje. Volta amanhã. ' +
            'Os 17 cenários prontos continuam funcionando.',
    }, 429);
  }

  // Cota do vendedor. Sobe antes de chamar o modelo: se a chamada falhar, o
  // vendedor perde uma pergunta -- preferivel a deixar porta aberta para
  // gastar sem contar.
  const meu = await somarUso(loja, chaveVend, POR_VENDEDOR_DIA);
  if (!meu.ok) {
    // `disputa` nao e cota estourada: e o contador que nao conseguiu subir.
    // Dizer "acabaram suas perguntas" nessa hora seria mentira, e mandaria o
    // vendedor voltar so amanha por um problema que passa em segundos.
    if (meu.disputa) {
      return json({ erro: 'Não consegui registrar sua pergunta agora. Tente de novo.' }, 503);
    }
    return json({
      erro: 'Acabaram suas perguntas de hoje. Volta amanhã de manhã.',
      restantes: 0,
    }, 429);
  }

  try {
    const cliente = new Anthropic({ apiKey: chaveApi });
    const resposta = await cliente.messages.create({
      model: MODELO,
      max_tokens: MAX_RESPOSTA,
      system: INSTRUCAO,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: 'O cliente falou o seguinte: ' + pergunta }],
    });

    const texto = (resposta.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    let dados;
    try {
      dados = JSON.parse(texto);
    } catch {
      return json({ erro: 'A resposta veio fora do formato. Tente escrever de outro jeito.' }, 502);
    }

    return json({
      resposta: {
        porTras: String(dados.por_tras || ''),
        fala: String(dados.fala || ''),
        porQue: String(dados.por_que || ''),
        cuidado: String(dados.cuidado || ''),
      },
      restantes: Math.max(0, POR_VENDEDOR_DIA - meu.usados),
      modelo: MODELO,
    });
  } catch (e) {
    return json({
      erro: 'Não consegui responder agora. Tente de novo em instantes.',
      detalhe: String(e && e.message || e).slice(0, 200),
    }, 502);
  }
}
