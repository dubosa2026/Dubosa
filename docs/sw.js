/* Service worker da Bússola: o app abre sem internet.
 *
 * Duas estrategias, de proposito.
 *
 * A PAGINA vem pela REDE primeiro. Ela carrega o app inteiro — telas,
 * contas, interpretacao da voz —, entao servi-la do cache faria uma
 * correcao levar dias para chegar ao celular. Ja aconteceu: um defeito da
 * voz corrigido aqui continuaria repetindo lancamento no aparelho. Sem
 * rede, o cache assume na hora e o app abre igual.
 *
 * O RESTO (icones) vem do cache primeiro, atualizando por tras: sao
 * arquivos que quase nunca mudam, e esperar a rede por eles so atrasaria a
 * tela.
 *
 * Nenhum lancamento passa por aqui — eles ficam no armazenamento do
 * aparelho e nunca viram rede.
 */
const CACHE = 'bussola-33c40128';
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

function guardar(pedido, resposta) {
  if (resposta && resposta.ok) {
    const copia = resposta.clone();
    caches.open(CACHE).then((c) => c.put(pedido, copia));
  }
  return resposta;
}

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);
  // A analise da IA nunca sai do cache: resposta velha de conselho e pior
  // que resposta nenhuma.
  if (ev.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  if (ev.request.mode === 'navigate') {
    // `cache: 'reload'` pula o cache HTTP do proprio navegador. Sem isso a
    // busca pela rede ainda podia devolver a pagina velha: o GitHub Pages
    // manda a pagina com validade de alguns minutos, e o navegador honra
    // essa validade antes mesmo de perguntar ao servidor. Uma correcao
    // ficava presa nesse meio do caminho.
    ev.respondWith(
      fetch(ev.request, { cache: 'reload' })
        .then((r) => guardar(ev.request, r))
        .catch(() => caches.match(ev.request).then((achado) => achado || caches.match('./index.html'))),
    );
    return;
  }

  ev.respondWith(caches.match(ev.request).then((achado) => {
    const rede = fetch(ev.request).then((r) => guardar(ev.request, r)).catch(() => achado);
    return achado || rede;
  }));
});
