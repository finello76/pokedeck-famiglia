/**
 * Rimette in sesto le linee evolutive di un mazzo modificato a mano.
 *
 * Le carte da stampare non sono decorazioni: esistono **per** una carta
 * precisa. Sostituendo Dragapult con altro, i Dreepy e i Drakloak stampati per
 * lui restano nel mazzo a far numero — fotocopie per giocare una carta che non
 * c'è più. E se al suo posto entra un'altra evoluzione, quella si ritrova senza
 * i gradini sotto.
 *
 * Questo modulo ricalcola le stampe a partire da ciò che nel mazzo c'è
 * **adesso**: toglie quelle diventate inutili, aggiunge quelle che servono, e
 * rimette il mazzo alla sua taglia pescando dalle carte vere ancora libere.
 *
 * Modulo puro: riceve il mazzo e la disponibilità, non sa nulla di DOM né di
 * database.
 *
 * @module engine/riallinea
 */

import { enumeraLinee } from './linee.js';
import { classifica, SCALA } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { eEnergiaBase, tipoEnergia } from '../data/energie.js';
import { aggiungiAlMazzo, togliDalMazzo } from './mazzo.js';

/**
 * @typedef {object} EsitoRiallineamento
 * @property {string[]} tolti nomi delle carte stampate rimosse perché inutili
 * @property {string[]} stampati nomi delle carte stampate aggiunte
 * @property {string[]} reintegrati nomi delle carte vere entrate a riempire
 * @property {string[]} scoperti carte del mazzo rimaste senza pre-evoluzione
 */

/**
 * Ricalcola le carte da stampare di un mazzo e lo riporta alla sua taglia.
 *
 * Muta il mazzo ricevuto.
 *
 * @param {object} mazzo
 * @param {object} opzioni
 * @param {import('./dispensa.js').Dispensa} [opzioni.dispensa] copie vere ancora
 *   libere in collezione. Senza, il mazzo può restare corto: le stampe tolte
 *   liberano slot che solo una carta vera può riempire
 * @param {Record<string, string>} [opzioni.indiceEvoluzioni] nome normalizzato →
 *   pre-evoluzione
 * @param {number} [opzioni.budgetProxy=0] tetto di carte stampabili per il mazzo
 * @param {Set<string>} [opzioni.nonPokemon] pre-evoluzioni che sono Allenatore
 * @param {number} [opzioni.taglia] carte che il mazzo deve avere; se assente si
 *   usa il totale corrente
 * @returns {EsitoRiallineamento}
 * @example
 * // dopo una sostituzione a mano:
 * riallineaLinee(mazzo, { dispensa, indiceEvoluzioni, budgetProxy: 12, taglia: 30 });
 */
export function riallineaLinee(mazzo, opzioni = {}) {
  const {
    dispensa = null,
    indiceEvoluzioni = {},
    budgetProxy = 0,
    taglia = mazzo.totale,
    nonPokemon = new Set(),
  } = opzioni;

  const esito = { tolti: [], stampati: [], reintegrati: [], scoperti: [] };
  const servono = gradiniMancanti(mazzo, indiceEvoluzioni, nonPokemon);

  // 1. Via le stampe che non servono più a nessuno.
  for (const voce of [...mazzo.carte]) {
    if (!voce.proxy || voce.carta.categoria !== 'Pokémon') continue;
    if (servono.has(normalizzaNome(voce.carta.nome))) continue;
    esito.tolti.push(voce.carta.nome);
    togliDalMazzo(mazzo, voce, voce.quantita);
  }

  // 2. Le stampe che servono e non ci sono. Una copia per gradino: è il minimo
  //    che rende giocabile la linea, e il budget va diviso fra tutte.
  const presenti = new Set(nomiPokemon(mazzo));
  let stampate = copieStampate(mazzo);

  for (const [chiave, richiesta] of servono) {
    if (presenti.has(chiave)) continue;
    if (stampate >= budgetProxy || mazzo.totale >= taglia) {
      esito.scoperti.push(richiesta.perChi);
      continue;
    }
    const messe = aggiungiAlMazzo(mazzo, richiesta.carta, 1, {
      proxy: true,
      motivo: `Serve per giocare ${richiesta.perChi}.`,
    });
    if (messe > 0) {
      esito.stampati.push(richiesta.carta.nome);
      presenti.add(chiave);
      stampate += messe;
    }
  }

  // 3. Il mazzo torna alla sua taglia con carte vere: le stampe tolte hanno
  //    lasciato buchi, e un mazzo da 30 che ne conta 25 non si gioca.
  if (dispensa) reintegra(mazzo, dispensa, taglia, esito);

  return esito;
}

