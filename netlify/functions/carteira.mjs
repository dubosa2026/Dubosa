/* POST /api/carteira  { token }
 *
 * Devolve a carteira de um unico vendedor -- a que o token aponta, e so
 * ela. Nao existe endpoint que liste vendedores ou carteiras.
 *
 * O token vai no corpo, e nao na URL, de proposito: assim ele nao aparece
 * em log de servidor nem no cabecalho Referer se a pagina tiver algum link
 * externo. Na pagina do vendedor ele fica depois do "#", que o navegador
 * nunca envia ao servidor.
 */

import { lojaCarteiras, json } from '../lib/loja.mjs';

export const config = { path: '/api/carteira' };

export default async function carteira(req) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Corpo da requisição não é JSON válido.' }, 400);
  }

  const token = String(corpo?.token || '').trim();
  // Formato fixo: descarta lixo antes de ir ao armazenamento.
  if (!/^[a-f0-9]{48}$/.test(token)) {
    return json({ erro: 'Link inválido.' }, 404);
  }

  const dados = await lojaCarteiras().get(token, { type: 'json' });
  if (!dados) return json({ erro: 'Link inválido ou ainda sem carteira publicada.' }, 404);

  return json(dados);
}
