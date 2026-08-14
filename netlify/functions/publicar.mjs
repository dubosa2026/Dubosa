/* POST /api/publicar
 *
 * O gestor envia a carteira de UM vendedor e recebe de volta o link secreto
 * dele. O app da etapa 3 chama isso uma vez por vendedor, o que mantem cada
 * requisicao pequena e da para mostrar o progresso na tela.
 *
 * Protegido pela senha de publicacao (variavel ADMIN_TOKEN do site). Sem
 * ela qualquer pessoa poderia sobrescrever a carteira da equipe.
 */

import {
  lojaCarteiras, lojaTokens, chaveVendedor, novoToken, segredosIguais, json,
} from '../lib/loja.mjs';

export const config = { path: '/api/publicar' };

const MAX_LINHAS = 5000;

export default async function publicar(req) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  const senha = process.env.ADMIN_TOKEN;
  if (!senha) {
    return json({
      erro: 'O site não tem a variável ADMIN_TOKEN configurada. ' +
            'Defina-a em Site settings → Environment variables no Netlify.',
    }, 500);
  }
  if (!segredosIguais(req.headers.get('x-admin-token'), senha)) {
    return json({ erro: 'Senha de publicação incorreta.' }, 401);
  }

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Corpo da requisição não é JSON válido.' }, 400);
  }

  const vendedor = String(corpo?.vendedor || '').trim();
  if (!vendedor) return json({ erro: 'Falta o nome do vendedor.' }, 400);

  const linhas = Array.isArray(corpo.linhas) ? corpo.linhas : [];
  if (linhas.length > MAX_LINHAS) {
    return json({ erro: `Carteira grande demais (${linhas.length} linhas, limite ${MAX_LINHAS}).` }, 413);
  }

  const chave = chaveVendedor(vendedor);
  if (!chave) return json({ erro: 'Nome de vendedor inválido.' }, 400);

  // O token e estavel: o link do vendedor continua o mesmo mes a mes, a nao
  // ser que o gestor peca um novo (por exemplo, se o link vazou).
  const tokens = lojaTokens();
  let token = await tokens.get(chave);
  if (!token || corpo.rotacionar) {
    token = novoToken();
    await tokens.set(chave, token);
  }

  await lojaCarteiras().setJSON(token, {
    vendedor,
    uf: String(corpo.uf || ''),
    modo: String(corpo.modo || ''),
    origem: String(corpo.origem || ''),
    publicadoEm: Date.now(),
    colunas: Array.isArray(corpo.colunas) ? corpo.colunas : [],
    linhas,
  });

  return json({ vendedor, token, qtde: linhas.length });
}
