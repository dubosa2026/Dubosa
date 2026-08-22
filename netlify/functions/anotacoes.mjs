/* POST /api/anotacoes
 *
 * O caderno do vendedor: o que aconteceu em cada conversa, com data.
 *
 * A regra que da sentido a tudo: as anotacoes ficam guardadas sob
 * VENDEDOR + CODIGO DO CLIENTE. Se numa rodada nova o cliente cair para
 * outro vendedor, ele abre a ficha e nao ha nada -- porque a chave dele e
 * outra. O que o primeiro escreveu continua intacto no lugar de sempre, e
 * reaparece inteiro se o cliente voltar para ele.
 *
 * Ninguem mais le: nem outro vendedor, nem o gestor. Nao existe endpoint que
 * devolva anotacao sem o token do dono, e o token so alcanca a chave dele.
 *
 * Acoes (campo `acao`):
 *   listar  (padrao)  -> todas as anotacoes do vendedor, por cliente
 *   somar             -> acrescenta uma anotacao ao cliente
 *   editar            -> troca o texto/data de uma anotacao existente
 *   apagar            -> remove uma anotacao
 */

import { lojaAnotacoes, vendedorDoToken, gravarComTrava, json } from '../lib/loja.mjs';

export const config = { path: '/api/anotacoes' };

const MAX_TEXTO = 2000;
const MAX_POR_CLIENTE = 200;
const MAX_CLIENTES = 3000;

/* Grava com escrita condicional: dois aparelhos do mesmo vendedor escrevendo
   ao mesmo tempo nao se apagam em silencio -- o segundo releva e tenta de
   novo em cima do que ja esta la.

   A escrita condicional so existe no @netlify/blobs a partir da 8.1. Num
   runtime anterior a chamada e aceita, a trava e IGNORADA e nao volta
   `modified` nenhum. Quem so olhava `escrita?.modified` concluia que falhou:
   o vendedor via "nao consegui salvar" e o texto era gravado uma vez por
   tentativa -- seis copias e um erro mentiroso. Por isso a distincao abaixo
   entre "outro ganhou a corrida" (modified === false, vale repetir) e "este
   runtime nao tem trava" (nao veio modified, ja gravou, repetir duplica).

   O caderno e de um vendedor so. Sem a trava ele perde a protecao contra
   dois aparelhos ao mesmo tempo -- e continua funcionando, que e o que
   importa aqui. */
const gravar = gravarComTrava;

function limpar(s, max) {
  return String(s === null || s === undefined ? '' : s).trim().slice(0, max);
}

/* Aceita "dd/mm/aaaa"; qualquer outra coisa vira a data de hoje. Uma data
   inventada pelo navegador nao quebra nada aqui -- e o caderno do proprio
   vendedor -- mas guardar lixo atrapalharia a ordenacao. */
function dataValida(s) {
  const m = String(s || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) {
    const h = new Date();
    return String(h.getDate()).padStart(2, '0') + '/' +
           String(h.getMonth() + 1).padStart(2, '0') + '/' + h.getFullYear();
  }
  return m[0];
}

export default async function anotacoes(req) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  let corpo;
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: 'Corpo da requisição não é JSON válido.' }, 400);
  }

  const dono = await vendedorDoToken(corpo?.token);
  if (!dono) return json({ erro: 'Link inválido.' }, 404);

  const loja = lojaAnotacoes();
  const chave = dono.chave;
  const acao = String(corpo.acao || 'listar');

  if (acao === 'listar') {
    const tudo = (await loja.get(chave, { type: 'json' })) || {};
    return json({ notas: tudo });
  }

  const cliente = limpar(corpo.cliente, 120);
  if (!cliente) return json({ erro: 'Falta o cliente.' }, 400);

  if (acao === 'somar') {
    const texto = limpar(corpo.texto, MAX_TEXTO);
    if (!texto) return json({ erro: 'Anotação vazia.' }, 400);
    const nova = { data: dataValida(corpo.data), texto, ts: Date.now() };

    const r = await gravar(loja, chave, function (tudo) {
      const lista = tudo[cliente] || [];
      if (lista.length >= MAX_POR_CLIENTE) return null;
      if (!tudo[cliente] && Object.keys(tudo).length >= MAX_CLIENTES) return null;
      lista.push(nova);
      tudo[cliente] = lista;
      return tudo;
    });
    if (!r.ok) return json({ erro: 'Não consegui salvar agora. Tente de novo.' }, 409);
    return json({ notas: r.dados[cliente] || [] });
  }

  if (acao === 'editar' || acao === 'apagar') {
    const i = Number(corpo.indice);
    if (!Number.isInteger(i) || i < 0) return json({ erro: 'Anotação inválida.' }, 400);
    const texto = acao === 'editar' ? limpar(corpo.texto, MAX_TEXTO) : '';
    if (acao === 'editar' && !texto) return json({ erro: 'Anotação vazia.' }, 400);

    const r = await gravar(loja, chave, function (tudo) {
      const lista = tudo[cliente];
      if (!lista || !lista[i]) return null;
      if (acao === 'apagar') {
        lista.splice(i, 1);
        if (!lista.length) delete tudo[cliente];
      } else {
        lista[i] = { data: dataValida(corpo.data), texto, ts: lista[i].ts || Date.now() };
      }
      return tudo;
    });
    if (!r.ok) {
      return json({ erro: r.motivo === 'disputa'
        ? 'Não consegui salvar agora. Tente de novo.'
        : 'Essa anotação não existe mais.' }, r.motivo === 'disputa' ? 409 : 404);
    }
    return json({ notas: r.dados[cliente] || [] });
  }

  return json({ erro: 'Ação desconhecida.' }, 400);
}
