/**
 * Aggiunge a `data/set/indice.json` la serie di appartenenza di ogni set.
 *
 * Perché serve. Una collezione di famiglia non si guarda per set — sono 110 —
 * ma per **serie**: "Sole e Luna", "Scarlatto e Violetto". È così che sono
 * organizzati i raccoglitori veri, ed è così che si capisce cosa manca.
 *
 * Il dato non è nei file dei set scaricati: `scarica-set.mjs` salva le carte,
 * non l'albero delle serie. Si potrebbe dedurre dall'URL delle immagini
 * (`.../it/sv/sv08/001` → serie `sv`), ma 16 set su 110 non hanno immagini e
 * resterebbero senza; e comunque servirebbero i nomi italiani, che nell'URL non
 * ci sono.
 *
 * Strumento di **sviluppo**: 18 richieste, una per serie. Va rieseguito quando
 * escono set nuovi, subito dopo `scarica-set.mjs`. La PWA legge il JSON
 * prodotto e non chiama mai la rete.
 *
 * Uso:
 *     node tools/aggiorna-serie.mjs
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
const serie = await leggi(`${API}/series`);
console.log(`Serie disponibili: ${serie.length}.`);

/** @type {Map<string, {id: string, nome: string}>} id del set → sua serie */
const serieDelSet = new Map();
/** @type {Array<{id: string, nome: string}>} le serie, nell'ordine dell'API */
const elencoSerie = [];

for (const { id, name } of serie) {
  const dettaglio = await leggi(`${API}/series/${id}`);
  const suoi = dettaglio.sets ?? [];
  elencoSerie.push({ id, nome: name });
  for (const set of suoi) serieDelSet.set(set.id, { id, nome: name });
  console.log(`  ${name.padEnd(38)} ${String(suoi.length).padStart(3)} set`);
}

// I set scaricati che l'API non colloca da nessuna parte finiscono in un
// gruppo esplicito: sparire dall'elenco sarebbe peggio, perché quelle carte
// nella collezione ci sono davvero.
const ALTRE = { id: 'altre', nome: 'Altre serie' };
let orfani = 0;

const setAggiornati = indice.set.map((set) => {
  const sua = serieDelSet.get(set.id);
  if (!sua) orfani += 1;
  return { ...set, serie: sua ?? ALTRE };
});

const usate = new Set(setAggiornati.map((s) => s.serie.id));
const serieUsate = [...elencoSerie, ALTRE].filter((s) => usate.has(s.id));

writeFileSync(INDICE, `${JSON.stringify({ ...indice, serie: serieUsate, set: setAggiornati }, null, 0)}\n`);

console.log(`\nScritti ${setAggiornati.length} set in ${INDICE}, ${serieUsate.length} serie usate.`);
if (orfani) console.log(`${orfani} set non collocati dall'API: finiti in "${ALTRE.nome}".`);
