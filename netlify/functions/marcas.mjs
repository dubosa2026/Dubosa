/* POST /api/marcas
 *
 * A caixinha "ja falei com o cliente", na lista do vendedor.
 *
 * As marcas pertencem a RODADA: a chave inclui a data em que aquela rodada
 * foi publicada, entao publicar uma lista nova gera uma chave nova e as
 * marcas comecam zeradas. Mes novo, trabalho novo -- sem precisar apagar
 * nada, e sem risco de apagar o que nao devia.
 *
 * A data da publicacao vem do documento no servidor, nunca do navegador:
 * senao bastaria mandar uma data antiga para trazer as marcas de volta.
 *
 * Sem senha de gestor. O token do link e a credencial, e ele so alcanca as
 * marcas do proprio dono.
 */

import { lojaMarcas, vendedorDoToken, json } from '../lib/loja.mjs';

export const config = { path: '/api/marcas' };

const TIPOS = ['normal', 'ataque', 'carteira'];
const MAX_MARCAS = 5000;

function chaveDaRodada(chaveVend, modo, publicadoEm) {
  return `${chaveVend}/${modo}/${publicadoEm}`;
}

export default async function marcas(req) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Corpo da requisição não é JSON válido.' }, 400);
  }

  const dono = await vendedorDoToken(corpo?.token);
  if (!dono) return json({ erro: 'Link inválido.' }, 404);

  const loja = lojaMarcas();

  // Sem modo: devolve as marcas de todas as rodadas vivas do link, para a
  // pagina desenhar a lista inteira de uma vez.
  if (!corpo.modo) {
    const saida = {};
    for (const modo of TIPOS) {
      const r = dono.doc.rodadas?.[modo];
      if (!r) continue;
      const guardado = await loja.get(chaveDaRodada(dono.chave, modo, r.publicadoEm), { type: 'json' });
      saida[modo] = guardado || {};
    }
    return json({ marcas: saida });
  }

  const modo = String(corpo.modo);
  if (TIPOS.indexOf(modo) === -1) return json({ erro: 'Tipo de lista desconhecido.' }, 400);

  const rodada = dono.doc.rodadas?.[modo];
  if (!rodada) return json({ erro: 'Você não tem essa lista.' }, 404);

  const cliente = String(corpo.cliente || '').trim().slice(0, 120);
  if (!cliente) return json({ erro: 'Falta o cliente.' }, 400);

  const chave = chaveDaRodada(dono.chave, modo, rodada.publicadoEm);
  const guardado = (await loja.get(chave, { type: 'json' })) || {};

  if (corpo.marcado) {
    if (Object.keys(guardado).length >= MAX_MARCAS && !guardado[cliente]) {
      return json({ erro: 'Marcas demais nesta rodada.' }, 413);
    }
    guardado[cliente] = true;
  } else {
    delete guardado[cliente];
  }

  await loja.setJSON(chave, guardado);
  return json({ marcados: Object.keys(guardado).length, marcas: guardado });
}
