/**
 * La dispensa: le copie fisiche ancora disponibili mentre si costruiscono i mazzi.
 *
 * È il vincolo che rende questo problema diverso dal costruire un mazzo qualsiasi.
 * I mazzi non si pescano da un catalogo infinito ma da **una scatola di carte
 * vere**: se ci sono 4 Zweilous e il primo mazzo ne prende 3, al secondo ne
 * resta 1. Per questo i mazzi vanno generati insieme e non uno alla volta —
 * altrimenti il primo si prende tutto il meglio.
 *
 * Modulo puro, senza DOM né database.
 *
 * @module engine/dispensa
 */

import { normalizzaNome } from './nomi.js';

/**
 * Chiave di una carta nella dispensa.
 *
 * Si usa set + numero, non il nome: due Charizard di set diversi sono carte
 * fisiche distinte, con attacchi e PS diversi, e vanno contati separatamente.
 *
 * @param {object} carta
 * @returns {string}
 */
export function chiaveCarta(carta) {
  return `${carta.idSet ?? '?'}:${carta.numero ?? normalizzaNome(carta.nome)}`;
}

export class Dispensa {
  /** @type {Map<string, {carta: object, disponibili: number, iniziali: number}>} */
  #scorte = new Map();

  /**
   * @param {Array<{carta: object, quantita: number, idSet?: string}>} voci
   *   righe di collezione; `carta.idSet` viene copiato dalla voce se assente
   */
  constructor(voci = []) {
    for (const voce of voci) {
      if (!voce?.carta || voce.quantita <= 0) continue;
      const carta = { ...voce.carta, idSet: voce.carta.idSet ?? voce.idSet };
      const chiave = chiaveCarta(carta);
      const esistente = this.#scorte.get(chiave);
      if (esistente) {
        esistente.disponibili += voce.quantita;
        esistente.iniziali += voce.quantita;
      } else {
        this.#scorte.set(chiave, {
          carta,
          disponibili: voce.quantita,
          iniziali: voce.quantita,
        });
      }
    }
  }

  /**
   * Quante copie di questa carta restano.
   * @param {object} carta
   * @returns {number}
   */
  disponibili(carta) {
    return this.#scorte.get(chiaveCarta(carta))?.disponibili ?? 0;
  }

  /**
   * Preleva fino a `quante` copie, restituendo quante se ne sono davvero avute.
   *
   * Non lancia eccezioni se ce ne sono meno del richiesto: il generatore chiede
   * l'ideale e si adatta al reale, che è la situazione normale con una
   * collezione incompleta.
   *
   * @param {object} carta
   * @param {number} quante
   * @returns {number} copie effettivamente prelevate
   * @example
   * dispensa.preleva(zweilous, 3); // → 3 se ce ne sono almeno 3, meno altrimenti
   */
  preleva(carta, quante) {
    const scorta = this.#scorte.get(chiaveCarta(carta));
    if (!scorta || quante <= 0) return 0;
    const prese = Math.min(scorta.disponibili, Math.floor(quante));
    scorta.disponibili -= prese;
    return prese;
  }

  /**
   * Rimette in dispensa delle copie. Usata dal bilanciamento, che sposta carte
   * fra i mazzi e deve poter tornare sui propri passi.
   *
   * @param {object} carta
   * @param {number} quante
   * @returns {void}
   */
  restituisci(carta, quante) {
    const scorta = this.#scorte.get(chiaveCarta(carta));
    if (!scorta || quante <= 0) return;
    scorta.disponibili = Math.min(scorta.iniziali, scorta.disponibili + Math.floor(quante));
  }

  /**
   * Le carte ancora disponibili che soddisfano un criterio.
   *
   * @param {(carta: object, disponibili: number) => boolean} [criterio]
   * @returns {Array<{carta: object, disponibili: number}>}
   */
  cerca(criterio = () => true) {
    const esito = [];
    for (const { carta, disponibili } of this.#scorte.values()) {
      if (disponibili > 0 && criterio(carta, disponibili)) esito.push({ carta, disponibili });
    }
    return esito;
  }

  /** @returns {number} copie ancora disponibili in totale */
  get totaleDisponibile() {
    let totale = 0;
    for (const s of this.#scorte.values()) totale += s.disponibili;
    return totale;
  }

  /**
   * Copia indipendente della dispensa, per provare una strategia senza
   * intaccare lo stato corrente.
   * @returns {Dispensa}
   */
  clona() {
    const copia = new Dispensa();
    for (const [chiave, s] of this.#scorte) {
      copia.#scorte.set(chiave, { ...s });
    }
    return copia;
  }
}
