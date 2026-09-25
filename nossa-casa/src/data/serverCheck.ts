// Sem dependências de React Native: testado contra a API real em tests/e2e-api.test.ts.

/** Confere se o endereço/chave respondem e se o SQL do banco já foi rodado. Retorna o problema ou null. */
export async function checkServer(url: string, anonKey: string): Promise<string | null> {
  const base = url.trim().replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetch(`${base}/rest/v1/households?select=id&limit=1`, {
      // As chaves novas (sb_publishable_...) vão só no cabeçalho apikey; as antigas (JWT) também como Bearer.
      headers: anonKey.trim().split('.').length === 3
        ? { apikey: anonKey.trim(), Authorization: `Bearer ${anonKey.trim()}` }
        : { apikey: anonKey.trim() },
    });
  } catch {
    return 'Não consegui acessar esse endereço. Confira a URL do projeto e a internet.';
  }
  if (res.ok) return null;
  let body: { code?: string; message?: string } = {};
  try {
    body = await res.json();
  } catch {
    // resposta sem JSON
  }
  // Tabela existe, mas sem login não pode ler: é exatamente o esperado.
  if (body.code === '42501') return null;
  if (body.code === 'PGRST205' || body.code === '42P01' || res.status === 404) {
    return 'O banco ainda não foi preparado: no Supabase, abra o SQL Editor e rode o arquivo 001_nossa_casa.sql.';
  }
  if (res.status === 401 || res.status === 403) return 'A chave pública (anon key) não foi aceita. Copie de novo em Project Settings → API.';
  return `O servidor respondeu com erro (${res.status}${body.message ? `: ${body.message}` : ''}).`;
}
