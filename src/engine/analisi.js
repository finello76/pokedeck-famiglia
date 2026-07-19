/**
 * Analisi della collezione: che cosa si può davvero giocare.
 *
 * È il primo stadio del motore. Riceve le carte possedute, ne ricostruisce le
 * linee evolutive e riporta cosa manca. Il generatore (step successivo) userà
 * questo risultato senza tornare a guardare le carte grezze.
 *
 * Modulo **puro**: nessun DOM, nessun IndexedDB, nessuna `fetch`. Riceve dati e
 * restituisce dati, per poter essere testato senza browser.
 *
 * @module engine/analisi
 */

import { normalizzaNome } from './nomi.js';
import { classifica, CATEGORIA, eBase } from './stadi.js';
import { conteggioEnergie } from '../data/energie.js';

/**
 * Profondità massima nella risalita di una catena evolutiva.
 *
 * Non esistono linee più lunghe di tre, ma il dataset è dato esterno: un ciclo
 * (A evolve da B, B evolve da A) manderebbe la risalita in loop infinito e
 * bloccherebbe la pagina. Meglio un tetto che una scommessa.
 */
const PROFONDITA_MASSIMA = 10;

/**
 * @typedef {object} VoceCollezione
 * @property {object} carta carta del dataset
 * @property {number} quantita copie possedute
 */

/**
 * @typedef {object} LineaEvolutiva
 * @property {string} radice nome della carta iniziale della linea
 * @property {boolean} radicePosseduta se la carta iniziale è in collezione
 * @property {VoceCollezione[][]} livelli voci per livello: `[0]` Base, `[1]`
 *   Livello 1, `[2]` Livello 2
 * @property {string[]} mancanti nomi delle pre-evoluzioni assenti **di cui si
 *   conosce il nome**
 * @property {number} anelliMancanti quante carte servirebbero per completare la
 *   linea fino al Base. Può essere maggiore di `mancanti.length`: possedendo
 *   solo un Livello 2 si sa che mancano due anelli, ma il nome è noto solo per
 *   il primo, perché `evolveDa` della carta non posseduta non è leggibile
 * @property {boolean} giocabile se la linea ha almeno un Pokémon Base
 * @property {number} copie copie totali di tutta la linea
 */

/**
 * Indicizza le voci per nome normalizzato.
 * @param {VoceCollezione[]} voci
 * @returns {Map<string, VoceCollezione[]>}
 */
function perNome(voci) {
  const indice = new Map();
  for (const voce of voci) {
    if (voce.carta?.categoria !== 'Pokémon') continue;
    const chiave = normalizzaNome(voce.carta.nome);
    if (!indice.has(chiave)) indice.set(chiave, []);
    indice.get(chiave).push(voce);
  }
  return indice;
}

/**
 * Risale la catena evolutiva a partire da una carta, fin dove le carte
 * possedute lo consentono.
 *
 * Limite intrinseco: `evolveDa` dà solo un **nome**. Se la pre-evoluzione non è
 * in collezione non si può sapere da cosa evolvesse a sua volta, quindi la
 * risalita si ferma lì. Non è un problema: per il generatore basta sapere quale
 * carta manca, e lo stadio dichiarato dice già quanti anelli mancano in tutto.
 *
 * @param {object} carta
 * @param {Map<string, VoceCollezione[]>} indice
 * @returns {{radice: string, radicePosseduta: boolean, mancanti: string[]}}
 */
function risali(carta, indice) {
  const mancanti = [];
  let corrente = carta;
  const visitati = new Set([normalizzaNome(carta.nome)]);

  for (let passo = 0; passo < PROFONDITA_MASSIMA; passo++) {
    const precedente = corrente.evolveDa;
    if (!precedente) {
      return { radice: corrente.nome, radicePosseduta: true, mancanti };
    }

    const chiave = normalizzaNome(precedente);
    if (visitati.has(chiave)) break; // ciclo nei dati: ci si ferma
    visitati.add(chiave);

    const possedute = indice.get(chiave);
    if (!possedute?.length) {
      // La pre-evoluzione manca: è qui che nasce un orfano.
      mancanti.push(precedente);
      return { radice: precedente, radicePosseduta: false, mancanti };
    }
    corrente = possedute[0].carta;
  }

  return { radice: corrente.nome, radicePosseduta: true, mancanti };
}

