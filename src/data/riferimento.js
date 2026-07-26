/**
 * Il mazzo di riferimento: il metro di paragone dell'app.
 *
 * È **uno solo** e si sceglie fra i mazzi già salvati. Serve a due cose che
 * altrimenti non avrebbero un termine di confronto:
 *
 * - la forza obiettivo del wizard ("fammi mazzi forti come quello");
 * - la partita contro il computer, che dovrà giocare proprio quel mazzo.
 *
 * Su disco si salva **un puntatore** (piano + posizione del mazzo), non una
 * copia delle carte: il mazzo salvato è già una fotografia, e duplicarla
 * significherebbe ritrovarsi un riferimento diverso dal mazzo che si legge
 * nell'elenco dopo averlo modificato. Accanto al puntatore si tengono nome e
 * forza solo per poterli mostrare senza rileggere tutto.
 *
 * Se il piano puntato viene cancellato il riferimento **si scioglie**: un
 * riferimento che punta al nulla è peggio di nessun riferimento, perché
 * continuerebbe a promettere un confronto che non si può più fare.
 *
 * @module data/riferimento
 */

import { STORE_IMPOSTAZIONI, leggi, scrivi, cancella } from './deposito.js';
import { leggiPiano } from './mazzi-salvati.js';

/** Riga unica dello store: c'è un solo mazzo di riferimento per volta. */
const CHIAVE = 'mazzo-riferimento';

/**
 * Come si presenta un mazzo di un piano salvato, per scegliere e per mostrare.
 *
 * Funzione pura: è la sola parte di questo modulo che si può provare senza un
 * database, ed è anche l'unica in cui si può sbagliare qualcosa.
 *
 * @param {object} piano un record di `elencoPiani()`
 * @param {number} indice posizione del mazzo dentro `piano.mazzi`
 * @returns {{idPiano: string, indice: number, nomePiano: string, nomeMazzo: string,
 *   forza: number|null, taglia: number|null}|null} `null` se il mazzo non esiste
 * @example
 * descriviMazzo(piano, 0); // → { nomeMazzo: 'Erba', forza: 132, … }
 */
export function descriviMazzo(piano, indice) {
  const mazzo = piano?.mazzi?.[indice];
  if (!mazzo) return null;

  return {
    idPiano: piano.id,
    indice,
    nomePiano: piano.nome ?? 'Senza nome',
    nomeMazzo: mazzo.nome ?? `Mazzo ${indice + 1}`,
    // La forza è quella misurata al salvataggio, non una ricalcolata adesso:
    // è il numero che si legge nell'elenco dei salvati, e due numeri diversi
    // per lo stesso mazzo sarebbero solo un modo di non farsi credere.
    forza: piano.equilibrio?.punteggi?.[indice]?.totale ?? null,
    taglia: mazzo.totale ?? piano.opzioni?.taglia ?? null,
  };
}

/**
 * Il mazzo di riferimento scelto, se c'è ancora.
 *
 * @returns {Promise<object|null>} la descrizione aggiornata sui dati di oggi
 */
export async function leggiRiferimento() {
  const riga = await leggi(STORE_IMPOSTAZIONI, CHIAVE);
  if (!riga) return null;

  const piano = await leggiPiano(riga.idPiano);
  const descrizione = descriviMazzo(piano, riga.indice);
  if (!descrizione) {
    // Il piano è stato cancellato: si toglie il puntatore invece di lasciarlo
    // lì a puntare a un mazzo che non esiste più.
    await togliRiferimento();
    return null;
  }
  return { ...descrizione, sceltoIl: riga.sceltoIl };
}

/**
 * Elegge un mazzo di un piano salvato a mazzo di riferimento.
 *
 * @param {string} idPiano
 * @param {number} indice posizione del mazzo nel piano
 * @returns {Promise<object>} la descrizione del mazzo eletto
 */
export async function impostaRiferimento(idPiano, indice) {
  const piano = await leggiPiano(idPiano);
  const descrizione = descriviMazzo(piano, Number(indice));
  if (!descrizione) throw new Error('Questo mazzo non esiste più fra quelli salvati.');

  await scrivi(STORE_IMPOSTAZIONI, {
    id: CHIAVE,
    idPiano,
    indice: Number(indice),
    sceltoIl: new Date().toISOString(),
  });
  return descrizione;
}

/** @returns {Promise<void>} */
export function togliRiferimento() {
  return cancella(STORE_IMPOSTAZIONI, CHIAVE);
}

/**
 * Il mazzo di riferimento con dentro le sue carte, pronto per il motore.
 *
 * Le carte si rileggono dal piano al momento del bisogno — non stanno nella
 * riga delle impostazioni — così restano quelle vere anche se il piano è stato
 * riaperto e modificato.
 *
 * @returns {Promise<object|null>} il mazzo idratato (`{nome, carte: [{carta, quantita}]}`)
 */
export async function mazzoRiferimento() {
  const riga = await leggi(STORE_IMPOSTAZIONI, CHIAVE);
  if (!riga) return null;
  const piano = await leggiPiano(riga.idPiano);
  return piano?.mazzi?.[riga.indice] ?? null;
}
