/**
 * Orchestrazione: mazzi e regole della casa si determinano a vicenda.
 *
 * C'è una circolarità da sciogliere. Le regole si attivano guardando le carenze
 * dei mazzi, ma alcune regole **cambiano quali mazzi si possono costruire**: se
 * le evoluzioni orfane diventano giocabili, il generatore le sceglierebbe, e i
 * mazzi risultanti sarebbero diversi.
 *
 * Si risolve in due passate:
 *
 * 1. si generano i mazzi con le regole standard e si guarda cosa non va;
 * 2. si decidono le regole e si **rigenerano** i mazzi con le deroghe concesse.
 *
 * Poi le regole si rivalutano sui mazzi definitivi, perché il foglio stampato
 * deve descrivere i mazzi che hai davvero in mano, non quelli del primo
 * tentativo. Non serve una terza passata: le deroghe allargano le possibilità,
 * non le restringono, quindi il procedimento non oscilla.
 *
 * Modulo puro.
 *
 * @module engine/pianifica
 */

import { generaMazzi, rilevaCarenze } from './generazione.js';
import { valutaRegole } from './regole.js';
import { calcolaProxy, integraProxy } from './proxy.js';

/**
 * Costruisce mazzi e foglio regole.
 *
 * @param {Array<{carta: object, quantita: number}>} voci collezione
 * @param {object} opzioni
 * @param {number} opzioni.taglia 15, 20, 30 o 60
 * @param {number} [opzioni.numeroMazzi=2]
 * @param {boolean} [opzioni.semplificata=false] difficoltà per chi impara
 * @param {boolean} [opzioni.proxyEnergia=false] se si stamperanno energie proxy
 * @param {boolean} [opzioni.proxyPokemon=false] se si stamperanno le
 *   pre-evoluzioni mancanti
 * @param {boolean} [opzioni.ammettiEsotici=false]
 * @param {number} [opzioni.seme=1] seme del caso: cambiarlo produce mazzi
 *   diversi dalla stessa collezione. Le due passate usano lo stesso seme, o la
 *   seconda non ricostruirebbe i mazzi su cui si sono decise le regole
 * @returns {{mazzi: object[], regole: object[], permessi: object, carenze: object[],
 *   analisi: object, proxy: object[], proxyScartati: object[]}}
 * @example
 * const { mazzi, regole } = pianifica(collezione, { taglia: 15, numeroMazzi: 2 });
 * // regole → solo quelle attivate, ciascuna con testo e motivazione stampabili
 */
export function pianifica(voci, opzioni) {
  const configurazione = {
    numeroMazzi: 2,
    semplificata: false,
    proxyEnergia: false,
    proxyPokemon: false,
    ammettiEsotici: false,
    seme: 1,
    // Indice nome→pre-evoluzione: serve ai proxy Pokémon per stampare l'intera
    // catena mancante, non solo l'anello immediato. Lo passa il livello
    // applicativo, che ha accesso al dataset; il motore resta puro.
    indiceEvoluzioni: {},
    ...opzioni,
  };

  // Passata 1: com'è la situazione giocando secondo le regole standard.
  const primo = generaMazzi(voci, configurazione);
  const { permessi } = valutaRegole({
    analisi: primo.analisi,
    mazzi: primo.mazzi,
    carenze: primo.carenze,
    opzioni: configurazione,
  });

  // Coi proxy Pokémon attivi gli orfani vanno selezionati comunque: la loro
  // pre-evoluzione verrà stampata. È una deroga TECNICA per il generatore, non
  // una regola della casa: se poi tutti gli orfani risultano risolti dai
  // proxy, la regola non comparirà sul foglio.
  if (configurazione.proxyPokemon) permessi.evoluzioniComeBase = true;

  // Passata 2: si rigenera con le deroghe concesse dalle regole.
  const definitivo = generaMazzi(voci, { ...configurazione, permessi });

  // I proxy si calcolano sui mazzi definitivi e si inseriscono nelle liste;
  // poi le carenze si RIMISURANO, perché un buco tappato da un proxy non è più
  // un buco e non deve attivare regole della casa.
  const { proxy, scartati } = calcolaProxy(
    { mazzi: definitivo.mazzi, carenze: definitivo.carenze },
    configurazione,
  );
  integraProxy(definitivo.mazzi, proxy, configurazione.taglia);
  const carenze = proxy.length
    ? rilevaCarenze(definitivo.mazzi, configurazione.taglia, definitivo.analisi, permessi)
    : definitivo.carenze;

  // Le regole si rivalutano sui mazzi definitivi: il foglio deve spiegare
  // questi mazzi, non quelli della prima passata.
  const { regole } = valutaRegole({
    analisi: definitivo.analisi,
    mazzi: definitivo.mazzi,
    carenze,
    opzioni: configurazione,
  });

  return {
    mazzi: definitivo.mazzi,
    regole,
    permessi,
    carenze,
    analisi: definitivo.analisi,
    proxy,
    proxyScartati: scartati,
  };
}

/**
 * Rivaluta carenze e regole di un piano i cui mazzi sono stati modificati a
 * mano (sostituzione di carte).
 *
 * Serve perché il foglio regole descrive i mazzi CORRENTI: togliere una
 * pre-evoluzione può creare un orfano, aggiungerla può far sparire una regola.
 * Muta il piano ricevuto e lo restituisce.
 *
 * @param {object} piano risultato di `pianifica()` (con `opzioni` allegate)
 * @param {object} [opzioni] se assenti si usano quelle salvate nel piano
 * @returns {object} lo stesso piano, con `carenze` e `regole` aggiornate
 */
export function rivaluta(piano, opzioni = piano.opzioni ?? {}) {
  piano.carenze = rilevaCarenze(piano.mazzi, opzioni.taglia, piano.analisi, piano.permessi);
  piano.regole = valutaRegole({
    analisi: piano.analisi,
    mazzi: piano.mazzi,
    carenze: piano.carenze,
    opzioni,
  }).regole;
  return piano;
}

/**
 * Le carte di un mazzo che si giocano solo grazie a una deroga, da segnalare
 * nella lista stampata.
 *
 * Serve perché la regola "le evoluzioni si giocano come Base" è inapplicabile
 * se non si sa **quali** carte riguarda: chi ha il mazzo in mano deve poterlo
 * leggere dalla lista, non dedurlo.
 *
 * @param {object} mazzo
 * @param {object} permessi
 * @param {object[]} carenze
 * @returns {Set<string>} nomi delle carte da contrassegnare
 */
export function carteConDeroga(mazzo, permessi, carenze) {
  const nomi = new Set();
  if (!permessi.evoluzioniComeBase) return nomi;

  for (const carenza of carenze) {
    if (carenza.codice !== 'orfani-nel-mazzo' || carenza.mazzo !== mazzo.nome) continue;
    for (const orfano of carenza.dati.orfani) nomi.add(orfano.nome);
  }
  return nomi;
}
