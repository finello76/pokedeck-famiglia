/**
 * Quanto vale un mazzo **in assoluto**, su una scala 0–100.
 *
 * È una misura diversa da quella di `bilancia.js`, e le due convivono apposta.
 * `punteggioMazzo()` somma valori assoluti — PS totali, gradini evolutivi
 * totali — e quindi **cresce con la taglia**: serve a ordinare fra loro mazzi
 * nati insieme, che hanno la stessa taglia per costruzione, ed è il criterio su
 * cui è tarato l'hill-climbing. Non è una scala: un 60 carte batte sempre un 30
 * anche quando è più debole carta per carta.
 *
 * Qui invece serve rispondere a una domanda diversa: *il mazzo che ho appena
 * generato regge il Kit Allenatore che sta nella scatola in salotto?* Quel Kit
 * è da 30, o da 60 se si uniscono i due mazzetti, e va confrontato con qualsiasi
 * taglia si stia generando. Perciò ogni indicatore è **mediato per carta**, mai
 * sommato, e normalizzato su un tetto fisso.
 *
 * I tetti sono **misurati sul dataset**, non inventati (vedi `TETTI`).
 *
 * Modulo puro.
 *
 * @module engine/forza
 */

import { classifica } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { eEnergiaBase, tipoEnergia } from '../data/energie.js';
import { formatoPer } from './formati.js';
import { QUOTA_ENERGIE_PER_COSTO } from './proporzioni.js';

/**
 * I valori che valgono 100 su ciascun indicatore.
 *
 * Sono i **90° percentili** misurati su tutti i 12.877 Pokémon del dataset, non
 * i massimi. Sul massimo (250 di danno per energia, 380 PS) ogni mazzo di casa
 * finirebbe schiacciato sotto il 20 e la scala non distinguerebbe più niente:
 * i valori estremi appartengono a poche carte da torneo che in una collezione
 * di famiglia non ci sono. Col p90 il mazzo "buono ma normale" sta intorno a
 * metà scala, che è dove serve leggerlo.
 *
 * Mediana del dataset, per riferimento: 25 di danno per energia, 100 PS.
 */
export const TETTI = { dannoPerEnergia: 55, ps: 220 };

/**
 * Quanto pesa ogni indicatore nel totale.
 *
 * L'offesa pesa più di tutto perché è ciò che decide una partita corta: fra due
 * mazzi altrimenti pari vince chi mette KO per primo. La costanza pesa poco non
 * perché conti poco, ma perché è quasi sempre alta: un mazzo generato
 * dall'app ha già il vincolo del minimo di Base.
 */
export const PESI = {
  offesa: 0.3,
  resistenza: 0.2,
  struttura: 0.2,
  motore: 0.2,
  costanza: 0.1,
};

/**
 * Quota minima di Pokémon con dati di attacco utilizzabili sotto la quale il
 * risultato non si può dichiarare attendibile.
 *
 * Serve perché il dataset non è uniforme: i set Kit Allenatore sono ristampe e
 * TCGdex non vi replica i dati di gioco — `tk-sm-l` ha gli attacchi solo sul
 * 17% dei Pokémon, `tk-xy-b` su nessuno, contro il 98,9% del dataset intero.
 * Un mazzo costruito da lì darebbe un numero basso che non significa "mazzo
 * debole" ma "non lo sappiamo", e le due cose non vanno confuse.
 */
export const COPERTURA_MINIMA = 0.6;

// La quota di Energie giusta per unità di costo degli attacchi vive in
// `proporzioni.js`, che è il modulo che COSTRUISCE i mazzi. Qui si importa e
// basta: quando la stessa regola stava scritta in due posti, il generatore
// riempiva di Energie un terzo del mazzo e questa funzione ne voleva il 22% —
// ogni mazzo generato perdeva un quarto del proprio `motore` per costruzione.

