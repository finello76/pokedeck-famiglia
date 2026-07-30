/**
 * Export e import della collezione in JSON, per spostare i dati fra telefono
 * e PC (IndexedDB è legato al singolo browser: non c'è nessuna sincronia).
 *
 * Il file contiene **solo** identificativi e quantità, non i dati delle carte:
 * resta leggibile a occhio, pesa pochi KB e non invecchia quando il dataset
 * viene aggiornato.
 *
 * @module data/scambio
 */

import { elencoCompleto, svuotaTutto, scriviMoltePer } from './collezione.js';
import { recordSalvati, scriviRecord } from './mazzi-salvati.js';

/**
 * Versione del formato del file.
 *
 * Resta **1** anche dopo l'aggiunta dei mazzi: il campo `mazzi` è facoltativo e
 * la sua assenza è indistinguibile da "non ne avevo". Un file vecchio si
 * rilegge senza conversioni, e uno nuovo aperto da una versione vecchia
 * dell'app perde i mazzi ma non le carte — cioè degrada, non si rompe.
 */
const VERSIONE_FORMATO = 1;

/**
 * Produce l'oggetto da salvare su file.
 * @returns {Promise<object>}
 */
export async function esporta() {
  // Con i desideri: sono dati che hai inserito a mano come tutti gli altri, e
  // perderli spostando la collezione su un altro telefono sarebbe una perdita
  // silenziosa — te ne accorgeresti solo davanti allo scaffale del negozio.
  const righe = await elencoCompleto({ conDesideri: true });
  // I mazzi salvati sono lavoro fatto a mano — nomi scelti, regole della casa
  // accettate, punteggi con cui i mazzi sono stati dichiarati pari — e senza
  // di essi "esporta dati" mantiene solo metà della promessa: si cambia
  // telefono e i mazzi restano indietro, senza che niente lo dica.
  const mazzi = await recordSalvati();
  return {
    formato: 'pokedeck-famiglia',
    versione: VERSIONE_FORMATO,
    esportatoIl: new Date().toISOString(),
    // Il record salvato porta con sé i campi delle carte e la forza calcolata:
    // si esporta tale e quale, e al reimport torna identico. Pesa più delle
    // carte, ma un mazzo ricostruito dal dataset di domani non sarebbe lo
    // stesso mazzo (vedi `istantanea()` in mazzi-salvati.js).
    mazzi,
    carte: righe.map((r) => ({
      idSet: r.idSet,
      numero: r.numero,
      quantita: r.quantita,
      // Presente solo sui desideri: le righe normali restano identiche a
      // prima, quindi i file esportati con le versioni vecchie si rileggono
      // senza conversioni.
      ...(r.desiderata ? { desiderata: true } : {}),
      // Stesso criterio per il cuore dei preferiti: è una scelta fatta a mano,
      // carta per carta, e rifarla su un telefono nuovo vorrebbe dire riscorrere
      // tutta la collezione.
      ...(r.preferita ? { preferita: true } : {}),
      // Solo per leggibilità umana: all'import viene ignorato, perché la
      // verità sta nel dataset. Se un nome cambia, l'import resta valido.
      nome: r.carta?.nome ?? null,
    })),
  };
}

/**
 * Fa scaricare la collezione come file JSON.
 * @returns {Promise<string>} nome del file generato
 */
