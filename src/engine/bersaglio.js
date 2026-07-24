/**
 * Generare mazzi che valgano **quanto si vuole**, non quanto viene.
 *
 * Il problema, in una frase: dalla stessa collezione il motore produce mazzi da
 * 49 e mazzi da 77 a seconda del seme, e se in casa si gioca contro un Kit
 * Allenatore da 31 la differenza fra i due è la differenza fra una partita e
 * un'esecuzione. Finora quale dei due uscisse era questione di fortuna.
 *
 * La soluzione **non** è un ottimizzatore. `pianifica()` è deterministica e
 * seminata: semi diversi danno mazzi diversi dalla stessa collezione, e la
 * dispersione misurata (49–77 a parità di taglia e collezione) è più larga
 * della precisione che serve. Quindi basta provare qualche seme e tenere il
 * risultato più vicino al bersaglio — che è anche l'unico modo di restare
 * onesti: ogni piano proposto è un piano che il generatore avrebbe potuto
 * produrre da solo, non un mazzo forzato a valere un numero.
 *
 * Modulo puro. Non tocca `pianifica()`, la chiama.
 *
 * @module engine/bersaglio
 */

import { pianifica } from './pianifica.js';
import { forzaMedia } from './forza.js';

/**
 * Scarto entro il quale due mazzi si considerano pari.
 *
 * Cinque punti su cento: sotto, la differenza si perde nel rumore del pescare —
 * non è distinguibile giocando, e continuare a cercare sarebbe tempo speso per
 * una precisione che non esiste. È la stessa soglia di `confronta()` in
 * `forza.js`, e deve restare la stessa: se la ricerca si fermasse a una
 * distanza che poi la UI chiama "più forte", l'app si contraddirebbe da sola.
 */
export const TOLLERANZA = 5;

/**
 * Quanti semi provare prima di accontentarsi.
 *
 * Ogni tentativo è una `pianifica()` completa, che internamente genera due
 * volte (le due passate delle regole della casa): otto tentativi sono sedici
 * generazioni. Su una collezione di famiglia sono decimi di secondo, ma il
 * tetto serve comunque — senza, una collezione che non può avvicinarsi al
 * bersaglio farebbe cercare all'infinito.
 */
export const TENTATIVI = 8;

/**
 * Sotto questo valore di `motore` un mazzo non si può giocare: vuol dire che
 * le Energie che contiene non alimentano quasi nessuno dei suoi Pokémon.
 *
 * Serve perché la ricerca, puntando a un bersaglio **basso**, altrimenti
 * preferisce i mazzi rotti: un mazzo che non può attaccare ha una forza bassa,
 * e per il solo numero è il candidato ideale. È successo davvero — chiedendo
 * mazzi da 31 usciva un piano con un mazzo a `motore: 0`, cioè zero Pokémon
 * alimentabili. Più debole sì, giocabile no.
 */
const MOTORE_MINIMO = 0.15;

/**
 * Se un piano è fatto di mazzi che si possono davvero giocare.
 *
 * @param {object[]} forze da `forzaMedia().forze`
 * @returns {boolean}
 */
const giocabile = (forze) => forze.every((f) => f.motore >= MOTORE_MINIMO);

/**
 * @typedef {object} Ricerca
 * @property {object} piano il risultato di `pianifica()` più vicino al bersaglio
 * @property {number} forza la forza media dei suoi mazzi
 * @property {number} scarto quanto dista dal bersaglio, con segno
 * @property {boolean} centrato se è rientrato in tolleranza
 * @property {number} tentativi quante generazioni sono servite
 * @property {number[]} provate le forze di tutti i tentativi, in ordine
 */

/**
 * Cerca un piano di mazzi che valga quanto il bersaglio.
 *
 * Senza `bersaglio` genera una volta sola e restituisce quella: è il
 * comportamento di prima, e chi non ha scelto un mazzo di riferimento non deve
 * pagare otto generazioni per niente.
 *
 * @param {Array<{carta: object, quantita: number}>} voci collezione
 * @param {object} opzioni le stesse di `pianifica()`, `seme` compreso
 * @param {object} [ricerca]
 * @param {number|null} [ricerca.bersaglio=null] forza desiderata, 0–100
 * @param {number} [ricerca.tolleranza=TOLLERANZA]
 * @param {number} [ricerca.tentativi=TENTATIVI]
 * @param {(fatti: number, totali: number, forza: number) => void} [ricerca.onTentativo]
 *   chiamata a ogni giro, per poter dire a schermo che si sta lavorando
 * @param {(piano: object) => Promise<void>|void} [ricerca.rifinisci] completa un
 *   piano **prima** di misurarlo. Serve perché le carte da stampare escono dal
 *   generatore col solo nome, e acquistano PS e attacchi solo quando il livello
 *   applicativo le ritrova nel dataset: misurate prima, un mazzo pieno di
 *   stampe risulta molto più debole del vero, e la ricerca sceglierebbe il
 *   piano sbagliato. Il motore non sa leggere il dataset, quindi lo fa fare a
 *   chi lo chiama
 * @returns {Promise<Ricerca>}
 * @example
 * // Mazzi che se la giochino col Kit di Alola, che vale 31.
 * const { piano, forza, centrato } = await cercaPiano(voci, opzioni, { bersaglio: 31 });
 */
