// "Código de conexão": leva o endereço do servidor, a chave pública e o convite
// de um celular para o outro numa mensagem só (WhatsApp, por exemplo), para
// ninguém precisar digitar a chave comprida. A chave "anon" é pública por
// natureza — quem manda na segurança são as regras do banco e o login.

export interface ConnectionInfo {
  url: string;
  anonKey: string;
  invite?: string | null;
}

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// O conteúdo é JSON com tudo que não for ASCII escapado (\uXXXX): cada caractere é um byte.
function bytes(s: string): number[] {
  const ascii = s.replace(/[\u0080-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return Array.from(ascii, (ch) => ch.charCodeAt(0));
}

export function b64urlEncode(s: string): string {
  const b = bytes(s);
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += ALPHA[(n >> 18) & 63] + ALPHA[(n >> 12) & 63];
    if (i + 1 < b.length) out += ALPHA[(n >> 6) & 63];
    if (i + 2 < b.length) out += ALPHA[n & 63];
  }
  return out;
}

export function b64urlDecode(s: string): string {
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    const v = ALPHA.indexOf(ch);
    if (v < 0) throw new Error('caractere inválido');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 255);
    }
  }
  return String.fromCharCode(...bytes);
}

export function encodeConnection(c: ConnectionInfo): string {
  return `NC1-${b64urlEncode(JSON.stringify({ u: c.url, k: c.anonKey, c: c.invite ?? undefined }))}`;
}

/** Aceita o código puro, o link nossacasa://conectar?d=... ou a mensagem inteira colada. */
export function decodeConnection(text: string): ConnectionInfo | null {
  const m = text.match(/NC1-([A-Za-z0-9_-]{20,})/);
  if (!m) return null;
  try {
    const o = JSON.parse(b64urlDecode(m[1])) as { u?: string; k?: string; c?: string };
    if (!o.u || !o.k) return null;
    return { url: o.u, anonKey: o.k, invite: o.c ?? null };
  } catch {
    return null;
  }
}

export const APK_URL = 'https://github.com/dubosa2026/Dubosa/releases/download/nossa-casa-latest/NossaCasa.apk';

export function shareMessage(c: ConnectionInfo): string {
  const code = encodeConnection(c);
  return [
    'Nossa Casa ❤️ — vamos organizar a casa juntos!',
    '',
    `1) Instale o app: ${APK_URL}`,
    '2) Abra, crie seu usuário e senha.',
    '3) Copie ESTA mensagem inteira e toque em "Colar convite" no app.',
    '',
    c.invite ? `Convite: ${c.invite}` : '',
    `Conexão: ${code}`,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
}

/** Acha o código de convite num texto colado (mensagem inteira, código de conexão ou só o código). */
export function extractInvite(text: string): string | null {
  const fromConn = decodeConnection(text)?.invite;
  if (fromConn) return fromConn;
  const all = text.toUpperCase().match(/\b[A-HJ-NP-Z2-9]{8}\b/g) ?? [];
  // Palavras comuns de 8 letras (ex.: MENSAGEM) também casam; prefere o que tem número.
  return all.find((x) => /\d/.test(x)) ?? all[0] ?? null;
}