/**
 * Raggruppa le carte possedute in linee evolutive.
 *
 * @param {VoceCollezione[]} voci
 * @param {{ammettiEsotici?: boolean}} [opzioni]
 * @returns {LineaEvolutiva[]} ordinate dalla linea più numerosa
 * @example
 * costruisciLinee([
 *   { carta: { nome: 'Zweilous', categoria: 'Pokémon', stadio: 'Livello 1', evolveDa: 'Deino' }, quantita: 4 },
 * ]);
 * // → una linea con radice 'Deino', radicePosseduta false, giocabile false
 */
export function costruisciLinee(voci, opzioni = {}) {
  const indice = perNome(voci);
  /** @type {Map<string, LineaEvolutiva>} */
  const linee = new Map();

  for (const voce of voci) {
    const { carta } = voce;
    if (carta?.categoria !== 'Pokémon') continue;

    const info = classifica(carta);
    if (info.categoria === CATEGORIA.ESOTICO && !opzioni.ammettiEsotici) continue;
    if (info.livello === null) continue;

    const { radice, radicePosseduta, mancanti } = risali(carta, indice);
    const chiave = normalizzaNome(radice);

    if (!linee.has(chiave)) {
      linee.set(chiave, {
        radice,
        radicePosseduta,
        livelli: [[], [], []],
        mancanti: [],
        giocabile: false,
        copie: 0,
      });
    }

    const linea = linee.get(chiave);
    linea.livelli[info.livello].push(voce);
    linea.copie += voce.quantita;
    for (const nome of mancanti) {
      if (!linea.mancanti.some((m) => normalizzaNome(m) === normalizzaNome(nome))) {
        linea.mancanti.push(nome);
      }
    }
    if (eBase(carta)) linea.giocabile = true;
  }

  // Quanti anelli mancano davvero. Il livello più basso posseduto dice quanti
  // gradini ci sono sotto: chi ha solo un Livello 2 deve procurarsi sia il
  // Livello 1 sia il Base, anche se il nome noto è uno solo.
  for (const linea of linee.values()) {
    const piuBasso = linea.livelli.findIndex((v) => v.length > 0);
    linea.anelliMancanti = piuBasso <= 0 ? 0 : piuBasso;
  }

  return [...linee.values()].sort((a, b) => b.copie - a.copie);
}

/**
 * I Pokémon orfani: evoluzioni possedute senza la loro pre-evoluzione.
 *
 * Sono il caso che il progetto deve risolvere. Senza la pre-evoluzione la carta
 * è **ingiocabile** con le regole standard, e servirà una regola della casa
 * ("le Livello 1 selezionate si giocano come Base") oppure un proxy.
 *
 * @param {VoceCollezione[]} voci
 * @param {{ammettiEsotici?: boolean}} [opzioni]
 * @returns {Array<{voce: VoceCollezione, manca: string}>}
 */
export function trovaOrfani(voci, opzioni = {}) {
  const indice = perNome(voci);
  const orfani = [];

  for (const voce of voci) {
    const { carta } = voce;
    if (carta?.categoria !== 'Pokémon' || !carta.evolveDa) continue;

    const info = classifica(carta);
    if (info.categoria === CATEGORIA.ESOTICO && !opzioni.ammettiEsotici) continue;

    const possedute = indice.get(normalizzaNome(carta.evolveDa));
    if (!possedute?.length) orfani.push({ voce, manca: carta.evolveDa });
  }

  return orfani;
}

/**
 * Analisi completa della collezione.
 *
 * @param {VoceCollezione[]} voci righe di collezione con i dati di carta
 * @param {{ammettiEsotici?: boolean}} [opzioni]
 * @returns {object} il quadro completo, pronto per il generatore
 */
