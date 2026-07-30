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
 * uscire molte evoluzioni. Sette da Pikachu (Raichu, Raichu di Alola, Raichu
 * ex, Raichu-GX…), **trentatré da Eevee**: da qui il tetto per livello, che non
 * è un dettaglio di stile ma la differenza fra una schermata leggibile e un
 * muro di trentatré miniature.
 *
 * I nomi che escono da questo modulo sono di due specie diverse, e chi li
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

/** Quanti gradini può avere una linea: Base → Livello 1 → Livello 2. */
export const MAX_GRADINI = 3;

/** Quanti nomi si mostrano per livello, prima di dire "e altri N". */
const MAX_PER_LIVELLO = 8;

/**
 * @typedef {object} Gradino
 * @property {number} livello 0 il Base, poi 1 e 2
 * @property {string[]} nomi le specie a quel livello, di norma una sola
 * @property {number} oltre quanti nomi sono stati tagliati dal tetto
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
 * Ordina i nomi di un livello per **quanto meritano di stare a schermo**.
 *
 * Prima quelli che possiedi: se una delle evoluzioni ce l'hai in scatola, è la
 * prima cosa che vuoi vedere e non deve finire fra i tagliati. Poi i nomi
 * corti, che sono le forme normali: da Eevee discendono trentatré nomi, e
 * lasciandoli in ordine d'indice le prime otto caselle se le prendono le
 * varianti (*Dark Espeon*, *Espeon ex*, *Espeon δ*) mentre Flareon, Jolteon e
 * Vaporeon restano fuori. È la stessa regola che usa la ricerca per nome in
 * `data/dataset.js`, per lo stesso motivo.
 *
 * @param {string[]} nomi
 * @param {Set<string>} possedute nomi normalizzati che hai in collezione
 * @returns {string[]} nuovo array
 */
function ordina(nomi, possedute) {
  return [...nomi].sort((a, b) => {
    const mia = Number(possedute.has(normalizzaNome(b))) - Number(possedute.has(normalizzaNome(a)));
    if (mia) return mia;
    return a.length - b.length || a.localeCompare(b);
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
 * @returns {{gradini: Gradino[], livelloCarta: number}} `livelloCarta` è la
 *   riga in cui sta la carta di partenza, per poterla evidenziare
 * @example
 * catenaEvolutiva(machoke, { machoke: 'Machop', machamp: 'Machoke' });
 * // → gradini [['Machop'], ['Machoke'], ['machamp']], livelloCarta 1
 */
export function catenaEvolutiva(carta, indice = {}, nonPokemon = new Set(), opzioni = {}) {
  const { maxPerLivello = MAX_PER_LIVELLO, possedute = new Set() } = opzioni;
  if (!carta?.nome) return { gradini: [], livelloCarta: 0 };

  // Verso il basso la catena è unica: ogni Pokémon ha una sola pre-evoluzione.
  const dalBasso = [...catenaVersoIlBasso(carta, indice, nonPokemon)].reverse();
  const gradini = dalBasso.map((nome, livello) => ({ livello, nomi: [nome], oltre: 0 }));
  const livelloCarta = gradini.length - 1;

  // Verso l'alto si dirama. `visti` evita che un dato storto (A→B, B→A) faccia
  // ricomparire più in su un nome già mostrato più in giù.
  const giu = rovescia(indice);
  const visti = new Set(dalBasso.map(normalizzaNome));
  let sopra = [carta.nome];

  while (gradini.length < MAX_GRADINI) {
    const nomi = [];
    for (const nome of sopra) {
      for (const figlio of giu.get(normalizzaNome(nome)) ?? []) {
        const chiave = normalizzaNome(figlio);
        if (visti.has(chiave)) continue;
        visti.add(chiave);
        nomi.push(figlio);
      }
    }
    if (!nomi.length) break;

    const mostrati = ordina(nomi, possedute).slice(0, maxPerLivello);
    gradini.push({
      livello: gradini.length,
      nomi: mostrati,
      oltre: nomi.length - mostrati.length,
    });
    // Il livello dopo si calcola solo da ciò che si mostra: cercare le
    // evoluzioni di nomi tagliati vorrebbe dire riempire l'ultima riga di
    // carte figlie di una riga che l'utente non sta vedendo.
    sopra = mostrati;
  }

  return { gradini, livelloCarta };
}
