/**
 * La linea evolutiva di **una carta sola**, guardata da entrambi i lati.
 *
 * `linee.js` costruisce linee per fare mazzi: guarda solo verso il basso, verso
 * i gradini che mancano e vanno stampati. Qui la domanda è un'altra — *questa
 * carta com'è fatta la sua famiglia?* — e la risposta ha bisogno anche del
 * sopra: possedere Machop senza sapere che porta a Machoke e Machamp significa
 * non sapere cosa cercare la prossima volta che si apre una bustina.
 *
 * Il risalire è facile: l'indice delle evoluzioni è già `nome → pre-evoluzione`.
 * Lo scendere no: bisogna **rovesciare** l'indice, e da un solo Pokémon possono
 * uscire molti nomi. Sette da Pikachu (Raichu, Raichu di Alola, Raichu ex,
 * Raichu-GX…), **trentatré da Eevee**.
 *
 * Ma quei numeri contano **carte**, e una linea evolutiva non è fatta di carte:
 * è fatta di **specie**. Rockruff porta a Lycanroc — non a Lycanroc, Lycanroc-ex
 * e Lycanroc GX, che sono la stessa bestia stampata in tre modi. Quindi i nomi
 * di un livello si accorpano (`raggruppaPerSpecie()`) e solo dopo si taglia col
 * tetto: da Eevee restano otto specie, che è esattamente ciò che si vuole
 * vedere.
 *
 * I nomi che escono da questo modulo sono di due provenienze diverse, e chi li
 * mostra deve saperlo: quelli **verso il basso** arrivano dai dati della carta
 * e sono scritti come sulla carta (`Raichu-GX`), quelli **verso l'alto**
 * arrivano dalle chiavi dell'indice e sono normalizzati (`raichu gx`). Sono
 * comunque buoni da cercare — la ricerca per nome normalizza a sua volta — ma
 * vanno rimpiazzati col nome vero della carta trovata prima di stamparli a
 * schermo.
 *
 * Modulo puro: nessun DOM, nessun database, nessuna immagine.
 *
 * @module engine/catena
 */

import { normalizzaNome } from './nomi.js';
import { classifica } from './stadi.js';

/** Quanti gradini può avere una linea: Base → Livello 1 → Livello 2. */
export const MAX_GRADINI = 3;

/** Quanti nomi si mostrano per livello, prima di dire "e altri N". */
const MAX_PER_LIVELLO = 8;

/**
 * @typedef {object} Specie
 * @property {string} nome il nome della specie: il più corto del gruppo
 * @property {string[]} varianti le versioni speciali della stessa specie
 *   (`Lycanroc-ex`, `Lycanroc GX`), che a schermo non si mostrano ma servono a
 *   riconoscere le tue carte
 */

/**
 * @typedef {object} Gradino
 * @property {number} livello 0 il Base, poi 1 e 2
 * @property {Specie[]} specie le specie a quel livello, di norma una sola
 * @property {number} oltre quante specie sono state tagliate dal tetto
 */

/**
 * Risale i nomi delle pre-evoluzioni di una carta, fino al Base.
 *
 * Prima si crede a `evolveDa` della carta, poi all'indice: la stampa che hai in
 * mano è più affidabile di un indice ricostruito, ma il 41% delle stampe tace
 * il collegamento ed è lì che l'indice salva la linea.
 *
 * @param {object} carta
 * @param {Record<string, string>} indice nome normalizzato → pre-evoluzione
 * @param {Set<string>} nonPokemon nomi che non sono Pokémon: i fossili
 * @returns {string[]} nomi dalla cima al Base, cima inclusa
 */
export function catenaVersoIlBasso(carta, indice, nonPokemon) {
  const catena = [carta.nome];
  const visti = new Set([normalizzaNome(carta.nome)]);
  let precedente = carta.evolveDa ?? indice[normalizzaNome(carta.nome)] ?? null;

  // L'indice è un dato esterno: un ciclo (A←B, B←A) manderebbe il loop
  // all'infinito, e nessuna linea vera supera i tre gradini.
  while (precedente && catena.length < MAX_GRADINI) {
    const chiave = normalizzaNome(precedente);
    // Omanyte "evolve" da *Vecchio Helixfossile*, che è una carta Allenatore:
    // la catena finisce qui. Trattarlo da gradino significa stamparlo come
    // Pokémon Base — carte che nel gioco non esistono, ed è successo davvero.
    if (nonPokemon.has(chiave)) break;
    if (visti.has(chiave)) break;
    visti.add(chiave);
    catena.push(precedente);
    precedente = indice[chiave] ?? null;
  }
  return catena;
}