/**
 * Il danno di un attacco come numero.
 *
 * Nel dataset il danno è una **stringa**, e non sempre numerica: `"10+"`,
 * `"40×"`, `"20-"`. Si prende la parte numerica e si ignora il modificatore:
 * quanto valga davvero quel `+` dipende dall'effetto, che il dataset non
 * struttura. `Number("10+")` darebbe `NaN` e quindi 0, che è peggio.
 *
 * @param {string|number|null|undefined} danno
 * @returns {number} 0 se non c'è nessuna cifra
 */
function valoreDanno(danno) {
  const cifre = String(danno ?? '').match(/\d+/);
  return cifre ? Number(cifre[0]) : 0;
}

/**
 * Cosa una carta sa fare, e quanto costa tenerla accesa.
 *
 * Gli attacchi con `costo` vuoto vengono **ignorati**, non contati come costo 1.
 * È la differenza fra misurare e inventare: nei set Kit Allenatore il costo
 * manca su tutti gli attacchi presenti, e trattarlo come 1 gonfierebbe la resa
 * di un fattore 2 o 3 proprio sui mazzi che servono da metro.
 *
 * `resa` e `costo` non vengono dallo stesso attacco, e non è una svista:
 *
 * - la **resa** è quella dell'attacco migliore, perché è quello che si userà;
 * - il **costo** è la media di tutti gli attacchi, perché è il fabbisogno di
 *   Energie della carta. Prendere il costo dell'attacco più redditizio —
 *   quasi sempre il più economico — faceva risultare che al mazzo bastavano
 *   pochissime Energie, e otto Energie Lotta in un mazzo Lotta venivano
 *   giudicate un eccesso da azzerare il motore.
 *
 * @param {object} carta
 * @returns {{resa: number, costo: number}|null} `null` se la carta non ha
 *   nessun attacco misurabile
 */
function misuraCarta(carta) {
  let resa = 0;
  let costoTotale = 0;
  let quanti = 0;
  for (const attacco of carta?.attacchi ?? []) {
    const costo = attacco.costo?.length ?? 0;
    if (costo === 0) continue;
    resa = Math.max(resa, valoreDanno(attacco.danno) / costo);
    costoTotale += costo;
    quanti += 1;
  }
  return quanti ? { resa, costo: costoTotale / quanti } : null;
}

/**
 * Probabilità di pescare almeno una carta di un certo gruppo nella mano
 * iniziale (distribuzione ipergeometrica).
 *
 * Si calcola come complemento — 1 meno la probabilità di **non** pescarne
 * nessuna — e per prodotto invece che con i coefficienti binomiali: `C(60, 7)`
 * è già oltre i 380 milioni, e su mazzi grandi i fattoriali uscirebbero dai
 * numeri esatti di JavaScript.
 *
 * @param {number} totale carte nel mazzo
 * @param {number} favorevoli copie cercate
 * @param {number} mano carte pescate
 * @returns {number} 0–1
 * @example
 * probabilitaAlmenoUna(60, 8, 7); // ≈ 0,63
 */
export function probabilitaAlmenoUna(totale, favorevoli, mano) {
  if (totale <= 0 || favorevoli <= 0) return 0;
  if (favorevoli >= totale || mano >= totale) return 1;

  let nessuna = 1;
  for (let i = 0; i < mano; i++) {
    nessuna *= (totale - favorevoli - i) / (totale - i);
    if (nessuna <= 0) return 1;
  }
  return 1 - nessuna;
}

/** @param {number} valore @returns {number} il valore riportato in 0–1 */
const limita = (valore) => Math.min(1, Math.max(0, valore || 0));

/**
 * @typedef {object} Forza
 * @property {number} totale 0–100, la media pesata degli indicatori
 * @property {number} offesa danno per Energia, rapportato al p90 del dataset
 * @property {number} resistenza PS medi, rapportati al p90 del dataset
 * @property {number} struttura gradini evolutivi effettivamente giocabili
 * @property {number} motore se le Energie bastano e sono del tipo giusto
 * @property {number} costanza probabilità di aprire con un Pokémon Base
 * @property {boolean} attendibile falso se il dataset non ha abbastanza dati
 * @property {number} copertura quota di Pokémon con attacchi misurabili
 */

