/* POST /api/conselho
 *
 * O assessor de IA. A tela do celular manda um retrato SO DE NUMEROS e
 * recebe de volta um diagnostico e ate quatro acoes.
 *
 * Por que isto existe num servidor, e nao dentro do app:
 *
 * 1. A CHAVE. Se o app chamasse a Anthropic direto do navegador, a chave da
 *    API ficaria guardada no celular, legivel por qualquer pessoa que abra
 *    o console. Aqui ela fica na variavel de ambiente do site e nunca sai.
 * 2. O TETO DE GASTO. Um botao que chama modelo e um botao que gasta
 *    dinheiro. O teto e verificado aqui, antes da chamada, e nao na tela —
 *    contador de tela e enfeite.
 *
 * O que NUNCA sobe para o modelo: descricao de lancamento (texto livre,
 * onde acabam entrando nomes de pessoas), datas dos gastos e qualquer coisa
 * que identifique quem esta perguntando. O app monta o retrato em
 * `conselhos.js`, funcao `retrato()`, e e so isso que chega aqui.
 */

import Anthropic from '@anthropic-ai/sdk';

export const config = { path: '/api/conselho' };

const MODELO = 'claude-haiku-4-5';
const MAX_RESPOSTA = 900;

/* Lido a cada chamada, e nao uma vez no carregamento: assim mudar o teto e
   mexer numa variavel de ambiente do site, sem editar codigo nem publicar
   de novo. */
function teto(nome, padrao) {
  const v = parseInt(process.env[nome] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : padrao;
}

/* Nasce desligada. Ter a chave no site nao basta: e preciso dizer
   IA_LIGADA=1 de proposito. O app funciona inteiro sem isto — os conselhos
   locais nao dependem de rede nem de chave. */
function ligada() {
  const v = String(process.env.IA_LIGADA ?? '').trim().toLowerCase();
  return ['1', 'sim', 'on', 'true', 'ligada', 'ligado'].includes(v);
}

/* Contagem simples do dia, em memoria da instancia. Nao e perfeita (a
   funcao pode subir em varias instancias), mas segura o caso que importa:
   o dedo preso no botao. O teto duro de verdade e o limite de gasto na
   conta da Anthropic, que se configura la. */
const uso = { dia: '', n: 0 };
function contar() {
  const hoje = new Date().toISOString().slice(0, 10);
  if (uso.dia !== hoje) { uso.dia = hoje; uso.n = 0; }
  uso.n += 1;
  return uso.n;
}

function json(dados, status) {
  return new Response(JSON.stringify(dados), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

const INSTRUCAO = `Você é um assessor financeiro pessoal falando com uma pessoa no Brasil, pelo celular dela.

Você recebe um retrato em JSON das finanças dela: saldo, quanto entra e sai por mês, média de gasto diário, gastos por categoria nos últimos 30 dias, contas fixas, dívidas e projeções que o próprio app calculou.

Como responder:
- Português do Brasil, direto, sem jargão de banco. Trate por "você".
- Comece pelo que muda o resultado dela, não pelo que é fácil de dizer.
- Toda ação precisa vir com o número: "cortar X em delivery devolve R$ Y por mês". Sem número, não é ação, é frase de efeito.
- No máximo 4 ações, em ordem de impacto.
- Se a dívida tem juro maior que qualquer rendimento possível, dizer com todas as letras que quitar vem antes de investir.
- Se falta reserva de emergência, ela vem antes de investimento.

REGRA ABSOLUTA — você NÃO sabe e NUNCA inventa:
taxa de CDI, Selic, poupança, rendimento de qualquer aplicação, inflação, cotação, preço de nada, nome de banco, de corretora, de fundo ou de produto financeiro. Use SOMENTE o campo "taxa_ano_informada" quando ele existir; se for null, diga que precisa saber quanto a aplicação dela rende antes de simular, e não estime.
Não recomende produto, banco, corretora, seguro nem investimento específico. Você fala de quanto sobra e para onde esse dinheiro pode ir em termos gerais (reserva, quitar dívida cara, aplicar), nunca de onde comprar.
Se o campo "confianca" for "baixa", diga que o histórico ainda é curto e que os números vão firmar com o uso.

Nada de bronca, nada de moralismo. A pessoa já sabe que gastou.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    diagnostico: { type: 'string' },
    acoes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          porque: { type: 'string' },
          impacto_mes: { type: 'string' },
        },
        required: ['titulo', 'porque', 'impacto_mes'],
        additionalProperties: false,
      },
    },
    risco: { type: 'string' },
  },
  required: ['diagnostico', 'acoes', 'risco'],
  additionalProperties: false,
};

export default async function conselho(req) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  const chave = ligada() ? process.env.ANTHROPIC_API_KEY : '';
  if (!chave) {
    return json({
      erro: ligada()
        ? 'Falta a ANTHROPIC_API_KEY nas variáveis de ambiente do site.'
        : 'A análise por IA está desligada. Para ligar, defina IA_LIGADA=1 nas variáveis de ambiente do site.',
    }, 503);
  }

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Corpo da requisição não é JSON válido.' }, 400);
  }

  /* A senha e opcional, mas quem publica o app numa URL aberta deveria
     definir SENHA_IA: sem ela, qualquer pessoa que descubra o endereco
     gasta da sua conta da Anthropic. */
  const esperada = String(process.env.SENHA_IA || '');
  if (esperada && String(corpo.senha || '') !== esperada) {
    return json({ erro: 'Senha da análise por IA incorreta. Corrija em Ajustes.' }, 401);
  }

  const retrato = corpo && corpo.retrato;
  if (!retrato || typeof retrato !== 'object') {
    return json({ erro: 'Retrato financeiro ausente.' }, 400);
  }
  // Corta pela raiz qualquer campo de texto livre que tenha escapado do app.
  delete retrato.descricoes;
  delete retrato.lancamentos;

  if (contar() > teto('IA_POR_DIA', 30)) {
    return json({
      erro: 'Limite de análises de hoje atingido. Os conselhos da própria tela continuam funcionando.',
    }, 429);
  }

  try {
    const cliente = new Anthropic({ apiKey: chave });
    const resposta = await cliente.messages.create({
      model: MODELO,
      max_tokens: MAX_RESPOSTA,
      system: INSTRUCAO,
      output_config: { format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{
        role: 'user',
        content: 'Retrato financeiro (valores em reais):\n' + JSON.stringify(retrato, null, 1),
      }],
    });

    const texto = (resposta.content || [])
      .filter((b) => b.type === 'text').map((b) => b.text).join('');

    let dados;
    try {
      dados = JSON.parse(texto);
    } catch {
      return json({ erro: 'A resposta veio fora do formato. Tente de novo.' }, 502);
    }

    return json({
      resposta: {
        diagnostico: String(dados.diagnostico || ''),
        acoes: (dados.acoes || []).slice(0, 4).map((a) => ({
          titulo: String(a.titulo || ''),
          porque: String(a.porque || ''),
          impacto_mes: String(a.impacto_mes || ''),
        })),
        risco: String(dados.risco || ''),
      },
      modelo: MODELO,
    });
  } catch (e) {
    return json({
      erro: 'Não consegui analisar agora. Tente de novo em instantes.',
      detalhe: String((e && e.message) || e).slice(0, 200),
    }, 502);
  }
}
