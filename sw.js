/**
 * SERVICE WORKER — NÃO GUARDA O CÓDIGO DO APLICATIVO
 * ==================================================
 *
 * A versão anterior guardava a casca do aplicativo para abrir rápido e
 * funcionar sem rede. O preço apareceu inteiro: uma falha de privacidade foi
 * corrigida no servidor e continuou acontecendo nos aparelhos, porque o
 * navegador seguia entregando o código guardado. E consertar isso exigia da
 * pessoa uma sequência que ela não tem por que conhecer — recarregar duas
 * vezes, fechar a aba, achar um botão em Configuração.
 *
 * Num placar de vendas, abrir alguns milissegundos mais rápido não vale nada
 * perto de mostrar a tela errada para a pessoa errada. Então este arquivo
 * deixou de guardar código: TUDO vem da rede, sempre. O que se publica é o que
 * se vê, na abertura seguinte, em qualquer navegador — sem depender de o
 * usuário saber de nada.
 *
 * O que sobra guardado é apenas a página inicial, e ela só é usada quando a
 * rede falha, para o aplicativo não morrer numa tela de erro do navegador.
 * Nunca para substituir uma versão que a rede poderia entregar.
 *
 * Ele continua existindo por um motivo: sem service worker, o Chrome e o Edge
 * não oferecem "instalar aplicativo", e é dali que sai a janela própria, sem
 * barra de endereços.
 */

const PREFIXO = 'liga-';
// Trocado no build por um resumo do conteúdo publicado.
const VERSION = `${PREFIXO}@@VERSAO@@`;
const RESERVA = './index.html';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // Só a página inicial, e buscada da rede na hora — nunca do cache HTTP.
    try {
      const cache = await caches.open(VERSION);
      const resposta = await fetch(RESERVA, { cache: 'reload' });
      if (resposta.ok) await cache.put(RESERVA, resposta);
    } catch { /* sem rede na instalação: a reserva fica para a próxima */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const nomes = await caches.keys();
    // Só o que é deste aplicativo: a origem é dividida com outros dois.
    const antigos = nomes.filter((n) => n.startsWith(PREFIXO) && n !== VERSION);
    await Promise.all(antigos.map((n) => caches.delete(n)));
    // `claim` dispara `controllerchange` nas janelas abertas, e a página já
    // recarrega sozinha nesse evento. Mandar o recarregamento também daqui
    // faria dois ao mesmo tempo — e num teste isso travou a página. Um dono
    // por comportamento: quem recarrega é a página.
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch (erro) {
      // Sem rede. Uma navegação recebe a página inicial guardada; o resto
      // falha honestamente, em vez de reviver uma versão antiga.
      if (request.mode === 'navigate') {
        const reserva = await caches.match(RESERVA);
        if (reserva) return reserva;
      }
      throw erro;
    }
  })());
});
