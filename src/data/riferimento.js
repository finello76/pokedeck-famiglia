/**
 * Il mazzo di riferimento: il metro di paragone dell'app.
 *
 * È **uno solo**, e si sceglie fra due sorgenti diverse:
 *
 * - un mazzo che hai **salvato** — "fammi mazzi forti come quello di mio
 *   fratello", il paragone che si ha davvero in casa;
 * - un mazzo **prefatto** — i Kit Allenatore da negozio di
 *   `data/mazzi-prefatti.json`, di cui si conosce la lista esatta.
 *
 * Servono a due cose che altrimenti non avrebbero un termine di confronto: la
 * forza obiettivo del wizard, e la partita contro il computer, che dovrà
 * giocare proprio quel mazzo.
 *
 * Perché entrambe e non una: un prefatto è un metro stabile e oggettivo, ma non
 * è il mazzo contro cui si gioca davvero se in casa ci si scontra fra mazzi
 * costruiti. Tenere solo i salvati toglieva il metro a chi non ha ancora
 * salvato niente; tenere solo i prefatti toglieva il caso d'uso più comune.
 *
 * ## Cosa si salva su disco
 *
 * Un **puntatore**, non una copia delle carte: `{sorgente, idPiano, indice}`
 * per un mazzo salvato, `{sorgente, idPrefatto}` per un Kit. Il mazzo salvato è
 * già una fotografia, e duplicarla significherebbe ritrovarsi un riferimento
 * diverso dal mazzo che si legge nell'elenco dopo averlo modificato.
 *
 * Se ciò che il puntatore indica sparisce — il piano cancellato, il prefatto
 * non più nel catalogo — il riferimento **si scioglie**: un riferimento che
 * punta al nulla è peggio di nessun riferimento, perché continuerebbe a
 * promettere un confronto che non si può più fare.
 *
 * ## L'unità di misura
 *
 * La forza qui è sempre quella di `engine/forza.js`, la scala assoluta 0–100 —
 * **mai** il punteggio di `bilancia.js`, che è relativo e serve a confrontare i
 * mazzi di uno stesso piano fra loro. È la scala su cui il wizard chiede
 * l'obiettivo e su cui `bersaglio.js` cerca: leggerne una e inseguirne un'altra
 * farebbe fermare la ricerca su un numero che la UI poi contraddice.
 *
 * @module data/riferimento
 */

import { STORE_IMPOSTAZIONI, leggi, scrivi, cancella } from './deposito.js';
import { leggiPiano } from './mazzi-salvati.js';
import { leggiPrefatto } from './mazzi-prefatti.js';
import { forza } from '../engine/forza.js';

/** Riga unica dello store: c'è un solo mazzo di riferimento per volta. */
const CHIAVE = 'mazzo-riferimento';

/** Le due sorgenti da cui può venire un riferimento. */
export const SORGENTI = { SALVATO: 'salvato', PREFATTO: 'prefatto' };

/**
 * Come si presenta un mazzo di un piano salvato, per scegliere e per mostrare.
 *
 * Funzione pura: è la sola parte di questo modulo che si può provare senza un
 * database, ed è anche l'unica in cui si può sbagliare qualcosa.
 *
 * @param {object} piano un record di `elencoPiani()`
 * @param {number} indice posizione del mazzo dentro `piano.mazzi`
 * @returns {{sorgente: string, idPiano: string, indice: number, nomePiano: string,
 *   nome: string, forza: number|null, taglia: number|null}|null} `null` se il
 *   mazzo non esiste
 * @example
 * descriviMazzo(piano, 0); // → { nome: 'Erba', forza: 52, … }
 */
export function descriviMazzo(piano, indice) {
  const mazzo = piano?.mazzi?.[indice];
  if (!mazzo) return null;

  const taglia = mazzo.totale ?? piano.opzioni?.taglia ?? null;

  return {
    sorgente: SORGENTI.SALVATO,
    idPiano: piano.id,
    indice,
    nomePiano: piano.nome ?? 'Senza nome',
    nome: mazzo.nome ?? `Mazzo ${indice + 1}`,
    // La forza salvata col mazzo, sulla scala 0–100. È quella misurata al
    // salvataggio e non una ricalcolata adesso: è il numero che si legge
    // nell'elenco dei salvati, e due numeri diversi per lo stesso mazzo
    // sarebbero solo un modo di non farsi credere. Il ripiego calcola, perché i
    // piani salvati prima che `istantanea()` scrivesse `forza` non ce l'hanno.
    forza: mazzo.forza?.totale ?? mazzo.forza ?? forzaDi(mazzo, taglia),
    taglia,
  };
}

