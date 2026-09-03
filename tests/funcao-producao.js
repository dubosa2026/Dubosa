/**
 * Testes da função de servidor `netlify/functions/producao.mjs`.
 *
 * A rede é simulada: substituímos `fetch` para devolver o cadastro publicado e
 * uma resposta plausível do sistema de pedidos. O que está sendo verificado é o
 * que realmente importa nesta função — quem ela deixa entrar e o que ela deixa
 * sair para cada perfil.
 *
 * Executar com: node tests/funcao-producao.js
 */

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  FALHA ${name}\n       ${err.message}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg ?? 'condição falsa'); }
function assertEqual(a, b, msg) { if (a !== b) throw new Error(`${msg ?? ''} esperado ${b}, obtido ${a}`); }

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TOKEN_GESTOR = 'GEST-AAAA-BBBB-CCCC';
const TOKEN_ANA = 'ANAA-1111-2222';
const DATE = '2026-09-03';

// A base traz só quem produziu — Diego, que está zerado, não aparece nela.
const RESPOSTA_PEDIDOS = [
  { nome: 'ANA FERREIRA', pedidos: 6, faturamento: 'R$ 60.000,00' },
  { nome: 'BRUNO MACHADO', pedidos: 9, faturamento: 'R$ 91.000,00' },
  { nome: 'CARLA TAVARES', pedidos: 2, faturamento: 'R$ 12.000,00' },
];

const EQUIPE = {
  version: 1,
  vendedores: [
    { sellerId: 'ana-ferreira', name: 'Ana Ferreira', uf: 'TO' },
    { sellerId: 'bruno-machado', name: 'Bruno Machado', uf: 'TO' },
    { sellerId: 'carla-tavares', name: 'Carla Tavares', uf: 'RO' },
    { sellerId: 'diego-peixoto', name: 'Diego Peixoto', uf: 'RO' },
  ],
};

const chamadas = [];