/**
 * Rovescia l'indice: pre-evoluzione normalizzata → nomi che ne discendono.
 *
 * Si ricostruisce a ogni chiamata invece di tenerla in una cache di modulo: la
 * si chiama una volta per finestra aperta, su 1.100 voci sono microsecondi, e
 * una cache renderebbe il modulo dipendente dal fatto che l'indice non cambi —
 * cioè non più puro.
 *
 * @param {Record<string, string>} indice
 * @returns {Map<string, string[]>}
 */
function rovescia(indice) {
  const giu = new Map();
  for (const [evoluzione, preEvoluzione] of Object.entries(indice)) {
    const chiave = normalizzaNome(preEvoluzione);
    if (!giu.has(chiave)) giu.set(chiave, []);
    giu.get(chiave).push(evoluzione);
  }
  return giu;
}

/**
 * Riduce i nomi di un livello alle **specie**, mettendo le versioni da parte.
 *
 * È la differenza fra le due domande che si possono fare a una linea. *Quali
 * carte esistono?* dà, da Rockruff, `Lycanroc`, `Lycanroc-ex`, `Lycanroc GX`.
 * *Com'è fatta la linea?* dà `Lycanroc`, e basta: le altre sono la stessa
 * specie stampata in un modo speciale. La finestra della linea risponde alla
 * seconda, quindi qui le versioni si accorpano.
 *
 * Non c'è nessun elenco di suffissi da mantenere (`ex`, `GX`, `V`, `VMAX`,
 * `δ`, `Dark`, `Mega`, `di Alola`, e i prossimi che inventeranno): la regola è
 * **strutturale**. Ordinati dal più corto, un nome che *contiene* un nome già
 * tenuto — davanti (`Dark Espeon`), dietro (`Espeon ex`) o in mezzo
 * (`Mega Gardevoir ex`) — è una versione di quello. Il nome più corto è sempre
 * la specie.
 *
 * Il confronto è **a confine di parola**: senza, `Nidorina` si mangerebbe
 * `Nidorino`. E avviene solo fra i figli di uno stesso Pokémon, cioè fra nomi
 * che sono già lo stesso gradino della stessa famiglia — due specie sorelle
 * come Gallade e Gardevoir non si somigliano abbastanza da confondersi.
 *
 * @param {string[]} nomi
 * @returns {Specie[]} un elemento per specie, col nome più corto come capofila
 * @example
 * raggruppaPerSpecie(['Espeon ex', 'Espeon', 'Dark Espeon', 'Flareon']);
 * // → [{nome: 'Espeon', varianti: ['Espeon ex', 'Dark Espeon']}, {nome: 'Flareon', varianti: []}]
 */
function raggruppaPerSpecie(nomi) {
  // Dal più corto: la specie deve essere trovata **prima** delle sue versioni,
  // o sarebbe una versione a fare da capofila.
  const ordinati = [...nomi].sort((a, b) => a.length - b.length || a.localeCompare(b));
  /** @type {Specie[]} */
  const specie = [];

  for (const nome of ordinati) {
    const n = normalizzaNome(nome);
    // Gli spazi attorno fanno il confine di parola in un colpo solo: inizio,
    // fine e mezzo.
    const gruppo = specie.find(({ nome: capofila }) =>
      ` ${n} `.includes(` ${normalizzaNome(capofila)} `),
    );
    if (gruppo) gruppo.varianti.push(nome);
    else specie.push({ nome, varianti: [] });
  }
  return specie;
}

/**
 * Ordina le specie di un livello per **quanto meritano di stare a schermo**.
 *
 * Prima quelle che possiedi: se un'evoluzione ce l'hai in scatola, è la prima
 * cosa che vuoi vedere e non deve finire fra le tagliate. Poi i nomi corti, che
 * è la stessa euristica della ricerca per nome in `data/dataset.js`.
 *
 * @param {Specie[]} specie
 * @param {Set<string>} possedute nomi normalizzati che hai in collezione
 * @returns {Specie[]} nuovo array
 */
function ordina(specie, possedute) {
  const tua = ({ nome, varianti }) =>
    Number([nome, ...varianti].some((n) => possedute.has(normalizzaNome(n))));
  return [...specie].sort((a, b) => {
    const mia = tua(b) - tua(a);
    if (mia) return mia;
    return a.nome.length - b.nome.length || a.nome.localeCompare(b.nome);
  });
}

