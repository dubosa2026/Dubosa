/* Serve app/dist e roda as funcoes reais do Netlify, sem alterar uma linha
   delas: o unico substituto e o @netlify/blobs, que aqui guarda em memoria. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = '/home/user/Dubosa/app/dist';
const publicar = (await import('./netlify/functions/publicar.mjs')).default;
const carteira = (await import('./netlify/functions/carteira.mjs')).default;

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
      const fn = url.pathname === '/api/publicar' ? publicar : carteira;
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
}).listen(8899, () => console.log('teste em http://localhost:8899'));
