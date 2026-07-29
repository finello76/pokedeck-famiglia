/**
 * Costruisce `data/nomi.json`: **nome normalizzato → dove sta quella carta**.
 *
 * Perché serve. Per identificare una carta fisica l'app chiedeva numero e
 * *totale* stampati (`118/191`), e filtrava i set che hanno quel totale. È un
 * identificatore debole in due modi:
 *
 * 1. **Il totale non identifica il set.** 165 è sia `151` che Expedition, 101
 *    è cinque set diversi. I candidati arrivano per coincidenza aritmetica.
 * 2. **Le promo il totale non ce l'hanno stampato.** Un Black Star Promo dice
 *    `032` e basta: non esiste nessun numero da digitare nel secondo campo, e
 *    oltre 750 promo italiane presenti nei dati erano di fatto inaccessibili.
 *
 * Il nome invece è scritto a caratteri cubitali sulla carta. Da solo non basta
 * — *Pikachu* compare 63 volte — ma **nome + numero identifica una carta sola
 * nel 97% dei casi**, molto meglio di numero + totale. Nel restante 3% (i
 * Weedle e i Caterpie numero 1) restano i candidati da confrontare a occhio,
 * che è la schermata che già esiste.
 *
 * Perché un indice e non una ricerca a runtime. `cercaPerNome()` in
 * `dataset.js` guarda solo i set **già in memoria**, perché caricarli tutti
 * vuol dire 8,6 MB a ogni ricerca. L'indice costa ~200 KB (~66 KB gzip),
 * si scarica una volta e sta nel guscio del service worker: la ricerca poi
 * apre **solo** i file dei set che compaiono fra i risultati.
 *
 * Strumento di **sviluppo**: si rilancia dopo `scarica-set.mjs`, insieme a
 * `genera-indice-evoluzioni.mjs`. La PWA legge il JSON e non chiama la rete.
 *
 * Uso:
 *     node tools/genera-indice-nomi.mjs
 *
 * @module tools/genera-indice-nomi
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { normalizzaNome } from '../src/engine/nomi.js';

const CARTELLA_SET = 'data/set';
const USCITA = 'data/nomi.json';

/** @type {Map<string, string[]>} nome normalizzato → ['idSet:numero', …] */
const perNome = new Map();

let carte = 0;
let set = 0;

for (const file of readdirSync(CARTELLA_SET).sort()) {
  if (!file.endsWith('.json') || file === 'indice.json') continue;
  const dati = JSON.parse(readFileSync(join(CARTELLA_SET, file), 'utf8'));
  set += 1;

  for (const carta of dati.carte) {
    const chiave = normalizzaNome(carta.nome);
    // Una carta senza nome non è cercabile per nome: saltarla è l'unica cosa
    // onesta, e non è mai successo sui dati reali.
    if (!chiave) continue;
    carte += 1;

    // Si usa `normalizzaNome` di `src/engine/nomi.js`, lo stesso che serve a
    // riconciliare le pre-evoluzioni: toglie accenti, appiattisce i trattini e
    // lo spazio doppio. Così "Sneasel di Hisui" si trova anche scritto storto,
    // e soprattutto **l'app normalizza con la stessa funzione** — se le due
    // normalizzazioni divergessero, l'indice diventerebbe muto senza dirlo.
    if (!perNome.has(chiave)) perNome.set(chiave, []);
    perNome.get(chiave).push(`${dati.id}:${carta.numero}`);
  }
}

// Le posizioni si uniscono in **una stringa** invece che in un array di
// oggetti: `{"pikachu": "sv08:57 base1:58"}` invece di
// `{"pikachu": [{"set":"sv08","numero":"57"}, …]}`. Sono gli stessi dati, ma
// il JSON dimezza — e questo file lo scarica ogni telefono al primo avvio.
const indice = {};
for (const [nome, posizioni] of [...perNome].sort(([a], [b]) => a.localeCompare(b))) {
  indice[nome] = posizioni.join(' ');
}

const testo = `${JSON.stringify(indice)}\n`;
writeFileSync(USCITA, testo);

const univoci = [...perNome.values()].filter((p) => p.length === 1).length;
console.log(`Letti ${set} set, ${carte} carte.`);
console.log(`Scritti ${perNome.size} nomi in ${USCITA} (${(testo.length / 1024).toFixed(1)} KB).`);
console.log(`  ${univoci} nomi appartengono a una carta sola.`);

const affollati = [...perNome].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
console.log(`  i più ristampati: ${affollati.map(([n, p]) => `${n} (${p.length})`).join(', ')}`);
