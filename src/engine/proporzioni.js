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

/**
 * Quota del mazzo da riservare alle Energie, per unità di costo medio degli
 * attacchi.
 *
 * Da cui: attacchi che costano 2 → ~22% di Energie (13 carte su 60, la
 * proporzione dei mazzi veri); attacchi che costano 3 → ~33%.
 *
 * **Sta qui e la importa `forza.js`**, non il contrario, e non è un dettaglio
 * di organizzazione. Prima la costante viveva solo dentro `forza.js` mentre
 * `proporzioni.js` costruiva i mazzi con un terzo fisso di Energie: il
 * generatore e il misuratore seguivano due regole diverse sulla stessa cosa, e
 * ogni mazzo generato buttava via un quarto del proprio `motore` per
 * costruzione — circa 5 punti di forza, sempre, senza che nessuno sbagliasse
 * niente. Una regola sola, in un posto solo, è l'unico modo perché non
 * ricapiti.
 */
export const QUOTA_ENERGIE_PER_COSTO = 0.11;

/**
 * Limiti entro cui tenere la quota di Energie, qualunque cosa dicano i conti.
 *
 * Servono contro i dati strani: una collezione di sole carte senza costo
 * dichiarato darebbe una quota assurda, e un mazzo con il 5% o il 60% di
 * Energie non è giocabile in nessuno dei due sensi.
 */
// Il pavimento è **la quota di un attacco da una sola Energia**, non un numero
// scelto a parte: un costo medio sotto 1 non esiste (un costo è un elenco con
// almeno un elemento), quindi qui sotto ci si arriva solo con dati assenti — e
// in quel caso `composizione()` usa già la mediana come valore predefinito.
// Metterlo più in alto, come era all'inizio, avrebbe ricreato in piccolo lo
// stesso disaccordo che questa modifica elimina.
const ENERGIE_MIN = QUOTA_ENERGIE_PER_COSTO;
const ENERGIE_MAX = 0.4;

/** Quota dei Pokémon, prima di scontrarsi con la realtà. */
const QUOTA_POKEMON = 1 / 3;

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
  // Un quarto fino a 30 carte, un quinto oltre. Sopra le 30 la quota fissa
  // chiedeva 15 Base su 60 — i mazzi veri ne hanno 8-12 — e quei 3-4 slot in
  // più sono esattamente la differenza fra un mazzo con due linee evolutive
  // complete e uno con una sola. La probabilità di aprire regge lo stesso:
  // con 12 Base su 60 e una mano da 7 si parte l'80% delle volte.
  const quota = taglia > 30 ? 0.2 : 0.25;
  return Math.max(2, Math.round(taglia * quota));
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
 * @param {object} [opzioni]
 * @param {number} [opzioni.costoMedio=2] quanto costano in media gli attacchi
 *   delle carte con cui si sta costruendo, da `costoMedioAttacchi()`. Decide
 *   quante Energie servono: un mazzo di attacchi da una Energia ne vuole molte
 *   meno di uno di attacchi da tre. Il valore predefinito è la mediana del
 *   dataset
 * @returns {{pokemon: number, energie: number, allenatori: number, mancanti: number}}
 *   `mancanti` è quanto non si riesce a riempire in nessun modo
 * @example
 * // 5 allenatori richiesti ma solo 2 disponibili: i 3 slot vanno alle energie
 * composizione(15, { pokemon: 8, energie: 9, allenatori: 2 });
 * // → { pokemon: 5, energie: 8, allenatori: 2, mancanti: 0 }
 */
export function composizione(taglia, disponibili, opzioni = {}) {
  const costoMedio = opzioni.costoMedio ?? 2;
  const parteEnergie = Math.min(
    ENERGIE_MAX,
    Math.max(ENERGIE_MIN, costoMedio * QUOTA_ENERGIE_PER_COSTO),
  );
  const pokemon = Math.round(taglia * QUOTA_POKEMON);
  const energie = Math.round(taglia * parteEnergie);
  const quota = {
    pokemon,
    energie,
    // Gli Allenatori prendono ciò che resta, ed è voluto: nei mazzi veri sono
    // la parte più grande (30-38 su 60). Qui non ci arriveranno quasi mai —
    // una collezione di famiglia ne ha pochi — ma quando ci sono devono poter
    // riempire il mazzo invece di lasciare il posto a Energie che nessuno usa.
    allenatori: taglia - pokemon - energie,
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
 * piramide(60); // [4, 3, 2]
 * piramide(15); // [2, 1, 1]
 */
export function piramide(taglia) {
  // Il 60 vuole 4-3-2, la forma dei mazzi veri. Prima restituiva 3-2-1 come il
  // 30: in un mazzo doppio la stessa linea si pesca la metà delle volte, quindi
  // una linea non raddoppiata è una linea che quasi non entra in gioco. Il ramo
  // c'era già ma dava lo stesso risultato di quello sotto, cioè non faceva
  // niente.
  if (taglia >= 40) return [4, 3, 2];
  if (taglia >= 25) return [3, 2, 1];
  if (taglia >= 18) return [2, 2, 1];
  return [2, 1, 1];
}