/**
 * Misura la forza di un mazzo.
 *
 * Gli indicatori si restituiscono separati e non solo il totale: dire "45
 * contro 80" non serve a nessuno se non si sa **in cosa** il secondo è più
 * forte, che è l'unica informazione con cui si può intervenire.
 *
 * @param {object} mazzo con `carte: [{carta, quantita}]`
 * @param {object} [opzioni]
 * @param {number} [opzioni.taglia] se assente si usa il totale delle carte
 * @returns {Forza}
 * @example
 * forza(mazzoGenerato).totale;      // 47
 * forza(kitDiAlola).totale;         // 45  → partita pari
 */
export function forza(mazzo, opzioni = {}) {
  const carte = mazzo?.carte ?? [];
  const totale = opzioni.taglia ?? carte.reduce((s, c) => s + (c.quantita ?? 0), 0);
  const pokemon = carte.filter((c) => c.carta?.categoria === 'Pokémon');
  const copie = pokemon.reduce((s, c) => s + c.quantita, 0);

  const vuoto = {
    totale: 0,
    offesa: 0,
    resistenza: 0,
    struttura: 0,
    motore: 0,
    costanza: 0,
    attendibile: false,
    copertura: 0,
  };
  if (!copie || !totale) return vuoto;

  // --- Offesa -------------------------------------------------------------
  // I Pokémon senza dati di attacco non entrano né al numeratore né al
  // denominatore: escluderli dalla media è diverso dal contarli zero. Un mazzo
  // di cui conosciamo solo metà delle carte non è un mazzo debole, e la
  // `copertura` dice quanto ci si può fidare del numero che esce.
  let resaTotale = 0;
  let costoTotale = 0;
  let copieMisurate = 0;
  for (const voce of pokemon) {
    const misura = misuraCarta(voce.carta);
    if (!misura) continue;
    resaTotale += misura.resa * voce.quantita;
    costoTotale += misura.costo * voce.quantita;
    copieMisurate += voce.quantita;
  }
  const copertura = copieMisurate / copie;
  const offesa = copieMisurate
    ? limita(resaTotale / copieMisurate / TETTI.dannoPerEnergia)
    : 0;

  // --- Resistenza ---------------------------------------------------------
  // Stesso trattamento degli attacchi, e per la stessa ragione: le carte
  // **proxy** che il generatore crea per stampare una pre-evoluzione mancante
  // non hanno i PS, perché nascono da `cartaDaStampare()` con il solo nome e lo
  // stadio. Contarle zero abbassava la resistenza di tutti i mazzi che ne
  // contengono — e su una collezione di famiglia sono la maggioranza — facendo
  // sembrare fragile un mazzo che non lo è.
  let psTotali = 0;
  let copieConPs = 0;
  for (const voce of pokemon) {
    if (!voce.carta.ps) continue;
    psTotali += voce.carta.ps * voce.quantita;
    copieConPs += voce.quantita;
  }
  const resistenza = copieConPs ? limita(psTotali / copieConPs / TETTI.ps) : 0;

  // --- Struttura ----------------------------------------------------------
  // Stessa regola di `bilancia.js`: un gradino conta solo se la carta da cui
  // evolve è nel mazzo. Un Livello 2 da solo è una carta morta, non una carta
  // forte, e misurarlo come forte è esattamente l'errore che porta a generare
  // il mazzo che poi non funziona in mano.
  const presenti = new Set(pokemon.map((c) => normalizzaNome(c.carta.nome)));
  const gradini = pokemon.reduce((somma, c) => {
    const livello = classifica(c.carta).livello ?? 0;
    if (livello === 0) return somma;
    const haLaSua = c.carta.evolveDa && presenti.has(normalizzaNome(c.carta.evolveDa));
    return somma + (haLaSua ? livello * c.quantita : 0);
  }, 0);
  // Diviso 2: il massimo teorico è un mazzo di soli Livello 2 giocabili, che
  // non esiste, ed è giusto che il tetto sia irraggiungibile.
  const struttura = limita(gradini / copie / 2);

  // --- Motore -------------------------------------------------------------
  // Due cose insieme, perché una sola non basta: le Energie devono essere
  // abbastanza *e* del tipo giusto. Dodici Energie Acqua in un mazzo Lotta
  // sono dodici carte morte.
  const energieBase = carte.filter((c) => eEnergiaBase(c.carta));
  const quantiEnergie = energieBase.reduce((s, c) => s + c.quantita, 0);
  const costoMedio = copieMisurate ? costoTotale / copieMisurate : 2;
  const quotaIdeale = costoMedio * QUOTA_ENERGIE_PER_COSTO;
  const rapporto = quantiEnergie / totale / quotaIdeale;
  // La penalità è **asimmetrica**, perché lo sono le conseguenze: senza
  // Energie non si attacca affatto, e la mancanza va contata per intero. Averne
  // troppe fa solo pescare Energie invece di Pokémon — un fastidio, non una
  // paralisi — e si penalizza a metà velocità: il motore si azzera solo al
  // triplo del necessario, cioè quando il mazzo è per metà Energie.
  const adeguatezza = rapporto <= 1 ? limita(rapporto) : limita(1 - (rapporto - 1) / 2);

  const tipiEnergia = new Set(energieBase.map((c) => tipoEnergia(c.carta)).filter(Boolean));
  const serviti = pokemon.reduce(
    (s, c) => s + ((c.carta.tipi ?? []).some((t) => tipiEnergia.has(t)) ? c.quantita : 0),
    0,
  );
  const motore = adeguatezza * (serviti / copie);

  // --- Costanza -----------------------------------------------------------
  // Senza un Base in mano iniziale non si comincia nemmeno: si rimescola e si
  // perde il turno. La mano la dà il formato, che è la fonte unica dei numeri
  // di partita.
  const basi = pokemon.reduce(
    (s, c) => s + (classifica(c.carta).livello === 0 ? c.quantita : 0),
    0,
  );
  const costanza = probabilitaAlmenoUna(totale, basi, formatoPer(totale).manoIniziale);

  const voci = { offesa, resistenza, struttura, motore, costanza };
  const punteggio = Object.entries(PESI).reduce((s, [voce, peso]) => s + voci[voce] * peso, 0);

  return {
    ...voci,
    totale: Math.round(punteggio * 100),
    attendibile: copertura >= COPERTURA_MINIMA,
    copertura,
  };
}

