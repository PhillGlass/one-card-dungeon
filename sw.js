// Service worker minimo. Chrome/Android richiedono un service worker
// registrato con un handler "fetch" perché una web app sia "installabile"
// a schermo intero (senza barre del browser), esattamente come il
// manifest.json qui a fianco. Non fa alcun caching/offline di proposito:
// serve solo a soddisfare questo requisito, senza rischiare di mostrare
// versioni vecchie del gioco dopo un aggiornamento.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
