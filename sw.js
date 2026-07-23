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

const VERSIONE = 'v28';
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
  './src/app/barra-aggiornamento.js',
  './src/app/tema.js',
  './src/app/aggiunta.js',
  './src/app/versione.js',
  './src/data/dataset.js',
  './src/data/deposito.js',
  './src/data/collezione.js',
  './src/data/completamento.js',
  './src/data/energie.js',
  './src/data/scambio.js',
  './src/ui/stile/base.css',
  './src/ui/stile/tipi.css',
  './src/ui/scheda-carta/scheda-carta.js',
  './src/ui/scheda-carta/scheda-carta.css',
  './src/ui/griglia-collezione/griglia-collezione.js',
  './src/ui/griglia-collezione/raggruppa.js',
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
  './src/engine/linee.js',
  './src/engine/carenze.js',
  './src/engine/mazzo.js',
  './src/engine/riallinea.js',
  './src/engine/bilancia.js',
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
  // L'indice delle evoluzioni: 22 KB, ma serve a ogni generazione di mazzi
  // (recupera i collegamenti che le singole stampe non dichiarano).
  './data/evoluzioni.json',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_GUSCIO);
      // `cache: 'reload'` scavalca la cache HTTP del browser. Senza, un file
      // servito da GitHub Pages con `max-age=600` verrebbe ripreso dalla cache
      // vecchia e finirebbe *dentro* quella nuova del service worker: si
      // installerebbe una versione nuova piena di file vecchi.
      // Uno per uno, non `cache.addAll()`. `addAll` è tutto-o-niente: basta un
      // file rinominato o cancellato e l'installazione fallisce **in silenzio**,
      // il service worker nuovo non entra mai in servizio e il vecchio resta al
      // comando per sempre. È successo davvero — un modulo rimasto nell'elenco
      // dopo essere stato cancellato ha bloccato tre versioni di aggiornamenti,
      // e sul telefono non c'era modo di accorgersene.
      const esiti = await Promise.allSettled(
        GUSCIO.map(async (url) => {
          const risposta = await fetch(new Request(url, { cache: 'reload' }));
          if (!risposta.ok) throw new Error(`${url}: HTTP ${risposta.status}`);
          return cache.put(url, risposta);
        }),
      );
      const falliti = esiti.filter((e) => e.status === 'rejected');
      if (falliti.length) {
        // Non blocca l'installazione: quei file si prenderanno dalla rete alla
        // prima richiesta. Ma va detto, o il buco resta invisibile.
        console.warn(
          `Guscio incompleto: ${falliti.length} file non precaricati.`,
          falliti.map((e) => e.reason?.message),
        );
      }

      // NON si attiva da sé. Il service worker nuovo resta in attesa finché la
      // pagina non chiede di passare alla versione nuova (vedi il messaggio
      // qui sotto): attivandosi subito servirebbe file nuovi a una pagina che
      // ha già caricato i moduli vecchi, mescolando due versioni dell'app.
    })(),
  );
});

/**
 * Passa il controllo alla versione nuova, su richiesta della pagina.
 *
 * Lo chiede l'utente toccando "Aggiorna" nella barra che compare in fondo: è
 * l'unico momento in cui una ricarica non fa perdere niente, perché è stata
 * decisa da chi sta usando l'app.
 */
self.addEventListener('message', (evento) => {
  if (evento.data?.tipo === 'attiva-subito') self.skipWaiting();
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

  // version.json va preso SEMPRE dalla rete: è il file che dice "sei
  // aggiornato?", e servirlo dalla cache mostrerebbe eternamente il numero
  // vecchio, cioè l'esatto contrario del suo scopo. Offline si ripiega sulla
  // copia salvata, così almeno mostra l'ultima nota invece di sparire.
  if (url.pathname.endsWith('version.json')) {
    evento.respondWith(reteThenCache(richiesta));
    return;
  }

  // I file dei singoli set: non precaricati, salvati alla prima lettura.
  // L'indice invece sta nel guscio e passa da cachePrima().
  if (url.pathname.includes('/data/set/') && !url.pathname.endsWith('indice.json')) {
    evento.respondWith(cacheARichiesta(richiesta, CACHE_DATI));
    return;
  }

  evento.respondWith(cachePrima(richiesta));
});

/**
 * Network-first: prima la rete, la cache solo come riserva offline. Usata per
 * `version.json`, che deve riflettere il deploy corrente.
 * @param {Request} richiesta
 * @returns {Promise<Response>}
 */
async function reteThenCache(richiesta) {
  const cache = await caches.open(CACHE_GUSCIO);
  try {
    const risposta = await fetch(richiesta, { cache: 'no-store' });
    if (risposta.ok) cache.put(richiesta, risposta.clone());
    return risposta;
  } catch (errore) {
    const salvata = await cache.match(richiesta, { ignoreSearch: true });
    if (salvata) return salvata;
    throw errore;
  }
}

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
