/* Armazenamento das carteiras publicadas.
 *
 * Usa Netlify Blobs, que ja vem com o Netlify -- nao precisa contratar
 * banco de dados separado. Sao dois depositos:
 *
 *   tokens/<vendedor>  -> o segredo do link daquele vendedor
 *   carteiras/<token>  -> a lista de clientes dele nesta rodada
 *
 * O token e a chave de leitura. Guardar a carteira sob o token (e nao sob o
 * nome) significa que uma requisicao so consegue ler o que o token dela
 * aponta: nao existe caminho para listar ou adivinhar a carteira de outro.
 */

import { getStore } from '@netlify/blobs';

export const lojaCarteiras = () => getStore('carteiras');
export const lojaTokens = () => getStore('tokens');

/* anotacoes/<vendedor>  -> { <codigo do cliente>: [ {data, texto, ts} ] }
   Guardar sob o VENDEDOR e o que faz a regra funcionar: o cliente que muda
   de mao numa rodada nova cai numa chave onde nao ha nada escrito, e o que o
   vendedor anterior anotou continua onde estava -- invisivel para o novo,
   inteiro se o cliente voltar. */
export const lojaAnotacoes = () => getStore('anotacoes');

/* marcas/<vendedor>/<modo>/<publicadoEm> -> { <codigo>: true }
   A data da publicacao entra na chave de proposito: rodada nova gera chave
   nova, e as marcas de "ja falei" comecam zeradas sem precisar apagar nada. */
export const lojaMarcas = () => getStore('marcas');

/* uso/<dia>/<vendedor> e uso/<dia>/__global__ -> { n } */
export const lojaUso = () => getStore('uso');

/* Data do SERVIDOR, em AAAA-MM-DD. O relogio do aparelho do vendedor nao
   participa: mudar a data do celular nao vira o dia do contador. */
export function diaDeHoje() {
  return new Date().toISOString().slice(0, 10);
}

/* Soma 1 num contador, sem deixar duas requisicoes simultaneas lerem o mesmo
   numero e gravarem o mesmo valor.
 *
 * A escrita e condicional: quem leu "19" so grava "20" se a etag ainda for a
 * que ele leu. Se outra requisicao gravou no meio, a escrita nao acontece e
 * esta aqui recomeca a contagem. Cinquenta disparos ao mesmo tempo viram
 * cinquenta tentativas de gravar, e so uma passa por vez -- que e o unico
 * jeito de o teto de gasto significar alguma coisa.
 *
 * Devolve { ok, usados }. ok=false quando o limite ja foi atingido. */
export async function somarUso(loja, chave, limite, tentativas = 8) {
  for (let i = 0; i < tentativas; i++) {
    const atual = await loja.getWithMetadata(chave, { type: 'json' });
    const usados = Number(atual?.data?.n) || 0;
    if (usados >= limite) return { ok: false, usados };

    const novo = { n: usados + 1, em: Date.now() };
    const escrita = atual
      ? await loja.setJSON(chave, novo, { onlyIfMatch: atual.etag })
      : await loja.setJSON(chave, novo, { onlyIfNew: true });

    if (escrita?.modified) return { ok: true, usados: usados + 1 };
    // Alguem gravou primeiro: le de novo e tenta outra vez.
  }
  // Disputa alta demais. Recusar e melhor que gastar sem contar.
  return { ok: false, usados: limite, disputa: true };
}

/* Le o contador sem alterar. Serve so para mostrar quanto resta na tela. */
export async function lerUso(loja, chave) {
  const atual = await loja.get(chave, { type: 'json' });
  return Number(atual?.n) || 0;
}

/** "Rayane Almeida dos Santos" -> "RAYANE-ALMEIDA-DOS-SANTOS" */
export function chaveVendedor(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // tira acentos
    .toUpperCase().trim()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 192 bits de aleatoriedade: adivinhar por tentativa e inviavel. */
export function novoToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparacao em tempo constante, para nao vazar a senha pelo tempo de resposta. */
export function segredosIguais(a, b) {
  const x = String(a ?? ''), y = String(b ?? '');
  if (x.length !== y.length) return false;
  let diferenca = 0;
  for (let i = 0; i < x.length; i++) diferenca |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diferenca === 0;
}

/* O token e a unica credencial da pagina do vendedor. Toda funcao que ele
   chama passa por aqui: valida o formato, busca o documento e devolve de quem
   e. Nenhuma delas confia num nome de vendedor mandado pelo navegador --
   quem manda e o token. */
export async function vendedorDoToken(token) {
  const limpo = String(token || '').trim();
  if (!/^[a-f0-9]{48}$/.test(limpo)) return null;
  const doc = await lojaCarteiras().get(limpo, { type: 'json' });
  if (!doc) return null;
  const nome = String(doc.vendedor || '').trim();
  if (!nome) return null;
  return { nome, chave: chaveVendedor(nome), doc };
}

export function json(corpo, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
