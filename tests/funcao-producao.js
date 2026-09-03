/**
 * Testes da função de servidor `netlify/functions/producao.mjs`.
 *
 * A rede é simulada, no formato REAL do sistema de pedidos — lido do
 * código-fonte da própria página em 03/09/2026:
 *
 *   POST /api/entrar {pin}  -> cookie de sessão
 *   GET  /api/dados          -> os números, recortados pelo PIN
 *
 * O detalhe que manda no produto está em `vendedores`: três colunas —
 * gerente, vendedor, QUANTIDADE. Faturamento existe por carteira, não por
 * vendedor. Por isso o ranking individual sai por pedidos.
 *
 * O que está sendo verificado é o que importa nesta função: quem ela deixa
 * entrar e o que ela deixa sair para cada perfil.
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
const ONTEM = '2026-09-02';
const PIN = '522979';

/** Resposta no formato real de /api/dados, no escopo de um gestor. */
const RESPOSTA_PEDIDOS = {
  data: '03/09/2026',
  ontemData: '02/09/2026',
  geradoEm: '2026-09-03T17:00:00.000Z',
  gestor: 'EDUARDO LUIZ DOS SANTOS',
  nome: 'EDUARDO LUIZ DOS SANTOS',
  hoje: 17,
  valorDia: 370332,
  ultimaNota: '03/09/2026 10:43',
  diaUtil: 3,
  diasUteis: 21,
  carteiras: [['EDUARDO LUIZ DOS SANTOS', 17, 370332]],
  vendedores: [
    ['EDUARDO LUIZ DOS SANTOS', 'ANA FERREIRA', 6],
    ['EDUARDO LUIZ DOS SANTOS', 'BRUNO MACHADO', 9],
    ['EDUARDO LUIZ DOS SANTOS', 'CARLA TAVARES', 2],
  ],
  carteirasOntemFechado: [['EDUARDO LUIZ DOS SANTOS', 24, 410000]],
  vendedoresOntemFechado: [
    ['EDUARDO LUIZ DOS SANTOS', 'ANA FERREIRA', 11],
    ['EDUARDO LUIZ DOS SANTOS', 'BRUNO MACHADO', 13],
  ],
  estados: [['TO', 9], ['RO', 8]],
};

/** Diego está no cadastro e não veio na resposta: precisa aparecer zerado. */
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
let corpoEntrar = null;

async function prepararAmbiente() {
  process.env.URL = 'https://liga.exemplo';
  process.env.PEDIDOS_BASE = 'https://pedidos.exemplo';
  process.env.PEDIDOS_PIN = PIN;

  const roster = {
    version: 1,
    manager: { name: 'Gestor', tokenHash: await sha256Hex(TOKEN_GESTOR) },
    sellers: [{ sellerId: 'ana-ferreira', name: 'Ana Ferreira', tokenHash: await sha256Hex(TOKEN_ANA) }],
  };

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    chamadas.push(url);
    const responder = (body) => new Response(JSON.stringify(body), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });

    if (url.includes('config/equipe.json')) return responder(roster);
    if (url.includes('config/vendedores.json')) return responder(EQUIPE);

    if (url.includes('/api/entrar')) {
      corpoEntrar = init?.body ? JSON.parse(init.body) : null;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'sessao=abc123; Path=/; HttpOnly' },
      });
    }
    if (url.includes('/api/dados')) return responder(RESPOSTA_PEDIDOS);

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

console.log('\nFUNÇÃO DE PRODUÇÃO — LEITURA DA ORIGEM');

const vendedor = await chamar({ data: DATE, token: TOKEN_ANA, hora: '14:00' });

await check('entra com o PIN antes de pedir os dados', () => {
  assert(chamadas.some((u) => u.includes('/api/entrar')), 'não houve entrada com PIN');
  assert(chamadas.some((u) => u.includes('/api/dados')), 'não buscou os dados');
  assertEqual(corpoEntrar?.pin, PIN);
});

await check('o horário avaliado é o do chamador, não o do servidor', () => {
  const horas = new Set(vendedor.body.records.map((r) => r.time));
  assertEqual(horas.size, 1);
  assertEqual([...horas][0], '14:00');
});

await check('a origem declara que não tem faturamento por vendedor', () => {
  assertEqual(vendedor.body.meta.origem.faturamentoPorVendedor, false);
});

console.log('\nFUNÇÃO DE PRODUÇÃO — ESCOPO DO VENDEDOR');

