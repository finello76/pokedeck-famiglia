/**
 * Service worker: rende l'app usabile senza rete.
 *
 * Deve stare nella RADICE del progetto: un service worker controlla solo gli
 * URL che stanno al suo livello o più in basso. Se fosse in `src/` non potrebbe
 * servire `index.html`.
 *
 * Tre strategie, una per tipo di risorsa:
 *
 * 1. Guscio dell'app (HTML, CSS, JS) e dati dei set → **cache-first**.
 *    Cambiano solo quando pubblico una versione nuova, quindi li precarico in
 *    installazione e li servo dalla cache: apertura istantanea e offline totale.
 * 2. Immagini delle carte (assets.tcgdex.net) → **cache-first a richiesta**.
 *    Sono migliaia: precaricarle tutte sarebbe assurdo. Le salvo man mano che
 *    vengono viste, così le carte già sfogliate restano disponibili offline.
 * 3. Tutto il resto → rete, senza intercettare.
 *
 * Per pubblicare una versione nuova basta cambiare VERSIONE: i vecchi cache
 * store vengono cancellati in fase di attivazione.
 */

const VERSIONE = 'v1';
const CACHE_GUSCIO = `pokedeck-guscio-${VERSIONE}`;
const CACHE_IMMAGINI = `pokedeck-immagini-${VERSIONE}`;

/**
 * Path RELATIVI: risolti rispetto alla posizione di sw.js, quindi funzionano
 * identici dalla radice del dominio o da una sottocartella di GitHub Pages.
 */
const GUSCIO = [
  './',
  './index.html',
  './manifest.webmanifest',
  './risorse/icona.svg',
  './risorse/icona-maskable.svg',
  './src/app/app.js',
  './src/app/registra-sw.js',
  './src/data/dataset.js',
  './src/ui/stile/base.css',
  './src/ui/stile/tipi.css',
  './src/ui/scheda-carta/scheda-carta.js',
  './src/ui/scheda-carta/scheda-carta.css',
  './data/set/indice.json',
  './data/set/sv03.5.json',
  './data/set/swsh10.json',
  './data/set/swsh12.5.json',
  './data/set/sv08.json',
  './data/set/me01.json',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_GUSCIO);
      await cache.addAll(GUSCIO);
      // Attiva subito la versione nuova invece di aspettare che tutte le schede
      // aperte vengano chiuse: su un'app di famiglia è quello che si vuole.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomi = await caches.keys();
      await Promise.all(
        nomi
          .filter((n) => n.startsWith('pokedeck-') && !n.endsWith(VERSIONE))
          .map((n) => caches.delete(n)),
      );
      // Prende il controllo delle pagine già aperte senza ricaricarle.
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== 'GET') return;

  const url = new URL(richiesta.url);

  if (url.hostname === 'assets.tcgdex.net') {
    evento.respondWith(cacheARichiesta(richiesta, CACHE_IMMAGINI));
    return;
  }

  if (url.origin === location.origin) {
    evento.respondWith(cachePrima(richiesta));
  }
});

/**
 * Cache-first sul guscio, con la rete come riserva.
 * @param {Request} richiesta
 * @returns {Promise<Response>}
 */
async function cachePrima(richiesta) {
  const salvata = await caches.match(richiesta, { ignoreSearch: true });
  if (salvata) return salvata;

  try {
    return await fetch(richiesta);
  } catch (errore) {
    // Offline e non in cache: se è una navigazione, almeno l'app si apre.
    if (richiesta.mode === 'navigate') {
      const guscio = await caches.match('./index.html');
      if (guscio) return guscio;
    }
    throw errore;
  }
}

/**
 * Scarica una volta, poi sempre dalla cache. Usata per le immagini delle carte.
 * @param {Request} richiesta
 * @param {string} nomeCache
 * @returns {Promise<Response>}
 */
async function cacheARichiesta(richiesta, nomeCache) {
  const cache = await caches.open(nomeCache);
  const salvata = await cache.match(richiesta);
  if (salvata) return salvata;

  try {
    const risposta = await fetch(richiesta);

    // Un <img> verso un altro dominio produce una risposta OPAQUE: il browser
    // ce la consegna ma non ce ne fa leggere nulla, e `status` vale 0, quindi
    // `ok` è false anche quando è andata benissimo. Senza questo caso
    // esplicito nessuna immagine finirebbe mai in cache, e offline resterebbero
    // tutte vuote. Contro-effetto da tenere presente: essendo illeggibile, una
    // risposta opaque viene salvata anche se in realtà era un 404.
    if (risposta.ok || risposta.type === 'opaque') {
      await cache.put(richiesta, risposta.clone());
    }
    return risposta;
  } catch (errore) {
    // Senza rete e senza copia locale: <scheda-carta> mostra il segnaposto.
    return new Response('', { status: 504, statusText: 'Immagine non disponibile offline' });
  }
}
