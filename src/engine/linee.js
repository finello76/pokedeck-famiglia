/**
 * Le linee evolutive come unità di progetto del mazzo.
 *
 * Questo modulo nasce da un fatto misurato sulla collezione vera: **non una
 * sola evoluzione posseduta ha in casa la carta da cui evolve**. 38 Base, 14
 * Livello 1, 12 Livello 2, zero linee complete. Finché il motore ha ragionato
 * su "ciò che possiedo", l'unico mazzo costruibile era un mucchio di Base
 * sciolte, e le evoluzioni — le carte interessanti — restavano fuori perché
 * ingiocabili.
 *
 * Il cambio di prospettiva: una linea non è ciò che possiedi, è **ciò che
 * possiedi più i gradini che ti mancano per giocarlo**. Machamp non è una
 * carta orfana da penalizzare: è una linea Machop → Machoke → Machamp di cui
 * hai la cima e devi stampare i due gradini bassi. Il buco diventa un costo di
 * progetto, non un difetto che esclude la carta.
 *
 * È l'inverso del modulo che sostituisce (`scelta-linee.js`), dove un'orfana
 * partiva a -35 punti e perdeva sempre contro un Base qualsiasi.
 *
 * Modulo puro: nessun DOM, nessun database, nessuna immagine.
 *
 * @module engine/linee
 */

import { classifica } from './stadi.js';
import { normalizzaNome } from './nomi.js';

/** Quanti gradini può avere una linea: Base → Livello 1 → Livello 2. */
const MAX_GRADINI = 3;

/**
 * @typedef {object} Gradino
 * @property {string} nome nome della specie a questo gradino
 * @property {number} livello 0 Base, 1, 2
 * @property {object|null} carta la carta vera, o `null` se va stampata
 * @property {string|null} evolveDa il gradino sotto, per nome
 */

/**
 * @typedef {object} Linea
 * @property {Gradino[]} gradini dal Base alla cima, contigui e senza salti
 * @property {object} cima la carta posseduta più evoluta: è il motivo della linea
 * @property {number} profondita quanti gradini ha
 * @property {number} daStampare gradini senza carta vera
 * @property {string[]} tipi i tipi della cima
 * @property {number} punteggio quanto conviene, riempito da `ordinaLinee()`
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
function catenaVersoIlBasso(carta, indice, nonPokemon) {
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
 * Costruisce una linea per ogni Pokémon posseduto.
 *
 * Ogni carta posseduta genera la linea di cui è la **cima**: i gradini sotto si
 * riempiono con altre carte possedute se ci sono, altrimenti restano vuoti e
 * andranno stampati. Una Base senza evoluzioni possedute produce semplicemente
 * una linea di un gradino solo, che non costa stampa: è il caso in cui il
 * comportamento coincide con quello di prima.
 *
 * @param {Array<{carta: object, disponibili: number}>} candidati dalla dispensa
 * @param {Record<string, string>} [indiceEvoluzioni] nome normalizzato → pre-evoluzione
 * @param {Set<string>} [nonPokemon] nomi normalizzati di pre-evoluzioni che sono
 *   carte Allenatore (i fossili): la catena si ferma prima di loro
 * @returns {Linea[]} non ordinate: ci pensa `ordinaLinee()`
 * @example
 * // possedendo il solo Machamp, con l'indice completo:
 * enumeraLinee([{ carta: machamp, disponibili: 1 }], indice);
 * // → [{ gradini: [Machop(null), Machoke(null), Machamp(carta)], daStampare: 2 }]
 */
