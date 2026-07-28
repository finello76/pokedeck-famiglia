/**
 * Scrive `data/legalita.json`: cosa serve per sapere se una carta è giocabile a
 * un torneo.
 *
 * Due dati, per due motivi diversi.
 *
 * **Il marchio di regolamentazione** (`marchi`). Se una carta sia valida in
 * Standard non è scritto sulla carta a parole, ma in una letterina dentro un
 * quadratino in basso a sinistra. Ogni aprile la rotazione ne toglie uno, e le
 * carte con quel marchio smettono di essere legali senza che nulla cambi nella
 * carta. Il marchio è quindi il dato **immutabile** da salvare; quali marchi
 * siano legali oggi è una regola che cambia, e sta in `src/data/legalita.js`.
 *
 * **L'ammissibilità in Expanded** (`espansi`). Questa invece non si deduce da
 * niente di stampato. Non basta "dal Nero e Bianco in poi": in ogni set c'è
 * qualche carta **bandita** (Lysandre Ultima Risorsa, Foresta di Piante Giganti
 * e compagnia), e restano fuori set interi che pure sono recenti — Pokémon TCG
 * Pocket, le promo McDonald's, i Kit Allenatore. È un elenco arbitrario deciso
 * a tavolino: l'unico modo di averlo giusto è chiederlo.
 *
 * Perché costa 8 richieste e non 21.000. TCGdex filtra l'elenco delle carte per
 * campo: `/cards?regulationMark=H` restituisce in **una** risposta gli id di
 * tutte le carte con quel marchio, e `?legal.expanded=true` fa lo stesso per
 * l'Expanded. Sette marchi più l'Expanded: otto richieste per l'intero
 * catalogo. Non si scarica invece `legal.standard`, che è la stessa cosa già
 * scaduta — dice com'è oggi, e andrebbe riscaricata a ogni rotazione.
 *
 * Il file è compatto (~14 KB) perché quasi ogni set è omogeneo: si scrive il
 * valore dominante, e solo le eccezioni carta per carta.
 *
 *     "marchi":  { "sv09": "I", "sv08": { "_": "H", "252": "G" } }
 *     "espansi": { "sv08": true, "xy1": { "_": true, "133": false }, "mc1": false }
 *
 * Strumento di **sviluppo**: va rieseguito quando escono set nuovi (dopo
 * `scarica-set.mjs`) e quando cambia la lista dei banditi. La PWA legge il JSON
 * prodotto e non chiama mai la rete.
 *
 * Uso:
 *     node tools/aggiorna-legalita.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';

const API = 'https://api.tcgdex.net/v2/it';
const INDICE = 'data/set/indice.json';
const USCITA = 'data/legalita.json';

/**
 * I marchi esistiti finora. Quando ne esce uno nuovo va aggiunto qui: una
 * lettera in più costa una richiesta, una lettera dimenticata rende "fuori
 * formato" un set intero appena uscito.
 */
const MARCHI = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

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

/**
 * Spezza un id TCGdex in set e numero.
 *
 * Si taglia sull'**ultimo** trattino, non sul primo: i Kit Allenatore hanno id
 * di set che contengono trattini (`tk-xy-latio-8` è la carta 8 del set
 * `tk-xy-latio`).
 *
 * @param {string} id
 * @returns {[string, string]}
 */
function spezza(id) {
  const taglio = id.lastIndexOf('-');
  return [id.slice(0, taglio), id.slice(taglio + 1)];
}

/**
 * Comprime una mappa numero→valore nel valore dominante più le eccezioni.
 *
 * @template T
 * @param {Map<string, T>} carte
 * @returns {T|Record<string, T|any>} il valore solo, se il set è omogeneo
 */
function comprimi(carte) {
  const conteggi = new Map();
  for (const v of carte.values()) conteggi.set(v, (conteggi.get(v) ?? 0) + 1);
  const [dominante] = [...conteggi].sort((a, b) => b[1] - a[1])[0];

  const deroghe = [...carte].filter(([, v]) => v !== dominante);
  // `_` è il valore di tutti gli altri. Non può collidere con un numero di
  // collezione: quelli sono cifre, o sigle tipo `TG01`, `SV01`, `GG12`.
  return deroghe.length ? { _: dominante, ...Object.fromEntries(deroghe) } : dominante;
}

