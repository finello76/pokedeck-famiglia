/**
 * L'indice dei numeri del Pokédex: nome della specie → numero.
 *
 * Serve a un solo scopo, ordinare il catalogo come il Pokédex, e per questo si
 * carica **solo quando lo si chiede**: chi non usa quell'ordinamento non deve
 * pagarne i 40 KB. È la stessa scelta dei prezzi — un dato che l'app procura
 * quando serve, non all'avvio.
 *
 * Lo costruisce `tools/genera-indice-dex.mjs` in `data/dex.json`. Il file non
 * elenca le carte ma i **nomi**: *Pikachu* è il 25 in tutte le sue 63 stampe, e
 * un indice per carta sarebbe dieci volte più grosso per dire la stessa cosa.
 *
 * ## La normalizzazione, di nuovo
 *
 * La chiave è il nome passato per `normalizzaNome` — e vale l'avvertenza che
 * CLAUDE.md dà per `data/nomi.json`: l'indice lo **scrive** `engine/nomi.js` e
 * qui lo si **legge**, quindi la funzione dev'essere la stessa. Qui lo è
 * davvero, perché a cercare è la griglia (in `ui/`), che da `engine/` può
 * importare. `data/` no, ed è il motivo per cui questo modulo restituisce la
 * mappa grezza invece di offrire un `numeroDi(carta)`: chiederebbe di
 * normalizzare, cioè di dipendere da `engine/`.
 *
 * @module data/dex
 */

/** @type {Map<string, number>|null} */
let cache = null;
/** @type {Promise<Map<string, number>>|null} */
let caricamento = null;

/**
 * La mappa nome normalizzato → numero del Pokédex.
 *
 * Si scarica una volta e resta in memoria; il service worker la tiene nel
 * guscio, quindi dalla seconda volta è offline. Se il file non c'è o non si
 * legge torna una mappa **vuota** invece di sollevare: senza numeri
 * l'ordinamento per Pokédex mette tutto in fondo in ordine di nome, che è una
 * risposta modesta ma non un errore.
 *
 * @returns {Promise<Map<string, number>>}
 * @example
 * const numeri = await numeriDex();
 * numeri.get('pikachu'); // → 25
 */
export async function numeriDex() {
  if (cache) return cache;
  caricamento ??= fetch(new URL('../../data/dex.json', import.meta.url))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((indice) => {
      cache = new Map(Object.entries(indice ?? {}));
      return cache;
    });
  return caricamento;
}