export function enumeraLinee(candidati, indiceEvoluzioni = {}, nonPokemon = new Set()) {
  /** @type {Map<string, object>} nome normalizzato → carta posseduta */
  const posseduti = new Map();
  for (const { carta } of candidati) {
    const chiave = normalizzaNome(carta.nome);
    // A parità di nome tiene la prima: sono stampe diverse della stessa specie,
    // e per la linea l'una vale l'altra.
    if (!posseduti.has(chiave)) posseduti.set(chiave, carta);
  }

  const linee = [];
  const viste = new Set();

  for (const { carta } of candidati) {
    if (classifica(carta).livello === null) continue; // stadio ignoto: non si sa come giocarlo

    const catena = catenaVersoIlBasso(carta, indiceEvoluzioni, nonPokemon);
    // Una linea è identificata dalla catena di nomi: due stampe della stessa
    // specie non devono produrre due linee identiche.
    const firma = catena.map(normalizzaNome).join('>');
    if (viste.has(firma)) continue;
    viste.add(firma);

    // La catena arriva dalla cima: si rovescia, perché un mazzo si costruisce
    // dal basso e la piramide ragiona per livelli crescenti.
    const dalBasso = [...catena].reverse();
    const gradini = dalBasso.map((nome, livello) => ({
      nome,
      livello,
      carta: posseduti.get(normalizzaNome(nome)) ?? null,
      evolveDa: livello > 0 ? dalBasso[livello - 1] : null,
    }));
    // La cima è sempre posseduta: è la carta da cui la linea è nata.
    gradini[gradini.length - 1].carta = carta;

    linee.push({
      gradini,
      // Il Base della catena identifica la famiglia anche dopo un collasso per
      // deroga, quando i gradini bassi spariscono: serve a non prendere due
      // volte la stessa linea sotto forme diverse.
      famiglia: normalizzaNome(dalBasso[0]),
      cima: carta,
      profondita: gradini.length,
      daStampare: gradini.filter((g) => !g.carta).length,
      // Del gradino più basso non si conosce la pre-evoluzione, ma non è un
      // Base: è una linea che non poggia su niente. Non si può nemmeno
      // stamparne il fondo — non si sa quale carta sarebbe — quindi si gioca
      // solo se una regola della casa la calo dalla mano.
      radiceOrfana: (classifica(gradini[0].carta ?? {}).livello ?? 0) > 0,
      tipi: carta.tipi ?? [],
      punteggio: 0,
    });
  }
  return linee;
}

/**
 * Riduce una linea alla sola cima, giocata dalla mano per deroga.
 *
 * È la via d'uscita quando la stampa non è disponibile: la regola della casa
 * "le evoluzioni selezionate si giocano come Pokémon Base" permette di usare
 * comunque la carta, senza i gradini sotto. Vale meno di una linea vera — si
 * gioca alterando le regole — ma molto più che lasciare la carta nella scatola.
 *
 * @param {Linea} linea
 * @returns {Linea}
 */
function collassaSuCima(linea) {
  return {
    ...linea,
    gradini: [{ nome: linea.cima.nome, livello: 0, carta: linea.cima, evolveDa: null }],
    profondita: 1,
    daStampare: 0,
    deroga: true,
  };
}

/**
 * Ordina le linee per quanto convengono a un mazzo, scartando le impraticabili.
 *
 * @param {Linea[]} linee
 * @param {string[]} tipi tipi del mazzo
 * @param {object} [contesto]
 * @param {number} [contesto.budget=0] copie stampabili ancora disponibili
 * @param {boolean} [contesto.evoluzioniComeBase=false] se la regola della casa
 *   permette di giocare dalla mano un'evoluzione priva dei gradini sotto
 * @param {Set<string>} [contesto.famiglieInMazzo] linee già prese, per firma
 * @returns {Linea[]} nuovo array, punteggio decrescente
 */
export function ordinaLinee(linee, tipi, contesto = {}) {
  const { budget = 0, evoluzioniComeBase = false, famiglieInMazzo = new Set() } = contesto;

  const praticabili = [];
  for (const linea of linee) {
    // Linea appoggiata sul vuoto: nessuna stampa la ripara, serve la deroga.
    if (linea.radiceOrfana) {
      if (evoluzioniComeBase && linea.daStampare <= budget) {
        praticabili.push({ ...linea, deroga: true });
      }
      continue;
    }
    // Linea completabile: si prende intera.
    if (linea.daStampare <= budget) praticabili.push(linea);
    // Altrimenti o la si gioca per deroga, o si lascia perdere: mezza linea è
    // peggio di nessuna linea, perché occupa slot con carte ingiocabili.
    else if (evoluzioniComeBase) praticabili.push(collassaSuCima(linea));
  }

  return praticabili
    .map((l) => ({ ...l, punteggio: punteggioLinea(l, tipi, famiglieInMazzo) }))
    .sort((a, b) => b.punteggio - a.punteggio);
}

/**
 * @param {Linea} linea
 * @param {string[]} tipi
 * @param {Set<string>} famiglieInMazzo
 * @returns {number}
 */
