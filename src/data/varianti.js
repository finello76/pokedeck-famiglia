/**
 * Le finiture di una carta: normale, holo, reverse holo.
 *
 * La stessa carta esce in stampe diverse — la comune opaca, quella con
 * l'illustrazione lucida (*holo*), quella col fondo lucido tutt'intorno
 * (*reverse holo*) — e per chi colleziona non sono la stessa carta: cambiano il
 * valore e cambiano cosa manca al raccoglitore. Fino a ieri l'app contava
 * copie e basta, quindi tre Pikachu erano tre Pikachu.
 *
 * ## Perché un campo in più e non tre righe
 *
 * La tentazione era una riga per finitura (`sv08:118:reverse`). Sarebbe stato
 * un terremoto: `idSet:numero` è la chiave con cui tutto il resto dell'app
 * riconosce una carta — le mancanti, i desideri, il cuore dei preferiti, i
 * prezzi, il motore che costruisce i mazzi — e all'improvviso la stessa carta
 * sarebbe stata due o tre righe, con due cuori e tre desideri possibili.
 *
 * Invece la riga resta una e `quantita` resta **il totale**: chi non sa niente
 * di finiture continua a leggere il numero giusto. Le finiture speciali si
 * contano a parte, in `varianti: { holo, reverse }`, e le normali sono ciò che
 * resta — non si scrivono, come `desiderata` non si scrive sulle carte che hai.
 * Nessuna migrazione dello store, e i file esportati prima continuano a
 * rileggersi: una riga senza `varianti` è una riga di sole copie normali.
 *
 * Modulo **puro**: nessun database, nessun DOM. Il conto si fa qui e si scrive
 * in `data/collezione.js`.
 *
 * @module data/varianti
 */

/**
 * Le tre finiture, nell'ordine in cui compaiono nei comandi.
 *
 * `normale` c'è nell'elenco anche se non si scrive mai nel database: è la
 * scelta predefinita di ogni comando, e un elenco che non la contiene
 * costringerebbe ogni schermata a riaggiungerla a mano.
 *
 * @type {Array<{codice: string, etichetta: string, sigla: string}>}
 */
export const VARIANTI = [
  { codice: 'normale', etichetta: 'Normale', sigla: '' },
  { codice: 'holo', etichetta: 'Holo', sigla: 'H' },
  { codice: 'reverse', etichetta: 'Reverse', sigla: 'R' },
];

/** Le finiture che si scrivono davvero sulla riga. */
const SPECIALI = ['holo', 'reverse'];

/** @param {unknown} n @returns {number} un intero ≥ 0, comunque arrivi */
const intero = (n) => {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/**
 * Quante copie per finitura, a partire da una riga di collezione.
 *
 * **Il totale comanda.** I conteggi per finitura possono arrivare da un file
 * importato o da una versione futura, e sommare più del totale: in quel caso si
 * tagliano invece di far comparire copie che la riga non dichiara. Il contrario
 * — meno del totale — è normale e vuol dire che le altre sono normali.
 *
 * @param {{quantita?: number, varianti?: {holo?: number, reverse?: number}}|null} riga
 * @returns {{normale: number, holo: number, reverse: number}}
 * @example
 * ripartizione({ quantita: 3, varianti: { reverse: 2 } });
 * // → { normale: 1, holo: 0, reverse: 2 }
 */
export function ripartizione(riga) {
  const totale = intero(riga?.quantita);
  const holo = Math.min(intero(riga?.varianti?.holo), totale);
  const reverse = Math.min(intero(riga?.varianti?.reverse), totale - holo);
  return { normale: totale - holo - reverse, holo, reverse };
}

/**
 * La riga aggiornata dopo aver aggiunto o tolto copie di una finitura.
 *
 * Togliere è il caso interessante. Il `−` della griglia non sa di finiture e
 * chiede sempre "normale": se di normali non ce ne sono più, togliere zero
 * copie sarebbe un pulsante che non fa niente. Quindi si prende da dove c'è,
 * in un ordine dichiarato — prima la finitura chiesta, poi le normali, poi
 * reverse, infine holo — così l'holo, che è la più preziosa, è l'ultima ad
 * andarsene.
 *
 * @param {{quantita?: number, varianti?: object}|null} riga com'è adesso
 * @param {string} variante uno dei codici di `VARIANTI`
 * @param {number} delta copie da aggiungere (negativo per togliere)
 * @returns {{quantita: number, varianti: {holo?: number, reverse?: number}|null}}
 *   `varianti` è `null` quando restano solo copie normali: così la riga scritta
 *   torna identica a quelle di prima di questa funzione.
 * @example
 * applica({ quantita: 1 }, 'reverse', 1);   // → { quantita: 2, varianti: { reverse: 1 } }
 * applica({ quantita: 2, varianti: { reverse: 1 } }, 'normale', -1);
 * // → { quantita: 1, varianti: { reverse: 1 } }
 */
export function applica(riga, variante, delta = 1) {
  const conti = ripartizione(riga);
  const chiesta = conti[variante] === undefined ? 'normale' : variante;

  if (delta > 0) {
    conti[chiesta] += Math.floor(delta);
  } else {
    let daTogliere = Math.floor(-delta);
    for (const dove of [chiesta, 'normale', 'reverse', 'holo']) {
      if (daTogliere <= 0) break;
      const preso = Math.min(conti[dove], daTogliere);
      conti[dove] -= preso;
      daTogliere -= preso;
    }
  }

  const varianti = {};
  for (const codice of SPECIALI) {
    if (conti[codice] > 0) varianti[codice] = conti[codice];
  }

  return {
    quantita: conti.normale + conti.holo + conti.reverse,
    varianti: Object.keys(varianti).length ? varianti : null,
  };
}

/**
 * Le finiture speciali di una riga, pronte da stampare: `[{sigla, quante}]`.
 *
 * Vuoto quando sono tutte normali, che è il caso più frequente: chi disegna una
 * card non deve chiedersi se c'è qualcosa da mostrare, gli basta che l'elenco
 * sia vuoto.
 *
 * @param {{quantita?: number, varianti?: object}|null} riga
 * @returns {Array<{codice: string, sigla: string, etichetta: string, quante: number}>}
 * @example
 * segniVarianti({ quantita: 3, varianti: { reverse: 2 } });
 * // → [{ codice: 'reverse', sigla: 'R', etichetta: 'Reverse', quante: 2 }]
 */
export function segniVarianti(riga) {
  const conti = ripartizione(riga);
  return VARIANTI.filter((v) => SPECIALI.includes(v.codice) && conti[v.codice] > 0).map((v) => ({
    ...v,
    quante: conti[v.codice],
  }));
}
