/**
 * Costruisce `data/evoluzioni.json`: da quale Pokémon evolve ciascuna specie.
 *
 * Perché serve. Nel dataset **il 41% delle carte evoluzione non dichiara
 * `evolveDa`** — ma è un'incoerenza fra stampe, non un dato mancante: la stessa
 * specie lo dichiara in un set e lo tace in un altro. Su 2.037 carte senza il
 * campo, 1.839 (il 90%) hanno un'altra stampa che lo compila.
 *
 * Senza questo indice il motore non riesce a collegare l'Ivysaur che possiedi al
 * tuo Bulbasaur: lo tratta da orfano, lo esclude dal mazzo o lo gioca "come
 * Base", e arriva perfino a proporre di stampare una pre-evoluzione che hai già
 * nella scatola. Con l'indice, i collegamenti si recuperano tutti in una volta.
 *
 * Strumento di **sviluppo**: va rieseguito solo quando si scaricano set nuovi.
 * La PWA legge il JSON prodotto, non questo script.
 *
 * Uso:
 *     node tools/genera-indice-evoluzioni.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CARTELLA_SET = 'data/set';
const USCITA = 'data/evoluzioni.json';

/**
 * Normalizza un nome come fa `src/engine/nomi.js`.
 *
 * Duplicato apposta: questo è uno strumento di sviluppo che gira in Node e non
 * deve dipendere dai moduli della PWA. Se la regola cambia là, va allineata qui.
 *
 * @param {string} nome
 * @returns {string}
 */
function normalizza(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const file = readdirSync(CARTELLA_SET)
  .filter((f) => f.endsWith('.json') && f !== 'indice.json')
  .sort();

/** @type {Map<string, string>} nome normalizzato → nome della pre-evoluzione */
const evoluzioni = new Map();
/** Conflitti: la stessa specie con due pre-evoluzioni diverse. */
const conflitti = [];
let carteLette = 0;

for (const nomeFile of file) {
  const set = JSON.parse(readFileSync(join(CARTELLA_SET, nomeFile), 'utf8'));
  for (const carta of set.carte ?? []) {
    if (carta.categoria !== 'Pokémon' || !carta.evolveDa) continue;
    carteLette++;

    const chiave = normalizza(carta.nome);
    const gia = evoluzioni.get(chiave);
    if (gia && normalizza(gia) !== normalizza(carta.evolveDa)) {
      // Succede con le forme regionali che condividono il nome: si tiene la
      // prima e si segnala, invece di sovrascrivere in silenzio.
      conflitti.push(`${carta.nome}: ${gia} / ${carta.evolveDa}`);
      continue;
    }
    if (!gia) evoluzioni.set(chiave, carta.evolveDa);
  }
}

// Ordinato per nome: così il file è stabile fra due esecuzioni e il diff in
// git mostra solo le specie davvero cambiate.
const indice = Object.fromEntries([...evoluzioni.entries()].sort(([a], [b]) => a.localeCompare(b)));

writeFileSync(USCITA, `${JSON.stringify(indice, null, 0)}\n`);

const peso = (JSON.stringify(indice).length / 1024).toFixed(1);
console.log(`Letti ${file.length} set, ${carteLette} carte con evolveDa dichiarato.`);
console.log(`Scritte ${Object.keys(indice).length} specie in ${USCITA} (${peso} KB).`);
if (conflitti.length) {
  console.log(`\n${conflitti.length} nomi con pre-evoluzioni discordanti (tenuta la prima):`);
  for (const c of conflitti.slice(0, 10)) console.log('  ', c);
  if (conflitti.length > 10) console.log(`   …e altri ${conflitti.length - 10}`);
}
