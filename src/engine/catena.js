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
 * @property {number} livello la riga: 0 la più bassa mostrata, poi 1 e 2
 * @property {number} stadio lo stadio di gioco della specie (0 Base, 1, 2).
 *   **Non coincide con `livello`**: la linea di Omanyte comincia da un Livello
 *   1, quella di Pichu ha due Base di fila. È questo che va etichettato
 * @property {Specie[]} specie le specie a quel livello, di norma una sola
 * @property {number} oltre quante specie sono state tagliate dal tetto
 */

/**
 * Lo stadio di gioco di una specie, col conteggio delle righe come ripiego.
 *
 * @param {string} nome
 * @param {Record<string, number>} stadi
 * @param {number} ripiego
 * @returns {number}
 */
function stadioDi(nome, stadi, ripiego) {
  const suo = stadi[normalizzaNome(nome)];
  return Number.isInteger(suo) ? suo : Math.max(0, ripiego);
}

/**
 * Risale le pre-evoluzioni di una carta, dicendo anche **dove si è fermata**.
 *
 * Prima si crede a `evolveDa` della carta, poi all'indice: la stampa che hai in
 * mano è più affidabile di un indice ricostruito, ma il 41% delle stampe tace
 * il collegamento ed è lì che l'indice salva la linea.
 *
 * @param {object} carta
 * @param {Record<string, string>} indice nome normalizzato → pre-evoluzione
 * @param {Set<string>} nonPokemon nomi che non sono Pokémon: i fossili
 * @returns {{catena: string[], origine: string|null}} `catena` dalla cima al
 *   Base, cima inclusa; `origine` è la carta Allenatore su cui la linea poggia,
 *   quando ce n'è una
 */
function scendi(carta, indice, nonPokemon) {
  const catena = [carta.nome];
  const visti = new Set([normalizzaNome(carta.nome)]);
  let precedente = carta.evolveDa ?? indice[normalizzaNome(carta.nome)] ?? null;
  let origine = null;

  // L'indice è un dato esterno: un ciclo (A←B, B←A) manderebbe il loop
  // all'infinito, e nessuna linea vera supera i tre gradini.
  while (precedente && catena.length < MAX_GRADINI) {
    const chiave = normalizzaNome(precedente);
    // Omanyte "evolve" da *Vecchio Helixfossile*, che è una carta Allenatore:
    // la catena finisce qui. Trattarlo da gradino significa stamparlo come
    // Pokémon Base — carte che nel gioco non esistono, ed è successo davvero.
    //
    // Fermarsi però non basta: buttato via il nome, la linea sembra un Livello
    // 1 senza Base, cioè rotta. Il fossile si tiene da parte e chi la mostra
    // può dire *da cosa* si parte davvero.
    if (nonPokemon.has(chiave)) {
      origine = precedente;
      break;
    }
    if (visti.has(chiave)) break;
    visti.add(chiave);
    catena.push(precedente);
    precedente = indice[chiave] ?? null;
  }
  return { catena, origine };
}

/**
 * I soli nomi della catena verso il basso.
 *
 * @param {object} carta
 * @param {Record<string, string>} indice nome normalizzato → pre-evoluzione
 * @param {Set<string>} nonPokemon nomi che non sono Pokémon: i fossili
 * @returns {string[]} nomi dalla cima al Base, cima inclusa
 */
