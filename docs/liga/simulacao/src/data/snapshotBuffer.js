/**
 * ACÚMULO DE SNAPSHOTS
 * ====================
 *
 * Algumas origens não têm histórico: respondem apenas "como está agora".
 * O sistema de pedidos é assim — ele diz quem já produziu hoje, não a curva do
 * dia.
 *
 * Sem linha do tempo não existe ritmo, projeção nem comparação com o mesmo
 * horário de ontem. Este módulo guarda cada leitura, montando a curva do dia
 * conforme o aplicativo fica aberto.
 *
 * LIMITE, dito com todas as letras: o acúmulo é POR NAVEGADOR. A curva existe
 * enquanto alguém mantém o aplicativo aberto, e cada máquina monta a sua. Para
 * uma curva confiável e igual para todos, a coleta precisa acontecer no
 * servidor, em intervalo fixo — ver `netlify/functions/producao.mjs` e
 * docs/INTEGRACAO-DADOS.md.
 */

const PREFIX = 'dubosa.liga.snapshots.';
const MAX_DIAS = 10;

function chave(date) {
  return `${PREFIX}${date}`;
}

function ler(date) {
  try {
    const raw = globalThis.localStorage?.getItem(chave(date));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function escrever(date, registros) {
  try {
    globalThis.localStorage?.setItem(chave(date), JSON.stringify(registros));
    return true;
  } catch {
    return false;
  }
}

/** Remove dias antigos para não crescer sem limite. */
export function limparAntigos(hoje) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const datas = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k?.startsWith(PREFIX)) datas.push(k.slice(PREFIX.length));
    }
    datas.sort().reverse();
    for (const data of datas.slice(MAX_DIAS)) {
      if (data !== hoje) storage.removeItem(chave(data));
    }
  } catch { /* sem armazenamento — o aplicativo segue funcionando */ }
}

/**
 * Guarda uma leitura e devolve a série acumulada do dia.
 *
 * Cada par (vendedor, horário) entra uma única vez: reler no mesmo minuto não
 * duplica ponto. Leituras iguais à anterior também não geram ponto novo — a
 * curva só ganha vértice quando a produção muda de fato.
 *
 * @param {string} date
 * @param {import('./types.js').ProductionRecord[]} novos
 * @returns {import('./types.js').ProductionRecord[]} histórico completo do dia
 */
export function acumular(date, novos) {
  const historico = ler(date);
  const vistos = new Set(historico.map((r) => `${r.sellerId}|${r.time}`));
  const ultimo = new Map();
  for (const r of historico) {
    const anterior = ultimo.get(r.sellerId);
    if (!anterior || r.time > anterior.time) ultimo.set(r.sellerId, r);
  }

  let mudou = false;
  for (const registro of novos ?? []) {
    const id = `${registro.sellerId}|${registro.time}`;
    if (vistos.has(id)) continue;
    const anterior = ultimo.get(registro.sellerId);
    if (anterior && anterior.orders === registro.orders && anterior.revenue === registro.revenue) continue;
    historico.push(registro);
    vistos.add(id);
    ultimo.set(registro.sellerId, registro);
    mudou = true;
  }

  if (mudou) {
    historico.sort((a, b) => (a.sellerId === b.sellerId
      ? a.time.localeCompare(b.time)
      : a.sellerId.localeCompare(b.sellerId)));
    escrever(date, historico);
  }

  limparAntigos(date);
  return historico;
}

/** Histórico guardado de um dia, sem gravar nada. */
export function historicoDe(date) {
  return ler(date);
}

/** Quantos pontos de curva já existem para o dia. */
export function pontosDe(date) {
  const historico = ler(date);
  return {
    registros: historico.length,
    horarios: new Set(historico.map((r) => r.time)).size,
    primeiro: historico[0]?.time ?? null,
    ultimo: historico.at(-1)?.time ?? null,
  };
}

export function limparTudo() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const chaves = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k?.startsWith(PREFIX)) chaves.push(k);
    }
    chaves.forEach((k) => storage.removeItem(k));
  } catch { /* nada a fazer */ }
}
