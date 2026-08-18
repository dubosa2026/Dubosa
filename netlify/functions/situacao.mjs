/* POST /api/situacao   { vendedores: ["NOME", ...] }
 *
 * Diz o que cada vendedor tem publicado no link dele AGORA: quais listas,
 * de que data e com quantos clientes. Sem isso o gestor so descobriria
 * abrindo os 22 links um a um.
 *
 * Devolve apenas o resumo -- nunca as linhas de cliente. A resposta fica
 * pequena mesmo com a equipe inteira, e o painel do gestor nao precisa
 * trafegar a base toda para dizer "Rayane tem 143 clientes".
 *
 * Protegido pela senha de publicacao.
 */

import { lojaCarteiras, lojaTokens, chaveVendedor, segredosIguais, json } from '../lib/loja.mjs';

export const config = { path: '/api/situacao' };

const MAX_VENDEDORES = 200;

export default async function situacao(req) {
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

  const nomes = Array.isArray(corpo?.vendedores) ? corpo.vendedores.slice(0, MAX_VENDEDORES) : [];
  const tokens = lojaTokens();
  const carteiras = lojaCarteiras();

  const itens = await Promise.all(nomes.map(async (nomeBruto) => {
    const vendedor = String(nomeBruto || '').trim();
    const chave = chaveVendedor(vendedor);
    if (!chave) return { vendedor, semLink: true };

    const token = await tokens.get(chave);
    if (!token) return { vendedor, semLink: true };

    const doc = await carteiras.get(token, { type: 'json' });
    const rodadas = doc && doc.rodadas ? doc.rodadas : null;

    return {
      vendedor,
      token,
      rodadas: rodadas
        ? Object.keys(rodadas).map((k) => ({
            modo: k,
            rotulo: rodadas[k].rotulo || k,
            uf: rodadas[k].uf || '',
            publicadoEm: rodadas[k].publicadoEm || null,
            qtde: (rodadas[k].linhas || []).length,
          })).sort((a, b) => (b.publicadoEm || 0) - (a.publicadoEm || 0))
        : [],
    };
  }));

  return json({ itens });
}
