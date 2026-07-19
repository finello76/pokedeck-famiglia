/**
 * Quante carte di ciascun tipo deve avere un mazzo.
 *
 * Il punto di partenza è la proporzione classica del TCG (circa un terzo
 * Pokémon, un terzo Energie, un terzo Allenatori), ma **è solo un punto di
 * partenza**: una collezione di famiglia non ha quasi mai abbastanza Allenatori,
 * e insistere sulle proporzioni ideali produrrebbe mazzi impossibili.
 *
 * Modulo puro.
 *
 * @module engine/proporzioni
 */

/**
 * Taglia del mazzo per livello di difficoltà.
 * @type {Record<string, number>}
 */
export const TAGLIE = {
  bambini: 15,
  facile: 20,
  intermedio: 30,
  standard: 60,
};

/** Quota ideale, prima di scontrarsi con la realtà. */
const IDEALE = { pokemon: 1 / 3, energie: 1 / 3, allenatori: 1 / 3 };

/**
 * Minimo di Pokémon Base perché la mano iniziale ne contenga quasi certamente uno.
 *
 * Con un mazzo da 15 e una mano da 5, avere 4 Base dà circa l'80% di probabilità
 * di aprirne almeno uno. Sotto quella soglia si passa il primo turno a rimescolare,
 * che per un bambino è il modo più veloce per annoiarsi.
 *
 * @param {number} taglia
 * @returns {number}
 */
export function minimoBasi(taglia) {
  return Math.max(2, Math.round(taglia * 0.25));
}

/**
 * Calcola la composizione di un mazzo adattandola a ciò che c'è davvero.
 *
 * L'algoritmo: si parte dalle quote ideali, si tagliano a quanto è disponibile,
 * e la parte che avanza viene redistribuita. La redistribuzione **non è
 * proporzionale**: privilegia le Energie, perché un mazzo con pochi Pokémon si
 * gioca male ma un mazzo senza abbastanza Energie non si gioca affatto.
 *
 * @param {number} taglia carte totali del mazzo
 * @param {{pokemon: number, energie: number, allenatori: number}} disponibili
 *   copie utilizzabili da **questo** mazzo (già divise fra i mazzi)
 * @returns {{pokemon: number, energie: number, allenatori: number, mancanti: number}}
 *   `mancanti` è quanto non si riesce a riempire in nessun modo
 * @example
 * // 5 allenatori richiesti ma solo 2 disponibili: i 3 slot vanno alle energie
 * composizione(15, { pokemon: 8, energie: 9, allenatori: 2 });
 * // → { pokemon: 5, energie: 8, allenatori: 2, mancanti: 0 }
 */
export function composizione(taglia, disponibili) {
  const quota = {
    pokemon: Math.round(taglia * IDEALE.pokemon),
    energie: Math.round(taglia * IDEALE.energie),
    allenatori: taglia - Math.round(taglia * IDEALE.pokemon) - Math.round(taglia * IDEALE.energie),
  };

  const esito = {
    pokemon: Math.min(quota.pokemon, disponibili.pokemon ?? 0),
    energie: Math.min(quota.energie, disponibili.energie ?? 0),
    allenatori: Math.min(quota.allenatori, disponibili.allenatori ?? 0),
  };

  // Gli slot rimasti scoperti vanno a chi ha ancora scorte, energie per prime.
  let avanzo = taglia - esito.pokemon - esito.energie - esito.allenatori;
  for (const categoria of ['energie', 'pokemon', 'allenatori']) {
    if (avanzo <= 0) break;
    const spazio = (disponibili[categoria] ?? 0) - esito[categoria];
    const preso = Math.min(avanzo, Math.max(0, spazio));
    esito[categoria] += preso;
    avanzo -= preso;
  }

  return { ...esito, mancanti: Math.max(0, avanzo) };
}

/**
 * Divide le scorte comuni fra i mazzi da generare.
 *
 * Serve perché le carte sono fisiche: due mazzi non possono contenere la stessa
 * copia. Ogni mazzo può contare al più sulla sua fetta.
 *
 * @param {{pokemon: number, energie: number, allenatori: number}} totali
 * @param {number} numeroMazzi
 * @returns {{pokemon: number, energie: number, allenatori: number}}
 */
export function fettaPerMazzo(totali, numeroMazzi) {
  const n = Math.max(1, numeroMazzi);
  return {
    pokemon: Math.floor((totali.pokemon ?? 0) / n),
    energie: Math.floor((totali.energie ?? 0) / n),
    allenatori: Math.floor((totali.allenatori ?? 0) / n),
  };
}

/**
 * Piramide evolutiva consigliata per una linea, scalata alla taglia del mazzo.
 *
 * La forma classica è 3 Base / 2 Livello 1 / 1 Livello 2: servono più copie in
 * basso perché la linea parte sempre dal Base, e le evoluzioni sono inutili se
 * non si pesca prima ciò da cui evolvono.
 *
 * @param {number} taglia
 * @returns {[number, number, number]} copie consigliate per livello
 * @example
 * piramide(60); // [3, 2, 1]
 * piramide(15); // [2, 1, 1]
 */
export function piramide(taglia) {
  if (taglia >= 40) return [3, 2, 1];
  if (taglia >= 25) return [3, 2, 1];
  if (taglia >= 18) return [2, 2, 1];
  return [2, 1, 1];
}