// ─── Le carte che abbiamo davvero, set per set ──────────────────────────────
//
// Si parte dai file locali e non dall'API: interessa la legalità delle carte
// che l'app può mostrare, e per dire "questo set è tutto Expanded" bisogna
// sapere quante carte contiene. I file ci sono già, leggerli non costa niente.

const indice = JSON.parse(readFileSync(INDICE, 'utf8'));
/** @type {Map<string, string[]>} idSet → numeri di collezione */
const nostreCarte = new Map();

for (const info of indice.set) {
  try {
    const set = JSON.parse(readFileSync(`data/set/${info.id}.json`, 'utf8'));
    nostreCarte.set(
      info.id,
      (set.carte ?? []).map((c) => String(c.numero)),
    );
  } catch {
    console.log(`  ${info.id}: file mancante, salto`);
  }
}
console.log(`${nostreCarte.size} set letti da data/set/.`);

// ─── I marchi ───────────────────────────────────────────────────────────────

/** @type {Map<string, Map<string, string>>} idSet → (numero → marchio) */
const marchiPerSet = new Map();

for (const marchio of MARCHI) {
  const carte = await leggi(`${API}/cards?regulationMark=${marchio}`);
  console.log(`  marchio ${marchio}: ${carte.length} carte`);
  for (const carta of carte) {
    const [set, coda] = spezza(carta.id);
    if (!nostreCarte.has(set)) continue;
    // `localId` è il numero come stampato sulla carta, cioè la chiave con cui
    // la cerca l'app; l'id lo normalizza e i due possono differire.
    const numero = String(carta.localId ?? coda);
    if (!marchiPerSet.has(set)) marchiPerSet.set(set, new Map());
    marchiPerSet.get(set).set(numero, marchio);
  }
}

/** @type {Record<string, any>} */
const marchi = {};
for (const [set, carte] of [...marchiPerSet].sort(([a], [b]) => a.localeCompare(b))) {
  marchi[set] = comprimi(carte);
}

// ─── L'Expanded ─────────────────────────────────────────────────────────────

const legaliExpanded = new Set(
  (await leggi(`${API}/cards?legal.expanded=true`)).map((c) => {
    const [set, coda] = spezza(c.id);
    return `${set}/${String(c.localId ?? coda)}`;
  }),
);
console.log(`  Expanded: ${legaliExpanded.size} carte legali in tutto il catalogo`);

/** @type {Record<string, any>} */
const espansi = {};
let banditi = 0;

for (const [set, numeri] of [...nostreCarte].sort(([a], [b]) => a.localeCompare(b))) {
  if (!numeri.length) continue;
  const stato = new Map(numeri.map((n) => [n, legaliExpanded.has(`${set}/${n}`)]));
  const compresso = comprimi(stato);
  // Un set fuori dall'Expanded con dentro qualche Energia base legale non è
  // un'eccezione da elencare: le Energie base sono sempre legali comunque
  // (vedi `src/data/legalita.js`), quindi si tiene solo il "no" del set.
  espansi[set] = compresso;
  if (typeof compresso === 'object' && compresso._ === true) {
    banditi += Object.keys(compresso).length - 1;
  }
}

// ─── Scrittura ──────────────────────────────────────────────────────────────

const contenuto = {
  generato: new Date().toISOString().slice(0, 10),
  marchi,
  espansi,
};
writeFileSync(USCITA, `${JSON.stringify(contenuto, null, 0)}\n`);

const setMisti = Object.values(marchi).filter((v) => typeof v !== 'string').length;
console.log(`\nScritto ${USCITA}.`);
console.log(`  ${Object.keys(marchi).length} set con marchio (${setMisti} a marchi misti)`);
console.log(`  ${Object.keys(espansi).length} set classificati per l'Expanded`);
console.log(`  ${banditi} carte bandite dentro set per il resto legali`);
