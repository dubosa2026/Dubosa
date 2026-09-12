import { normalizeMoney, normalizeCount, slugifyName } from './types.js';
import { resolveSeller } from '../core/team.js';

/**
 * LEITURA DE PRODUÇÃO COLADA
 * ==========================
 *
 * O sistema de pedidos mostra os números na tela, mas não oferece (ainda) um
 * endereço de dados. Enquanto isso não se resolve, o gestor seleciona a lista
 * na tela, copia e cola aqui.
 *
 * O texto que sai de uma cópia de tela é bagunçado: às vezes o vendedor e os
 * números vêm na mesma linha, às vezes cada valor cai numa linha própria — e
 * quase sempre vêm marcadores (›, •, -) no meio. Por isso a leitura não tenta
 * adivinhar colunas: ela se ancora no CADASTRO DA EQUIPE. Uma linha que contém
 * o nome de alguém da equipe abre um registro; os números seguintes pertencem a
 * essa pessoa até o próximo nome aparecer.
 *
 * Nada é descartado em silêncio: nome fora do cadastro e número sem dono viram
 * aviso na tela.
 */

const LIXO = /^[\s›»•·—–\-*+|]+|[\s›»•·—–\-*+|]+$/g;
const SO_NUMERO = /^[\s\d.,]+$/;

/** Um pedaço de texto que parece valor monetário? */
function pareceDinheiro(texto) {
  return /R\$/i.test(texto) || /\b(mil|mi|mm|milhoes|milhões|milhao|milhão|k)\b\s*$/i.test(texto.trim());
}

/** Extrai os candidatos numéricos de uma linha, na ordem em que aparecem. */
function numerosDe(linha) {
  const achados = [];
  // "R$ 370 mil", "R$ 370.332", "1.234,56", "22"
  const regex = /(R\$\s*)?(\d[\d.,]*)\s*(mil|mi|mm|milh[oõ]es|milh[aã]o|k)?/gi;
  let m = regex.exec(linha);
  while (m) {
    const [bruto, cifrao, numero, sufixo] = m;
    if (numero) {
      const texto = `${cifrao ?? ''}${numero}${sufixo ? ` ${sufixo}` : ''}`;
      achados.push({
        texto: texto.trim(),
        dinheiro: Boolean(cifrao) || Boolean(sufixo),
        valor: normalizeMoney(texto),
        inteiro: normalizeCount(numero),
        digitos: numero.replace(/[.,]/g, '').length,
      });
    }
    m = regex.exec(linha);
  }
  return achados;
}

/**
 * Decide qual número é faturamento e qual é quantidade de pedidos.
 *
 * Preferência, nesta ordem:
 *   1. quem está marcado como dinheiro (R$ ou "mil"/"mi") é o faturamento;
 *   2. sem marcação, o maior valor é o faturamento e o menor os pedidos;
 *   3. um número só, marcado como dinheiro, é faturamento; sem marcação e
 *      pequeno, é quantidade de pedidos.
 *
 * `confianca` fica em 'baixa' quando a decisão veio de heurística, para que a
 * tela peça confirmação em vez de assumir.
 */
function separarValores(numeros) {
  const marcados = numeros.filter((n) => n.dinheiro);
  const simples = numeros.filter((n) => !n.dinheiro);

  if (marcados.length && simples.length) {
    return {
      revenue: marcados[0].valor,
      orders: simples[0].inteiro,
      confianca: 'alta',
    };
  }
  if (marcados.length >= 1 && !simples.length) {
    return { revenue: marcados[0].valor, orders: null, confianca: 'parcial' };
  }
  if (simples.length >= 2) {
    const ordenados = [...simples].sort((a, b) => b.valor - a.valor);
    return { revenue: ordenados[0].valor, orders: ordenados[1].inteiro, confianca: 'baixa' };
  }
  if (simples.length === 1) {
    const unico = simples[0];
    // Um número solto e pequeno é contagem de pedidos; grande é faturamento.
    return unico.digitos <= 3 && unico.valor < 1000
      ? { revenue: null, orders: unico.inteiro, confianca: 'parcial' }
      : { revenue: unico.valor, orders: null, confianca: 'baixa' };
  }
  return { revenue: null, orders: null, confianca: 'nenhuma' };
}

/**
 * Palavras de cabeçalho da tela do sistema de pedidos. Sem esta lista,
 * "Pedidos do dia" e "Minha equipe" viram vendedores fantasmas com os números
 * da linha seguinte pendurados neles.
 */
