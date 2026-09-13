/* POST /api/abordagem
 *
 * "Gerar abordagem": o vendedor descreve um lead (novo ou parado) e recebe
 * um plano pronto — perfil provável, hipótese comercial, abertura, pergunta
 * de descoberta, respostas prováveis do cliente com resposta pronta para
 * cada uma, qualificação do lead e a próxima ação. É o mesmo princípio do
 * `duvida.mjs` (não inventar dado, teto de gasto antes de chamar o modelo),
 * só que para ANTES do primeiro contato em vez de durante uma objeção — por
 * isso é uma rota própria, com o próprio orçamento, e não um modo a mais
 * dentro de `duvida`.
 *
 * As mesmas duas regras de lá valem aqui:
 *
 * 1. O ORÇAMENTO é conferido ANTES de chamar o modelo, com escrita
 *    condicional (só uma requisição em disputa passa). Chave própria no
 *    mesmo depósito (`uso`), com prefixo "abordagem/" para não disputar
 *    contador com `duvida`.
 * 2. NÃO INVENTAR. O modelo não conhece preço, frete, prazo, estoque,
 *    condição do mês nem nome de prêmio — se a abertura ou a resposta
 *    dependesse disso, a instrução manda deixar em branco na proposta e
 *    apontar isso ao vendedor, nunca chutar um número.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  lojaUso, vendedorDoToken, diaDeHoje, somarUso, lerUso, json,
} from '../lib/loja.mjs';

export const config = { path: '/api/abordagem' };

function teto(nome, padrao) {
  const v = parseInt(process.env[nome] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : padrao;
}
const POR_VENDEDOR_DIA = teto('IA_ABORDAGEM_POR_VENDEDOR_DIA', 15);
const GLOBAL_DIA = teto('IA_ABORDAGEM_GLOBAL_DIA', 150);
const POR_MINUTO = teto('IA_ABORDAGEM_POR_MINUTO', 5);

/* Mesma trava-mestra do duvida.mjs: uma so variavel (IA_LIGADA) liga as duas
   rotas de IA do site. Quem decide a hora de apresentar cada uma ao time e o
   gestor, ligando/desligando o texto na tela — aqui a funcao so recusa. */
function recursoLigado() {
  const v = String(process.env.IA_LIGADA ?? '').trim().toLowerCase();
  return ['1', 'sim', 'on', 'true', 'ligada', 'ligado'].includes(v);
}

const MAX_CAMPO = 120;       // nome, cidade, canal
const MAX_OBSERVACOES = 800; // o que o vendedor ja sabe do lead
const MAX_RESPOSTA = 1500;   // tokens de saida: o esquema tem varios campos

const MODELO = 'claude-haiku-4-5';

