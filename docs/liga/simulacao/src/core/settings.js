/**
 * CONFIGURAÇÃO
 * ============
 *
 * Base: `config/app.config.json`, versionado no repositório.
 * Sobreposição: ajustes que o gestor faz na tela de configuração, guardados no
 * navegador dele (`localStorage`). Assim o gestor muda horário comercial, metas,
 * faixas de nível e regras de privacidade sem precisar editar arquivo — e pode
 * exportar o resultado para virar o `app.config.json` definitivo.
 */

const STORAGE_KEY = 'dubosa.liga.config.overrides.v1';

let baseConfig = null;
let overrides = {};

function readOverrides() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeOverrides(value) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Merge profundo — arrays são substituídos por inteiro, não mesclados. */
export function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch.slice();
  if (patch && typeof patch === 'object' && !Array.isArray(base)) {
    const out = { ...(base ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      out[key] = value && typeof value === 'object' ? deepMerge(base?.[key], value) : value;
    }
    return out;
  }
  return patch === undefined ? base : patch;
}

export async function loadConfig(url = 'config/app.config.json') {
  // Build de arquivo único: não há arquivo para buscar, os dados vêm embutidos.
  const embutido = globalThis.__LIGA_DADOS__?.config;
  if (embutido) return setBaseConfig(embutido);

  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Não foi possível carregar ${url} (${res.status}).`);
  baseConfig = await res.json();
  overrides = readOverrides();
  return getConfig();
}

/** Usado nos testes e por adaptadores que já têm o JSON em memória. */
export function setBaseConfig(config) {
  baseConfig = config;
  overrides = readOverrides();
  return getConfig();
}

export function getConfig() {
  return deepMerge(baseConfig ?? {}, overrides);
}

export function getBaseConfig() {
  return baseConfig;
}

export function getOverrides() {
  return { ...overrides };
}

export function updateConfig(patch) {
  overrides = deepMerge(overrides, patch);
  writeOverrides(overrides);
  return getConfig();
}

export function resetConfig() {
  overrides = {};
  writeOverrides(overrides);
  return getConfig();
}

/** JSON pronto para virar o `config/app.config.json` do repositório. */
export function exportConfig() {
  return JSON.stringify(getConfig(), null, 2);
}

/**
 * Versão publicada, carimbada no build.
 *
 * Existe para responder "essa correção chegou no seu aparelho?" sem
 * adivinhação. Aberto do disco, ou servido por um build que não carimbou,
 * simplesmente não há versão — e a tela não inventa uma.
 */
export function versaoPublicada() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('meta[name="liga-versao"]')?.content ?? null;
}

/**
 * O navegador está oferecendo instalar o aplicativo?
 *
 * Existe para trocar "abra o menu de três pontos e procure Instalar" por um
 * botão na tela. A diferença não é de conforto: o passo a passo por menu é
 * onde a instalação parava.
 */
export function convitePendente() {
  return Boolean(globalThis.__ligaInstalar);
}

/** Aceita o convite. Devolve true se a pessoa confirmou. */
export async function instalarAplicativo() {
  const convite = globalThis.__ligaInstalar;
  if (!convite) return false;
  convite.prompt();
  const { outcome } = await convite.userChoice;
  globalThis.__ligaInstalar = null;
  return outcome === 'accepted';
}
