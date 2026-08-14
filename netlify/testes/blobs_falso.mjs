/* Stub do Netlify Blobs para teste local: guarda tudo em memoria, com a
   mesma superficie que as funcoes usam (get, set, setJSON). */
const depositos = new Map();
export function getStore(nome) {
  if (!depositos.has(nome)) depositos.set(nome, new Map());
  const m = depositos.get(nome);
  return {
    async get(chave, opcoes) {
      const v = m.get(chave);
      if (v === undefined) return null;
      return opcoes?.type === 'json' ? JSON.parse(v) : v;
    },
    async set(chave, valor) { m.set(chave, String(valor)); },
    async setJSON(chave, valor) { m.set(chave, JSON.stringify(valor)); },
  };
}
export const __depositos = depositos;
