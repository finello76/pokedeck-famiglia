/**
 * Aggiunge alle carte già scaricate i dati che servono a **giocare**.
 *
 * `scarica-set.mjs` tiene i campi che servono a *catalogare* e a *costruire
 * mazzi*: PS, tipi, costo e danno degli attacchi, ritirata. Per simulare una
 * partita ne mancano quattro, che nell'API ci sono ma non erano mai stati
 * chiesti:
 *
 * - **`debolezza`** e **`resistenza`**: senza, un attacco Fuoco su un Erba fa
 *   lo stesso danno di un attacco qualsiasi, e la scelta del tipo — che è la
 *   prima strategia che un bambino impara — non conta niente;
 * - **`effetto` degli attacchi**: è lì che vivono veleno, paralisi, sonno e
 *   confusione. Il testo è italiano libero, ma gli stati speciali sono un
 *   insieme **chiuso** di parole sempre uguali, quindi si riconoscono;
 * - **`effetto` degli Allenatori** (*"Pesca tre carte."*) e **`tipoAllenatore`**
 *   (Aiuto, Strumento, Base, Stadio), che decide anche quante se ne giocano per
 *   turno: un solo Aiuto.
 *
 * Perché uno strumento a parte invece di rifare `scarica-set.mjs --forza`:
 * quello **riscrive** i file da capo e ributterebbe via le correzioni che ci
 * sono sopra (le ristampe completate, le scansioni recuperate). Questo invece
 * aggiunge campi e basta, ed è **riprendibile**: una carta che ha già i dati
 * nuovi non si richiede, quindi se la connessione cade si rilancia e riparte da
 * dove era.
 *
 * Costa una richiesta per carta — sono 21.264 — perché l'elenco di un set dà
 * solo le carte in forma breve. Circa dieci minuti.
 *
 * Uso:
 *     node tools/arricchisci-carte.mjs            # tutti i set che ne hanno bisogno
 *     node tools/arricchisci-carte.mjs sv09 A1    # solo questi
 *
 * Dopo: alzare `VERSIONE_DATI` in `sw.js`, o i dati nuovi non arrivano a chi
 * quei set li aveva già aperti.
 *
 * @module tools/arricchisci-carte
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CARTELLA_SET = 'data/set';
const API = 'https://api.tcgdex.net/v2/it/cards';
const API_RIPIEGO = 'https://api.tcgdex.net/v2/en/cards';

/** Quante carte chiedere insieme. Un po' piu' di scarica-set.mjs (8): qui le carte sono 21.264 e la differenza fra 8 e 12 sono venti minuti. Oltre, l'API comincia a rifiutare. */
const PARALLELE = 12;

/**
 * I valori che il motore usa come **chiavi** vanno tradotti, o una carta
 * inglese sparisce dai confronti. Stessa scelta (e stesse tabelle) di
 * `scarica-set.mjs`: i set marcati `lingua: 'en'` hanno i dati in inglese, ma
 * tipi e categorie restano in italiano perché sono identificatori, non prosa.
 */
const TIPO = {
  Colorless: 'Incolore',
  Darkness: 'Oscurità',
  Dragon: 'Drago',
  Fairy: 'Folletto',
  Fighting: 'Lotta',
  Fire: 'Fuoco',
  Grass: 'Erba',
  Lightning: 'Lampo',
  Metal: 'Metallo',
  Psychic: 'Psico',
  Water: 'Acqua',
};

/** I quattro tipi di carta Allenatore, che decidono come si gioca la carta. */
const TIPO_ALLENATORE = {
  Supporter: 'Aiuto',
  Item: 'Strumento',
  Stadium: 'Stadio',
  Tool: 'Strumento Pokémon',
};

/**
 * @param {string} url
 * @param {number} [tentativi=3]
 * @returns {Promise<any|null>} `null` se la carta non esiste in quella lingua
 */
async function prendiJson(url, tentativi = 3) {
  for (let i = 1; i <= tentativi; i += 1) {
    try {
      const risposta = await fetch(url);
      if (risposta.status === 404) return null;
      if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
      return await risposta.json();
    } catch (errore) {
      if (i === tentativi) throw new Error(`${url}: ${errore.message}`);
      await new Promise((r) => setTimeout(r, 400 * i));
    }
  }
  return null;
}

/**
 * Esegue `lavoro` su ogni elemento con un tetto di esecuzioni contemporanee.
 * @template T, R
 * @param {T[]} elementi
 * @param {number} limite
 * @param {(elemento: T) => Promise<R>} lavoro
 * @returns {Promise<R[]>}
 */
async function inParallelo(elementi, limite, lavoro) {
  const risultati = new Array(elementi.length);
  let prossimo = 0;
  const operai = Array.from({ length: Math.min(limite, elementi.length) }, async () => {
    while (prossimo < elementi.length) {
      const mio = prossimo++;
      risultati[mio] = await lavoro(elementi[mio]);
    }
  });
  await Promise.all(operai);
  return risultati;
}

