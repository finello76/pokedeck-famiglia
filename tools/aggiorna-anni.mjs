/**
 * Aggiunge a `data/set/indice.json` la **data di uscita** di ogni set.
 *
 * Perché serve. I set si scelgono per epoca, non per nome: "quello del 2016" è
 * un'informazione che chi ha le carte in mano possiede, "Evoluzioni" no. Senza
 * la data il menu dei set è un elenco di 190 nomi in ordine di comparsa nella
 * collezione, cioè in nessun ordine utile.
 *
 * Il dato non è nei file scaricati: `scarica-set.mjs` tiene solo le carte, e
 * l'elenco breve `/sets` non riporta `releaseDate`. Sta solo nel dettaglio del
 * singolo set, quindi serve una richiesta per set.
 *
 * Strumento di **sviluppo**: 190 richieste, meno di un minuto. Va rieseguito
 * quando escono set nuovi, dopo `scarica-set.mjs` e `aggiorna-serie.mjs`. La
 * PWA legge il JSON prodotto e non chiama mai la rete.
 *
 * Uso:
 *     node tools/aggiorna-anni.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const API = 'https://api.tcgdex.net/v2/it';
const INDICE = 'data/set/indice.json';

/**
 * Scarica un JSON, con un messaggio comprensibile se va storto.
 * @param {string} url
 * @returns {Promise<any>}
 */
async function leggi(url) {
  const risposta = await fetch(url);
  if (!risposta.ok) throw new Error(`${url} → HTTP ${risposta.status}`);
  return risposta.json();
}

const indice = JSON.parse(readFileSync(INDICE, 'utf8'));
console.log(`Chiedo la data di uscita di ${indice.set.length} set.`);

let senzaData = 0;
const setAggiornati = [];

for (const set of indice.set) {
  let uscita = null;
  try {
    const dettaglio = await leggi(`${API}/sets/${set.id}`);
    uscita = dettaglio.releaseDate ?? null;
  } catch (errore) {
    console.log(`  ${set.id}: ${errore.message}`);
  }
  if (!uscita) senzaData += 1;
  // `uscita` è la data intera (`1999-01-09`): l'anno da solo non basterebbe a
  // ordinare i set usciti nello stesso anno, che sono la maggioranza.
  setAggiornati.push({ ...set, uscita });
}

writeFileSync(INDICE, `${JSON.stringify({ ...indice, set: setAggiornati }, null, 0)}\n`);

console.log(`\nScritti ${setAggiornati.length} set in ${INDICE}.`);
if (senzaData) console.log(`${senzaData} set senza data: resteranno in fondo all'elenco.`);