export async function cercaPiano(voci, opzioni, ricerca = {}) {
  const {
    bersaglio = null,
    tolleranza = TOLLERANZA,
    tentativi = TENTATIVI,
    onTentativo = null,
    rifinisci = null,
  } = ricerca;

  const semeIniziale = opzioni.seme ?? 1;

  if (bersaglio == null) {
    const piano = pianifica(voci, opzioni);
    await rifinisci?.(piano);
    const { media } = forzaMedia(piano.mazzi, { taglia: opzioni.taglia });
    return {
      piano,
      forza: media,
      scarto: 0,
      centrato: true,
      tentativi: 1,
      provate: [media],
    };
  }

  let migliore = null;
  const provate = [];

  for (let giro = 0; giro < Math.max(1, tentativi); giro++) {
    // I semi si derivano da quello iniziale invece di essere 0, 1, 2…: così
    // due ricerche avviate con semi diversi esplorano zone diverse, e "rigenera
    // diversi" continua a produrre mazzi diversi anche col bersaglio attivo.
    const seme = semeIniziale + giro * 7919;
    const piano = pianifica(voci, { ...opzioni, seme });
    await rifinisci?.(piano);
    const { media, forze } = forzaMedia(piano.mazzi, { taglia: opzioni.taglia });
    provate.push(media);

    const scarto = media - bersaglio;
    const candidato = { piano, forza: media, scarto, giocabile: giocabile(forze) };

    // Un piano giocabile batte sempre uno che non lo è, per quanto vicino sia
    // al bersaglio: avvicinarsi al numero rompendo il mazzo è centrare la
    // misura e mancare lo scopo.
    if (!migliore || meglio(candidato, migliore)) migliore = candidato;

    onTentativo?.(giro + 1, tentativi, media);

    // Dentro tolleranza **e** giocabile: cercare ancora significherebbe
    // scartare un piano buono sperando in uno indistinguibile.
    if (candidato.giocabile && Math.abs(scarto) <= tolleranza) break;
  }

  return {
    ...migliore,
    centrato: migliore.giocabile && Math.abs(migliore.scarto) <= tolleranza,
    tentativi: provate.length,
    provate,
  };
}

/**
 * Se il primo candidato è preferibile al secondo.
 *
 * @param {{scarto: number, giocabile: boolean}} a
 * @param {{scarto: number, giocabile: boolean}} b
 * @returns {boolean}
 */
function meglio(a, b) {
  if (a.giocabile !== b.giocabile) return a.giocabile;
  return Math.abs(a.scarto) < Math.abs(b.scarto);
}

/**
 * Il bersaglio numerico corrispondente a una scelta del wizard.
 *
 * Le scelte sono relative — «alla pari», «un po' più debole» — perché nessuno
 * sa cosa voglia dire 31 finché non ha giocato qualche partita, mentre tutti
 * sanno cosa vuol dire «un po' più forte del mazzo di mio fratello».
 *
 * Lo scarto è di **dieci punti**, cioè il doppio della tolleranza: sotto, la
 * differenza rientrerebbe nel rumore e «un po' più forte» produrrebbe mazzi
 * indistinguibili da «alla pari».
 *
 * @param {number} riferimento forza del mazzo prefatto scelto
 * @param {'pari'|'sotto'|'sopra'} verso
 * @returns {number} bersaglio, tenuto dentro la scala
 * @example
 * bersaglioPer(31, 'sopra'); // 41
 */
export function bersaglioPer(riferimento, verso) {
  const scarti = { pari: 0, sotto: -10, sopra: 10 };
  return Math.min(100, Math.max(0, riferimento + (scarti[verso] ?? 0)));
}
