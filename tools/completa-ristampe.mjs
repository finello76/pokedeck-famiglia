/**
 * Costruisce `data/ristampe.json`: i dati di gioco delle carte che TCGdex
 * lascia incomplete.
 *
 * Il problema. TCGdex tratta alcune stampe come ristampe e non vi replica PS e
 * attacchi. Sono 204 Pokémon su 12.877 — l'1,6% — ma non sono sparsi a caso:
 * stanno quasi tutti nei set Kit Allenatore, cioè proprio nei mazzi con cui si
 * gioca in casa. Il risultato, prima di questo strumento, era che il
 * costruttore di mazzi mostrava "offesa 0" su un mazzo di Lycanroc e Raichu, e
 * dichiarava il punteggio inattendibile.
 *
 * La soluzione. Quelle carte esistono complete altrove nel dataset e si
 * ritrovano per nome. La ricerca si fa **una volta sola, qui**, e non a runtime:
 * cercare un omonimo significa scorrere tutti i set, e la PWA ne carica uno per
 * volta apposta — farlo nel browser vorrebbe dire scaricare 6,4 MB per leggere
 * gli attacchi di una carta.
 *
 * Il file che ne esce è minuscolo (solo le carte incomplete) e va nel guscio
 * del service worker, quindi funziona anche offline.
 *
 * Strumento di SVILUPPO: si rilancia dopo aver scaricato set nuovi.
 *
 * Uso:
 *     node tools/completa-ristampe.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { misurabile, ritrovaDati, setDoveCercare } from './lib/ristampe.mjs';

const RADICE = process.cwd();
const CARTELLA_SET = join(RADICE, 'data', 'set');
const USCITA = join(RADICE, 'data', 'ristampe.json');

const leggi = (percorso) => JSON.parse(readFileSync(percorso, 'utf8'));
const indice = leggi(join(CARTELLA_SET, 'indice.json'));

const cache = new Map();
/** @param {string} id @returns {object[]} le carte di un set */
function carteDi(id) {
  if (!cache.has(id)) {
    try {
      cache.set(id, leggi(join(CARTELLA_SET, `${id}.json`)).carte ?? []);
    } catch {
      // Set nell'indice ma non ancora scaricato: si salta, non si interrompe.
      cache.set(id, []);
    }
  }
  return cache.get(id);
}

const file = readdirSync(CARTELLA_SET).filter((f) => f.endsWith('.json') && f !== 'indice.json');

const ristampe = {};
let trovate = 0;
let irrisolte = 0;
let approssimate = 0;

for (const nomeFile of file) {
  const idSet = nomeFile.replace(/\.json$/, '');
  for (const carta of carteDi(idSet)) {
    if (misurabile(carta)) continue;

    // Le candidate si passano TUTTE insieme, in ordine di preferenza, e non
    // un set per volta fermandosi al primo che contiene un omonimo: la
    // preferenza per i PS uguali deve valere sull'intero dataset, o il
    // Lycanroc del Kit (110 PS) ricade sul promo da 120 solo perché quel set
    // viene prima. I set restano in cache, quindi si leggono una volta sola.
    const candidate = setDoveCercare(idSet, indice).flatMap((altro) =>
      carteDi(altro).map((c) => ({ carta: c, idSet: altro })),
    );
    const dati = ritrovaDati(carta, candidate);

    if (!dati) {
      irrisolte += 1;
      console.warn(`  ! ${idSet}/${carta.numero} ${carta.nome}: nessuna omonima completa`);
      continue;
    }
    if (dati.approssimati) approssimate += 1;
    ristampe[`${idSet}/${carta.numero}`] = dati;
    trovate += 1;
  }
}

writeFileSync(
  USCITA,
  JSON.stringify({ generatoIl: new Date().toISOString().slice(0, 10), ristampe }, null, 1) + '\n',
  'utf8',
);

console.log(`Scritto data/ristampe.json — ${trovate} carte completate.`);
if (approssimate) {
  console.log(`  ~ ${approssimate} con PS diversi dall'omonima: attacchi approssimati.`);
}
if (irrisolte) {
  console.log(`  ! ${irrisolte} restano senza dati: nel dataset non esiste un'omonima completa.`);
}
