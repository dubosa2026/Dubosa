/**
 * VARREDURA DE NOMES
 * ==================
 *
 * Base comum das barreiras de privacidade: decidir se um texto identifica
 * alguém da equipe.
 *
 * A regra é a mesma em todos os pontos do sistema: um sobrenome que várias
 * pessoas dividem (Santos, Oliveira, Silva) não aponta para ninguém e não pode
 * derrubar um painel; o nome completo de um colega, o id dele, ou um termo que
 * só ele tem, sim.
 */

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'junior', 'filho', 'neto', 'sobrinho']);

/** Minúsculas, sem acento — comparação estável de nomes. */
export function normalizeForScan(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Termos de um nome com potencial de identificar alguém. */
export function nameTokens(name) {
  return normalizeForScan(name)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !PARTICULAS.has(token));
}

/**
 * Termos que identificam UM colega específico: exclusivos dele na equipe e
 * ausentes do nome de quem está olhando.
 * @param {{sellerId:string, sellerName:string}[]} allSellers
 * @param {string} ownSellerId
 * @returns {Set<string>}
 */
export function identifyingTokens(allSellers = [], ownSellerId = null) {
  const frequency = new Map();
  for (const seller of allSellers) {
    for (const token of new Set(nameTokens(seller.sellerName))) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }
  const own = allSellers.find((s) => s.sellerId === ownSellerId);
  const ownTokens = new Set(nameTokens(own?.sellerName ?? ''));

  const out = new Set();
  for (const seller of allSellers) {
    if (seller.sellerId === ownSellerId) continue;
    for (const token of nameTokens(seller.sellerName)) {
      if (ownTokens.has(token)) continue;
      if (frequency.get(token) !== 1) continue;
      out.add(token);
    }
  }
  return out;
}

/**
 * O texto identifica algum terceiro?
 * @param {string} text
 * @param {{sellerId:string, sellerName:string}[]} others  colegas
 * @param {Set<string>} tokens  saída de identifyingTokens
 */
export function textIdentifiesOther(text, others = [], tokens = new Set()) {
  const haystack = normalizeForScan(text);
  if (!haystack) return null;

  for (const other of others) {
    const full = normalizeForScan(other.sellerName ?? '');
    if (full.length >= 5 && haystack.includes(full)) return other.sellerName;
    const id = normalizeForScan(other.sellerId ?? '');
    if (id.length >= 5 && haystack.includes(id)) return other.sellerId;
  }
  for (const token of tokens) {
    if (haystack.includes(token)) return token;
  }
  return null;
}
