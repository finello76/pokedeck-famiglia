/**
 * Quanto vale un mazzo, e come si pareggiano fra loro.
 *
 * È il punto 3 della specifica del motore, e finora mancava: i mazzi venivano
 * costruiti insieme — il che evita che il primo si prenda tutto — ma nessuno
 * verificava che alla fine si somigliassero. Il risultato lo si vedeva
 * giocando: un mazzo con due linee fino al Livello 2 contro uno di nove Pokémon
 * Base non è una partita, è un'esecuzione.
 *
 * Il punteggio segue la specifica: PS totali, danno per energia, profondità
 * evolutiva, coerenza energetica. Non pretende di misurare la forza reale nel
 * gioco — servirebbe una simulazione — ma di **ordinare** due mazzi della stessa
 * collezione, che è tutto ciò che serve per accorgersi di uno squilibrio.
 *
 * Il riequilibrio sposta **linee intere** da un mazzo all'altro, mai carte
 * singole: muovere un Livello 2 senza i suoi gradini bassi non pareggia niente,
 * peggiora entrambi i mazzi.
 *
 * Modulo puro.
 *
 * @module engine/bilancia
 */

import { classifica } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { eEnergiaBase, tipoEnergia } from '../data/energie.js';
import { enumeraLinee } from './linee.js';

/**
 * Differenza minima sotto la quale due mazzi si considerano pari, comunque.
 *
 * Serve un pavimento perché su mazzi piccoli i punteggi sono piccoli, e una
 * soglia solo percentuale segnalerebbe come squilibrio qualche punto di PS.
 */
export const SOGLIA_SQUILIBRIO = 25;

/** Quota del punteggio medio oltre la quale la differenza si sente giocando. */
const QUOTA_TOLLERATA = 0.15;

/**
 * La soglia adatta a questi mazzi.
 *
 * È **relativa**: un mazzo da 15 carte vale un terzo di uno da 60, e venti
 * punti di differenza pesano in modo diverso nei due casi. Con una soglia fissa
 * i mazzi grandi risultavano sempre squilibrati e i piccoli mai.
 *
 * @param {Punteggio[]} punteggi
 * @returns {number}
 */
export function sogliaPer(punteggi) {
  if (!punteggi?.length) return SOGLIA_SQUILIBRIO;
  const media = punteggi.reduce((s, p) => s + p.totale, 0) / punteggi.length;
  return Math.max(SOGLIA_SQUILIBRIO, Math.round(media * QUOTA_TOLLERATA));
}

/**
 * Se i mazzi sono abbastanza diversi da rovinare la partita.
 *
 * @param {{differenza: number, punteggi: Punteggio[]}} equilibrio da `squilibrio()`
 * @returns {boolean}
 */
export function squilibrati(equilibrio) {
  if (!equilibrio?.punteggi?.length) return false;
  return equilibrio.differenza > sogliaPer(equilibrio.punteggi);
}

/**
 * @typedef {object} Punteggio
 * @property {number} totale il valore su cui si confrontano i mazzi
 * @property {number} ps punti salute complessivi, in decine
 * @property {number} danno danno medio per energia spesa
 * @property {number} evoluzione gradini evolutivi giocabili
 * @property {number} coerenza quanto le energie servono i Pokémon che ci sono
 */

/**
 * Valuta un mazzo.
 *
 * @param {object} mazzo
 * @returns {Punteggio} le voci separate, non solo il totale: uno squilibrio si
 *   spiega solo dicendo **in cosa** un mazzo è più forte
 * @example
 * punteggioMazzo(mazzo).totale; // 118
 */
export function punteggioMazzo(mazzo) {
  const pokemon = (mazzo.carte ?? []).filter((c) => c.carta?.categoria === 'Pokémon');
  const copie = pokemon.reduce((s, c) => s + c.quantita, 0) || 1;

  const ps = pokemon.reduce((s, c) => s + (c.carta.ps ?? 0) * c.quantita, 0) / 10;

  // Danno per energia, non danno assoluto: un attacco da 120 che ne costa
  // quattro è più debole di uno da 40 che ne costa una, in una partita corta.
  const resa = (carta) => {
    const valori = (carta.attacchi ?? []).map(
      (a) => (Number(a.danno) || 0) / Math.max(1, a.costo?.length ?? 1),
    );
    return valori.length ? Math.max(...valori) : 0;
  };
  const danno = pokemon.reduce((s, c) => s + resa(c.carta) * c.quantita, 0) / copie;

  // I gradini evolutivi contano solo se **giocabili**: un Livello 2 senza la
  // sua linea nel mazzo è una carta morta, non una carta forte.
  const presenti = new Set(pokemon.map((c) => normalizzaNome(c.carta.nome)));
  const evoluzione = pokemon.reduce((somma, c) => {
    const livello = classifica(c.carta).livello ?? 0;
    if (livello === 0) return somma;
    const haLaSua = c.carta.evolveDa && presenti.has(normalizzaNome(c.carta.evolveDa));
    return somma + (haLaSua ? livello * c.quantita : 0);
  }, 0);

  // Coerenza: quanta parte dei Pokémon può essere alimentata dalle energie che
  // il mazzo contiene davvero.
  const tipiEnergia = new Set(
    (mazzo.carte ?? [])
      .filter((c) => eEnergiaBase(c.carta))
      .map((c) => tipoEnergia(c.carta))
      .filter(Boolean),
  );
  const serviti = pokemon.reduce(
    (s, c) => s + ((c.carta.tipi ?? []).some((t) => tipiEnergia.has(t)) ? c.quantita : 0),
    0,
  );
  const coerenza = serviti / copie;

  return {
    ps,
    danno,
    evoluzione,
    coerenza,
    // I pesi sono tarati perché una linea completa in più (2 gradini) pesi
    // quanto una ventina di PS: è la differenza che si sente giocando.
    totale: Math.round(ps * 0.6 + danno * 2 + evoluzione * 12 + coerenza * 20),
  };
}