/**
 * Se di questa carta sappiamo già tutto quello che serve a giocare.
 *
 * `arricchita` è un campo nostro, non dell'API: senza, una carta che davvero
 * non ha debolezza (le Energie, gli Allenatori) verrebbe richiesta a ogni giro
 * per sempre, e lo strumento non sarebbe mai finito.
 *
 * @param {object} carta
 * @returns {boolean}
 */
function giaFatta(carta) {
  return carta.arricchita === true;
}

/**
 * I campi nuovi presi dalla scheda completa.
 *
 * Si scrivono solo se ci sono: una carta senza debolezza non deve portarsi
 * dietro `debolezza: null`, che nei 189 file diventano megabyte di niente.
 *
 * @param {object} scheda la carta come la dà l'API
 * @param {object} carta la carta come sta nel nostro file
 * @returns {object} la carta arricchita
 */
function arricchisci(scheda, carta) {
  const nuova = { ...carta, arricchita: true };

  const debolezza = scheda.weaknesses?.[0];
  if (debolezza?.type) {
    nuova.debolezza = { tipo: TIPO[debolezza.type] ?? debolezza.type, valore: debolezza.value ?? '×2' };
  }

  const resistenza = scheda.resistances?.[0];
  if (resistenza?.type) {
    nuova.resistenza = {
      tipo: TIPO[resistenza.type] ?? resistenza.type,
      valore: resistenza.value ?? '-30',
    };
  }

  // Il testo dell'attacco: è lì che stanno gli stati speciali e le monete.
  if (Array.isArray(nuova.attacchi) && Array.isArray(scheda.attacks)) {
    nuova.attacchi = nuova.attacchi.map((attacco, i) => {
      const effetto = scheda.attacks[i]?.effect;
      return effetto ? { ...attacco, effetto } : attacco;
    });
  }

  if (scheda.effect) nuova.effetto = scheda.effect;
  if (scheda.trainerType) {
    nuova.tipoAllenatore = TIPO_ALLENATORE[scheda.trainerType] ?? scheda.trainerType;
  }

  return nuova;
}

const chiesti = process.argv.slice(2);
const file = readdirSync(CARTELLA_SET)
  .filter((f) => f.endsWith('.json') && f !== 'indice.json')
  .filter((f) => !chiesti.length || chiesti.includes(f.replace('.json', '')))
  .sort();

const indice = JSON.parse(readFileSync(join(CARTELLA_SET, 'indice.json'), 'utf8'));
const lingue = new Map(indice.set.map((s) => [s.id, s.lingua ?? 'it']));

let carteFatte = 0;
let carteSaltate = 0;
let setFatti = 0;

for (const nomeFile of file) {
  const idSet = nomeFile.replace('.json', '');
  const percorso = join(CARTELLA_SET, nomeFile);
  const set = JSON.parse(readFileSync(percorso, 'utf8'));
  const daFare = set.carte.filter((c) => !giaFatta(c));
  if (!daFare.length) {
    carteSaltate += set.carte.length;
    continue;
  }

  // La lingua del set decide l'endpoint: chiedere in italiano una carta che in
  // italiano non esiste torna 404, e la carta resterebbe senza dati nuovi.
  const base = lingue.get(idSet) === 'en' ? API_RIPIEGO : API;

  const arricchite = await inParallelo(daFare, PARALLELE, async (carta) => {
    const scheda = await prendiJson(`${base}/${idSet}-${carta.numero}`).catch(() => null);
    // Carta che l'API non conosce (numerazioni strane delle promo): si marca
    // comunque fatta, o la si richiederebbe per sempre a ogni rilancio.
    return scheda ? arricchisci(scheda, carta) : { ...carta, arricchita: true };
  });

  const perNumero = new Map(arricchite.map((c) => [String(c.numero), c]));
  set.carte = set.carte.map((c) => perNumero.get(String(c.numero)) ?? c);
  writeFileSync(percorso, `${JSON.stringify(set)}\n`);

  carteFatte += daFare.length;
  setFatti += 1;
  const conDebolezza = set.carte.filter((c) => c.debolezza).length;
  console.log(
    `${idSet.padEnd(12)} ${String(daFare.length).padStart(4)} carte  ` +
      `(debolezza: ${conDebolezza}, effetti: ${set.carte.filter((c) => c.effetto || c.attacchi?.some((a) => a.effetto)).length})`,
  );
}

console.log(`\n${carteFatte} carte arricchite in ${setFatti} set. ${carteSaltate} erano già a posto.`);
console.log('Ricordarsi di alzare VERSIONE_DATI in sw.js.');
