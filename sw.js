/**
 * Service worker: rende l'app usabile senza rete.
 *
 * Deve stare nella RADICE del progetto: un service worker controlla solo gli
 * URL che stanno al suo livello o più in basso. Se fosse in `src/` non potrebbe
 * servire `index.html`.
 *
 * Quattro strategie, una per tipo di risorsa:
 *
 * 1. Guscio dell'app (HTML, CSS, JS) e indice dei set → **cache-first**,
 *    precaricati in installazione: apertura istantanea e offline garantito.
 * 2. File dei singoli set (`data/set/<id>.json`) → **cache-first a richiesta**.
 *    Sono 190 file per 6,4 MB complessivi: precaricarli tutti significherebbe
 *    scaricare l'intero catalogo Pokémon alla prima apertura. Vengono salvati
 *    man mano che servono, quindi resta offline ciò che si è davvero usato.
 * 3. Immagini delle carte (assets.tcgdex.net) → **cache-first a richiesta**,
 *    per lo stesso motivo.
 * 4. Tutto il resto → rete, senza intercettare.
 *
 * Per pubblicare una versione nuova basta cambiare VERSIONE: i vecchi cache
 * store vengono cancellati in fase di attivazione.
 */

const VERSIONE = 'v8';
const CACHE_GUSCIO = `pokedeck-guscio-${VERSIONE}`;
const CACHE_IMMAGINI = `pokedeck-immagini-${VERSIONE}`;

/**
 * I dati dei set NON sono versionati come il guscio: sopravvivono agli
 * aggiornamenti dell'app. Ributtarli via a ogni pubblicazione costringerebbe a
 * riscaricare set già visti solo perché è cambiato un CSS.
 */
const CACHE_DATI = 'pokedeck-dati';

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
  './src/data/deposito.js',
  './src/data/collezione.js',
  './src/data/energie.js',
  './src/data/scambio.js',
  './src/ui/stile/base.css',
  './src/ui/stile/tipi.css',
  './src/ui/scheda-carta/scheda-carta.js',
  './src/ui/scheda-carta/scheda-carta.css',
  './src/ui/griglia-collezione/griglia-collezione.js',
  './src/ui/griglia-collezione/griglia-collezione.css',
  './src/ui/contatore-energie/contatore-energie.js',
  './src/ui/contatore-energie/contatore-energie.css',
  './src/ui/visore-carta/visore-carta.js',
  './src/ui/visore-carta/visore-carta.css',
  './src/app/viste.js',
  './src/app/vista-mazzi.js',
  './src/data/mazzi-salvati.js',
  './src/engine/nomi.js',
  './src/engine/stadi.js',
  './src/engine/analisi.js',
  './src/engine/dispensa.js',
  './src/engine/proporzioni.js',
  './src/engine/generazione.js',
  './src/engine/regole.js',
  './src/engine/regole-catalogo.js',
  './src/engine/pianifica.js',
  './src/engine/proxy.js',
  './src/engine/alternative.js',
  './src/engine/casuale.js',
  './src/engine/scelta-linee.js',
  './src/engine/formati.js',
  './src/ui/vista-regole/vista-regole.js',
  './src/ui/vista-regole/vista-regole.css',
  './src/ui/vista-regole/testi-regolamento.js',
  './src/app/foglio-proxy.js',
  './src/app/sostituzione.js',
  './src/ui/procedura-guidata/procedura-guidata.js',
  './src/ui/procedura-guidata/procedura-guidata.css',
  './src/ui/mazzo-generato/mazzo-generato.js',
  './src/ui/mazzo-generato/mazzo-generato.css',
  './src/ui/stile/stampa.css',
  // Solo l'indice: i file dei singoli set arrivano su richiesta.
  './data/set/indice.json',
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
          // CACHE_DATI non ha suffisso di versione ed è esclusa apposta: i set
          // già scaricati devono sopravvivere agli aggiornamenti dell'app.
          .filter((n) => n.startsWith('pokedeck-') && n !== CACHE_DATI && !n.endsWith(VERSIONE))
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

  if (url.origin !== location.origin) return;

  // I file dei singoli set: non precaricati, salvati alla prima lettura.
  // L'indice invece sta nel guscio e passa da cachePrima().
  if (url.pathname.includes('/data/set/') && !url.pathname.endsWith('indice.json')) {
    evento.respondWith(cacheARichiesta(richiesta, CACHE_DATI));
    return;
  }

  evento.respondWith(cachePrima(richiesta));
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
