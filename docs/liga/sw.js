/**
 * Service worker — casca do aplicativo offline.
 *
 * Estratégia deliberada:
 *   - código e estilo: cache primeiro (a interface abre instantaneamente);
 *   - configuração, cadastro e QUALQUER dado de produção: rede primeiro, com
 *     cache apenas como último recurso. Placar velho servido como se fosse
 *     atual seria pior que placar nenhum.
 */

// Todo cache deste aplicativo começa com este prefixo. Não é enfeite: o
// armazenamento de cache pertence à ORIGEM, não à pasta. Este app divide
// dubosa2026.github.io com outros dois, e uma limpeza que apagasse "tudo que
// não é meu" derrubaria o modo offline dos vizinhos — e o deles, o nosso.
const PREFIXO = 'liga-';
// A constante abaixo recebe, no build, um resumo do conteúdo publicado. Sem
// isso o nome do cache nunca mudava, e como a casca é servida do cache
// primeiro, um aparelho que já tinha aberto o aplicativo continuava rodando a
// versão antiga para sempre — correção publicada que nunca chegava a ninguém.
const VERSION = `${PREFIXO}3226b41f215c`;
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
      // `cache: 'reload'` pula o cache HTTP do próprio navegador. Sem isso a
      // busca podia devolver o arquivo velho: o GitHub Pages manda os arquivos
      // com validade de alguns minutos, e o navegador honra essa validade antes
      // mesmo de perguntar ao servidor — o cache novo nasceria com bytes
      // antigos dentro.
      .then((cache) => Promise.all(SHELL.map((caminho) => fetch(caminho, { cache: 'reload' })
        .then((resposta) => (resposta.ok ? cache.put(caminho, resposta) : null))
        .catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k.startsWith(PREFIXO) && k !== VERSION)
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // A PÁGINA vem pela rede primeiro. Ela carrega o aplicativo inteiro, então
  // servi-la do cache faria uma correção levar dias para chegar ao aparelho.
  // Sem rede, o cache assume na hora e o aplicativo abre igual.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'reload' })
        .then((resposta) => {
          const copia = resposta.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copia));
          return resposta;
        })
        .catch(() => caches.match(request).then((achado) => achado ?? caches.match('./index.html'))),
    );
    return;
  }

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
