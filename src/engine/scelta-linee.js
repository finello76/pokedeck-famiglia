/**
 * Scelta dei Pokémon per linea evolutiva, non per singola carta.
 *
 * È la differenza fra un mazzo che si gioca e uno che sta in mano. Scegliendo
 * una carta per volta, ogni Pokémon Base ancora disponibile batte qualunque
 * evoluzione — essere giocabile dalla mano vale più che completare una linea —
 * e la quota Pokémon si riempie di sole Basi: il mazzo non evolve mai. È il
 * difetto che questo modulo esiste per correggere.
 *
 * Qui l'unità di scelta è il **gruppo**: una carta giocabile dalla mano con le
 * sue evoluzioni disponibili. Il generatore sceglie un gruppo e ne prende i
 * pezzi secondo la piramide (più Base che evoluzioni), così le linee entrano
 * nel mazzo intere invece che a pezzi.
 *
 * Modulo puro.
 *
 * @module engine/scelta-linee
 */

import { classifica } from './stadi.js';
import { normalizzaNome } from './nomi.js';

/**
 * @typedef {object} Gruppo
 * @property {object} radice la carta che si gioca dalla mano (una Base, oppure
 *   un'evoluzione orfana quando la deroga lo consente)
 * @property {object[][]} livelli carte per livello: `[0]` la radice, `[1]` e
 *   `[2]` le evoluzioni disponibili in dispensa
 * @property {number} profondita quanti livelli sono davvero popolati (1..3)
 * @property {boolean} orfana se la radice si gioca solo grazie a una deroga
 * @property {number} punteggio quanto conviene a questo mazzo
 */

/**
 * Costruisce i gruppi giocabili a partire dalle carte disponibili.
 *
 * @param {Array<{carta: object, disponibili: number}>} candidati dalla dispensa
 * @param {object} [permessi] deroghe attive (`evoluzioniComeBase`)
 * @returns {Gruppo[]} non ordinati: ci pensa `ordinaGruppi()`
 */
export function costruisciGruppi(candidati, permessi = {}) {
  // Indice delle evoluzioni per nome della carta da cui evolvono: serve a
  // ritrovare in un colpo solo i "figli" di ogni carta.
  const figliDi = new Map();
  for (const voce of candidati) {
    const da = normalizzaNome(voce.carta.evolveDa);
    if (!da) continue;
    if (!figliDi.has(da)) figliDi.set(da, []);
    figliDi.get(da).push(voce.carta);
  }

  const nomiDisponibili = new Set(candidati.map((v) => normalizzaNome(v.carta.nome)));

  const gruppi = [];
  for (const { carta } of candidati) {
    const livello = classifica(carta).livello;
    if (livello === null) continue; // stadio ignoto: non si sa come giocarlo

    // Una radice è ciò che si può mettere in gioco dalla mano. Un'evoluzione lo
    // diventa solo se è davvero orfana (la sua pre-evoluzione non è da nessuna
    // parte) e una regola della casa la promuove: se la pre-evoluzione c'è,
    // questa carta entrerà come figlia nel gruppo di quella, non per conto suo.
    const orfana = livello > 0;
    if (orfana) {
      if (!permessi.evoluzioniComeBase) continue;
      const preEvoluzioneDisponibile =
        Boolean(carta.evolveDa) && nomiDisponibili.has(normalizzaNome(carta.evolveDa));
      if (preEvoluzioneDisponibile) continue;
    }

    const livelli = [[carta], [], []];
    // Le evoluzioni si raccolgono risalendo di un gradino per volta: i figli
    // della radice, poi i figli dei figli. Oltre il Livello 2 non si va.
    let frontiera = [carta];
    for (let passo = 1; passo <= 2; passo++) {
      const prossima = [];
      for (const genitore of frontiera) {
        for (const figlio of figliDi.get(normalizzaNome(genitore.nome)) ?? []) {
          livelli[passo].push(figlio);
          prossima.push(figlio);
        }
      }
      frontiera = prossima;
      if (!frontiera.length) break;
    }

    gruppi.push({
      radice: carta,
      livelli,
      profondita: livelli.filter((l) => l.length).length,
      orfana,
      punteggio: 0,
    });
  }
  return gruppi;
}

