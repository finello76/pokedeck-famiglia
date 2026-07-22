/**
 * Registrazione del service worker e gestione degli aggiornamenti.
 *
 * Sta in un modulo a parte perché la registrazione ha un suo ciclo di vita
 * (installazione, attesa, attivazione) che non c'entra con la logica dell'app.
 *
 * **Il problema che questo modulo risolve.** Una PWA installata sul telefono
 * non ha il pulsante "ricarica", e le sue schede non si chiudono mai: il
 * service worker vecchio resta al comando a tempo indefinito, e chi gioca
 * continua a usare una versione di settimane prima senza avere modo di
 * accorgersene né di uscirne. Su desktop si svuota la cache dagli strumenti per
 * sviluppatori; su un telefono, no.
 *
 * La soluzione è chiedere: quando c'è una versione nuova pronta, l'app lo dice
 * e offre un pulsante. Non si aggiorna da sola perché ricaricare butta via i
 * mazzi appena generati — e perderli senza averlo chiesto è peggio che restare
 * indietro di una versione.
 *
 * @module app/registra-sw
 */

/** Ogni quanto chiedere al server se c'è una versione nuova. */
const INTERVALLO_CONTROLLO = 15 * 60 * 1000;

/**
 * Quanto si aspetta che il service worker in attesa risponda, prima di
 * ricorrere alle maniere forti.
 *
 * Serve perché un worker può restare sordo al messaggio: se il file da cui è
 * nato è vecchio non conosce il messaggio, e se è andato in errore non risponde
 * affatto. Senza questa scadenza il pulsante "Aggiorna" sembrerebbe rotto —
 * proprio nella situazione in cui l'utente non ha altri modi per uscirne.
 */
const ATTESA_RISPOSTA = 3000;

/** @type {boolean} guardia contro il ciclo di ricariche */
let ricaricaInCorso = false;

/**
 * Registra `sw.js` se il browser lo supporta e sorveglia gli aggiornamenti.
 *
 * Lo `scope` è relativo alla pagina, non alla radice del dominio: è ciò che
 * permette all'app di funzionare da `https://utente.github.io/PokeDeckFamiglia/`.
 * Un service worker può controllare solo path uguali o più profondi del proprio,
 * quindi `sw.js` DEVE stare nella radice del progetto, non in `src/`.
 *
 * @param {(aggiorna: () => void) => void} [alPronto] chiamata quando una
 *   versione nuova è pronta. Riceve la funzione da eseguire per applicarla:
 *   questo modulo non sa nulla di come venga chiesto all'utente
 * @returns {Promise<ServiceWorkerRegistration|null>} null se non supportato o fallito
 * @example
 * registraServiceWorker((aggiorna) => mostraBarra('Nuova versione', aggiorna));
 */
export async function registraServiceWorker(alPronto = null) {
  if (!('serviceWorker' in navigator)) {
    console.info('Service worker non supportato: l\'app funziona, ma senza offline.');
    return null;
  }

  // Con file:// la registrazione lancia sempre un errore di sicurezza: meglio
  // dirlo chiaramente che lasciare un'eccezione oscura in console.
  if (location.protocol === 'file:') {
    console.warn(
      'Aperta con file://: niente offline. Serve un web server, es. `python3 -m http.server`.',
    );
    return null;
  }

  try {
    const registrazione = await navigator.serviceWorker.register(
      new URL('../../sw.js', import.meta.url),
      {
        scope: './',
        // Niente cache HTTP per sw.js: è il file che annuncia le versioni
        // nuove, e servirlo dalla cache significherebbe non accorgersi mai che
        // ne esiste una.
        updateViaCache: 'none',
      },
    );
    // Lo stato va detto per intero: quando un aggiornamento si incastra, la
    // sola riga "registrato" non permette di capire da che parte guardare.
    console.info(
      'Service worker registrato.',
      `attivo=${registrazione.active?.state ?? 'nessuno'}`,
      `in attesa=${registrazione.waiting?.state ?? 'nessuno'}`,
      `controlla questa pagina=${Boolean(navigator.serviceWorker.controller)}`,
    );
    sorvegliaAggiornamenti(registrazione, alPronto);
    return registrazione;
  } catch (errore) {
    // L'app deve restare usabile anche se l'offline non parte.
    console.error('Registrazione service worker fallita:', errore);
    return null;
  }
}

