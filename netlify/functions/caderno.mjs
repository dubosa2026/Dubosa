/* POST /api/caderno   { vendedores: ["NOME", ...] }
 *
 * A leitura do gestor: o que cada vendedor escreveu em cada cliente.
 *
 * Protegido pela senha de publicacao, como as outras funcoes de gestor. Um
 * vendedor nao alcanca isto: a pagina dele so tem o token do link, e o token
 * nao abre esta porta. Continua valendo que um vendedor nao le o caderno do
 * outro -- o que muda aqui e so o gestor.
 *
 * Devolve o texto inteiro. E leitura: nao ha caminho para escrever, editar
 * nem apagar anotacao de vendedor por aqui.
 */

import {
  lojaAnotacoes, lojaAgenda, lojaCarteiras, lojaTokens,
  chaveVendedor, segredosIguais, json,
} from '../lib/loja.mjs';

export const config = { path: '/api/caderno' };

const MAX_VENDEDORES = 200;

/* A MESMA conta que o navegador do vendedor faz em carteira.js. Precisa ser
   identica, senao o codigo guardado na anotacao nao encontra a linha da
   carteira e o gestor le "CLI100379" em vez do nome do integrador. */
function chaveCliente(linha, colunas) {
  let nome = '';
  for (const c of colunas) {
    if (/integrador/i.test(c)) { nome = String(linha[c] || ''); break; }
  }
  const m = nome.match(/CLI[-\s]?0*(\d+)/i);
  return m ? 'CLI' + m[1] : nome.trim().toUpperCase();
}

/* Do codigo de volta ao nome, usando o que esta publicado hoje no link dele.
   Cliente que saiu da carteira nesta rodada nao tem nome aqui -- a anotacao
   continua, e o codigo serve de rotulo. */
function mapaDeNomes(doc) {
  const mapa = {};
  const rodadas = doc?.rodadas || {};
  for (const modo of Object.keys(rodadas)) {
    const r = rodadas[modo] || {};
    const colunas = r.colunas || [];
    const coluna = colunas.filter((c) => /integrador/i.test(c))[0];
    if (!coluna) continue;
    for (const linha of r.linhas || []) {
      const k = chaveCliente(linha, colunas);
      if (k && !mapa[k]) mapa[k] = String(linha[coluna] || '');
    }
  }
  return mapa;
}

export default async function caderno(req) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  const senha = process.env.ADMIN_TOKEN;
  if (!senha) return json({ erro: 'O site não tem a variável ADMIN_TOKEN configurada.' }, 500);
  if (!segredosIguais(req.headers.get('x-admin-token'), senha)) {
    return json({ erro: 'Senha de publicação incorreta.' }, 401);
  }

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Corpo da requisição não é JSON válido.' }, 400);
  }

  const anotacoes = lojaAnotacoes();
  const tokens = lojaTokens();
  const carteiras = lojaCarteiras();

  /* Sem lista de nomes, procura quem tem caderno. Sem isto o gestor teria de
     importar a planilha antes de conseguir ler uma anotacao -- e ler nao
     depende de rodada nenhuma. O nome vem da propria chave: ela ja e o nome
     do vendedor normalizado. */
  const agendaLoja = lojaAgenda();

  let nomes = Array.isArray(corpo?.vendedores) ? corpo.vendedores : [];
  if (!nomes.length) {
    const achados = {};
    for (const loja of [anotacoes, agendaLoja]) {
      try {
        const { blobs } = await loja.list();
        for (const b of blobs || []) {
          const k = String(b.key || '');
          if (k) achados[k.replace(/-/g, ' ')] = true;
        }
      } catch { /* uma loja vazia ainda nao existe: nao e erro */ }
    }
    nomes = Object.keys(achados);
    if (!nomes.length) return json({ itens: [] });
  }
  nomes = nomes.slice(0, MAX_VENDEDORES);

  const agora = Date.now();

  const itens = await Promise.all(nomes.map(async (nomeBruto) => {
    const vendedor = String(nomeBruto || '').trim();
    const chave = chaveVendedor(vendedor);
    const vazio = { vendedor, clientes: [], total: 0, agenda: [] };
    if (!chave) return vazio;

    const guardado = (await anotacoes.get(chave, { type: 'json' })) || {};
    const codigos = Object.keys(guardado).filter((k) => (guardado[k] || []).length);

    const marcados = (await agendaLoja.get(chave, { type: 'json' })) || {};
    const agenda = Object.keys(marcados)
      .map((id) => ({ id, ...marcados[id] }))
      .filter((a) => !a.feitoEm && Date.parse(a.quando) > agora)
      .sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando))
      .slice(0, 50);

    if (!codigos.length && !agenda.length) return vazio;

    // So busca a carteira de quem tem alguma coisa: sem isto seriam 22
    // leituras de base inteira para montar uma tela que quase sempre e curta.
    let nomesDeCliente = {};
    const token = await tokens.get(chave);
    if (token) {
      const doc = await carteiras.get(token, { type: 'json' });
      if (doc) nomesDeCliente = mapaDeNomes(doc);
    }

    const clientes = codigos.map((codigo) => {
      const notas = guardado[codigo] || [];
      return {
        codigo,
        nome: nomesDeCliente[codigo] || '',
        notas,
        ultima: Math.max(...notas.map((n) => Number(n.ts) || 0)),
      };
    }).sort((a, b) => b.ultima - a.ultima);

    return {
      vendedor,
      clientes,
      agenda: agenda.map((a) => ({
        quando: a.quando,
        obs: a.obs || '',
        nome: a.nome || nomesDeCliente[a.cliente] || a.cliente,
      })),
      total: clientes.reduce((s, c) => s + c.notas.length, 0),
    };
  }));

  return json({ itens });
}