/**
 * Ordina i gruppi per quanto convengono a un mazzo.
 *
 * Il criterio decisivo è la **profondità**: una linea che evolve vale più di
 * una carta isolata, ed è ciò che mancava scegliendo una carta per volta. Il
 * tipo del mazzo pesa comunque di più, perché una linea del tipo sbagliato non
 * si riesce ad alimentare con le energie disponibili.
 *
 * @param {Gruppo[]} gruppi
 * @param {string[]} tipi tipi del mazzo
 * @param {object} [permessi]
 * @param {number} [orfaniGia=0] deroghe già presenti nel mazzo
 * @param {Set<string>} [nomiInMazzo] nomi già nel mazzo, in forma normalizzata
 * @returns {Gruppo[]} nuovo array ordinato per punteggio decrescente
 */
export function ordinaGruppi(gruppi, tipi, permessi = {}, orfaniGia = 0, nomiInMazzo = new Set()) {
  const valutati = gruppi.map((g) => ({
    ...g,
    punteggio: punteggioGruppo(g, tipi, orfaniGia, nomiInMazzo),
  }));
  return valutati.sort((a, b) => b.punteggio - a.punteggio);
}

/**
 * @param {Gruppo} gruppo
 * @param {string[]} tipi
 * @param {number} orfaniGia
 * @param {Set<string>} nomiInMazzo
 * @returns {number}
 */
function punteggioGruppo(gruppo, tipi, orfaniGia, nomiInMazzo) {
  const { radice } = gruppo;
  let p = 0;

  if (tipi.some((t) => (radice.tipi ?? []).includes(t))) p += 100;

  // Linea già nel mazzo: si passa a un'altra. Senza questa penalità il gruppo
  // migliore resta il migliore anche dopo essere stato preso, e il mazzo
  // finisce per essere una sola linea ripetuta fino a riempire la quota. È una
  // penalità, non un divieto: se non c'è altro, ci si torna.
  if (nomiInMazzo.has(normalizzaNome(radice.nome))) p -= 70;

  // Ogni gradino in più della linea vale molto: è il motivo per cui esiste
  // questo modulo. Deve superare il vantaggio di una Base isolata, altrimenti
  // si torna a mazzi che non evolvono mai.
  p += 45 * (gruppo.profondita - 1);

  if (gruppo.orfana) {
    // La radice si gioca solo per deroga. Costa, per due motivi: un Livello 2
    // calato dalla mano è molto più forte di un Base vero, e concentrare le
    // deroghe in un mazzo solo sbilancia la partita.
    const livello = classifica(radice).livello ?? 1;
    p -= 35 * livello + 30 * orfaniGia;
  }

  p += Math.min(20, (radice.ps ?? 0) / 10);
  const danno = Math.max(0, ...(radice.attacchi ?? []).map((a) => Number(a.danno) || 0));
  const costo = Math.min(9, ...(radice.attacchi ?? []).map((a) => a.costo?.length || 9));
  p += Math.min(25, danno / 10) - costo * 2; // danno a buon mercato

  return p;
}

/**
 * Le carte da prendere da un gruppo, con quante copie, secondo la piramide.
 *
 * La piramide (es. 3 Base / 2 Livello 1 / 1 Livello 2) non è un vezzo: la linea
 * parte sempre dalla Base, e le evoluzioni sono carte morte se non si pesca
 * prima ciò da cui evolvono.
 *
 * Non tocca la dispensa né il mazzo: dice solo *cosa* prendere, e il chiamante
 * decide se ci sono le copie e lo spazio.
 *
 * @param {Gruppo} gruppo
 * @param {[number, number, number]} piramide copie consigliate per livello
 * @param {number} spazio quante carte Pokémon mancano ancora al mazzo
 * @returns {Array<{carta: object, quante: number}>} in ordine di gioco
 * @example
 * pezziDaPrendere(gruppo, [3, 2, 1], 10);
 * // → [{carta: Bulbasaur, quante: 3}, {carta: Ivysaur, quante: 2}]
 */
export function pezziDaPrendere(gruppo, piramide, spazio) {
  const pezzi = [];
  let restante = spazio;

  for (let livello = 0; livello < gruppo.livelli.length && restante > 0; livello++) {
    // Il budget è per LIVELLO, non per carta: possedere tre Livello 1 diversi
    // della stessa linea non deve far entrare sei carte al posto di due.
    let budget = piramide[livello] ?? 1;
    for (const carta of gruppo.livelli[livello]) {
      if (restante <= 0 || budget <= 0) break;
      const quante = Math.min(budget, restante);
      pezzi.push({ carta, quante });
      budget -= quante;
      restante -= quante;
    }
  }
  return pezzi;
}
