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

// La sola presenza di un handler "fetch" basta per il requisito di
// installabilità: NON chiamiamo event.respondWith, così ogni richiesta
// (incluse quelle a Supabase) passa dritta al browser esattamente come se
// il service worker non ci fosse — nessuna intercettazione, per escludere
// del tutto che possa interferire col resto del gioco.
self.addEventListener('fetch', () => {});
