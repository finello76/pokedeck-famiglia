/**
 * Costruisce `data/dex.json`: **nome normalizzato → numero del Pokédex**.
 *
 * Serve a ordinare il catalogo "come il Pokédex": Bulbasaur 1, Pikachu 25,
 * Mewtwo 150 — l'ordine con cui chi colleziona sfoglia un raccoglitore, e
 * l'unico che mette vicine tutte le stampe della stessa specie anche quando
 * vengono da set lontani vent'anni.
 *
 * ## Perché non sta già nei file dei set
 *
 * TCGdex il `dexId` ce l'ha, ma **solo nella scheda della singola carta**:
 * prenderlo di là vorrebbe dire 21.264 richieste, un'ora buona, come
 * `arricchisci-carte.mjs`. Si gira la domanda al contrario e diventa una
 * richiesta per **numero del Pokédex**: `?dexId=eq:25` restituisce tutte le
 * carte di Pikachu, col nome già nella lingua che si chiede. Duemila richieste
 * (mille per lingua, vedi `LINGUE`) invece di ventunomila, e lo stesso dato.
 *
 * ## Perché la chiave è il nome e non `idSet:numero`
 *
 * Un indice per carta sarebbe 21.264 voci; per nome sono poche migliaia, e il
 * dato è lo stesso: *Pikachu* è il numero 25 in tutte le sue 63 stampe. Il file
 * si dimezza e vive nel guscio del service worker, dove ogni chilobyte è un
 * chilobyte scaricato da tutti al primo avvio.
 *
 * Le carte con due specie sopra (*Celebi e Venusaur GX*) compaiono sotto
 * entrambi i numeri: si tiene **il più basso**, cioè il primo che arriva
 * scorrendo il Pokédex in ordine. Non è una scelta profonda — serve solo che
 * quella carta abbia un posto stabile nell'elenco.
 *
 * Allenatori ed Energie non hanno numero e non entrano nell'indice: ordinando
 * per Pokédex finiscono in fondo, che è dove ci si aspetta di trovarli.
 *
 * Strumento di **sviluppo**: si rilancia dopo `scarica-set.mjs`, come gli altri
 * indici. La PWA legge il JSON e non chiama mai la rete.
 *
 * Uso:
 *     node tools/genera-indice-dex.mjs
 *
 * @module tools/genera-indice-dex
 */

import { writeFileSync } from 'node:fs';

import { normalizzaNome } from '../src/engine/nomi.js';

const BASE = 'https://api.tcgdex.net/v2';
const USCITA = 'data/dex.json';

/**
 * Le lingue da interrogare, in quest'ordine.
 *
 * L'italiano non basta: 79 dei nostri set hanno i dati **in inglese**, perché in
 * italiano TCGdex non ne ha nemmeno una carta (vedi CLAUDE.md), e i loro nomi
 * — *Alolan Meowth*, *Burmy Sandy Cloak* — in un indice italiano non compaiono.
 * Con la sola passata italiana restavano senza numero 748 carte su 18.005, e
 * **tutte** in quei set: ordinando per Pokédex sarebbero finite in fondo tutte
 * insieme, che è esattamente il posto sbagliato.
 *
 * Il nome della specie non cambia significato fra le due lingue, quindi le due
 * mappe si sommano senza rischio: *Pikachu* è 25 in entrambe.
 */
const LINGUE = ['it', 'en'];

/** Quante richieste insieme. Sei è gentile e finisce in un paio di minuti. */
const INSIEME = 6;

/** Tetto per pagina: la specie più stampata (Pikachu) sta abbondantemente sotto. */
const PER_PAGINA = 500;

/**
 * Le carte di una specie, con una richiesta sola.
 *
 * `eq:` non è decorativo: senza, l'API **ignora il filtro in silenzio** e
 * restituisce la prima pagina di tutte le carte — cioè un indice che sembra
 * pieno e associa Pikachu a Celebi.
 *
 * @param {string} lingua `'it'` o `'en'`
 * @param {number} dex
 * @returns {Promise<Array<{name: string}>>}
 */
async function carteDi(lingua, dex) {
  const url = `${BASE}/${lingua}/cards?dexId=eq:${dex}&pagination:itemsPerPage=${PER_PAGINA}`;
  const risposta = await fetch(url);
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status} su dex ${dex}`);
  return risposta.json();
}

const elenco = await (await fetch(`${BASE}/it/dex-ids`)).json();
const numeri = elenco.filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
console.log(`Il Pokédex ha ${numeri.length} numeri. Chiedo le carte di ciascuno…`);

/** @type {Map<string, number>} nome normalizzato → numero, il più basso vince */
const perNome = new Map();
let carte = 0;

for (const lingua of LINGUE) {
  const prima = perNome.size;

  for (let i = 0; i < numeri.length; i += INSIEME) {
    const gruppo = numeri.slice(i, i + INSIEME);
    const risposte = await Promise.all(
      gruppo.map(async (dex) => {
        try {
          return { dex, carte: await carteDi(lingua, dex) };
        } catch (errore) {
          console.warn(`  ${lingua} dex ${dex}: ${errore.message}`);
          return { dex, carte: [] };
        }
      }),
    );

    for (const { dex, carte: trovate } of risposte) {
      for (const carta of trovate) {
        const chiave = normalizzaNome(carta.name ?? '');
        if (!chiave) continue;
        carte += 1;
        // Il primo che arriva vince, e i numeri si scorrono in ordine: per una
        // carta a due specie resta il numero più basso.
        if (!perNome.has(chiave)) perNome.set(chiave, dex);
      }
    }

    if ((i / INSIEME) % 20 === 0) {
      process.stdout.write(`  ${lingua}: ${Math.min(i + INSIEME, numeri.length)}/${numeri.length}\r`);
    }
  }

  console.log(`\n  ${lingua}: ${perNome.size - prima} nomi nuovi.`);
}

const indice = {};
for (const [nome, dex] of [...perNome].sort(([a], [b]) => a.localeCompare(b))) {
  indice[nome] = dex;
}

const testo = `${JSON.stringify(indice)}\n`;
writeFileSync(USCITA, testo);

console.log(`Lette ${carte} carte in ${LINGUE.join(", ")}.`);
console.log(`Scritti ${perNome.size} nomi in ${USCITA} (${(testo.length / 1024).toFixed(1)} KB).`);