const INSTRUCAO = `Você ajuda vendedores da BelEnergy, distribuidora de energia solar, a planejar a ABERTURA de uma conversa comercial com um integrador — antes ou logo no início do contato, não durante uma objeção.

Contexto fixo da operação:
- A equipe fica em São Paulo e vende para integradores do Norte do Brasil.
- O frete é maior que o de concorrentes com centro de distribuição na região, e isso é verdade — nunca negue nem esconda.
- A política da empresa nunca foi ter o menor preço. Ela ganha em estoque, variedade, financiamento, atendimento, pós-venda e estrutura de fixação bem avaliada.
- A força é kit fotovoltaico fechado, não item avulso.
- O concorrente do integrador é o cliente final dele, ou outro integrador — não é a BelEnergy. Ajudar o integrador a ganhar a obra dele é o melhor caminho.

PRINCÍPIO CENTRAL: o objetivo da abordagem não é vender agora. É conseguir, nesta ordem, ATENÇÃO → CONVERSA → DESCOBERTA → OPORTUNIDADE → PRÓXIMO PASSO. Nunca abra oferecendo preço ou desconto. Desconto nunca é automático — só sugira se o próprio contexto trouxer motivo comercial real (volume, recorrência), e mesmo assim como possibilidade, não como oferta pronta.

REGRA ABSOLUTA — você NÃO conhece e NUNCA inventa:
preço, valor de frete, prazo de entrega, disponibilidade de estoque, condição de pagamento, limite de crédito, nome ou ano de prêmio, nome de marca que a empresa vende, e nenhum fato sobre o cliente que não esteja nos dados fornecidos. Se um dado faltar, não invente um substituto plausível — escreva a abertura sem ele, ou deixe explícito que falta confirmar.

Como escrever cada campo:
- Português do Brasil, direto, sem jargão de vendas.
- "tipo_abordagem": classifique com base nos dados dados — fria (sem relação e sem histórico), morna (algum contato/indicação prévia), nunca_comprou (cadastro existe, nunca comprou), inativo (comprou, parado há tempo relevante), reativacao (histórico relevante, parado, mas com sinal de retomada), ativo_crescimento (compra e há espaço para crescer), cross_sell (compra, mas mix estreito), upsell (compra, espaço para aumentar ticket/volume), recuperacao (queda relevante recente). Se os dados não derem para decidir, use "fria".
- "perfil_provavel": até 3 linhas, só com o que os dados sustentam — nunca invente ramo, porte ou região que não foi informado.
- "hipotese_comercial": uma frase sobre o que provavelmente gera interesse neste lead especificamente, não um motivo genérico.
- "abertura": mensagem curta (poucas frases), soa humana, não institucional, não comeca com "Olá, tudo bem? Somos a BelEnergy...". Contextualiza com o dado real disponível (cidade, tempo parado, histórico) sem inventar o que não foi dito. Termina em pergunta, de preferência aberta.
- "pergunta": a primeira pergunta de descoberta a fazer depois que ele responder a abertura — uma só, natural, não um interrogatório.
- "possiveis_respostas": 2 a 3 cenários prováveis de resposta do cliente à abertura+pergunta, cada um com a resposta pronta do vendedor para aquele cenário específico — nunca a mesma resposta genérica repetida.
- "proximo_passo": o objetivo comercial seguinte, concreto (ex.: conseguir telefone do comprador, agendar ligação, conseguir primeira cotação) — nunca "mandar mensagem" sozinho como objetivo final.
- "qualificacao": temperatura (quente = necessidade+potencial+intenção; morno = potencial sem intenção clara; frio = pouca necessidade/intenção; nao_qualificado = dados insuficientes) e três notas de 0 a 100 (potencial, intenção, urgência) — sem dado suficiente, valores baixos e temperatura "nao_qualificado", nunca um número otimista sem base.
- "proxima_acao": ação única (não lista), prazo realista, objetivo dela e uma mensagem pronta para essa ação (pode repetir a abertura se fizer sentido).

Nunca ofereça dez argumentos de uma vez — escolha o mais relevante para este lead. Nunca ataque o fornecedor atual do integrador.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    tipo_abordagem: {
      type: 'string',
      enum: ['fria', 'morna', 'nunca_comprou', 'inativo', 'reativacao', 'ativo_crescimento', 'cross_sell', 'upsell', 'recuperacao'],
    },
    perfil_provavel: { type: 'string' },
    hipotese_comercial: { type: 'string' },
    abertura: { type: 'string' },
    pergunta: { type: 'string' },
    possiveis_respostas: {
      type: 'array',
      minItems: 2,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          resposta_cliente: { type: 'string' },
          resposta_vendedor: { type: 'string' },
        },
        required: ['resposta_cliente', 'resposta_vendedor'],
        additionalProperties: false,
      },
    },
    proximo_passo: { type: 'string' },
    qualificacao: {
      type: 'object',
      properties: {
        temperatura: { type: 'string', enum: ['quente', 'morno', 'frio', 'nao_qualificado'] },
        potencial: { type: 'integer', minimum: 0, maximum: 100 },
        intencao: { type: 'integer', minimum: 0, maximum: 100 },
        urgencia: { type: 'integer', minimum: 0, maximum: 100 },
      },
      required: ['temperatura', 'potencial', 'intencao', 'urgencia'],
      additionalProperties: false,
    },
    proxima_acao: {
      type: 'object',
      properties: {
        acao: { type: 'string' },
        prazo: { type: 'string' },
        objetivo: { type: 'string' },
        mensagem: { type: 'string' },
      },
      required: ['acao', 'prazo', 'objetivo', 'mensagem'],
      additionalProperties: false,
    },
  },
  required: ['tipo_abordagem', 'perfil_provavel', 'hipotese_comercial', 'abertura', 'pergunta',
    'possiveis_respostas', 'proximo_passo', 'qualificacao', 'proxima_acao'],
  additionalProperties: false,
};

function corta(v, max) {
  return String(v || '').trim().slice(0, max);
}

/* Monta o texto que vai para o modelo a partir do que o vendedor preencheu.
   Campo vazio simplesmente não entra na lista — melhor o modelo ver "sem
   informação" por ausência do que por um rótulo "não informado" repetido,
   que ele poderia confundir com dado de verdade. */
function montarLead(lead) {
  const partes = [];
  const nome = corta(lead?.nome, MAX_CAMPO);
  const cidade = corta(lead?.cidade, MAX_CAMPO);
  const estado = corta(lead?.estado, MAX_CAMPO);
  const canal = corta(lead?.canal, MAX_CAMPO);
  const ultimaCompra = corta(lead?.ultimaCompra, MAX_CAMPO);
  const observacoes = corta(lead?.observacoes, MAX_OBSERVACOES);

  if (nome) partes.push(`Cliente/empresa: ${nome}`);
  if (cidade || estado) partes.push(`Local: ${[cidade, estado].filter(Boolean).join(' / ')}`);
  if (canal) partes.push(`Canal de contato: ${canal}`);
  if (lead?.jaComprou === true) partes.push('Já comprou da BelEnergy antes.');
  else if (lead?.jaComprou === false) partes.push('Nunca comprou da BelEnergy.');
  if (ultimaCompra) partes.push(`Última compra / última interação: ${ultimaCompra}`);
  if (observacoes) partes.push(`O que o vendedor já sabe: ${observacoes}`);

  return { texto: partes.join('\n'), temAlgo: partes.length > 0 };
}

export default async function abordagem(req) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  const ligado = recursoLigado();
  const chaveApi = ligado ? process.env.ANTHROPIC_API_KEY : '';

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
  const chaveVend = `abordagem/${dia}/${dono.chave}`;
  const chaveGlobal = `abordagem/${dia}/__global__`;

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
      erro: ligado
        ? 'Gerar abordagem ainda não está ligado neste site. ' +
          'Falta a variável ANTHROPIC_API_KEY em Site settings → Environment variables.'
        : 'Gerar abordagem está desligado no momento. ' +
          'Para ligar, defina IA_LIGADA=1 em Site settings → Environment variables.',
    }, 503);
  }

  const { texto: leadTexto, temAlgo } = montarLead(corpo.lead);
  if (!temAlgo) {
    return json({ erro: 'Preencha ao menos um dado do lead (nome, cidade ou o que você já sabe).' }, 400);
  }

  const minuto = new Date().toISOString().slice(0, 16);
  const rajada = await somarUso(loja, `min/abordagem/${minuto}/${dono.chave}`, POR_MINUTO);
  if (!rajada.ok) {
    return json({ erro: 'Muitos pedidos seguidos. Espere um minuto.' }, 429);
  }

  const global = await somarUso(loja, chaveGlobal, GLOBAL_DIA);
  if (!global.ok) {
    return json({
      erro: 'A equipe atingiu o limite de abordagens geradas hoje. Volta amanhã.',
    }, 429);
  }

  const meu = await somarUso(loja, chaveVend, POR_VENDEDOR_DIA);
  if (!meu.ok) {
    if (meu.disputa) {
      return json({ erro: 'Não consegui registrar seu pedido agora. Tente de novo.' }, 503);
    }
    return json({
      erro: 'Acabaram suas abordagens geradas hoje. Volta amanhã de manhã.',
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
      messages: [{ role: 'user', content: 'Dados do lead:\n' + leadTexto }],
    });

    const texto = (resposta.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    let dados;
    try {
      dados = JSON.parse(texto);
    } catch {
      return json({ erro: 'A resposta veio fora do formato. Tente descrever o lead de outro jeito.' }, 502);
    }

    const q = dados.qualificacao || {};
    const a = dados.proxima_acao || {};

    return json({
      resposta: {
        tipoAbordagem: String(dados.tipo_abordagem || ''),
        perfilProvavel: String(dados.perfil_provavel || ''),
        hipoteseComercial: String(dados.hipotese_comercial || ''),
        abertura: String(dados.abertura || ''),
        pergunta: String(dados.pergunta || ''),
        possiveisRespostas: Array.isArray(dados.possiveis_respostas)
          ? dados.possiveis_respostas.map((r) => ({
            respostaCliente: String(r?.resposta_cliente || ''),
            respostaVendedor: String(r?.resposta_vendedor || ''),
          }))
          : [],
        proximoPasso: String(dados.proximo_passo || ''),
        qualificacao: {
          temperatura: String(q.temperatura || 'nao_qualificado'),
          potencial: Number.isFinite(q.potencial) ? q.potencial : 0,
          intencao: Number.isFinite(q.intencao) ? q.intencao : 0,
          urgencia: Number.isFinite(q.urgencia) ? q.urgencia : 0,
        },
        proximaAcao: {
          acao: String(a.acao || ''),
          prazo: String(a.prazo || ''),
          objetivo: String(a.objetivo || ''),
          mensagem: String(a.mensagem || ''),
        },
      },
      restantes: Math.max(0, POR_VENDEDOR_DIA - meu.usados),
      modelo: MODELO,
    });
  } catch (e) {
    return json({
      erro: 'Não consegui gerar a abordagem agora. Tente de novo em instantes.',
      detalhe: String(e && e.message || e).slice(0, 200),
    }, 502);
  }
}
