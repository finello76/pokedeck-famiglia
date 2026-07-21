/**
 * Che cosa non ha funzionato nei mazzi generati.
 *
 * Sta in un modulo suo perché ha due chiamanti e due momenti diversi: subito
 * dopo la generazione, e di nuovo dopo che i mazzi sono stati modificati a
 * mano o completati dalle Energie proxy. Il foglio delle regole della casa
 * descrive i mazzi CORRENTI, quindi le carenze vanno rimisurate, non ricordate.
 *
 * Modulo puro.
 *
 * @module engine/carenze
 */

import { classifica, eBase } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { tipoEnergia, eEnergiaBase } from '../data/energie.js';
import { minimoBasi } from './proporzioni.js';

/**
 * Che cosa non ha funzionato, in forma utilizzabile dal motore delle regole.
 *
 * Ogni carenza è un fatto misurato, non un giudizio: sarà il motore delle regole
 * a decidere quale regola della casa attivare, e il foglio stampato a spiegarne
 * il perché.
 *
 * @param {Mazzo[]} mazzi
 * @param {number} taglia
 * @param {object} analisi
 * @param {object} [permessi] deroghe già concesse. Servono a **misurare
 *   diversamente**, non a nascondere: con le evoluzioni giocabili come Base il
 *   conteggio dei Base cambia davvero. Una carenza però non va mai soppressa
 *   perché una regola la risolve, o quella regola sparirebbe dal foglio
 * @returns {Array<{codice: string, mazzo?: string, dati: object}>}
 */
export function rilevaCarenze(mazzi, taglia, analisi, permessi = {}) {
  const carenze = [];

  for (const mazzo of mazzi) {
    if (mazzo.totale < taglia) {
      carenze.push({
        codice: 'mazzo-incompleto',
        mazzo: mazzo.nome,
        dati: { previste: taglia, effettive: mazzo.totale },
      });
    }
    // Con la deroga attiva, le evoluzioni orfane si giocano dalla mano: a tutti
    // gli effetti sono Base, e vanno contate come tali.
    const basi = mazzo.carte
      .filter(
        (c) =>
          eBase(c.carta) ||
          (permessi.evoluzioniComeBase && (classifica(c.carta).livello ?? 0) > 0),
      )
      .reduce((s, c) => s + c.quantita, 0);
    if (basi < minimoBasi(mazzo.totale || taglia)) {
      carenze.push({
        codice: 'poche-basi',
        mazzo: mazzo.nome,
        dati: { basi, consigliate: minimoBasi(mazzo.totale || taglia) },
      });
    }
    const energie = mazzo.composizione.energie;
    if (energie < Math.round((mazzo.totale || taglia) / 4)) {
      carenze.push({
        codice: 'poche-energie',
        mazzo: mazzo.nome,
        dati: { energie, tipi: mazzo.tipi },
      });
    }
    // Evoluzioni finite nel mazzo senza la loro pre-evoluzione. Vanno elencate
    // per nome: la regola "le Livello 1 selezionate si giocano come Base" deve
    // poter dire QUALI carte, altrimenti sul foglio stampato è inapplicabile.
    const nomiMazzo = new Set(mazzo.carte.map((c) => normalizzaNome(c.carta.nome)));
    const orfaniQui = mazzo.carte
      .filter((c) => {
        const livello = classifica(c.carta).livello ?? 0;
        if (livello === 0) return false;
        return !c.carta.evolveDa || !nomiMazzo.has(normalizzaNome(c.carta.evolveDa));
      })
      .map((c) => ({
        nome: c.carta.nome,
        manca: c.carta.evolveDa ?? null,
        stadio: c.carta.stadio,
      }));
    if (orfaniQui.length) {
      carenze.push({ codice: 'orfani-nel-mazzo', mazzo: mazzo.nome, dati: { orfani: orfaniQui } });
    }

    // Energie di tipo diverso da quello del mazzo: senza una regola della casa
    // sono carte che non si possono usare.
    const fuoriTipo = mazzo.carte
      .filter((c) => eEnergiaBase(c.carta) && !mazzo.tipi.includes(tipoEnergia(c.carta)))
      .reduce((s, c) => s + c.quantita, 0);
    // NON si sopprime quando la regola "energia universale" è già attiva: la
    // carenza è un fatto misurato, e sopprimerla farebbe sparire dal foglio
    // stampato proprio la regola che la risolve. Il giocatore si troverebbe
    // energie fuori tipo e nessuna regola che le autorizza.
    if (fuoriTipo > 0) {
      carenze.push({
        codice: 'energie-fuori-tipo',
        mazzo: mazzo.nome,
        dati: { fuoriTipo, tipi: mazzo.tipi },
      });
    }
  }

  if (analisi.orfani.length) {
    carenze.push({
      codice: 'orfani-in-collezione',
      dati: { quanti: analisi.orfani.length, nomi: [...new Set(analisi.orfani.map((o) => o.manca))] },
    });
  }

  return carenze;
}
