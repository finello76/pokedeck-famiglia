/**
 * Wrapper leggero su IndexedDB: l'unico punto dell'app che parla col database.
 *
 * IndexedDB ha una API a eventi, vecchia e verbosa. Qui la si avvolge in
 * Promise una volta sola, così il resto del codice usa `await` normalmente.
 *
 * Cosa NON fa: non sa nulla di carte, tipi o mazzi. Conserva righe con una
 * chiave e una quantità. Il significato lo dà `collezione.js`.
 *
 * @module data/deposito
 */

const NOME_DB = 'pokedeck';

/**
 * Versione dello schema. Va **incrementata** a ogni modifica della struttura
 * (nuovo store, nuovo indice): è ciò che fa scattare `onupgradeneeded`.
 * @type {number}
 */
const VERSIONE_DB = 1;

/** Store delle carte possedute. Chiave: `"<idSet>:<numero>"`. */
export const STORE_COLLEZIONE = 'collezione';

/** @type {Promise<IDBDatabase>|null} */
let connessione = null;

/**
 * Trasforma una IDBRequest (a eventi) in una Promise.
 *
 * @template T
 * @param {IDBRequest<T>} richiesta
 * @returns {Promise<T>}
 */
function promessa(richiesta) {
  return new Promise((risolvi, rifiuta) => {
    richiesta.onsuccess = () => risolvi(richiesta.result);
    richiesta.onerror = () => rifiuta(richiesta.error);
  });
}

/**
 * Apre il database, creando o aggiornando lo schema se serve.
 *
 * La connessione viene aperta una volta sola e riusata: `apri()` chiamata
 * cento volte restituisce sempre la stessa Promise.
 *
 * @returns {Promise<IDBDatabase>}
 */
export function apri() {
  connessione ??= new Promise((risolvi, rifiuta) => {
    const richiesta = indexedDB.open(NOME_DB, VERSIONE_DB);

    // Unico posto in cui si può toccare la struttura del database. Gira solo
    // se la versione sul disco è più vecchia di VERSIONE_DB.
    richiesta.onupgradeneeded = (evento) => {
      const db = richiesta.result;
      const daVersione = evento.oldVersion;

      // I salti di versione si gestiscono a cascata, senza `else`: chi arriva
      // da 0 esegue tutti i passi, chi arriva da 1 solo quelli successivi.
      if (daVersione < 1) {
        const store = db.createObjectStore(STORE_COLLEZIONE, { keyPath: 'id' });
        // Indice per mostrare "tutte le carte del set X" senza scorrere tutto.
        store.createIndex('perSet', 'idSet', { unique: false });
      }
    };

    richiesta.onsuccess = () => {
      const db = richiesta.result;
      // Se un'altra scheda apre una versione più nuova, questa connessione va
      // chiusa o bloccherebbe l'aggiornamento dell'altra.
      db.onversionchange = () => {
        db.close();
        connessione = null;
      };
      risolvi(db);
    };

    richiesta.onerror = () => rifiuta(richiesta.error);

    // Succede se un'altra scheda tiene aperta una versione precedente.
    richiesta.onblocked = () =>
      rifiuta(new Error('Database bloccato da un\'altra scheda aperta: chiudila e riprova.'));
  });

  return connessione;
}

/**
 * Esegue del lavoro dentro una transazione, restituendo il risultato.
 *
 * Attenzione a una particolarità di IndexedDB che sorprende chi viene da JDBC:
 * una transazione si chiude **da sola** appena il ciclo di eventi resta senza
 * richieste in sospeso. Non si può quindi mettere un `await` su qualcosa di
 * estraneo (una `fetch`, un timer) in mezzo alla transazione: al risveglio
 * sarebbe già chiusa. Qui dentro si fanno solo operazioni sullo store.
 *
 * @template T
 * @param {string} nomeStore
 * @param {IDBTransactionMode} modo `'readonly'` o `'readwrite'`
 * @param {(store: IDBObjectStore) => Promise<T>|T} lavoro
 * @returns {Promise<T>}
 */
export async function inTransazione(nomeStore, modo, lavoro) {
  const db = await apri();
  const transazione = db.transaction(nomeStore, modo);
  const store = transazione.objectStore(nomeStore);

  const risultato = await lavoro(store);

  // Si aspetta il `complete` della transazione, non solo la singola richiesta:
  // in scrittura è il commit vero. Senza questa attesa si potrebbe leggere
  // subito dopo e non trovare ancora i dati.
  await new Promise((risolvi, rifiuta) => {
    transazione.oncomplete = () => risolvi();
    transazione.onerror = () => rifiuta(transazione.error);
    transazione.onabort = () => rifiuta(transazione.error ?? new Error('Transazione annullata'));
  });

  return risultato;
}

/**
 * Tutte le righe di uno store.
 * @param {string} nomeStore
 * @returns {Promise<object[]>}
 */
export function leggiTutto(nomeStore) {
  return inTransazione(nomeStore, 'readonly', (store) => promessa(store.getAll()));
}

/**
 * Una riga per chiave.
 * @param {string} nomeStore
 * @param {string} chiave
 * @returns {Promise<object|undefined>}
 */
export function leggi(nomeStore, chiave) {
  return inTransazione(nomeStore, 'readonly', (store) => promessa(store.get(chiave)));
}

/**
 * Inserisce o sostituisce una riga (la chiave sta dentro l'oggetto).
 * @param {string} nomeStore
 * @param {object} riga
 * @returns {Promise<IDBValidKey>}
 */
export function scrivi(nomeStore, riga) {
  return inTransazione(nomeStore, 'readwrite', (store) => promessa(store.put(riga)));
}

/**
 * Scrive più righe in **una sola** transazione: o passano tutte o nessuna.
 * Usata dall'import, dove un fallimento a metà lascerebbe dati incoerenti.
 *
 * @param {string} nomeStore
 * @param {object[]} righe
 * @returns {Promise<number>} quante righe scritte
 */
export function scriviMolte(nomeStore, righe) {
  return inTransazione(nomeStore, 'readwrite', async (store) => {
    await Promise.all(righe.map((riga) => promessa(store.put(riga))));
    return righe.length;
  });
}

/**
 * Cancella una riga.
 * @param {string} nomeStore
 * @param {string} chiave
 * @returns {Promise<void>}
 */
export function cancella(nomeStore, chiave) {
  return inTransazione(nomeStore, 'readwrite', (store) => promessa(store.delete(chiave)));
}

/**
 * Svuota uno store. Usato dall'import in modalità "sostituisci".
 * @param {string} nomeStore
 * @returns {Promise<void>}
 */
export function svuota(nomeStore) {
  return inTransazione(nomeStore, 'readwrite', (store) => promessa(store.clear()));
}