/**
 * I gradini che mancano alle carte vere presenti nel mazzo.
 *
 * Si riusa `enumeraLinee()`: ricostruisce la catena di ogni Pokémon e segna i
 * gradini senza carta. Qui i "posseduti" sono le carte vere del mazzo, quindi
 * un gradino senza carta è esattamente un gradino da stampare.
 *
 * @param {object} mazzo
 * @param {Record<string, string>} indiceEvoluzioni
 * @returns {Map<string, {carta: object, perChi: string}>} per nome normalizzato,
 *   in ordine di gioco (prima i gradini bassi)
 */
function gradiniMancanti(mazzo, indiceEvoluzioni, nonPokemon) {
  const reali = mazzo.carte
    .filter((c) => !c.proxy && c.carta.categoria === 'Pokémon')
    .map((c) => ({ carta: c.carta, disponibili: c.quantita }));

  const servono = new Map();
  for (const linea of enumeraLinee(reali, indiceEvoluzioni, nonPokemon)) {
    // Linea appoggiata sul vuoto: della sua base non si conosce il nome, non
    // c'è niente da stampare. La gestisce la regola della casa.
    if (linea.radiceOrfana) continue;
    for (const gradino of linea.gradini) {
      if (gradino.carta) continue;
      servono.set(normalizzaNome(gradino.nome), {
        carta: {
          nome: gradino.nome,
          categoria: 'Pokémon',
          stadio: SCALA[gradino.livello] ?? SCALA[0],
          tipi: linea.cima.tipi ?? [],
          evolveDa: gradino.evolveDa,
        },
        perChi: linea.cima.nome,
      });
    }
  }
  return servono;
}

/**
 * @param {object} mazzo
 * @returns {string[]} nomi normalizzati dei Pokémon nel mazzo, stampe comprese
 */
function nomiPokemon(mazzo) {
  return mazzo.carte
    .filter((c) => c.carta.categoria === 'Pokémon')
    .map((c) => normalizzaNome(c.carta.nome));
}

/**
 * @param {object} mazzo
 * @returns {number} copie stampate di Pokémon già presenti
 */
function copieStampate(mazzo) {
  return mazzo.carte
    .filter((c) => c.proxy && c.carta.categoria === 'Pokémon')
    .reduce((somma, c) => somma + c.quantita, 0);
}

/**
 * Riempie il mazzo fino alla taglia con carte vere ancora libere.
 *
 * L'ordine delle preferenze è quello del generatore: prima i Pokémon del tipo
 * del mazzo, poi le Energie del suo tipo, poi qualunque Allenatore. Non si
 * prendono evoluzioni: entrerebbero senza la loro linea, ed è il difetto che
 * tutto questo lavoro serve a evitare.
 *
 * @param {object} mazzo
 * @param {import('./dispensa.js').Dispensa} dispensa
 * @param {number} taglia
 * @param {EsitoRiallineamento} esito
 */
function reintegra(mazzo, dispensa, taglia, esito) {
  const delTipo = (c) => (c.tipi ?? []).some((t) => mazzo.tipi?.includes(t));
  const criteri = [
    (c) => c.categoria === 'Pokémon' && classifica(c).livello === 0 && delTipo(c),
    (c) => c.categoria === 'Pokémon' && classifica(c).livello === 0,
    (c) => eEnergiaBase(c) && mazzo.tipi?.includes(tipoEnergia(c)),
    (c) => c.categoria === 'Allenatore',
    (c) => c.categoria === 'Energia',
  ];

  for (const criterio of criteri) {
    while (mazzo.totale < taglia) {
      const candidati = dispensa.cerca(criterio);
      if (!candidati.length) break;
      const carta = candidati[0].carta;
      const prese = dispensa.preleva(carta, 1);
      const messe = aggiungiAlMazzo(mazzo, carta, prese);
      if (prese > messe) dispensa.restituisci(carta, prese - messe);
      // Il tetto delle 4 copie ha respinto tutto: si passa al criterio dopo,
      // o si resterebbe in ciclo sulla stessa carta.
      if (messe === 0) break;
      esito.reintegrati.push(carta.nome);
    }
  }
}
