/* Serve app/dist e roda as funcoes reais do Netlify, sem alterar uma linha
   delas: o unico substituto e o @netlify/blobs, que aqui guarda em memoria. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = '/home/user/Dubosa/app/dist';
// PORTA solta permite subir um segundo servidor ao lado do primeiro -- e o
// que o test_blobs_antigo.py faz, com outro runtime de blobs.
const PORTA = Number(process.env.PORTA) || 8899;
// Cada funcao declara sua rota em `export const config`. Aqui o roteamento
// e montado a partir disso, para nao precisar lembrar de registrar cada uma
// -- foi o que quebrou quando /api/situacao caiu no handler da carteira.
const ROTAS = {};
for (const arquivo of ['publicar', 'carteira', 'situacao', 'apagar',
                       'marcas', 'anotacoes', 'duvida', 'caderno', 'agenda']) {
  const mod = await import(`./netlify/functions/${arquivo}.mjs`);
  const rota = (mod.config && mod.config.path) || `/api/${arquivo}`;
  ROTAS[rota] = mod.default;
}

/* As funcoes agendadas nao tem rota: o Netlify as chama pelo cron. Aqui elas
   ficam sob /__tarefa/<nome> para o teste conseguir disparar na hora. */
const TAREFAS = {};
for (const arquivo of ['lembretes', 'resumo']) {
  const mod = await import(`./netlify/functions/${arquivo}.mjs`);
  TAREFAS[arquivo] = mod.default;
}

/* Brevo falso: com CAIXA_FALSA definida, o envio nao sai da maquina -- vai
   para um arquivo que o teste le. Fica aqui, e nao em email.mjs, para o
   codigo que roda em producao nao carregar caminho de teste dentro. */
const CAIXA = process.env.CAIXA_FALSA;
if (CAIXA) {
  const fetchReal = globalThis.fetch;
  globalThis.fetch = async (entrada, opcoes) => {
    const alvo = String(entrada && entrada.url ? entrada.url : entrada);
    if (!alvo.includes('api.brevo.com')) return fetchReal(entrada, opcoes);
    const corpo = JSON.parse((opcoes && opcoes.body) || '{}');
    let caixa = [];
    try { caixa = JSON.parse(fs.readFileSync(CAIXA, 'utf-8')); } catch { caixa = []; }
    caixa.push({
      para: corpo.to?.[0]?.email || '',
      assunto: corpo.subject || '',
      html: corpo.htmlContent || '',
      texto: corpo.textContent || '',
    });
    fs.writeFileSync(CAIXA, JSON.stringify(caixa, null, 1));
    return new Response('{"messageId":"falso"}', { status: 201 });
  };
}

/* Semeia um compromisso direto no blob, para o teste montar o caso do
   compromisso que venceu enquanto o site estava fora do ar. */
async function semear(dados) {
  const { lojaAgenda, chaveVendedor } = await import('./netlify/lib/loja.mjs');
  const loja = lojaAgenda();
  const chave = chaveVendedor(dados.vendedor);
  const tudo = (await loja.get(chave, { type: 'json' })) || {};
  tudo['f'.repeat(16)] = {
    cliente: 'CLI101', nome: 'CLI-0000000101 - SOLAR NORTE',
    quando: new Date(dados.quando).toISOString(), obs: '', criadoEm: Date.now(),
  };
  await loja.setJSON(chave, tudo);
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/__tarefa/')) {
      const fn = TAREFAS[url.pathname.slice('/__tarefa/'.length)];
      if (!fn) { res.writeHead(404); res.end('tarefa desconhecida'); return; }
      const r = await fn();
      res.writeHead(200); res.end(await r.text());
      return;
    }
    if (url.pathname === '/__semear') {
      const corpo = await new Promise((r) => {
        let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d));
      });
      await semear(JSON.parse(corpo));
      res.writeHead(200); res.end('ok');
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const corpo = await new Promise((r) => {
        let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d));
      });
      const pedido = new Request('http://localhost' + url.pathname, {
        method: req.method, headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo,
      });
      const fn = ROTAS[url.pathname];
      if (!fn) { res.writeHead(404); res.end('rota desconhecida: ' + url.pathname); return; }
      const resposta = await fn(pedido);
      res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
      res.end(await resposta.text());
      return;
    }
    let arquivo = url.pathname === '/' ? '/index.html' : url.pathname;
    if (arquivo.endsWith('/')) arquivo += 'index.html';
    if (!path.extname(arquivo)) arquivo += '/index.html';
    const caminho = path.join(DIST, arquivo);
    if (!caminho.startsWith(DIST) || !fs.existsSync(caminho)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(caminho)] || 'application/octet-stream' });
    res.end(fs.readFileSync(caminho));
  } catch (e) {
    console.error('ERRO', url.pathname, e);
    res.writeHead(500); res.end(String(e && e.stack || e));
  }
}).listen(PORTA, () => console.log('teste em http://localhost:' + PORTA));