/**
 * La forza media di un gruppo di mazzi.
 *
 * È il numero con cui si confronta un piano intero con un mazzo di riferimento:
 * il bersaglio riguarda la partita, non il singolo mazzo.
 *
 * @param {object[]} mazzi
 * @param {object} [opzioni] passate a `forza()`
 * @returns {{media: number, forze: Forza[], attendibile: boolean}}
 */
export function forzaMedia(mazzi, opzioni = {}) {
  const forze = (mazzi ?? []).map((m) => forza(m, opzioni));
  if (!forze.length) return { media: 0, forze, attendibile: false };
  return {
    media: Math.round(forze.reduce((s, f) => s + f.totale, 0) / forze.length),
    forze,
    // Basta un mazzo non misurabile perché il confronto non regga.
    attendibile: forze.every((f) => f.attendibile),
  };
}

/**
 * Come si legge la differenza fra un mazzo e il suo riferimento.
 *
 * La soglia è a 5 punti su 100: sotto, la differenza si perde nel rumore del
 * pescare: non è distinguibile giocando, e prometterla sarebbe una bugia.
 *
 * @param {number} punteggio
 * @param {number} riferimento
 * @returns {{verso: 'pari'|'sotto'|'sopra', scarto: number, testo: string}}
 */
export function confronta(punteggio, riferimento) {
  const scarto = punteggio - riferimento;
  if (Math.abs(scarto) <= 5) return { verso: 'pari', scarto, testo: 'partita pari' };
  if (scarto < 0) {
    return {
      verso: 'sotto',
      scarto,
      testo: Math.abs(scarto) > 15 ? 'nettamente più debole' : 'un po\' più debole',
    };
  }
  return {
    verso: 'sopra',
    scarto,
    testo: scarto > 15 ? 'nettamente più forte' : 'un po\' più forte',
  };
}
