/**
 * Service worker — casca do aplicativo offline.
 *
 * Estratégia deliberada:
 *   - código e estilo: cache primeiro (a interface abre instantaneamente);
 *   - configuração, cadastro e QUALQUER dado de produção: rede primeiro, com
 *     cache apenas como último recurso. Placar velho servido como se fosse
 *     atual seria pior que placar nenhum.
 */

const VERSION = 'liga-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './src/app.js',
  './src/ui/dom.js',
  './src/ui/views/seller.js',
  './src/ui/views/manager.js',
  './src/ui/views/login.js',
  './src/ui/views/admin.js',
  './src/ui/components/widgets.js',
  './src/ui/components/waiting.js',
  './src/ui/components/chart.js',
  './src/core/format.js',
  './src/core/clock.js',
  './src/core/metrics.js',
  './src/core/ranking.js',
  './src/core/access.js',
  './src/core/gamification.js',
  './src/core/messages.js',
  './src/core/identity.js',
  './src/core/roster.js',
  './src/core/settings.js',
  './src/data/types.js',
  './src/data/store.js',
  './src/data/DataSource.js',
  './src/data/sources/registry.js',
  './src/data/sources/PendingSource.js',
  './src/data/sources/DemoSource.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isLiveData = url.pathname.includes('/config/') || url.searchParams.has('nocache');

  if (isLiveData) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