export async function scaricaFile() {
  const dati = await esporta();
  const testo = JSON.stringify(dati, null, 2);
  const blob = new Blob([testo], { type: 'application/json' });

  const url = URL.createObjectURL(blob);
  const nome = `collezione-${dati.esportatoIl.slice(0, 10)}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();

  // Senza revoke il blob resta in memoria finché la pagina è aperta.
  URL.revokeObjectURL(url);
  return nome;
}

/**
 * Verifica che un oggetto sia un export valido, con messaggi comprensibili.
 *
 * Il file arriva da fuori (magari modificato a mano): non ci si fida.
 *
 * @param {any} dati
 * @returns {{idSet: string, numero: string, quantita: number}[]}
 * @throws {Error} se il file non è utilizzabile
 */
export function validaImport(dati) {
  if (!dati || typeof dati !== 'object') {
    throw new Error('Il file non contiene dati leggibili.');
  }
  if (dati.formato !== 'pokedeck-famiglia') {
    throw new Error('Questo file non è un backup di PokéDeck Famiglia.');
  }
  if (Number(dati.versione) > VERSIONE_FORMATO) {
    throw new Error(
      `Il file è stato creato con una versione più recente dell'app (formato ${dati.versione}).`,
    );
  }
  if (!Array.isArray(dati.carte)) {
    throw new Error('Manca l\'elenco delle carte.');
  }

  const voci = [];
  dati.carte.forEach((c, indice) => {
    const quantita = Number(c?.quantita);
    if (!c?.idSet || c?.numero === undefined || c?.numero === null) {
      throw new Error(`Carta n. ${indice + 1}: mancano il codice del set o il numero.`);
    }
    if (!Number.isFinite(quantita) || quantita <= 0) {
      throw new Error(`Carta n. ${indice + 1} (${c.idSet}:${c.numero}): quantità non valida.`);
    }
    voci.push({
      idSet: String(c.idSet),
      numero: String(c.numero),
      quantita,
      // I file esportati prima della lista desideri non hanno il campo: assente
      // vuol dire posseduta, che e' il comportamento di sempre.
      ...(c.desiderata ? { desiderata: true } : {}),
      // Come sopra: assente vuol dire "non preferita". Un desiderio non può
      // essere preferito — il cuore sta sulle carte che hai — e la coppia
      // impossibile la scarta `scriviMoltePer()`, non qui: questa funzione
      // valida il file, non decide cosa sia coerente.
      ...(c.preferita ? { preferita: true } : {}),
    });
  });

  return voci;
}

/**
 * I mazzi salvati contenuti in un file di scambio, scartando quelli inservibili.
 *
 * Funzione **pura**, separata dalla scrittura, per due motivi: si prova senza
 * un IndexedDB, e soprattutto un mazzo malformato non deve far fallire l'import
 * delle carte. Le due cose viaggiano insieme nel file ma non dipendono l'una
 * dall'altra: perdere un mazzo rotto è un danno piccolo, perdere la collezione
 * per colpa sua no.
 *
 * Per questo qui si **scarta in silenzio** invece di lanciare, al contrario di
 * `validaImport()` sulle carte: là un errore significa che il file non è quello
 * che dice di essere, qui che una voce su venti è storta.
 *
 * @param {any} dati l'oggetto letto dal file
 * @returns {object[]} i record utilizzabili, eventualmente vuoto
 * @example
 * mazziDaImportare({ mazzi: [{ id: '2026-01-01', nome: 'Casa', mazzi: [] }] }).length; // 1
 * mazziDaImportare({});                                                               // []
 */
export function mazziDaImportare(dati) {
  if (!Array.isArray(dati?.mazzi)) return [];
  return dati.mazzi.filter(
    (r) =>
      r &&
      typeof r === 'object' &&
      typeof r.id === 'string' &&
      r.id !== '' &&
      // `mazzi` è l'elenco dei mazzi dentro il piano: senza, non c'è niente da
      // riaprire e la voce comparirebbe nell'elenco come una card vuota.
      Array.isArray(r.mazzi),
  );
}

/**
 * Importa una collezione da testo JSON.
 *
 * @param {string} testo contenuto del file
 * @param {{sostituisci?: boolean}} [opzioni] `sostituisci: true` svuota prima;
 *   altrimenti le quantità del file **sovrascrivono** quelle esistenti per le
 *   carte in comune, lasciando intatte le altre.
 * @returns {Promise<{importate: number, sostituito: boolean}>}
 */
export async function importa(testo, opzioni = {}) {
  let dati;
  try {
    dati = JSON.parse(testo);
  } catch (errore) {
    throw new Error('Il file è danneggiato o non è un backup di PokéDeck Famiglia.');
  }

  const voci = validaImport(dati);

  // La validazione avviene PRIMA di toccare il database: se il file è rotto,
  // la collezione esistente non viene sfiorata.
  if (opzioni.sostituisci) await svuotaTutto();

  const importate = await scriviMoltePer(voci);
  // I mazzi si aggiungono sempre, anche con `sostituisci`: quell'opzione parla
  // della collezione — "queste sono le mie carte, non quelle" — e allargarla
  // ai mazzi cancellerebbe lavoro che l'utente non ha mai chiesto di buttare.
  const mazzi = await scriviRecord(mazziDaImportare(dati));
  return { importate, mazzi, sostituito: Boolean(opzioni.sostituisci) };
}