/**
 * Come si presenta un mazzo prefatto.
 *
 * @param {object} prefatto un record di `elencoPrefatti()`
 * @returns {object|null}
 */
export function descriviPrefatto(prefatto) {
  if (!prefatto) return null;
  return {
    sorgente: SORGENTI.PREFATTO,
    idPrefatto: prefatto.id,
    nomePiano: prefatto.prodotto ?? 'Mazzo prefatto',
    nome: prefatto.nome,
    // Qui si calcola sempre: un prefatto è un prodotto che non cambia, quindi
    // il numero è stabile, e non c'è nessun salvataggio in cui fosse già stato
    // scritto.
    forza: forzaDi(prefatto, prefatto.taglia),
    taglia: prefatto.taglia ?? null,
  };
}

/**
 * La forza 0–100 di un mazzo, o `null` se non è misurabile.
 *
 * Restituire `null` invece di `0` non è pignoleria: zero significherebbe "mazzo
 * debolissimo" e il wizard lo userebbe come bersaglio, cercando mazzi che non
 * si possono giocare. `null` significa "non lo so", e chi lo riceve non lo
 * propone come metro.
 *
 * @param {object} mazzo
 * @param {number|null} [taglia]
 * @returns {number|null}
 */
function forzaDi(mazzo, taglia = null) {
  const misura = forza(mazzo, taglia ? { taglia } : {});
  return misura.attendibile ? misura.totale : null;
}

/**
 * Il mazzo di riferimento scelto, se c'è ancora.
 *
 * @returns {Promise<object|null>} la descrizione aggiornata sui dati di oggi
 */
export async function leggiRiferimento() {
  const riga = await leggi(STORE_IMPOSTAZIONI, CHIAVE);
  if (!riga) return null;

  const descrizione = await descriviPuntatore(riga);
  if (!descrizione) {
    // Ciò che era puntato non c'è più: si toglie il puntatore invece di
    // lasciarlo lì a promettere un confronto impossibile.
    await togliRiferimento();
    return null;
  }
  return { ...descrizione, sceltoIl: riga.sceltoIl };
}

/**
 * Risolve un puntatore salvato nella descrizione del mazzo che indica.
 *
 * @param {object} riga la riga dello store
 * @returns {Promise<object|null>}
 */
async function descriviPuntatore(riga) {
  if (riga.sorgente === SORGENTI.PREFATTO) {
    return descriviPrefatto(await leggiPrefatto(riga.idPrefatto));
  }
  // Le righe scritte prima che esistessero i prefatti non hanno `sorgente`:
  // erano tutte mazzi salvati, e vanno lette come tali invece di sparire.
  return descriviMazzo(await leggiPiano(riga.idPiano), riga.indice);
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
    sorgente: SORGENTI.SALVATO,
    idPiano,
    indice: Number(indice),
    sceltoIl: new Date().toISOString(),
  });
  return descrizione;
}

/**
 * Elegge un mazzo prefatto a mazzo di riferimento.
 *
 * @param {string} idPrefatto
 * @returns {Promise<object>} la descrizione del mazzo eletto
 */
export async function impostaRiferimentoPrefatto(idPrefatto) {
  const descrizione = descriviPrefatto(await leggiPrefatto(idPrefatto));
  if (!descrizione) throw new Error('Questo mazzo prefatto non è nel catalogo.');

  await scrivi(STORE_IMPOSTAZIONI, {
    id: CHIAVE,
    sorgente: SORGENTI.PREFATTO,
    idPrefatto,
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
 * Le carte si rileggono dalla sorgente al momento del bisogno — non stanno
 * nella riga delle impostazioni — così restano quelle vere anche se il piano è
 * stato riaperto e modificato.
 *
 * @returns {Promise<object|null>} il mazzo idratato (`{nome, carte: [{carta, quantita}]}`)
 */
export async function mazzoRiferimento() {
  const riga = await leggi(STORE_IMPOSTAZIONI, CHIAVE);
  if (!riga) return null;

  if (riga.sorgente === SORGENTI.PREFATTO) {
    return (await leggiPrefatto(riga.idPrefatto)) ?? null;
  }
  const piano = await leggiPiano(riga.idPiano);
  return piano?.mazzi?.[riga.indice] ?? null;
}