await check('o vendedor recebe apenas os próprios registros', () => {
  assertEqual(vendedor.res.status, 200);
  const nomes = new Set(vendedor.body.records.map((r) => r.sellerName));
  assertEqual(nomes.size, 1);
  assertEqual([...nomes][0], 'ANA FERREIRA');
  assertEqual(vendedor.body.records[0].orders, 6);
});

await check('nenhum nome de colega atravessa a função', () => {
  const blob = JSON.stringify(vendedor.body).toUpperCase();
  for (const proibido of ['BRUNO', 'MACHADO', 'CARLA', 'TAVARES', 'DIEGO', 'PEIXOTO']) {
    assert(!blob.includes(proibido), `vazou "${proibido}"`);
  }
});

await check('a posição vem calculada no servidor, por pedidos', () => {
  // Bruno 9, Ana 6, Carla 2, Diego 0 (do cadastro) -> Ana é a 2ª de 4.
  assertEqual(vendedor.body.competitive.position, 2);
  assertEqual(vendedor.body.competitive.total, 4, 'o zerado precisa contar no total:');
  assertEqual(vendedor.body.competitive.isLeader, false);
});

await check('a distância vem como magnitude, sem identidade', () => {
  assertEqual(vendedor.body.competitive.toNext.orders, 3, 'faltam 3 pedidos para alcançar o 1º:');
  assertEqual(vendedor.body.competitive.toPrevious.orders, 4);
  assertEqual(Object.keys(vendedor.body.competitive.toNext).sort().join(','), 'orders,revenue');
});

await check('o agregado da equipe vem só como soma', () => {
  assertEqual(vendedor.body.team.sellerCount, 4);
  assertEqual(vendedor.body.team.activeCount, 3);
  assertEqual(vendedor.body.team.orders, 17);
  assert(!('sellers' in vendedor.body.team) && !('rows' in vendedor.body.team));
});

console.log('\nFUNÇÃO DE PRODUÇÃO — DIA ANTERIOR');

await check('o dia anterior vem fechado, do campo certo', async () => {
  const ontem = await chamar({ data: ONTEM, token: TOKEN_GESTOR });
  assertEqual(ontem.res.status, 200);
  assertEqual(ontem.body.records.length, 2);
  const ana = ontem.body.records.find((r) => r.sellerName === 'ANA FERREIRA');
  assertEqual(ana.orders, 11, 'deveria vir o fechamento de ontem, não o número de hoje:');
  assertEqual(ana.time, '23:59');
});

await check('dia sem correspondência na origem devolve vazio, não erro', async () => {
  const antigo = await chamar({ data: '2026-08-20', token: TOKEN_GESTOR });
  assertEqual(antigo.res.status, 200);
  assertEqual(antigo.body.records.length, 0);
});

console.log('\nFUNÇÃO DE PRODUÇÃO — ESCOPO DO GESTOR');

await check('o gestor recebe a equipe inteira', async () => {
  const { res, body } = await chamar({ data: DATE, token: TOKEN_GESTOR });
  assertEqual(res.status, 200);
  assertEqual(body.records.length, 3);
  assertEqual(body.meta.escopo, 'manager');
});

console.log('\nFUNÇÃO DE PRODUÇÃO — SEGREDO E FALHA');

await check('o PIN não volta na resposta', () => {
  const blob = JSON.stringify(vendedor.body);
  assert(!blob.includes(PIN), 'o PIN vazou na resposta ao vendedor');
});

await check('PIN recusado vira mensagem clara, não erro cru', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => (String(input).includes('/api/entrar')
    ? new Response('não autorizado', { status: 401 })
    : original(input, init));
  const { res, body } = await chamar({ data: DATE, token: TOKEN_ANA });
  globalThis.fetch = original;
  assertEqual(res.status, 502);
  assert(body.message.includes('PIN recusado'), `mensagem pouco clara: ${body.message}`);
});

await check('falha da origem não derruba a função nem vaza detalhe interno', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => (String(input).includes('/api/dados')
    ? new Response('erro', { status: 500 })
    : original(input, init));
  const { res, body } = await chamar({ data: DATE, token: TOKEN_ANA });
  globalThis.fetch = original;
  assertEqual(res.status, 502);
  assertEqual(body.records.length, 0);
});

console.log(`\n${passed} verificações ok, ${failures.length} falha(s).`);
if (failures.length) process.exit(1);