export function catenaVersoIlBasso(carta, indice, nonPokemon) {
  return scendi(carta, indice, nonPokemon).catena;
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
 * @param {Set<string>} [opzioni.esotici] specie che non occupano un gradino:
 *   TURBO, VMAX, MEGA, V ASTRO, V UNIONE. Restano fuori dalla piramide
 * @returns {{gradini: Gradino[], livelloCarta: number, stadioDelPrimo: number,
 *   origine: string|null}} `livelloCarta` è la riga in cui sta la carta di
 *   partenza, per poterla evidenziare; `stadioDelPrimo` è lo stadio di gioco
 *   della riga più bassa (0 Base, 1, 2), che **non** è sempre 0; `origine` è la
 *   carta Allenatore da cui la linea parte, quando c'è
 * @example
 * catenaEvolutiva(machoke, { machoke: 'Machop', machamp: 'Machoke' });
 * // → gradini con specie [['Machop'], ['Machoke'], ['machamp']], livelloCarta 1
 */
export function catenaEvolutiva(carta, indice = {}, nonPokemon = new Set(), opzioni = {}) {
  const {
    maxPerLivello = MAX_PER_LIVELLO,
    possedute = new Set(),
    stadi = {},
    esotici = new Set(),
  } = opzioni;
  if (!carta?.nome) return { gradini: [], livelloCarta: 0, stadioDelPrimo: 0, origine: null };

  // Aprire la linea **su** una carta TURBO non deve creare il gradino che il
  // resto del modulo si preoccupa di non creare: `Omastar TURBO` si posa sopra
  // Omastar, quindi la linea è quella di Omastar e la carta aperta è una sua
  // variante. Si riparte dal Pokémon sotto, che è anche l'unico modo di vedere
  // il fondo della catena — altrimenti il tetto dei tre gradini la tronca prima.
  const suaChiave = normalizzaNome(carta.nome);
  const sotto = esotici.has(suaChiave)
    ? (carta.evolveDa ?? indice[suaChiave] ?? null)
    : null;
  const comeVariante = sotto && normalizzaNome(sotto) !== suaChiave ? carta.nome : null;

  // Verso il basso la catena è unica: ogni Pokémon ha una sola pre-evoluzione.
  const { catena, origine } = scendi(comeVariante ? { nome: sotto } : carta, indice, nonPokemon);
  const dalBasso = [...catena].reverse();
  const gradini = dalBasso.map((nome, livello) => ({
    livello,
    specie: [{ nome, varianti: [] }],
    oltre: 0,
  }));
  const livelloCarta = gradini.length - 1;
  if (comeVariante) gradini[livelloCarta].specie[0].varianti.push(comeVariante);

  // Verso l'alto si dirama. `visti` evita che un dato storto (A→B, B→A) faccia
  // ricomparire più in su un nome già mostrato più in giù.
  const giu = rovescia(indice);
  const visti = new Set([...dalBasso.map(normalizzaNome), suaChiave]);
  let sopra = [dalBasso[dalBasso.length - 1]];

  // A che stadio del gioco corrisponde il gradino più basso della catena. Serve
  // a due cose: confrontare i gradini (che sono posizioni in un array) con gli
  // stadi (che sono un dato della carta), e dare a ogni riga l'etichetta giusta.
  //
  // **Non è sempre 0.** Omanyte è un Livello 1 che si mette in gioco da un
  // fossile: la sua linea comincia al primo gradino, e chiamare "Base" quella
  // riga è dire una cosa falsa su una carta che l'utente ha in mano.
  //
  // Si guarda prima lo stadio della specie più bassa, che è un dato diretto, e
  // solo in mancanza si conta all'indietro dalla carta di partenza — che può
  // essere essa stessa esotica, e allora l'aritmetica darebbe un numero storto.
  // `null` quando non si sa nulla: senza un punto fermo non si confronta niente.
  const livelloCartaVero = classifica(carta).livello;
  const stadioNoto = stadi[normalizzaNome(dalBasso[0])];
  const livelloDelPrimo = Number.isInteger(stadioNoto)
    ? stadioNoto
    : livelloCartaVero === null
      ? null
      : Math.max(0, livelloCartaVero - livelloCarta);

  // L'etichetta di una riga viene dallo **stadio della sua specie**, non dalla
  // sua posizione. Contare le righe funziona finché la linea comincia da un
  // Base e sale di uno per volta, e il dataset è pieno di linee che non lo
  // fanno: Omanyte è un Livello 1 (il gradino sotto è un fossile, che è una
  // carta Allenatore), e Pichu → Pikachu sono **due Base** — la seconda riga
  // numerata direbbe che Pikachu è un Livello 1.
  for (const gradino of gradini) {
    gradino.stadio = stadioDi(gradino.specie[0].nome, stadi, (livelloDelPrimo ?? 0) + gradino.livello);
  }

  // Nomi arrivati troppo presto: `Dark Crobat` esce fra i figli di Zubat, ma è
  // un Livello 2 e il suo posto è due gradini più su. Si mettono da parte e si
  // riprendono quando tocca a loro, invece di buttarli — se possiedi proprio
  // quella carta, il gradino giusto deve dire "ce l'hai".
  /** @type {Array<{nome: string, livello: number}>} */
  const rimandati = [];

  while (gradini.length < MAX_GRADINI) {
    // Lo stadio che questa riga deve avere è **uno più di quello della riga
    // sotto**, non il numero di righe già fatte: da Pikachu, che è un Base
    // preceduto da Pichu, contare le righe pretendeva un Livello 2 e buttava
    // via Raichu, che è un Livello 1.
    const atteso = livelloDelPrimo === null ? null : gradini[gradini.length - 1].stadio + 1;
    // Oltre il Livello 2 non c'è niente: una linea che parte da un Livello 1,
    // come quella di Omanyte, ha due gradini e basta. Senza questo taglio la
    // terza riga si riempiva di quello che capitava — per Omastar, il TURBO.
    if (atteso !== null && atteso >= MAX_GRADINI) break;
    const nomi = [];

    for (const nome of sopra) {
      for (const figlio of giu.get(normalizzaNome(nome)) ?? []) {
        const chiave = normalizzaNome(figlio);
        if (visti.has(chiave)) continue;
        visti.add(chiave);

        // TURBO, VMAX, MEGA: non sono gradini, sono carte che si mettono sopra
        // un Pokémon già in gioco. `Arcanine BREAK` fra le evoluzioni di
        // Arcanine sarebbe un Livello 2 che nel gioco non esiste.
        if (esotici.has(chiave)) continue;

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
      stadio: stadioDi(mostrate[0].nome, stadi, atteso ?? gradini.length),
      specie: mostrate,
      oltre: tutte.length - mostrate.length,
    });
    // Il livello dopo si calcola solo da ciò che si mostra: cercare le
    // evoluzioni di specie tagliate vorrebbe dire riempire l'ultima riga di
    // carte figlie di una riga che l'utente non sta vedendo. Le varianti sì:
    // Lycanroc VMAX evolve da Lycanroc-V, non da "Lycanroc".
    sopra = mostrate.flatMap(({ nome, varianti }) => [nome, ...varianti]);
  }

  return { gradini, livelloCarta, stadioDelPrimo: livelloDelPrimo ?? 0, origine };
}