/**
 * Lo squilibrio fra i mazzi di un piano.
 *
 * @param {object[]} mazzi
 * @returns {{differenza: number, punteggi: Punteggio[], migliore: number, peggiore: number}}
 *   `migliore` e `peggiore` sono indici in `mazzi`
 */
export function squilibrio(mazzi) {
  const punteggi = mazzi.map(punteggioMazzo);
  let migliore = 0;
  let peggiore = 0;
  punteggi.forEach((p, i) => {
    if (p.totale > punteggi[migliore].totale) migliore = i;
    if (p.totale < punteggi[peggiore].totale) peggiore = i;
  });
  return {
    punteggi,
    migliore,
    peggiore,
    differenza: punteggi[migliore].totale - punteggi[peggiore].totale,
  };
}

/**
 * Le linee evolutive complete presenti in un mazzo.
 *
 * @param {object} mazzo
 * @param {Record<string, string>} indiceEvoluzioni
 * @param {Set<string>} nonPokemon
 * @returns {Array<{voci: object[], profondita: number, tipi: string[], cima: string}>}
 */
function lineeNelMazzo(mazzo, indiceEvoluzioni, nonPokemon) {
  const pokemon = mazzo.carte.filter((c) => c.carta?.categoria === 'Pokémon');
  const candidati = pokemon.map((c) => ({ carta: c.carta, disponibili: c.quantita }));

  // Una per famiglia, e la più profonda. `enumeraLinee()` produce una linea per
  // ogni carta posseduta, quindi con Machop, Machoke e Machamp nel mazzo escono
  // anche i tronconi (Machop→Machoke). Spostare un troncone significa spezzare
  // la linea: Machamp resterebbe di qua senza più nulla sotto.
  const perFamiglia = new Map();
  for (const linea of enumeraLinee(candidati, indiceEvoluzioni, nonPokemon)) {
    if (linea.profondita < 2) continue;
    const nomi = new Set(linea.gradini.map((g) => normalizzaNome(g.nome)));
    const voci = pokemon.filter((c) => nomi.has(normalizzaNome(c.carta.nome)));
    // La linea deve essere tutta nel mazzo, stampe comprese: se un gradino non
    // c'è, non è una linea che si può spostare.
    if (voci.length < linea.profondita) continue;

    const gia = perFamiglia.get(linea.famiglia);
    if (gia && gia.profondita >= linea.profondita) continue;
    perFamiglia.set(linea.famiglia, {
      voci,
      profondita: linea.profondita,
      tipi: linea.cima.tipi ?? [],
      cima: linea.cima.nome,
    });
  }
  // Difesa in più: con un indice delle evoluzioni incompleto la stessa linea
  // può uscire spezzata in due famiglie diverse, e la parte bassa sembrerebbe
  // spostabile per conto suo. Una linea contenuta in un'altra non è una linea.
  const linee = [...perFamiglia.values()];
  return linee.filter(
    (l) => !linee.some((altra) => altra !== l && l.voci.every((v) => altra.voci.includes(v))),
  );
}

