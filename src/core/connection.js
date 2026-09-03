/**
 * CONEXÃO COM A ORIGEM DOS DADOS
 * ==============================
 *
 * Guardada FORA da configuração exportável, de propósito.
 *
 * A conexão costuma carregar uma senha, e o `app.config.json` vai para o
 * repositório e é servido publicamente. Se a senha morasse lá, publicar o
 * aplicativo publicaria a senha do sistema de pedidos junto.
 *
 * Então: a conexão fica só no navegador do gestor, e `exportConfig()` nunca a
 * enxerga. Para a equipe inteira ler a origem, a busca precisa acontecer no
 * servidor, com a senha em variável de ambiente — ver
 * `netlify/functions/producao.mjs`.
 */

const STORAGE_KEY = 'dubosa.liga.conexao.v1';

export function emptyConnection() {
  return {
    adapter: 'pending',
    url: '',
    method: 'GET',
    auth: { mode: 'none', field: 'senha', value: '' },
    collectionPath: '',
    semantics: 'cumulative',
    timeMode: 'fetchTime',
    fieldMap: {},
    endpoint: '/api/producao',
  };
}

export function loadConnection() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return emptyConnection();
    return { ...emptyConnection(), ...JSON.parse(raw) };
  } catch {
    return emptyConnection();
  }
}

export function saveConnection(connection) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(connection));
    return true;
  } catch {
    return false;
  }
}

export function clearConnection() {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch { /* nada a fazer */ }
}

/** A conexão guarda algum segredo? Usado para avisar antes de exportar. */
export function hasSecret(connection) {
  return connection?.auth?.mode !== 'none' && Boolean(connection?.auth?.value);
}

/** Versão sem segredo — o que pode, com segurança, ir para o repositório. */
export function shareableConnection(connection) {
  const { auth, ...resto } = connection ?? {};
  return {
    ...resto,
    auth: { mode: auth?.mode ?? 'none', field: auth?.field ?? '', value: '' },
  };
}

/** Só os campos que o adaptador entende. */
export function toSourceOptions(connection) {
  return {
    url: connection?.url ?? '',
    method: connection?.method ?? 'GET',
    auth: connection?.auth ?? { mode: 'none' },
    collectionPath: connection?.collectionPath ?? '',
    semantics: connection?.semantics ?? 'cumulative',
    timeMode: connection?.timeMode ?? 'fetchTime',
    fieldMap: connection?.fieldMap ?? {},
    endpoint: connection?.endpoint ?? '/api/producao',
  };
}
