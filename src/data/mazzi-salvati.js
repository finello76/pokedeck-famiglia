/**
 * Salvataggio e rilettura dei mazzi generati.
 *
 * A differenza della collezione, qui i dati delle carte **vengono duplicati**
 * dentro il mazzo salvato. È una scelta deliberata e contraria a quella fatta
 * per la collezione: un mazzo è una fotografia di un momento, e deve restare
 * leggibile anche se poi vendi le carte, aggiorni i set o cambi la collezione.
 * Se ricalcolassimo tutto dal dataset, un mazzo salvato a maggio potrebbe
 * mostrare carte che non hai più.
 *
 * @module data/mazzi-salvati
 */

import { STORE_MAZZI, leggiTutto, leggi, scrivi, cancella } from './deposito.js';

/**
 * Salva il risultato di una generazione.
 *
 * @param {object} piano risultato di `pianifica()`
 * @param {object} opzioni le scelte fatte nel wizard, da mostrare nell'elenco
 * @returns {Promise<string>} l'id assegnato
 * @example
 * const id = await salvaPiano(piano, { taglia: 15, numeroMazzi: 2 });
 */
export async function salvaPiano(piano, opzioni) {
  const creatoIl = new Date().toISOString();
  const id = creatoIl;

  await scrivi(STORE_MAZZI, {
    id,
    creatoIl,
    opzioni,
    // Si salvano solo i campi che servono a rileggere il mazzo: l'oggetto
    // completo dell'analisi conterrebbe l'intera collezione, inutilmente.
    mazzi: piano.mazzi.map((m) => ({
      nome: m.nome,
      tipi: m.tipi,
      totale: m.totale,
      composizione: m.composizione,
      carte: m.carte.map((c) => ({
        quantita: c.quantita,
        idSet: c.carta.idSet ?? null,
        numero: c.carta.numero ?? null,
        nome: c.carta.nome,
        categoria: c.carta.categoria,
        stadio: c.carta.stadio ?? null,
        tipi: c.carta.tipi ?? [],
        ps: c.carta.ps ?? null,
        immagine: c.carta.immagine ?? null,
      })),
    })),
    regole: piano.regole,
    carenze: piano.carenze,
    permessi: piano.permessi,
  });

  return id;
}

/**
 * Tutti i piani salvati, dal più recente.
 * @returns {Promise<object[]>}
 */
export async function elencoPiani() {
  const piani = await leggiTutto(STORE_MAZZI);
  return piani.sort((a, b) => String(b.creatoIl).localeCompare(String(a.creatoIl)));
}

/**
 * @param {string} id
 * @returns {Promise<object|undefined>}
 */
export function leggiPiano(id) {
  return leggi(STORE_MAZZI, id);
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export function eliminaPiano(id) {
  return cancella(STORE_MAZZI, id);
}
