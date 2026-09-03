import { sha256Hex, generateToken, normalizeToken } from './identity.js';

/**
 * CADASTRO DE ACESSOS
 * ===================
 *
 * Guarda apenas: id do vendedor, nome e o HASH do token pessoal.
 * Nunca guarda produção, faturamento nem pedidos.
 *
 * Duas origens, nesta ordem:
 *   1. `config/equipe.json` publicado junto com o aplicativo — vale para todos
 *      os computadores da equipe;
 *   2. cadastro local do gestor (`localStorage`) — vale só na máquina dele,
 *      serve para montar a equipe antes de publicar o arquivo.
 */

const STORAGE_KEY = 'dubosa.liga.roster.local.v1';

export function emptyRoster() {
  return { version: 1, manager: null, sellers: [] };
}

function readLocal() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocalRoster(roster) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(roster));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalRoster() {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch { /* nada a fazer */ }
}

/**
 * @returns {Promise<{roster: Object, origin: 'publicado'|'local'|'nenhum'}>}
 */
export async function loadRoster(url = 'config/equipe.json') {
  let published = null;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (res.ok) {
      const json = await res.json();
      if (json?.sellers || json?.manager) published = json;
    }
  } catch { /* arquivo ainda não publicado — fluxo normal na primeira execução */ }

  const local = readLocal();
  if (published && local) {
    // O publicado manda; o local completa com quem ainda não foi publicado.
    const known = new Set((published.sellers ?? []).map((s) => s.tokenHash));
    const extra = (local.sellers ?? []).filter((s) => !known.has(s.tokenHash));
    return {
      roster: {
        ...published,
        manager: published.manager ?? local.manager,
        sellers: [...(published.sellers ?? []), ...extra],
      },
      origin: 'publicado',
    };
  }
  if (published) return { roster: published, origin: 'publicado' };
  if (local) return { roster: local, origin: 'local' };
  return { roster: emptyRoster(), origin: 'nenhum' };
}

/** Cria uma entrada de vendedor com token novo. Devolve o token em claro UMA vez. */
export async function createSellerAccess(roster, { sellerId, name }) {
  const token = generateToken();
  const entry = { sellerId, name, tokenHash: await sha256Hex(token) };
  const sellers = [...(roster.sellers ?? []).filter((s) => s.sellerId !== sellerId), entry];
  return { roster: { ...roster, sellers }, token, entry };
}

/** Define (ou troca) o acesso do gestor. */
export async function setManagerAccess(roster, { name = 'Gestor', token } = {}) {
  const value = token ? normalizeToken(token) : generateToken(4, 4);
  return {
    roster: { ...roster, manager: { name, tokenHash: await sha256Hex(value) } },
    token: value,
  };
}

export function removeSellerAccess(roster, sellerId) {
  return { ...roster, sellers: (roster.sellers ?? []).filter((s) => s.sellerId !== sellerId) };
}

/** Conteúdo pronto para salvar como `config/equipe.json`. */
export function exportRoster(roster) {
  return JSON.stringify(
    {
      version: 1,
      geradoEm: new Date().toISOString().slice(0, 10),
      manager: roster.manager ?? null,
      sellers: (roster.sellers ?? []).map((s) => ({
        sellerId: s.sellerId, name: s.name, tokenHash: s.tokenHash,
      })),
    },
    null,
    2,
  );
}
