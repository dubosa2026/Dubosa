// Identificadores.
// - randomId(): UUID v4 para registros novos criados no aparelho (funciona offline).
// - stableId(key): UUID determinístico a partir de uma chave. Usado nas ocorrências
//   de tarefas recorrentes: se os dois celulares gerarem a mesma ocorrência sem
//   internet, ela terá o mesmo id e o servidor guarda só uma.

function hex(n: number, len: number) {
  return (n >>> 0).toString(16).padStart(len, '0');
}

/** Hash de 128 bits (4 x 32 bits, variantes do FNV-1a/murmur mix). Não é criptográfico. */
function hash128(input: string): [number, number, number, number] {
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0xdeadbeef, h4 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
    h3 = Math.imul(h3 ^ c, 0xc2b2ae35);
    h4 = Math.imul(h4 ^ c, 0x27d4eb2f);
  }
  const mix = (h: number) => {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  };
  return [mix(h1 ^ h4), mix(h2 ^ h1), mix(h3 ^ h2), mix(h4 ^ h3)];
}

function formatUuid(a: number, b: number, c: number, d: number, version: number) {
  const s = hex(a, 8) + hex(b, 8) + hex(c, 8) + hex(d, 8);
  const v = version.toString(16);
  const variant = ((parseInt(s[16], 16) & 0x3) | 0x8).toString(16);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${v}${s.slice(13, 16)}-${variant}${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

export function stableId(key: string): string {
  const [a, b, c, d] = hash128(key);
  return formatUuid(a, b, c, d, 5);
}

export function randomId(): string {
  const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (g?.randomUUID) return g.randomUUID();
  const r = () => Math.floor(Math.random() * 0x100000000);
  return formatUuid(r(), r(), r(), r(), 4);
}

export function inviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