function punteggioLinea(linea, tipi, famiglieInMazzo) {
  const { cima } = linea;
  let p = 0;

  // Il tipo pesa più di tutto: una linea del tipo sbagliato non si alimenta
  // con le energie che hai, per quanto sia bella.
  if (tipi.some((t) => (cima.tipi ?? []).includes(t))) p += 100;

  // La profondità è il punto di questo modulo. Deve battere qualunque
  // vantaggio di una Base isolata, stampa compresa: una linea da 3 gradini con
  // 2 carte da stampare vale +140-40 = +100 contro il +0 di una Base sciolta.
  p += 70 * (linea.profondita - 1);

  // Stampare costa: fra due linee equivalenti vince quella che usa più carte
  // vere. È il principio "le carte vere vengono sempre prima", espresso come
  // preferenza invece che come divieto.
  p -= 20 * linea.daStampare;

  // Linea già nel mazzo: si passa ad altro, o il mazzo diventa una sola linea
  // ripetuta. Penalità, non divieto: se non c'è altro, ci si torna.
  if (famiglieInMazzo.has(firmaLinea(linea))) p -= 90;

  // Giocare un Livello 2 direttamente dalla mano è una concessione, non un
  // mazzo ben costruito: si preferisce una linea vera, anche più corta.
  if (linea.deroga) p -= 30;

  p += Math.min(20, (cima.ps ?? 0) / 10);
  const danno = Math.max(0, ...(cima.attacchi ?? []).map((a) => Number(a.danno) || 0));
  const costo = Math.min(9, ...(cima.attacchi ?? []).map((a) => a.costo?.length || 9));
  p += Math.min(25, danno / 10) - costo * 2; // danno a buon mercato

  return p;
}

/**
 * Identifica la famiglia evolutiva della linea: il nome del suo Base.
 *
 * Non si usa la catena dei gradini perché una linea collassata per deroga li
 * perde, e la stessa carta risulterebbe una linea diversa.
 *
 * @param {Linea} linea
 * @returns {string}
 */
export function firmaLinea(linea) {
  return linea.famiglia ?? normalizzaNome(linea.cima?.nome);
}

/**
 * Quante copie prendere di ciascun gradino, e quante di queste vanno stampate.
 *
 * La piramide (3 Base / 2 Livello 1 / 1 Livello 2) non è un vezzo: la linea
 * parte sempre dal Base, e le evoluzioni sono carte morte se non si pesca prima
 * ciò da cui evolvono.
 *
 * L'ordine di spesa del budget conta. Prima **una copia per ogni gradino**:
 * senza, la linea non si può giocare affatto. Solo con quel che avanza si
 * ingrossano i gradini bassi verso la piramide, perché è un miglioramento di
 * pescata, non un requisito.
 *
 * Non tocca la dispensa: dice soltanto *cosa* servirebbe.
 *
 * @param {Linea} linea
 * @param {[number, number, number]} piramide copie consigliate per livello
 * @param {number} spazio slot Pokémon ancora liberi nel mazzo
 * @param {number} budget copie stampabili ancora disponibili
 * @returns {Array<{gradino: Gradino, quante: number, daStampare: number}>}
 *   in ordine di gioco, dal Base alla cima. **Vuoto** se la linea non ci sta
 *   tutta: una linea troncata non arriva alla carta per cui esiste, e i suoi
 *   gradini bassi sarebbero carte da stampare per giocare niente
 * @example
 * richiestaPerLinea(lineaMachamp, [3, 2, 1], 10, 4);
 * // → Machop x1 (1 da stampare), Machoke x1 (1 da stampare), Machamp x1
 * //   e, col budget residuo, altre copie di Machop
 * richiestaPerLinea(lineaMachamp, [3, 2, 1], 1, 4); // → [] (un solo slot)
 */
export function richiestaPerLinea(linea, piramide, spazio, budget) {
  const richiesta = linea.gradini.map((gradino) => ({ gradino, quante: 0, daStampare: 0 }));
  let restante = spazio;
  let credito = budget;

  // Passata 1: la linea deve stare in piedi. Una copia per gradino.
  for (const voce of richiesta) {
    if (restante <= 0) break;
    const stampa = voce.gradino.carta ? 0 : 1;
    if (stampa > credito) break; // il gradino non si può pagare: la linea si ferma qui
    voce.quante = 1;
    voce.daStampare = stampa;
    credito -= stampa;
    restante -= 1;
  }

  // La linea esiste per la sua cima: se anche un solo gradino è rimasto
  // scoperto non ci si arriva, e stampare i gradini bassi servirebbe a giocare
  // niente. Meglio lasciare la linea a un altro giro, o a un altro mazzo.
  if (richiesta.some((v) => v.quante === 0)) return [];

  // Passata 2: si ingrossa la piramide dal basso, con ciò che avanza.
  for (const voce of richiesta) {
    if (restante <= 0) break;
    const volute = (piramide[voce.gradino.livello] ?? 1) - voce.quante;
    for (let i = 0; i < volute && restante > 0; i++) {
      // Le copie in più di un gradino posseduto le decide la dispensa, che sa
      // quante ne restano davvero; qui si chiedono e basta.
      const stampa = voce.gradino.carta ? 0 : 1;
      if (stampa > credito) break;
      voce.quante += 1;
      voce.daStampare += stampa;
      credito -= stampa;
      restante -= 1;
    }
  }

  return richiesta;
}
