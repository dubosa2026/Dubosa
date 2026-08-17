/* POST /api/publicar
 *
 * Publica UMA rodada de UM vendedor. O link dele guarda ate tres rodadas
 * vivas, uma por tipo:
 *
 *   normal    -> Distribuicao de carteira
 *   ataque    -> Ataque a um estado
 *   carteira  -> Sem compras no mes
 *
 * Publicar substitui apenas a rodada do MESMO tipo. Assim o vendedor nao
 * perde a distribuicao que recebeu quando chega um aviso de sem-compras --
 * era o comportamento antigo, em que cada publicacao apagava a anterior.
 *
 * Rodada sem nenhum cliente remove aquele tipo do link, em vez de deixar
 * uma secao vazia ou, pior, manter no ar a lista antiga ja vencida.
 *
 * Protegido pela senha de publicacao (variavel ADMIN_TOKEN do site).
 */

import {
  lojaCarteiras, lojaTokens, chaveVendedor, novoToken, segredosIguais, json,
} from '../lib/loja.mjs';

export const config = { path: '/api/publicar' };

const MAX_LINHAS = 5000;
const TIPOS = ['normal', 'ataque', 'carteira'];

/** Documentos gravados antes da versao multi-rodada tinham uma lista so. */
function normalizar(doc) {
  if (!doc) return null;
  if (doc.rodadas) return doc;
  if (!doc.linhas) return null;
  return {
    vendedor: doc.vendedor,
    rodadas: {
      [TIPOS.indexOf(doc.modo) > -1 ? doc.modo : 'normal']: {
        modo: doc.modo || 'normal',
        rotulo: doc.rotulo || 'Distribuição de carteira',
        uf: doc.uf || '',
        origem: doc.origem || '',
        publicadoEm: doc.publicadoEm || Date.now(),
        colunas: doc.colunas || [],
        linhas: doc.linhas || [],
      },
    },
  };
}

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

  // Tipo controlado: sem isso um cliente malformado criaria chaves soltas
  // dentro do documento e o link do vendedor viraria uma colcha de retalhos.
  const modo = TIPOS.indexOf(String(corpo?.modo || '')) > -1 ? String(corpo.modo) : 'normal';

  const linhas = Array.isArray(corpo.linhas) ? corpo.linhas : [];
  if (linhas.length > MAX_LINHAS) {
    return json({ erro: `Carteira grande demais (${linhas.length} linhas, limite ${MAX_LINHAS}).` }, 413);
  }

  const chave = chaveVendedor(vendedor);
  if (!chave) return json({ erro: 'Nome de vendedor inválido.' }, 400);

  const tokens = lojaTokens();
  let token = await tokens.get(chave);
  if (!token || corpo.rotacionar) {
    token = novoToken();
    await tokens.set(chave, token);
  }

  const carteiras = lojaCarteiras();
  const doc = normalizar(await carteiras.get(token, { type: 'json' })) || { vendedor, rodadas: {} };
  doc.vendedor = vendedor;

  if (linhas.length) {
    doc.rodadas[modo] = {
      modo,
      rotulo: String(corpo.rotulo || '').trim() || 'Distribuição de carteira',
      uf: String(corpo.uf || ''),
      origem: String(corpo.origem || ''),
      publicadoEm: Date.now(),
      colunas: Array.isArray(corpo.colunas) ? corpo.colunas : [],
      linhas,
    };
  } else {
    delete doc.rodadas[modo];
  }

  await carteiras.setJSON(token, doc);

  const vivas = Object.keys(doc.rodadas).length;
  return json({ vendedor, token, qtde: linhas.length, rodadasNoLink: vivas });
}