/**
 * La linea evolutiva completa attorno a una carta.
 *
 * @param {object} carta la carta da cui si parte
 * @param {Record<string, string>} [indice] nome normalizzato → pre-evoluzione
 * @param {Set<string>} [nonPokemon] pre-evoluzioni che sono carte Allenatore
 * @param {object} [opzioni]
 * @param {number} [opzioni.maxPerLivello=8] tetto ai nomi per livello
 * @param {Set<string>} [opzioni.possedute] nomi normalizzati in collezione:
 *   le carte tue non vengono mai tagliate dal tetto
 * @param {Record<string, number>} [opzioni.stadi] stadio noto di ogni specie
 *   (0 Base, 1, 2). Dove c'è, comanda lui: l'indice sbaglia (vedi `alGradinoGiusto`)
 * @returns {{gradini: Gradino[], livelloCarta: number}} `livelloCarta` è la
 *   riga in cui sta la carta di partenza, per poterla evidenziare
 * @example
 * catenaEvolutiva(machoke, { machoke: 'Machop', machamp: 'Machoke' });
 * // → gradini con specie [['Machop'], ['Machoke'], ['machamp']], livelloCarta 1
 */
export function catenaEvolutiva(carta, indice = {}, nonPokemon = new Set(), opzioni = {}) {
  const { maxPerLivello = MAX_PER_LIVELLO, possedute = new Set(), stadi = {} } = opzioni;
  if (!carta?.nome) return { gradini: [], livelloCarta: 0 };

  // Verso il basso la catena è unica: ogni Pokémon ha una sola pre-evoluzione.
  const dalBasso = [...catenaVersoIlBasso(carta, indice, nonPokemon)].reverse();
  const gradini = dalBasso.map((nome, livello) => ({
    livello,
    specie: [{ nome, varianti: [] }],
    oltre: 0,
  }));
  const livelloCarta = gradini.length - 1;

  // Verso l'alto si dirama. `visti` evita che un dato storto (A→B, B→A) faccia
  // ricomparire più in su un nome già mostrato più in giù.
  const giu = rovescia(indice);
  const visti = new Set(dalBasso.map(normalizzaNome));
  let sopra = [carta.nome];

  // A che stadio del gioco corrisponde il gradino più basso della catena. Serve
  // a confrontare i gradini (che sono posizioni in un array) con gli stadi
  // (che sono un dato della carta). `null` dove lo stadio della carta di
  // partenza non si conosce: senza quel punto fermo non si confronta niente.
  const livelloCartaVero = classifica(carta).livello;
  const livelloDelPrimo = livelloCartaVero === null ? null : livelloCartaVero - livelloCarta;

  // Nomi arrivati troppo presto: `Dark Crobat` esce fra i figli di Zubat, ma è
  // un Livello 2 e il suo posto è due gradini più su. Si mettono da parte e si
  // riprendono quando tocca a loro, invece di buttarli — se possiedi proprio
  // quella carta, il gradino giusto deve dire "ce l'hai".
  /** @type {Array<{nome: string, livello: number}>} */
  const rimandati = [];

  while (gradini.length < MAX_GRADINI) {
    const atteso = livelloDelPrimo === null ? null : livelloDelPrimo + gradini.length;
    const nomi = [];

    for (const nome of sopra) {
      for (const figlio of giu.get(normalizzaNome(nome)) ?? []) {
        const chiave = normalizzaNome(figlio);
        if (visti.has(chiave)) continue;
        visti.add(chiave);

        const suo = stadi[chiave];
        if (atteso !== null && Number.isInteger(suo) && suo !== atteso) {
          // Più in su: lo si aspetta. Più in giù (un Base fra le evoluzioni di
          // un Base) è un dato senza rimedio, e si scarta.
          if (suo > atteso) rimandati.push({ nome: figlio, livello: suo });
          continue;
        }
        nomi.push(figlio);
      }
    }

    // Chi era stato messo da parte per questo gradino torna adesso.
    for (let i = rimandati.length - 1; i >= 0; i -= 1) {
      if (rimandati[i].livello === atteso) nomi.push(...rimandati.splice(i, 1).map((r) => r.nome));
    }

    if (!nomi.length) break;

    // Prima si accorpano le versioni, poi si taglia: il tetto va speso in
    // specie diverse. Da Eevee i nomi sono trentatré e le specie otto — con
    // l'ordine inverso, otto caselle piene di Espeon.
    const tutte = raggruppaPerSpecie(nomi);
    const mostrate = ordina(tutte, possedute).slice(0, maxPerLivello);
    gradini.push({
      livello: gradini.length,
      specie: mostrate,
      oltre: tutte.length - mostrate.length,
    });
    // Il livello dopo si calcola solo da ciò che si mostra: cercare le
    // evoluzioni di specie tagliate vorrebbe dire riempire l'ultima riga di
    // carte figlie di una riga che l'utente non sta vedendo. Le varianti sì:
    // Lycanroc VMAX evolve da Lycanroc-V, non da "Lycanroc".
    sopra = mostrate.flatMap(({ nome, varianti }) => [nome, ...varianti]);
  }

  return { gradini, livelloCarta };
}