const CABECALHO = new Set([
  'pedido', 'pedidos', 'criados', 'criado', 'hoje', 'ontem', 'dia', 'dias', 'util', 'uteis',
  'minha', 'meu', 'equipe', 'carteira', 'vendedor', 'vendedora', 'vendedores', 'nome',
  'faturamento', 'valor', 'total', 'geral', 'estado', 'estados', 'cancelamento', 'cancelamentos',
  'mes', 'meses', 'anterior', 'detalhes', 'nota', 'notas', 'comparar', 'como', 'fechou',
  'ativar', 'notificacoes', 'aparelho', 'toque', 'para', 'ver', 'por', 'bom', 'boa',
  'dias', 'resultado', 'resultados', 'producao', 'ranking', 'posicao', 'media',
]);

/** Termos de um candidato a nome, sem acento e sem partículas. */
function tokensDe(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/**
 * Isto parece nome de gente?
 * Exige pelo menos dois termos de três letras e que nem todos sejam palavra de
 * cabeçalho. É a barreira que separa "Eduardo Luiz dos Santos" de "Pedidos do dia".
 */
function pareceNomeDePessoa(texto) {
  const tokens = tokensDe(texto);
  if (tokens.length < 2) return false;
  return tokens.some((t) => !CABECALHO.has(t));
}

/** Sobra de uma linha depois de tirar números e marcadores: candidato a nome. */
function nomeDe(linha) {
  const limpo = linha
    .replace(/R\$\s*[\d.,]+\s*(mil|mi|mm|milh[oõ]es|milh[aã]o|k)?/gi, ' ')
    .replace(/\b\d[\d.,]*\s*(mil|mi|mm|milh[oõ]es|milh[aã]o|k)?\b/gi, ' ')
    .replace(/\b(pedidos?|faturamento|vendas?|total|hoje)\b/gi, ' ')
    .replace(LIXO, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return limpo.length >= 4 && /[a-zà-ú]/i.test(limpo) ? limpo : null;
}

/**
 * @param {string} texto      o que o gestor colou
 * @param {Object} teamIndex  saída de core/team.js indexTeam()
 * @returns {{registros: Array, foraDoCadastro: string[], avisos: string[]}}
 */
export function parsePastedProduction(texto, teamIndex) {
  const linhas = String(texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, '  ').trim())
    .filter(Boolean);

  const registros = [];
  const foraDoCadastro = [];
  const avisos = [];
  let atual = null;

  const naoCadastrados = [];

  const fechar = () => {
    if (!atual) return;
    const separado = separarValores(atual.numeros);
    const leitura = {
      sellerId: atual.sellerId,
      sellerName: atual.sellerName,
      orders: separado.orders ?? 0,
      revenue: separado.revenue ?? 0,
      matched: atual.matched,
      confianca: separado.confianca,
    };

    if (separado.revenue === null && separado.orders === null) {
      avisos.push(`"${atual.sellerName}" apareceu sem nenhum número.`);
    } else if (atual.matched) {
      registros.push(leitura);
    } else {
      // Quem não está no cadastro não entra no ranking — mas o gestor precisa
      // ver o que foi lido, para decidir se adiciona a pessoa à equipe.
      naoCadastrados.push(leitura);
      foraDoCadastro.push(atual.sellerName);
    }
    atual = null;
  };

  for (const linha of linhas) {
    const numeros = numerosDe(linha);
    const candidato = nomeDe(linha);

    if (candidato) {
      const encontrado = resolveSeller(candidato, teamIndex);

      // Nome que não está no cadastro só é tratado como pessoa se realmente
      // parecer um nome. Caso contrário é cabeçalho da tela, e os números da
      // linha seguinte pertencem a quem veio antes.
      if (encontrado.matched || pareceNomeDePessoa(candidato)) {
        fechar();
        atual = {
          sellerId: encontrado.matched ? encontrado.sellerId : slugifyName(candidato),
          sellerName: encontrado.person?.name ?? candidato,
          matched: encontrado.matched,
          numeros: [...numeros],
        };
        continue;
      }
    }

    if (numeros.length) {
      if (atual) atual.numeros.push(...numeros);
      else if (!SO_NUMERO.test(linha) || registros.length) {
        avisos.push(`Número sem vendedor identificado: "${linha}".`);
      }
    }
  }
  fechar();

  // Mesma pessoa duas vezes na colagem: fica a leitura de maior produção.
  const porVendedor = new Map();
  const repetidos = new Set();
  for (const r of registros) {
    const anterior = porVendedor.get(r.sellerId);
    if (anterior) repetidos.add(r.sellerName);
    if (!anterior || r.revenue > anterior.revenue) porVendedor.set(r.sellerId, r);
  }
  for (const nome of repetidos) {
    avisos.push(`"${nome}" apareceu mais de uma vez; ficou a leitura de maior produção.`);
  }

  return {
    registros: [...porVendedor.values()],
    naoCadastrados,
    foraDoCadastro: [...new Set(foraDoCadastro)],
    avisos,
  };
}
