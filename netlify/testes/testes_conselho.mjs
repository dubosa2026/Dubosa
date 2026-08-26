/* Testes da funcao /api/conselho, sem gastar um centavo com a Anthropic.
 *
 *     node netlify/testes/testes_conselho.mjs
 *
 * Sobe um servidor local que finge ser a API da Anthropic e aponta o SDK
 * para ele com ANTHROPIC_BASE_URL. Assim da para conferir o que importa: os
 * freios (recurso desligado, senha errada, teto do dia) e — o principal —
 * que o texto livre dos lancamentos NUNCA chega ao modelo.
 */
import http from 'node:http';

let falhas = 0;
const ok = (cond, nome, extra = '') => {
  console.log((cond ? '  ok    ' : '  FALHA ') + nome + (cond ? '' : '  -> ' + extra));
  if (!cond) falhas++;
};

/* O sosia da Anthropic. Guarda o corpo de cada chamada para o teste
   inspecionar depois. */
const recebidos = [];
const RESPOSTA = {
  id: 'msg_falso', type: 'message', role: 'assistant', model: 'claude-haiku-4-5',
  content: [{
    type: 'text',
    text: JSON.stringify({
      diagnostico: 'Você fecha o mês no positivo, mas a dívida do cartão come a sobra.',
      acoes: [{ titulo: 'Quitar o cartão primeiro', porque: 'O juro é maior que qualquer rendimento.', impacto_mes: 'R$ 240' }],
      risco: '',
    }),
  }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 100 },
};

const servidor = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => { corpo += c; });
  req.on('end', () => {
    recebidos.push({ url: req.url, corpo });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(RESPOSTA));
  });
});

await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const porta = servidor.address().port;
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${porta}`;

const { default: conselho } = await import('../functions/conselho.mjs');

const RETRATO = {
  saldo: 3180, entra_mes: 6800, fixo_mes: 2986, media_dia_variavel: 115,
  dias_de_historico: 30, confianca: 'alta', limite_do_dia: 288,
  projecao_fim_do_mes: 2420, projecao_12_meses: 6812, zera_em: null,
  gastos_30_dias: [{ categoria: 'Mercado', total: 1566 }],
  contas_fixas: [{ nome: 'Aluguel', valor: 2100, tipo: 'saida', ciclo: 'mensal' }],
  dividas: [{ nome: 'Cartão', saldo: 6400, juros_mes: 0.135, parcela: 700 }],
  reserva_meta_meses: 3, taxa_ano_informada: 0.105,
};

const pedir = (corpo, metodo = 'POST') => conselho(new Request('http://local/api/conselho', {
  method: metodo,
  headers: { 'content-type': 'application/json' },
  body: metodo === 'POST' ? JSON.stringify(corpo) : undefined,
}));

console.log('\n== freios ==');
delete process.env.IA_LIGADA;
process.env.ANTHROPIC_API_KEY = 'sk-falsa';
let r = await pedir({ retrato: RETRATO });
ok(r.status === 503, 'nasce desligada mesmo com a chave no ambiente', r.status);
ok((await r.json()).erro.includes('IA_LIGADA'), 'a mensagem diz como ligar');

process.env.IA_LIGADA = '1';
r = await pedir({}, 'GET');
ok(r.status === 405, 'recusa GET', r.status);

r = await pedir({ semRetrato: true });
ok(r.status === 400, 'recusa pedido sem retrato', r.status);

process.env.SENHA_IA = 'abre-te-sesamo';
r = await pedir({ retrato: RETRATO, senha: 'chutei' });
ok(r.status === 401, 'senha errada é recusada', r.status);

console.log('\n== caminho feliz ==');
r = await pedir({ retrato: RETRATO, senha: 'abre-te-sesamo' });
const corpo = await r.json();
ok(r.status === 200, 'responde 200 com a senha certa', r.status);
ok(corpo.resposta && corpo.resposta.diagnostico.includes('cartão'), 'devolve o diagnóstico', JSON.stringify(corpo).slice(0, 120));
ok(corpo.resposta.acoes.length === 1 && corpo.resposta.acoes[0].impacto_mes === 'R$ 240',
   'devolve a ação com o impacto em dinheiro');

console.log('\n== o que chega ao modelo ==');
const enviado = recebidos[recebidos.length - 1].corpo;
ok(enviado.includes('"saldo": 3180') || enviado.includes('3180'), 'o retrato numérico chega');
ok(!/descricao|descrição/i.test(enviado), 'NÃO vai descrição de lançamento');
ok(!/\d{4}-\d{2}-\d{2}/.test(enviado), 'NÃO vai data de gasto nenhuma', enviado.slice(0, 200));
ok(/NUNCA inventa/.test(enviado), 'a instrução de não inventar taxa vai junto');

console.log('\n== o texto livre é cortado mesmo se escapar do app ==');
recebidos.length = 0;
await pedir({
  retrato: Object.assign({}, RETRATO, {
    lancamentos: [{ descricao: 'presente para a Ana', valor: 300 }],
    descricoes: ['almoço com o Dr. Silva'],
  }),
  senha: 'abre-te-sesamo',
});
const ultimo = recebidos[recebidos.length - 1].corpo;
ok(!/Ana|Silva/.test(ultimo), 'nome de pessoa não passa', ultimo.slice(0, 200));

console.log('\n== teto do dia ==');
process.env.IA_POR_DIA = '1';   // ja gastamos mais que isso acima
r = await pedir({ retrato: RETRATO, senha: 'abre-te-sesamo' });
ok(r.status === 429, 'estourado o teto, recusa', r.status);
ok((await r.json()).erro.includes('continuam funcionando'),
   'e lembra que os conselhos locais continuam de pé');

servidor.close();
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo passou.');
process.exit(falhas ? 1 : 0);
