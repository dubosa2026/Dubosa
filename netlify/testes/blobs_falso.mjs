/* Stub do Netlify Blobs para teste local: guarda tudo em memoria, com a
   mesma superficie que as funcoes usam.

   Inclui as escritas condicionais (onlyIfMatch / onlyIfNew) porque e nelas
   que o contador de uso da IA se apoia -- sem isso o teste passaria por um
   caminho diferente do que roda em producao, e a corrida de escrita, que e
   justamente o risco, nunca seria exercitada. */
const depositos = new Map();

/* Etag simples e deterministica: o conteudo basta para saber se mudou. */
function etagDe(texto) {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return '"' + h.toString(36) + '-' + texto.length + '"';
}

export function getStore(nome) {
  if (!depositos.has(nome)) depositos.set(nome, new Map());
  const m = depositos.get(nome);

  function gravar(chave, texto, opcoes) {
    const atual = m.get(chave);
    if (opcoes?.onlyIfNew && atual !== undefined) {
      return { modified: false, etag: etagDe(atual) };
    }
    if (opcoes?.onlyIfMatch !== undefined) {
      const etagAtual = atual === undefined ? null : etagDe(atual);
      if (etagAtual !== opcoes.onlyIfMatch) {
        return { modified: false, etag: etagAtual };
      }
    }
    m.set(chave, texto);
    return { modified: true, etag: etagDe(texto) };
  }

  return {
    async get(chave, opcoes) {
      const v = m.get(chave);
      if (v === undefined) return null;
      return opcoes?.type === 'json' ? JSON.parse(v) : v;
    },
    async getWithMetadata(chave, opcoes) {
      const v = m.get(chave);
      if (v === undefined) return null;
      return {
        data: opcoes?.type === 'json' ? JSON.parse(v) : v,
        etag: etagDe(v),
        metadata: {},
      };
    },
    async set(chave, valor, opcoes) { return gravar(chave, String(valor), opcoes); },
    async setJSON(chave, valor, opcoes) { return gravar(chave, JSON.stringify(valor), opcoes); },
    async delete(chave) { m.delete(chave); },
  };
}

export const __depositos = depositos;
