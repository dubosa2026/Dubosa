/**
 * IDENTIDADE POR LINK
 * ===================
 *
 * Cada pessoa recebe um link pessoal. O token vive no FRAGMENTO da URL
 * (depois do `#`), que por especificação do HTTP nunca é enviado ao servidor —
 * não aparece em log de acesso nem em referer.
 *
 *   vendedor  .../#/v/<TOKEN>
 *   gestor    .../#/gestor/<TOKEN>
 *
 * O arquivo público `config/equipe.json` guarda apenas o HASH SHA-256 do token.
 * Quem ler o arquivo não consegue montar o link de ninguém.
 *
 * LIMITE HONESTO DESTA CAMADA: em uma hospedagem estática, o link é a
 * credencial — quem tiver o link do colega vê o painel do colega, e o próprio
 * navegador do vendedor recebe o que a fonte lhe entregar. A garantia forte de
 * privacidade depende de a FONTE DE DADOS filtrar por escopo antes de responder
 * (ver docs/INTEGRACAO-DADOS.md). Esta camada identifica; ela não substitui o
 * filtro na origem.
 */

/* eslint-disable no-bitwise */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 puro — usado quando `crypto.subtle` não está disponível (file://). */
function sha256Fallback(message) {
  const bytes = new TextEncoder().encode(message);
  const bitLen = bytes.length * 8;
  const withPad = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
  withPad.set(bytes);
  withPad[bytes.length] = 0x80;
  new DataView(withPad.buffer).setUint32(withPad.length - 4, bitLen, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  const view = new DataView(withPad.buffer);

  for (let offset = 0; offset < withPad.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}

/** SHA-256 em hexadecimal. */
export async function sha256Hex(text) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Fallback(String(text));
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0, 1

/** Token aleatório legível, no formato XXXX-XXXX-XXXX. */
export function generateToken(groups = 3, size = 4) {
  const bytes = new Uint8Array(groups * size);
  (globalThis.crypto ?? { getRandomValues: (a) => a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); }) })
    .getRandomValues(bytes);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);
  const out = [];
  for (let i = 0; i < groups; i += 1) out.push(chars.slice(i * size, (i + 1) * size).join(''));
  return out.join('-');
}

export function normalizeToken(token) {
  return String(token ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Descobre quem está acessando.
 * @param {string} token
 * @param {{manager: {tokenHash: string, name?: string}, sellers: Array}} roster
 * @returns {Promise<{role:'seller'|'manager', sellerId:string|null, sellerName:string|null}|null>}
 */
export async function resolveIdentity(token, roster) {
  const clean = normalizeToken(token);
  if (!clean || !roster) return null;
  const hash = await sha256Hex(clean);

  if (roster.manager?.tokenHash && timingSafeEqual(roster.manager.tokenHash, hash)) {
    return { role: 'manager', sellerId: null, sellerName: roster.manager.name ?? 'Gestor' };
  }
  for (const seller of roster.sellers ?? []) {
    if (seller.tokenHash && timingSafeEqual(seller.tokenHash, hash)) {
      return { role: 'seller', sellerId: seller.sellerId, sellerName: seller.name ?? seller.sellerId };
    }
  }
  return null;
}

/** Comparação de tempo constante — não vaza o prefixo correto do hash. */
function timingSafeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/** Lê a rota atual do fragmento: #/v/TOKEN, #/gestor/TOKEN, #/entrar */
export function parseRoute(hash = globalThis.location?.hash ?? '') {
  const clean = String(hash).replace(/^#\/?/, '');
  const [head, ...rest] = clean.split('/');
  const token = rest.join('/');
  if (head === 'v' && token) return { view: 'seller', token: normalizeToken(token) };
  if (head === 'gestor' && token) return { view: 'manager', token: normalizeToken(token) };
  if (head === 'gestor') return { view: 'manager', token: null };
  return { view: 'login', token: null };
}

/** Monta o link pessoal a partir da base do aplicativo. */
export function buildLink(baseUrl, role, token) {
  const base = String(baseUrl).replace(/#.*$/, '').replace(/\/$/, '');
  return `${base}/#/${role === 'manager' ? 'gestor' : 'v'}/${normalizeToken(token)}`;
}
