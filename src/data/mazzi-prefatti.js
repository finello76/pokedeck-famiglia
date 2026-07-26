/**
 * I mazzi prefatti: il metro con cui si misura un mazzo generato.
 *
 * Sono i prodotti da negozio — i Kit Allenatore, i mazzi tema — di cui si
 * conosce la lista esatta. Servono a rispondere alla domanda che ha fatto
 * nascere `engine/forza.js`: *il mazzo che ho appena generato regge quello che
 * sta nella scatola in salotto?* Senza un termine di paragone, "forza 74" non
 * dice niente a nessuno.
 *
 * Il file arriva già pronto da `tools/genera-mazzi-prefatti.mjs`, con i dati
 * delle carte **dentro** invece che per riferimento. È una duplicazione voluta,
 * la stessa scelta fatta per i mazzi salvati in `mazzi-salvati.js`: un mazzo
 * prefatto è una fotografia di un prodotto che non cambia più, e ricostruirlo
 * dai set a ogni apertura significherebbe scaricare mezzo catalogo per leggere
 * trenta carte. Così è un file solo, 50 KB, precaricato dal service worker.
 *
 * Qui non c'è logica: solo lettura e cache. Le decisioni le prende il motore.
 *
 * @module data/mazzi-prefatti
 */

/**
 * Percorso calcolato dall'URL di questo modulo, non assoluto: è ciò che fa
 * funzionare l'app da una sottocartella di GitHub Pages. Stessa ragione
 * spiegata per esteso in `dataset.js`.
 */
const FILE = new URL('../../data/mazzi-prefatti.json', import.meta.url);

/** @type {Promise<object>|null} caricamento unico, condiviso fra i chiamanti */
let caricamento = null;

/**
 * Carica il catalogo, una volta sola.
 *
 * Si tiene la **promessa** e non il risultato: se due schermate lo chiedono
 * insieme prima che il primo `fetch` sia finito, aspettano lo stesso, invece di
 * partire in due.
 *
 * @returns {Promise<{generatoIl: string, mazzi: object[]}>}
 */
function catalogo() {
  caricamento ??= (async () => {
    const risposta = await fetch(FILE);
    if (!risposta.ok) {
      throw new Error(`Mazzi prefatti non disponibili (HTTP ${risposta.status})`);
    }
    return risposta.json();
  })();
  return caricamento;
}

/**
 * Tutti i mazzi prefatti disponibili.
 *
 * Non solleva: se il file manca — installazione a metà, cache incompleta — si
 * restituisce un elenco vuoto e la funzione "gioca contro un mazzo prefatto"
 * semplicemente non compare. È una comodità, non deve poter rompere la
 * generazione dei mazzi.
 *
 * @returns {Promise<object[]>} ciascuno con `{id, nome, taglia, carte, fonte}`
 * @example
 * const prefatti = await elencoPrefatti();
 * prefatti.map((m) => m.nome); // ['Kit Allenatore Lycanroc', …]
 */
export async function elencoPrefatti() {
  try {
    const { mazzi } = await catalogo();
    return mazzi ?? [];
  } catch {
    return [];
  }
}

/**
 * Un mazzo prefatto per id.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function leggiPrefatto(id) {
  const mazzi = await elencoPrefatti();
  return mazzi.find((m) => m.id === id) ?? null;
}
