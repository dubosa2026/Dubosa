/* Service worker da Bússola: o app abre sem internet.
 *
 * Estrategia: responde do cache na hora e busca a versao nova por tras. A
 * proxima abertura ja pega a atualizacao. Nenhum dado de lancamento passa
 * por aqui — eles ficam no localStorage do aparelho e nunca viram rede.
 */
const CACHE = 'bussola-1300447933';
const ARQUIVOS = ['./', './index.html', './manifest.webmanifest',
  './icone-192.png', './icone-512.png', './icone-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((ns) => Promise.all(ns.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  // A analise da IA nunca sai do cache: resposta velha de conselho e pior
  // que resposta nenhuma.
  if (ev.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  ev.respondWith(caches.match(ev.request).then((achado) => {
    const rede = fetch(ev.request).then((r) => {
      if (r && r.ok) caches.open(CACHE).then((c) => c.put(ev.request, r.clone()));
      return r;
    }).catch(() => achado);
    return achado || rede;
  }));
});
