/**
 * Motore delle regole della casa: decide quali regole del catalogo attivare.
 *
 * Il foglio da stampare elencherà solo le regole attivate, ciascuna con il
 * proprio perché: una regola senza spiegazione, in famiglia, sembra un
 * favoritismo.
 *
 * Alcune regole non si limitano a essere stampate: dichiarano anche dei
 * **permessi** che cambiano il modo in cui i mazzi vengono generati (per
 * esempio riabilitando le evoluzioni orfane). Per questo la generazione avviene
 * in due passate — vedi `pianifica()`.
 *
 * L'elenco delle regole possibili sta in `regole-catalogo.js`: qui c'è solo il
 * meccanismo di valutazione.
 *
 * Modulo puro.
 *
 * @module engine/regole
 */

import { CATALOGO } from './regole-catalogo.js';

/**
 * Valuta quali regole della casa servono.
 *
 * @param {object} contesto
 * @param {object} contesto.analisi risultato di `analizza()`
 * @param {Array} contesto.mazzi mazzi generati
 * @param {Array} contesto.carenze carenze rilevate dalla generazione
 * @param {object} contesto.opzioni `{taglia, numeroMazzi, semplificata, proxyEnergia, proxyPokemon}`
 * @returns {{regole: object[], permessi: object}}
 * @example
 * const { regole, permessi } = valutaRegole({ analisi, mazzi, carenze, opzioni });
 * // regole → solo quelle attivate, ognuna con testo e motivazione
 */
export function valutaRegole(contesto) {
  const regole = [];
  const permessi = {};

  for (const voce of CATALOGO) {
    const esito = voce.condizione(contesto);
    if (!esito) continue;
    regole.push({
      codice: voce.codice,
      origine: voce.origine,
      titolo: voce.titolo,
      testo: esito.testo,
      motivazione: esito.motivazione,
    });
    Object.assign(permessi, esito.permessi ?? {});
  }

  return { regole, permessi };
}

/**
 * I codici di tutte le regole esistenti, attivate o no. Utile ai test e alla
 * documentazione.
 * @returns {string[]}
 */
export function codiciRegole() {
  return CATALOGO.map((r) => r.codice);
}