/**
 * Pareggia i mazzi spostando linee evolutive intere.
 *
 * Il mazzo più forte cede una linea al più debole e riceve in cambio altrettante
 * carte fra le sue meno preziose (Base sciolte, che non spezzano nulla). Con la
 * linea viaggiano le **Energie del suo tipo**: una linea Lotta in un mazzo Erba
 * senza Energie Lotta sarebbe un regalo avvelenato.
 *
 * Si accetta uno scambio solo se la differenza di punteggio cala davvero: è una
 * salita di collina, non un rimescolamento.
 *
 * Muta i mazzi ricevuti.
 *
 * @param {object[]} mazzi
 * @param {object} [opzioni]
 * @param {Record<string, string>} [opzioni.indiceEvoluzioni]
 * @param {Set<string>} [opzioni.nonPokemon]
 * @param {number} [opzioni.soglia] differenza sotto la quale ci si ferma; se
 *   assente si usa `sogliaPer()`, che la calcola in proporzione ai mazzi
 * @param {number} [opzioni.passiMassimi=4] tetto agli scambi, per non oscillare
 * @returns {Array<{linea: string, da: string, a: string, differenzaPrima: number,
 *   differenzaDopo: number}>} gli scambi fatti, per poterli raccontare
 */
export function bilancia(mazzi, opzioni = {}) {
  const {
    indiceEvoluzioni = {},
    nonPokemon = new Set(),
    soglia = null,
    passiMassimi = 4,
  } = opzioni;

  const scambi = [];
  if (!Array.isArray(mazzi) || mazzi.length < 2) return scambi;

  // Una linea si sposta al più una volta. Senza questo vincolo la stessa linea
  // andava e tornava — ogni viaggio riduceva di poco la differenza, perché le
  // Base e le Energie scambiate non erano le stesse — e il risultato era due
  // scambi per restare quasi dov'eravamo.
  const giaSpostate = new Set();

  for (let passo = 0; passo < passiMassimi; passo++) {
    const prima = squilibrio(mazzi);
    if (prima.differenza <= (soglia ?? sogliaPer(prima.punteggi))) break;

    const ricco = mazzi[prima.migliore];
    const povero = mazzi[prima.peggiore];
    const candidate = lineeNelMazzo(ricco, indiceEvoluzioni, nonPokemon).filter(
      (l) => !giaSpostate.has(l.cima),
    );
    if (!candidate.length) break;

    // Si provano **tutte** le linee e si tiene quella che pareggia di più.
    // Cedere sempre la meno profonda sembrava prudente, ma spesso o non
    // bastava a rientrare sotto soglia o ribaltava lo squilibrio dall'altra
    // parte: qui la scelta la fa la misura, non una regola a priori.
    let migliore = null;
    for (const linea of candidate) {
      const annulla = spostaLinea(ricco, povero, linea);
      const differenza = squilibrio(mazzi).differenza;
      annulla();
      if (!migliore || differenza < migliore.differenza) migliore = { linea, differenza };
    }

    // Nessuno scambio avvicina i mazzi: succede quando c'è una linea sola in
    // tutto il piano, e spostarla si limiterebbe a invertire chi è il più
    // forte. Meglio lasciare le cose come stanno e dirlo.
    if (!migliore || migliore.differenza >= prima.differenza) break;

    spostaLinea(ricco, povero, migliore.linea);
    giaSpostate.add(migliore.linea.cima);
    scambi.push({
      linea: migliore.linea.cima,
      da: ricco.nome,
      a: povero.nome,
      differenzaPrima: prima.differenza,
      differenzaDopo: migliore.differenza,
    });
  }
  return scambi;
}

/**
 * Sposta una linea da un mazzo all'altro, con le sue energie e un contraccambio
 * di pari numero di carte.
 *
 * @param {object} da
 * @param {object} a
 * @param {object} linea da `lineeNelMazzo()`
 * @returns {() => void} funzione che rimette tutto com'era, se lo scambio non
 *   ha migliorato niente
 */
