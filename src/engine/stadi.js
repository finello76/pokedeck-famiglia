/**
 * Classificazione degli stadi evolutivi.
 *
 * Il progetto ragiona su tre stadi (Base → Livello 1 → Livello 2), ma nel
 * dataset ne compaiono **dieci**: oltre ai tre canonici ci sono VMAX, V ASTRO,
 * MEGA, TURBO, V UNIONE e Ricreato, più 589 carte senza stadio dichiarato.
 *
 * Quelli non canonici sono carte con meccaniche complesse (evoluzioni speciali,
 * regole proprie, effetti di sconfitta con più Premi). Il progetto punta a
 * partite in famiglia con regole semplificate, quindi di norma **si escludono
 * dai mazzi generati** — non perché siano difficili da gestire nel codice, ma
 * perché renderebbero la partita meno adatta allo scopo.
 *
 * Modulo puro: nessun DOM, nessun database.
 *
 * @module engine/stadi
 */

/** Stadi canonici, in ordine di gioco. */
export const BASE = 'Base';
export const LIVELLO_1 = 'Livello 1';
export const LIVELLO_2 = 'Livello 2';

/** @type {string[]} i tre stadi canonici, dal meno al più evoluto */
export const SCALA = [BASE, LIVELLO_1, LIVELLO_2];

/**
 * Categorie in cui `classifica()` divide le carte.
 * @enum {string}
 */
export const CATEGORIA = {
  /** Base, Livello 1 o Livello 2: utilizzabile dal generatore. */
  CANONICO: 'canonico',
  /** VMAX, V ASTRO, MEGA, TURBO, V UNIONE: escluso di default. */
  ESOTICO: 'esotico',
  /** Stadio assente o non riconosciuto. */
  IGNOTO: 'ignoto',
};

/**
 * Stadi non canonici visti nel dataset, con il livello a cui **si comportano**
 * quando si sceglie di ammetterli.
 *
 * Non sono senza posizione nella piramide: un VMAX evolve da un V, che è una
 * carta Base, quindi occupa il posto di un Livello 1. Un V UNIONE si gioca
 * direttamente dalla mano, come un Base. I "Ricreato" sono i Pokémon fossili:
 * si mettono in gioco dalla loro carta Allenatore, quindi valgono come Base.
 *
 * Senza questa mappa, attivare gli esotici non sarebbe servito a nulla: non
 * avendo livello sarebbero rimasti fuori dalle linee comunque.
 *
 * @type {Record<string, number>}
 */
const ESOTICI = {
  VMAX: 1,
  'V ASTRO': 1,
  MEGA: 1,
  TURBO: 1,
  'V UNIONE': 0,
  Ricreato: 0,
};

/**
 * Classifica lo stadio di una carta.
 *
 * @param {object} carta carta del dataset
 * @returns {{categoria: string, stadio: string|null, livello: number|null}}
 *   `livello` è la posizione nella piramide (0 Base, 1, 2), `null` solo per gli
 *   stadi ignoti. Gli esotici hanno un livello equivalente, così se vengono
 *   ammessi entrano nelle linee al posto giusto.
 * @example
 * classifica({ categoria: 'Pokémon', stadio: 'Livello 1' });
 * // → { categoria: 'canonico', stadio: 'Livello 1', livello: 1 }
 * classifica({ categoria: 'Pokémon', stadio: 'VMAX' });
 * // → { categoria: 'esotico', stadio: 'VMAX', livello: 1 }  (evolve da un V)
 */
export function classifica(carta) {
  if (carta?.categoria !== 'Pokémon') {
    return { categoria: CATEGORIA.IGNOTO, stadio: null, livello: null };
  }

  const stadio = carta.stadio ?? null;
  const indice = SCALA.indexOf(stadio);

  if (indice >= 0) {
    return { categoria: CATEGORIA.CANONICO, stadio, livello: indice };
  }
  if (stadio && stadio in ESOTICI) {
    return { categoria: CATEGORIA.ESOTICO, stadio, livello: ESOTICI[stadio] };
  }
  return { categoria: CATEGORIA.IGNOTO, stadio, livello: null };
}

/**
 * Se la carta è utilizzabile dal generatore di mazzi.
 *
 * @param {object} carta
 * @param {{ammettiEsotici?: boolean}} [opzioni] `ammettiEsotici: true` include
 *   VMAX e simili, per chi vuole giocare con le regole complete
 * @returns {boolean}
 */
export function utilizzabile(carta, opzioni = {}) {
  const { categoria } = classifica(carta);
  if (categoria === CATEGORIA.CANONICO) return true;
  return categoria === CATEGORIA.ESOTICO && Boolean(opzioni.ammettiEsotici);
}

/**
 * Se la carta si può giocare direttamente dalla mano, senza evolvere nulla.
 *
 * Serve al vincolo "almeno un Pokémon Base per mazzo": senza, la mano iniziale
 * può non contenere nulla di giocabile e il turno si perde.
 *
 * @param {object} carta
 * @returns {boolean}
 */
export function eBase(carta) {
  return classifica(carta).livello === 0;
}
