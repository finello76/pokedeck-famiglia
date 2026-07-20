/**
 * Casualità riproducibile.
 *
 * Il generatore di mazzi deve dare risultati **diversi a ogni giro** (altrimenti
 * "rigenera" non serve a nulla) ma anche **riproducibili**: un mazzo salvato
 * dev'essere lo stesso quando lo si riapre, e i test devono poter contare su un
 * risultato stabile. Le due cose stanno insieme solo se il caso ha un seme.
 *
 * Per questo il motore non chiama mai `Math.random()`: resterebbe impuro e
 * intestabile. Riceve un seme dall'esterno e da lì ricava tutta la sequenza.
 *
 * L'algoritmo è mulberry32: poche righe, distribuzione più che sufficiente per
 * scegliere fra carte Pokémon, e nessuna dipendenza.
 *
 * Modulo puro.
 *
 * @module engine/casuale
 */

export class Casuale {
  /** @type {number} stato interno, avanza a ogni estrazione */
  #stato;

  /**
   * @param {number} [seme=1] due istanze con lo stesso seme danno la stessa
   *   sequenza. Il default fisso serve ai test: chi vuole varietà passa un seme
   *   diverso a ogni generazione
   */
  constructor(seme = 1) {
    // `>>> 0` forza a intero senza segno a 32 bit: senza, un seme come
    // Date.now() (che supera i 32 bit) farebbe degenerare la sequenza.
    this.#stato = (Number(seme) || 1) >>> 0;
  }

  /**
   * Il prossimo numero della sequenza.
   * @returns {number} in [0, 1)
   */
  prossimo() {
    this.#stato = (this.#stato + 0x6d2b79f5) >>> 0;
    let t = this.#stato;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Un intero in [0, quanti).
   * @param {number} quanti
   * @returns {number}
   */
  intero(quanti) {
    return Math.floor(this.prossimo() * Math.max(1, quanti));
  }

  /**
   * Copia mescolata di un array (Fisher-Yates). Non tocca l'originale.
   * @template T
   * @param {T[]} elementi
   * @returns {T[]}
   */
  mescola(elementi) {
    const copia = [...elementi];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = this.intero(i + 1);
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  /**
   * Sceglie fra i candidati **quasi a pari merito**, non sempre il migliore.
   *
   * È il cuore della varietà fra una generazione e l'altra: prendere sempre il
   * massimo rende il risultato identico ogni volta, prendere a caso produce
   * mazzi scadenti. Si estrae quindi fra quelli entro `tolleranza` punti dal
   * migliore, che sono scelte altrettanto sensate.
   *
   * @template {{punteggio: number}} T
   * @param {T[]} candidati già ordinati per punteggio decrescente
   * @param {number} [tolleranza=25] distanza massima dal migliore
   * @returns {T|undefined}
   * @example
   * // fra 150, 148, 130 con tolleranza 25 si estrae fra i primi due
   * casuale.scegli(candidati, 25);
   */
  scegli(candidati, tolleranza = 25) {
    if (!candidati.length) return undefined;
    const migliore = candidati[0].punteggio;
    const ammessi = candidati.filter((c) => migliore - c.punteggio <= tolleranza);
    return ammessi[this.intero(ammessi.length)];
  }
}