/**
 * Avvisa quando c'è una versione nuova, e continua a controllare nel tempo.
 *
 * @param {ServiceWorkerRegistration} registrazione
 * @param {((aggiorna: () => void) => void)|null} alPronto
 */
function sorvegliaAggiornamenti(registrazione, alPronto) {
  const annuncia = (lavoratore) => {
    if (!lavoratore || !alPronto) return;
    alPronto(() => applica(lavoratore));
  };

  // Può essercene già uno in attesa da una visita precedente: chi riapre l'app
  // dopo giorni deve trovare l'avviso subito, non al prossimo aggiornamento.
  if (registrazione.waiting && navigator.serviceWorker.controller) {
    annuncia(registrazione.waiting);
  }

  registrazione.addEventListener('updatefound', () => {
    const nuovo = registrazione.installing;
    if (!nuovo) return;
    nuovo.addEventListener('statechange', () => {
      // `controller` assente significa prima installazione in assoluto: non
      // c'è niente da aggiornare e nessun avviso da dare.
      if (nuovo.state === 'installed' && navigator.serviceWorker.controller) {
        annuncia(nuovo);
      }
    });
  });

  // Quando il service worker nuovo prende il comando la pagina va ricaricata:
  // i moduli in memoria sono ancora quelli vecchi. Succede solo dopo che
  // l'utente ha accettato, quindi non sorprende nessuno.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (ricaricaInCorso) return;
    ricaricaInCorso = true;
    location.reload();
  });

  // Il controllo automatico avviene solo all'avvio della pagina. Su un telefono
  // l'app non viene mai davvero riaperta — si torna a una scheda già in
  // memoria — quindi si ricontrolla quando torna in primo piano, e ogni tanto
  // per chi la lascia aperta.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registrazione.update().catch(() => {});
  });
  setInterval(() => registrazione.update().catch(() => {}), INTERVALLO_CONTROLLO);
}

/**
 * Chiede al service worker in attesa di prendere il comando, e se non risponde
 * passa alle maniere forti.
 *
 * La ricarica non la fa questa funzione: la fa `controllerchange`, quando il
 * passaggio è davvero avvenuto. Ricaricare prima rimetterebbe in piedi la
 * stessa versione di prima.
 *
 * @param {ServiceWorker} lavoratore
 */
function applica(lavoratore) {
  lavoratore.postMessage({ tipo: 'attiva-subito' });
  // Se entro qualche secondo non è successo niente, il worker in attesa non ha
  // raccolto il messaggio: si smonta tutto e si riparte dalla rete.
  setTimeout(() => {
    if (!ricaricaInCorso) forzaAggiornamento();
  }, ATTESA_RISPOSTA);
}

/**
 * La via di fuga: butta via service worker e cache, e ricarica dalla rete.
 *
 * È il "premi qui se niente funziona" che su un telefono non esiste: nella PWA
 * installata non ci sono strumenti per sviluppatori né un modo di svuotare la
 * cache di una singola app. Senza questa funzione, un aggiornamento che si
 * inceppa lascia l'utente bloccato su una versione vecchia per sempre.
 *
 * I dati dei set (`pokedeck-dati`) si salvano: sono megabyte già scaricati e
 * non c'entrano niente con la versione dell'app. La collezione sta in
 * IndexedDB e non viene toccata da nessuna di queste operazioni.
 *
 * @returns {Promise<void>}
 * @example
 * // dal pulsante "Aggiorna" quando il modo gentile non ha funzionato
 * await forzaAggiornamento();
 */
export async function forzaAggiornamento() {
  if (ricaricaInCorso) return;
  ricaricaInCorso = true;

  try {
    if ('serviceWorker' in navigator) {
      const registrazioni = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrazioni.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const nomi = await caches.keys();
      await Promise.all(
        nomi.filter((n) => n !== 'pokedeck-dati').map((n) => caches.delete(n)),
      );
    }
  } catch (errore) {
    // Anche se la pulizia fallisce si ricarica lo stesso: peggio di così non
    // può andare, e senza service worker i file arrivano comunque dalla rete.
    console.warn('Pulizia incompleta prima della ricarica:', errore);
  }

  // `location.reload()` non basta su tutti i browser: ripropone la stessa
  // pagina dalla cache HTTP. Con la query si chiede un indirizzo mai visto.
  const url = new URL(location.href);
  url.searchParams.set('aggiornato', String(Date.now()));
  location.replace(url.toString());
}
