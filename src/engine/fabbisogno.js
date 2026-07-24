/**
 * Di quali Energie ha bisogno un mazzo, secondo le carte che contiene.
 *
 * Nasce da un difetto trovato provando l'app con una collezione vera: nei mazzi
 * finivano Skarmory, Dialga, Exeggcute — carte i cui attacchi chiedono Metallo,
 * Erba, Acqua — e le Energie di quei tipi non c'erano. Su 960 mazzi generati,
 * 1103 carte si trovavano senza l'Energia che serve loro per attaccare.
 *
 * La causa era una sola, e attraversava tutto il motore: si ragionava su
 * `mazzo.tipi`, il **tipo dichiarato** del mazzo, e mai su ciò che i suoi
 * Pokémon chiedono davvero. Un mazzo etichettato "Lotta" che contiene uno
 * Skarmory resta un mazzo Lotta: nessuno gli metterà mai un'Energia Metallo.
 *
 * Il tipo dichiarato non basta per tre motivi:
 *
 * 1. i mazzi si riempiono con quello che c'è, e ciò che c'è non è tutto del
 *    tipo scelto;
 * 2. il tipo di un Pokémon **non coincide** col costo dei suoi attacchi —
 *    Dialga è di tipo Drago e chiede Psico e Metallo;
 * 3. dopo un riequilibrio un mazzo diventa bitipo, e le carte arrivate con la
 *    linea spostata portano bisogni loro.
 *
 * Modulo puro.
 *
 * @module engine/fabbisogno
 */

import { eEnergiaBase, tipoEnergia } from '../data/energie.js';

/**
 * Il tipo di Energia che ogni carta Pokémon chiede per attaccare.
 *
 * Si legge dal **costo degli attacchi**, non dal campo `tipi`. Sono cose
 * diverse e confonderle è l'errore da cui nasce questo modulo: Dialga
 * (`tipi: ['Drago']`) ha attacchi che costano Psico e Metallo, e un mazzo
 * riempito di Energie Drago — che peraltro quasi non esistono — non lo farebbe
 * attaccare comunque.
 *
 * `Incolore` si ignora: lo paga qualunque Energia, quindi non è un bisogno.
 *
 * @param {object} carta
 * @returns {string[]} tipi distinti richiesti, eventualmente vuoto
 * @example
 * tipiRichiesti({ attacchi: [{ costo: ['Metallo', 'Incolore'] }] }); // ['Metallo']
 */
export function tipiRichiesti(carta) {
  if (carta?.categoria !== 'Pokémon') return [];
  const tipi = new Set();
  for (const attacco of carta.attacchi ?? []) {
    for (const costo of attacco.costo ?? []) {
      if (costo && costo !== 'Incolore') tipi.add(costo);
    }
  }
  return [...tipi];
}

/**
 * Quante copie di carte, in un mazzo, chiedono ciascun tipo di Energia.
 *
 * Ponderato per copie: tre Machop che chiedono Lotta pesano più di un Uxie che
 * chiede Psico, ed è giusto che il mazzo riceva Energie in quella proporzione.
 *
 * @param {object} mazzo
 * @returns {Record<string, number>} tipo → copie che lo chiedono
 * @example
 * fabbisogno(mazzo); // { Lotta: 6, Psico: 1 }
 */
export function fabbisogno(mazzo) {
  const conti = {};
  for (const voce of mazzo?.carte ?? []) {
    for (const tipo of tipiRichiesti(voce.carta)) {
      conti[tipo] = (conti[tipo] ?? 0) + voce.quantita;
    }
  }
  return conti;
}

/**
 * I tipi di Energia base presenti in un mazzo.
 *
 * @param {object} mazzo
 * @returns {Set<string>}
 */
export function tipiPresenti(mazzo) {
  return new Set(
    (mazzo?.carte ?? [])
      .filter((v) => eEnergiaBase(v.carta))
      .map((v) => tipoEnergia(v.carta))
      .filter(Boolean),
  );
}

/**
 * Le carte di un mazzo che non possono attaccare, perché l'Energia che
 * chiedono non è nel mazzo.
 *
 * È la misura del difetto, e serve sia al motore delle regole (per attivare
 * l'energia universale con dei numeri veri) sia al foglio stampato: chi ha il
 * mazzo in mano deve sapere **quali** carte non funzionano, non che "qualcosa"
 * non funziona.
 *
 * @param {object} mazzo
 * @returns {Array<{nome: string, quantita: number, mancano: string[]}>}
 * @example
 * scoperte(mazzo); // [{ nome: 'Skarmory', quantita: 1, mancano: ['Metallo'] }]
 */
export function scoperte(mazzo) {
  const presenti = tipiPresenti(mazzo);
  const fuori = [];
  for (const voce of mazzo?.carte ?? []) {
    const richiesti = tipiRichiesti(voce.carta);
    if (!richiesti.length) continue;
    // Basta **un** tipo servito: un attacco pagabile rende la carta giocabile,
    // anche se un secondo attacco più costoso resta fuori portata.
    if (richiesti.some((t) => presenti.has(t))) continue;
    fuori.push({ nome: voce.carta.nome, quantita: voce.quantita, mancano: richiesti });
  }
  return fuori;
}

/**
 * I tipi di Energia base che una collezione può davvero fornire.
 *
 * Serve al generatore per non scegliere carte che nessuna Energia posseduta
 * potrà mai alimentare: con zero Energie Metallo in collezione, uno Skarmory
 * nel mazzo è una carta morta qualunque cosa si faccia dopo.
 *
 * @param {Array<{carta: object, quantita: number}>} voci collezione
 * @returns {Set<string>}
 */
export function tipiDisponibili(voci) {
  return new Set(
    (voci ?? [])
      .filter((v) => eEnergiaBase(v.carta) && v.quantita > 0)
      .map((v) => tipoEnergia(v.carta))
      .filter(Boolean),
  );
}
