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
                       'marcas', 'anotacoes', 'duvida']) {
  const mod = await import(`./netlify/functions/${arquivo}.mjs`);
  const rota = (mod.config && mod.config.path) || `/api/${arquivo}`;
  ROTAS[rota] = mod.default;
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
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