function spostaLinea(da, a, linea) {
  const istantanea = [copiaMazzo(da), copiaMazzo(a)];
  const tipiPrima = [da.tipi, a.tipi];
  const copie = linea.voci.reduce((s, c) => s + c.quantita, 0);

  // 1. La linea cambia mazzo, intera.
  for (const voce of linea.voci) {
    da.carte.splice(da.carte.indexOf(voce), 1);
    a.carte.push(voce);
  }

  // 2. In cambio tornano indietro altrettante carte fra le meno preziose: Base
  //    sciolte da cui non evolve nessuno, e gli Allenatori in doppio.
  const dipendenze = new Set(a.carte.map((c) => normalizzaNome(c.carta.evolveDa)).filter(Boolean));
  const sacrificabili = a.carte.filter(
    (c) =>
      c !== undefined &&
      !linea.voci.includes(c) &&
      ((c.carta.categoria === 'Pokémon' &&
        classifica(c.carta).livello === 0 &&
        !dipendenze.has(normalizzaNome(c.carta.nome))) ||
        c.carta.categoria === 'Allenatore'),
  );

  let restituite = 0;
  for (const voce of sacrificabili) {
    if (restituite >= copie) break;
    const quante = Math.min(voce.quantita, copie - restituite);
    voce.quantita -= quante;
    if (voce.quantita <= 0) a.carte.splice(a.carte.indexOf(voce), 1);
    aggiungiCopie(da, voce, quante);
    restituite += quante;
  }

  // 3. Le Energie seguono la linea: senza, il mazzo che la riceve non la
  //    alimenta e lo scambio lo peggiora invece di aiutarlo.
  //
  //    Si procede **a coppie**: un'Energia del tipo giusto va di là solo se una
  //    del tipo sbagliato torna di qua. Spostarle a senso unico cambierebbe la
  //    taglia dei mazzi, che è l'unica cosa che qui non può cambiare. Se il
  //    mazzo che riceve ha già le Energie giuste — capita fra mazzi dello
  //    stesso tipo — non c'è niente da scambiare, ed è giusto così.
  const suoTipo = linea.tipi[0];
  if (suoTipo) {
    const daPortare = () =>
      da.carte.find((c) => eEnergiaBase(c.carta) && tipoEnergia(c.carta) === suoTipo);
    const daRestituire = () =>
      a.carte.find((c) => eEnergiaBase(c.carta) && tipoEnergia(c.carta) !== suoTipo);

    for (let scambiate = 0; scambiate < copie; scambiate++) {
      const va = daPortare();
      const viene = daRestituire();
      if (!va || !viene) break;
      muoviUna(da, a, va);
      muoviUna(a, da, viene);
    }
  }

  // Il mazzo che riceve diventa bitipo: la specifica lo ammette, ed è l'unico
  // modo onesto di descriverlo a chi ci gioca.
  if (linea.tipi[0]) a.tipi = [...new Set([...(a.tipi ?? []), linea.tipi[0]])].slice(0, 2);

  ricalcolaTotali(da);
  ricalcolaTotali(a);

  return () => {
    ripristina(da, istantanea[0]);
    ripristina(a, istantanea[1]);
    da.tipi = tipiPrima[0];
    a.tipi = tipiPrima[1];
  };
}

/**
 * Sposta **una** copia di una voce da un mazzo all'altro.
 *
 * Una alla volta perché gli scambi di Energie si fanno a coppie: una di qua,
 * una di là. Muovendone tre insieme si finisce per sbilanciare le taglie
 * quando dall'altra parte ce n'è solo una da restituire.
 *
 * @param {object} da
 * @param {object} a
 * @param {object} voce voce presente in `da.carte`
 */
function muoviUna(da, a, voce) {
  voce.quantita -= 1;
  if (voce.quantita <= 0) da.carte.splice(da.carte.indexOf(voce), 1);
  aggiungiCopie(a, voce, 1);
}

/**
 * Aggiunge copie di una voce a un mazzo, unendole a quelle già presenti.
 * @param {object} mazzo
 * @param {object} voce
 * @param {number} quante
 */
function aggiungiCopie(mazzo, voce, quante) {
  if (quante <= 0) return;
  const esistente = mazzo.carte.find(
    (c) =>
      Boolean(c.proxy) === Boolean(voce.proxy) &&
      normalizzaNome(c.carta.nome) === normalizzaNome(voce.carta.nome),
  );
  if (esistente) esistente.quantita += quante;
  else mazzo.carte.push({ ...voce, quantita: quante });
}

/**
 * Rifà i conti di `totale` e `composizione` dalle carte presenti.
 * @param {object} mazzo
 */
function ricalcolaTotali(mazzo) {
  const campo = { 'Pokémon': 'pokemon', Energia: 'energie', Allenatore: 'allenatori' };
  mazzo.composizione = { pokemon: 0, energie: 0, allenatori: 0 };
  mazzo.totale = 0;
  for (const voce of mazzo.carte) {
    mazzo.totale += voce.quantita;
    const dove = campo[voce.carta?.categoria];
    if (dove) mazzo.composizione[dove] += voce.quantita;
  }
}

/**
 * Fotografa un mazzo per poterlo rimettere com'era dopo una prova.
 *
 * Si annotano i **riferimenti** alle voci, non delle copie. È la differenza fra
 * un annullamento che funziona e uno che rompe tutto: le linee candidate
 * puntano a quegli stessi oggetti, e se il ripristino li sostituisse con
 * cloni, alla prova successiva il motore cercherebbe nel mazzo voci che non ci
 * sono più — e ne toglierebbe altre al loro posto.
 *
 * @param {object} mazzo
 * @returns {Array<{voce: object, quantita: number}>}
 */
function copiaMazzo(mazzo) {
  return mazzo.carte.map((voce) => ({ voce, quantita: voce.quantita }));
}

/**
 * @param {object} mazzo
 * @param {Array<{voce: object, quantita: number}>} istantanea
 */
function ripristina(mazzo, istantanea) {
  mazzo.carte = istantanea.map(({ voce, quantita }) => {
    voce.quantita = quantita;
    return voce;
  });
  ricalcolaTotali(mazzo);
}