export function analizza(voci, opzioni = {}) {
  const valide = (voci ?? []).filter((v) => v?.carta);

  const linee = costruisciLinee(valide, opzioni);
  const orfani = trovaOrfani(valide, opzioni);

  const pokemon = valide.filter((v) => v.carta.categoria === 'Pokémon');
  const allenatori = valide.filter((v) => v.carta.categoria === 'Allenatore');
  const esotici = pokemon.filter((v) => classifica(v.carta).categoria === CATEGORIA.ESOTICO);
  const ignoti = pokemon.filter((v) => classifica(v.carta).categoria === CATEGORIA.IGNOTO);

  const perTipo = {};
  let basiGiocabili = 0;
  for (const voce of pokemon) {
    if (classifica(voce.carta).categoria === CATEGORIA.ESOTICO && !opzioni.ammettiEsotici) continue;
    for (const tipo of voce.carta.tipi ?? []) {
      perTipo[tipo] = (perTipo[tipo] ?? 0) + voce.quantita;
    }
    if (eBase(voce.carta)) basiGiocabili += voce.quantita;
  }

  const energie = conteggioEnergie(valide);

  return {
    linee,
    orfani,
    energie,
    perTipo,
    /** Copie di Pokémon Base: se è 0 non si può costruire nessun mazzo legale. */
    basiGiocabili,
    conteggi: {
      pokemon: pokemon.reduce((s, v) => s + v.quantita, 0),
      allenatori: allenatori.reduce((s, v) => s + v.quantita, 0),
      energie: energie.totaleBase + energie.totaleSpeciali,
      esotici: esotici.reduce((s, v) => s + v.quantita, 0),
      ignoti: ignoti.reduce((s, v) => s + v.quantita, 0),
    },
    /** Tipi ordinati per quantità: il generatore ci sceglie il tipo del mazzo. */
    tipiPromettenti: Object.entries(perTipo)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, copie]) => ({ tipo, copie, energie: energie.perTipo[tipo] ?? 0 })),
    avvisi: costruisciAvvisi({ basiGiocabili, orfani, energie, esotici, ignoti }),
  };
}

/**
 * Problemi che impedirebbero di generare mazzi sensati.
 *
 * Vengono segnalati qui e non lasciati emergere come mazzi strani più tardi:
 * un motore che tace e produce risultati assurdi è peggio di uno che spiega.
 *
 * @param {object} dati
 * @returns {Array<{codice: string, messaggio: string}>}
 */
function costruisciAvvisi({ basiGiocabili, orfani, energie, esotici, ignoti }) {
  const avvisi = [];

  if (basiGiocabili === 0) {
    avvisi.push({
      codice: 'nessun-base',
      messaggio:
        'Nessun Pokémon Base in collezione: con le regole standard non si può ' +
        'iniziare la partita. Servirà una regola della casa o un proxy.',
    });
  }
  if (energie.totaleBase === 0) {
    avvisi.push({
      codice: 'nessuna-energia',
      messaggio:
        'Nessuna Energia base: i Pokémon non potrebbero attaccare. ' +
        'Aggiungile dal pannello "Energie base" o attiva i proxy Energia.',
    });
  }
  if (orfani.length) {
    const nomi = [...new Set(orfani.map((o) => o.manca))];
    avvisi.push({
      codice: 'orfani',
      messaggio:
        `${orfani.length} carte evolute non hanno la loro pre-evoluzione ` +
        `(mancano: ${nomi.slice(0, 5).join(', ')}${nomi.length > 5 ? '…' : ''}).`,
    });
  }
  if (energie.senzaTipo) {
    avvisi.push({
      codice: 'energie-senza-tipo',
      messaggio: `${energie.senzaTipo} Energie base di tipo non riconosciuto: verranno ignorate.`,
    });
  }
  if (esotici.length) {
    avvisi.push({
      codice: 'esotici-esclusi',
      messaggio:
        `${esotici.length} carte con stadi speciali (VMAX, V ASTRO, MEGA…) ` +
        'sono escluse dai mazzi: hanno regole troppo complesse per una partita in famiglia.',
    });
  }
  if (ignoti.length) {
    avvisi.push({
      codice: 'stadio-ignoto',
      messaggio: `${ignoti.length} Pokémon senza stadio dichiarato nei dati: esclusi per prudenza.`,
    });
  }

  return avvisi;
}
