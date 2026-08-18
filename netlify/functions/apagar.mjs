/* POST /api/apagar   { vendedor, modo? , revogarLink? }
 *
 * A unica forma de remover lista do link de um vendedor. Nada no app apaga
 * sozinho: a publicacao so grava, e o que sai daqui sai por comando do
 * gestor.
 *
 *   { vendedor, modo: 'carteira' }  -> apaga so aquela lista
 *   { vendedor }                    -> apaga todas as listas do vendedor,
 *                                      mantendo o link valido (ele passa a
 *                                      ver "nenhuma lista ativa")
 *   { vendedor, revogarLink: true } -> alem de apagar, sorteia um link novo,
 *                                      derrubando o antigo. Para quando um
 *                                      link vaza.
 *
 * Protegido pela senha de publicacao.
 */

import { lojaCarteiras, lojaTokens, chaveVendedor, segredosIguais, json } from '../lib/loja.mjs';

export const config = { path: '/api/apagar' };

const TIPOS = ['normal', 'ataque', 'carteira'];

export default async function apagar(req) {
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

  const vendedor = String(corpo?.vendedor || '').trim();
  const chave = chaveVendedor(vendedor);
  if (!chave) return json({ erro: 'Falta o nome do vendedor.' }, 400);

  const tokens = lojaTokens();
  const token = await tokens.get(chave);
  if (!token) return json({ erro: 'Esse vendedor ainda não tem link publicado.' }, 404);

  const carteiras = lojaCarteiras();
  const doc = (await carteiras.get(token, { type: 'json' })) || { vendedor, rodadas: {} };
  if (!doc.rodadas) doc.rodadas = {};

  const modo = corpo?.modo ? String(corpo.modo) : null;
  if (modo && TIPOS.indexOf(modo) === -1) {
    return json({ erro: 'Tipo de lista desconhecido.' }, 400);
  }

  let apagadas;
  if (modo) {
    apagadas = doc.rodadas[modo] ? [modo] : [];
    delete doc.rodadas[modo];
  } else {
    apagadas = Object.keys(doc.rodadas);
    doc.rodadas = {};
  }

  doc.vendedor = doc.vendedor || vendedor;
  await carteiras.setJSON(token, doc);

  // Link novo: o antigo deixa de existir para quem o tiver em maos.
  let tokenNovo = null;
  if (corpo?.revogarLink) {
    const { novoToken } = await import('../lib/loja.mjs');
    tokenNovo = novoToken();
    await tokens.set(chave, tokenNovo);
    await carteiras.setJSON(tokenNovo, doc);
  }

  return json({
    vendedor,
    apagadas,
    rodadasNoLink: Object.keys(doc.rodadas).length,
    token: tokenNovo || token,
    linkTrocado: !!tokenNovo,
  });
}
