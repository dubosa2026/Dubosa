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

export function json(corpo, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
