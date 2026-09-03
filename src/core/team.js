import { slugifyName } from '../data/types.js';

/**
 * CADASTRO DA EQUIPE
 * ==================
 *
 * A equipe é um cadastro PRÓPRIO do aplicativo, não uma consequência da base de
 * produção.
 *
 * Isto existe por um motivo concreto: o sistema de pedidos da empresa lista
 * apenas quem já produziu no dia. Quem está zerado simplesmente não aparece na
 * origem. Se o ranking fosse montado a partir do que a base entrega, o vendedor
 * sem pedido desapareceria da competição justamente no momento em que mais
 * precisa ver que está de fora — e o gestor perderia a visão de quem não
 * começou o dia.
 *
 * Portanto:
 *   - quem aparece no ranking é definido por ESTE cadastro;
 *   - a base de produção só fornece os NÚMEROS;
 *   - quem o cadastro tem e a base não trouxe entra com produção zero, nas
 *     últimas posições, marcado como "sem produção";
 *   - quem a base trouxe e o cadastro não tem aparece assinalado para o gestor,
 *     nunca é descartado em silêncio.
 */

const STORAGE_KEY = 'dubosa.liga.equipe.local.v1';

export function emptyTeam() {
  return { version: 1, vendedores: [] };
}

function readLocal() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocalTeam(team) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(team));
    return true;
  } catch {
    return false;
  }
}

/** @returns {Promise<{team: Object, origin: 'publicado'|'local'|'nenhum'}>} */
export async function loadTeam(url = 'config/vendedores.json') {
  const local = readLocal();
  if (local?.vendedores?.length) return { team: local, origin: 'local' };

  const embutido = globalThis.__LIGA_DADOS__?.equipe;
  if (embutido?.vendedores?.length) return { team: embutido, origin: 'publicado' };
  if (globalThis.__LIGA_DADOS__) return { team: emptyTeam(), origin: 'nenhum' };
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (res.ok) {
      const json = await res.json();
      if (json?.vendedores?.length) return { team: json, origin: 'publicado' };
    }
  } catch { /* cadastro ainda não publicado */ }
  return { team: emptyTeam(), origin: 'nenhum' };
}

/** Primeiro e último nome, normalizados — usado como chave de segunda tentativa. */
function shortKey(name) {
  const parts = slugifyName(name).split('-').filter(Boolean);
  if (parts.length < 2) return parts.join('-');
  return `${parts[0]}-${parts.at(-1)}`;
}

/** Índice de busca da equipe. */
export function indexTeam(team) {
  const byId = new Map();
  const byShort = new Map();
  for (const person of team?.vendedores ?? []) {
    byId.set(person.sellerId, person);
    const key = shortKey(person.name);
    // Chave curta ambígua (dois "Maria ... Silva") é descartada: melhor não
    // casar do que casar a produção de um vendedor com o nome de outro.
    byShort.set(key, byShort.has(key) ? null : person);
  }
  return { byId, byShort, size: byId.size };
}

/**
 * Descobre a qual vendedor do cadastro pertence um nome vindo da base.
 * @returns {{sellerId: string, matched: boolean, person: Object|null}}
 */
export function resolveSeller(name, index) {
  const id = slugifyName(name);
  const exact = index.byId.get(id);
  if (exact) return { sellerId: exact.sellerId, matched: true, person: exact };

  const short = index.byShort.get(shortKey(name));
  if (short) return { sellerId: short.sellerId, matched: true, person: short };

  return { sellerId: id, matched: false, person: null };
}

/** Normaliza uma lista de nomes (CSV colado, um por linha) em cadastro. */
export function teamFromLines(text) {
  const seen = new Set();
  const vendedores = [];
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const [nameRaw, ufRaw] = line.split(/[;,\t]/);
    const name = titleCase(String(nameRaw ?? '').trim());
    if (!name || /^(vendedor|nome)$/i.test(name)) continue;
    const sellerId = slugifyName(name);
    if (seen.has(sellerId)) continue;
    seen.add(sellerId);
    vendedores.push({ sellerId, name, uf: (ufRaw ?? '').trim().toUpperCase() || null });
  }
  return { version: 1, vendedores };
}

const LOWER = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** 'ALISSON DOS SANTOS' -> 'Alisson dos Santos' */
export function titleCase(name) {
  return String(name).trim().toLowerCase().split(/\s+/)
    .map((part, i) => (LOWER.has(part) && i > 0
      ? part
      : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

export function addToTeam(team, name, uf = null) {
  const clean = titleCase(name);
  const sellerId = slugifyName(clean);
  const vendedores = [
    ...(team.vendedores ?? []).filter((v) => v.sellerId !== sellerId),
    { sellerId, name: clean, uf: uf || null },
  ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return { ...team, vendedores };
}

export function removeFromTeam(team, sellerId) {
  return { ...team, vendedores: (team.vendedores ?? []).filter((v) => v.sellerId !== sellerId) };
}

export function exportTeam(team) {
  return JSON.stringify(
    {
      version: 1,
      geradoEm: new Date().toISOString().slice(0, 10),
      vendedores: (team.vendedores ?? []).map((v) => ({
        sellerId: v.sellerId, name: v.name, uf: v.uf ?? null,
      })),
    },
    null,
    2,
  );
}