async function prepararAmbiente() {
  process.env.URL = 'https://liga.exemplo';
  process.env.PEDIDOS_URL = 'https://pedidos.exemplo/api?data={data}';
  process.env.PEDIDOS_SENHA = 'senha-secreta';
  process.env.PEDIDOS_AUTH = 'query';
  process.env.PEDIDOS_CAMPO = 'senha';

  const roster = {
    version: 1,
    manager: { name: 'Gestor', tokenHash: await sha256Hex(TOKEN_GESTOR) },
    sellers: [{ sellerId: 'ana-ferreira', name: 'Ana Ferreira', tokenHash: await sha256Hex(TOKEN_ANA) }],
  };

  globalThis.fetch = async (input) => {
    const url = String(input);
    chamadas.push(url);
    const responder = (body) => new Response(JSON.stringify(body), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
    if (url.includes('config/equipe.json')) return responder(roster);
    if (url.includes('config/vendedores.json')) return responder(EQUIPE);
    if (url.includes('pedidos.exemplo')) return responder(RESPOSTA_PEDIDOS);
    return new Response('não encontrado', { status: 404 });
  };
}

await prepararAmbiente();
const { default: handler } = await import('../netlify/functions/producao.mjs');

const chamar = async (params) => {
  const url = new URL('https://liga.exemplo/api/producao');
  for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
  const res = await handler(new Request(url));
  return { res, body: await res.json() };
};

console.log('\nFUNÇÃO DE PRODUÇÃO — ACESSO');

await check('código não reconhecido recebe 403 e nenhum dado', async () => {
  const { res, body } = await chamar({ data: DATE, token: 'XXXX-XXXX-XXXX' });
  assertEqual(res.status, 403);
  assert(!body.records, 'devolveu registros para um código inválido');
});

await check('chamada sem data é recusada', async () => {
  const { res } = await chamar({ data: null, token: TOKEN_ANA });
  assertEqual(res.status, 400);
});

console.log('\nFUNÇÃO DE PRODUÇÃO — ESCOPO DO VENDEDOR');

const vendedor = await chamar({ data: DATE, token: TOKEN_ANA, hora: '14:00' });

await check('o vendedor recebe apenas os próprios registros', () => {
  assertEqual(vendedor.res.status, 200);
  const nomes = new Set(vendedor.body.records.map((r) => r.sellerName));
  assertEqual(nomes.size, 1);
  assertEqual([...nomes][0], 'ANA FERREIRA');
});

await check('nenhum nome de colega atravessa a função', () => {
  const blob = JSON.stringify(vendedor.body).toUpperCase();
  for (const proibido of ['BRUNO', 'MACHADO', 'CARLA', 'TAVARES', 'DIEGO', 'PEIXOTO']) {
    assert(!blob.includes(proibido), `vazou "${proibido}"`);
  }
});

await check('nenhum faturamento de colega atravessa a função', () => {
  const blob = JSON.stringify(vendedor.body);
  for (const valor of ['91000', '12000']) {
    assert(!blob.includes(valor), `vazou o valor ${valor}`);
  }
});

await check('o horário avaliado é o do chamador, não o do servidor', () => {
  // Este teste existe porque a versão anterior carimbava o registro com o
  // relógio do servidor: rodar depois das 14h fazia a leitura cair fora da
  // janela avaliada e o ranking saía zerado, sem explicação aparente.
  const horas = new Set(vendedor.body.records.map((r) => r.time));
  assertEqual(horas.size, 1);
  assertEqual([...horas][0], '14:00');
});

await check('a posição vem calculada no servidor', () => {
  assertEqual(vendedor.body.competitive.position, 2, 'Ana deveria ser a 2ª (Bruno 91k, Ana 60k):');
  assertEqual(vendedor.body.competitive.total, 4, 'o zerado precisa contar no total:');
  assertEqual(vendedor.body.competitive.isLeader, false);
});

await check('a distância vem como magnitude, sem identidade', () => {
  assertEqual(vendedor.body.competitive.toNext.revenue, 31000);
  assertEqual(vendedor.body.competitive.toPrevious.revenue, 48000);
  assertEqual(Object.keys(vendedor.body.competitive.toNext).sort().join(','), 'orders,revenue');
});

await check('o agregado da equipe vem só como soma', () => {
  assertEqual(vendedor.body.team.sellerCount, 4);
  assertEqual(vendedor.body.team.activeCount, 3);
  assertEqual(vendedor.body.team.revenue, 163000);
  assert(!('sellers' in vendedor.body.team) && !('rows' in vendedor.body.team));
});

console.log('\nFUNÇÃO DE PRODUÇÃO — ESCOPO DO GESTOR');

await check('o gestor recebe a equipe inteira', async () => {
  const { res, body } = await chamar({ data: DATE, token: TOKEN_GESTOR });
  assertEqual(res.status, 200);
  assertEqual(body.records.length, 3);
  assertEqual(body.meta.escopo, 'manager');
});

console.log('\nFUNÇÃO DE PRODUÇÃO — SEGREDO');

await check('a senha vai para o sistema de pedidos e não volta na resposta', () => {
  assert(chamadas.some((u) => u.includes('senha=senha-secreta')), 'a senha não foi enviada à origem');
  const blob = JSON.stringify(vendedor.body);
  assert(!blob.includes('senha-secreta'), 'a senha vazou na resposta ao vendedor');
});

await check('falha da origem não derruba a função nem vaza detalhe interno', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => (String(input).includes('pedidos.exemplo')
    ? new Response('erro', { status: 500 })
    : original(input));
  const { res, body } = await chamar({ data: DATE, token: TOKEN_ANA });
  assertEqual(res.status, 502);
  assertEqual(body.records.length, 0);
  globalThis.fetch = original;
});

console.log(`\n${passed} verificações ok, ${failures.length} falha(s).`);
if (failures.length) process.exit(1);
