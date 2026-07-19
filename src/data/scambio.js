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

/** Versione del formato del file, per riconoscere export vecchi in futuro. */
const VERSIONE_FORMATO = 1;

/**
 * Produce l'oggetto da salvare su file.
 * @returns {Promise<object>}
 */
export async function esporta() {
  const righe = await elencoCompleto();
  return {
    formato: 'pokedeck-famiglia',
    versione: VERSIONE_FORMATO,
    esportatoIl: new Date().toISOString(),
    carte: righe.map((r) => ({
      idSet: r.idSet,
      numero: r.numero,
      quantita: r.quantita,
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
    throw new Error('Il file non contiene un oggetto JSON.');
  }
  if (dati.formato !== 'pokedeck-famiglia') {
    throw new Error('Questo file non è un export di PokéDeck Famiglia.');
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
      throw new Error(`Carta n. ${indice + 1}: mancano idSet o numero.`);
    }
    if (!Number.isFinite(quantita) || quantita <= 0) {
      throw new Error(`Carta n. ${indice + 1} (${c.idSet}:${c.numero}): quantità non valida.`);
    }
    voci.push({ idSet: String(c.idSet), numero: String(c.numero), quantita });
  });

  return voci;
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
    throw new Error(`Il file non è JSON valido: ${errore.message}`);
  }

  const voci = validaImport(dati);

  // La validazione avviene PRIMA di toccare il database: se il file è rotto,
  // la collezione esistente non viene sfiorata.
  if (opzioni.sostituisci) await svuotaTutto();

  const importate = await scriviMoltePer(voci);
  return { importate, sostituito: Boolean(opzioni.sostituisci) };
}
