/**
 * Generazione dei mazzi.
 *
 * I mazzi si costruiscono **tutti insieme**, non uno dopo l'altro: pescano dalla
 * stessa scatola di carte fisiche, quindi generare il primo "al meglio" gli
 * farebbe prendere tutte le carte buone. Si procede a turni alternati, come in
 * un draft: ogni mazzo sceglie una carta per volta.
 *
 * Modulo puro: nessun DOM, nessun database.
 *
 * @module engine/generazione
 */

import { analizza } from './analisi.js';
import { Dispensa } from './dispensa.js';
import { classifica, eBase } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { tipoEnergia, eEnergiaBase } from '../data/energie.js';
import { composizione, fettaPerMazzo, minimoBasi, piramide } from './proporzioni.js';
import { Casuale } from './casuale.js';
import { costruisciGruppi, ordinaGruppi, pezziDaPrendere } from './scelta-linee.js';

/** Limite standard del TCG, che non vale per le Energie base. */
const MAX_COPIE = 4;

/**
 * @typedef {object} Mazzo
 * @property {string} nome etichetta leggibile
 * @property {string[]} tipi tipi su cui è centrato
 * @property {Array<{carta: object, quantita: number}>} carte
 * @property {number} totale carte effettive
 * @property {object} composizione quante Pokémon/Energie/Allenatori contiene
 */

/**
 * Aggiunge copie a un mazzo rispettando il limite delle 4 copie.
 *
 * Le Energie base sono esenti: è la regola ufficiale, ed è anche l'unica ragione
 * per cui un mazzo con poche carte diverse riesce comunque a stare in piedi.
 *
 * @param {Mazzo} mazzo
 * @param {object} carta
 * @param {number} quante
 * @returns {number} copie effettivamente aggiunte
 */
function aggiungi(mazzo, carta, quante) {
  const chiave = `${carta.idSet ?? '?'}:${carta.numero ?? normalizzaNome(carta.nome)}`;
  const esistente = mazzo.carte.find(
    (c) => `${c.carta.idSet ?? '?'}:${c.carta.numero ?? normalizzaNome(c.carta.nome)}` === chiave,
  );

  const gia = esistente?.quantita ?? 0;
  const tetto = eEnergiaBase(carta) ? Infinity : MAX_COPIE;
  const aggiungibili = Math.max(0, Math.min(quante, tetto - gia));
  if (aggiungibili === 0) return 0;

  if (esistente) esistente.quantita += aggiungibili;
  else mazzo.carte.push({ carta, quantita: aggiungibili });

  mazzo.totale += aggiungibili;
  return aggiungibili;
}

/**
 * Sceglie i tipi su cui centrare ogni mazzo.
 *
 * Il criterio non è "il tipo con più Pokémon" ma **il tipo che si può davvero
 * giocare**: un tipo con 5 Pokémon e 1 Energia produce un mazzo che non attacca.
 * Il punteggio pesa quindi le due cose insieme, penalizzando lo squilibrio.
 *
 * @param {object} analisi risultato di `analizza()`
 * @param {number} numeroMazzi
 * @returns {string[][]} un elenco di tipi per mazzo
 */
export function scegliTipi(analisi, numeroMazzi) {
  const candidati = analisi.tipiPromettenti
    .map((t) => ({
      tipo: t.tipo,
      // La media geometrica crolla se uno dei due fattori è zero: è
      // esattamente il comportamento voluto, perché un tipo senza energie o
      // senza Pokémon non è una scelta.
      punteggio: Math.sqrt(t.copie * t.energie),
      copie: t.copie,
      energie: t.energie,
    }))
    .sort((a, b) => b.punteggio - a.punteggio);

  const utilizzabili = candidati.filter((c) => c.punteggio > 0);
  const scelte = [];

  for (let i = 0; i < numeroMazzi; i++) {
    if (utilizzabili.length >= numeroMazzi) {
      scelte.push([utilizzabili[i].tipo]);
    } else if (utilizzabili.length > 0) {
      // Meno tipi giocabili che mazzi: si condivide il migliore. I mazzi
      // saranno simili, ma giocabili — che conta di più della varietà.
      scelte.push([utilizzabili[i % utilizzabili.length].tipo]);
    } else {
      // Nessun tipo si regge da solo: si va sul più numeroso e si conterà
      // sulle regole della casa per le energie.
      scelte.push(candidati.length ? [candidati[0].tipo] : []);
    }
  }
  return scelte;
}

/**
 * Genera i mazzi.
 *
 * @param {Array<{carta: object, quantita: number}>} voci collezione
 * @param {object} opzioni
 * @param {number} opzioni.taglia carte per mazzo (15/20/30/60)
 * @param {number} [opzioni.numeroMazzi=2]
 * @param {boolean} [opzioni.ammettiEsotici=false]
 * @param {object} [opzioni.permessi] deroghe concesse dalle regole della casa
 *   (`evoluzioniComeBase`, `energiaUniversale`): arrivano dalla seconda passata
 *   orchestrata da `pianifica()`
 * @param {number} [opzioni.seme=1] seme del caso. Con lo stesso seme e la stessa
 *   collezione i mazzi sono identici; cambiandolo si ottengono mazzi diversi
 *   pur restando sensati. Il default fisso tiene i test riproducibili
 * @returns {{mazzi: Mazzo[], carenze: object[], analisi: object}}
 *   `carenze` alimenta il motore delle regole della casa
 * @example
 * const { mazzi } = generaMazzi(collezione, { taglia: 15, numeroMazzi: 2 });
 * // mazzi diversi a ogni giro:
 * generaMazzi(collezione, { taglia: 15, seme: Date.now() });
 */
export function generaMazzi(voci, opzioni) {
  const { taglia, numeroMazzi = 2, ammettiEsotici = false, permessi = {}, seme = 1 } = opzioni;
  const casuale = new Casuale(seme);
  const analisi = analizza(voci, { ammettiEsotici });
  const dispensa = new Dispensa(voci);

  const totali = {
    pokemon: analisi.conteggi.pokemon,
    energie: analisi.conteggi.energie,
    allenatori: analisi.conteggi.allenatori,
  };
  const fetta = fettaPerMazzo(totali, numeroMazzi);
  const quota = composizione(taglia, fetta);
  const tipiPerMazzo = scegliTipi(analisi, numeroMazzi);

  /** @type {Mazzo[]} */
  const mazzi = Array.from({ length: numeroMazzi }, (_, i) => ({
    nome: `Mazzo ${i + 1}`,
    tipi: tipiPerMazzo[i] ?? [],
    carte: [],
    totale: 0,
    composizione: { pokemon: 0, energie: 0, allenatori: 0 },
  }));

  const forma = piramide(taglia);

  // --- Pokémon: si sceglie una LINEA per volta, a turni alternati ---
  //
  // L'unità di scelta è il gruppo (una carta giocabile dalla mano con le sue
  // evoluzioni), non la singola carta. Scegliendo carta per carta ogni Base
  // ancora disponibile batteva qualunque evoluzione, e la quota Pokémon si
  // riempiva di sole Basi: i mazzi non evolvevano mai. Vedi scelta-linee.js.
  for (let giro = 0; giro < taglia; giro++) {
    let qualcosaAggiunto = false;
    for (const mazzo of mazzi) {
      if (mazzo.composizione.pokemon >= quota.pokemon) continue;

      const nomi = new Set(mazzo.carte.map((c) => normalizzaNome(c.carta.nome)));
      // Quante carte del mazzo si giocano già solo grazie a una deroga: serve a
      // non concentrarle tutte nello stesso mazzo.
      const orfaniGia = mazzo.carte.filter((c) => {
        const liv = classifica(c.carta).livello ?? 0;
        return liv > 0 && !(c.carta.evolveDa && nomi.has(normalizzaNome(c.carta.evolveDa)));
      }).length;

      const candidati = dispensa.cerca(
        (c) => c.categoria === 'Pokémon' && classifica(c).livello !== null,
      );
      const gruppi = ordinaGruppi(
        costruisciGruppi(candidati, permessi),
        mazzo.tipi,
        permessi,
        orfaniGia,
        nomi,
      );
      // Non sempre il migliore: fra scelte quasi equivalenti si estrae, ed è
      // ciò che rende diversi due giri di generazione.
      const scelto = casuale.scegli(gruppi);
      if (!scelto) continue;

      const spazio = quota.pokemon - mazzo.composizione.pokemon;
      for (const { carta, quante } of pezziDaPrendere(scelto, forma, spazio)) {
        const prese = dispensa.preleva(carta, quante);
        const messe = aggiungi(mazzo, carta, prese);
        // Ciò che il tetto delle 4 copie ha respinto torna disponibile.
        if (prese > messe) dispensa.restituisci(carta, prese - messe);
        mazzo.composizione.pokemon += messe;
        if (messe > 0) qualcosaAggiunto = true;
      }
    }
    if (!qualcosaAggiunto) break;
  }

  // --- Energie: prima quelle del tipo del mazzo ---
  for (const mazzo of mazzi) {
    const suoTipo = (c) => eEnergiaBase(c) && mazzo.tipi.includes(tipoEnergia(c));
    for (const criterio of [suoTipo, (c) => c.categoria === 'Energia']) {
      while (mazzo.composizione.energie < quota.energie) {
        const disponibili = casuale.mescola(dispensa.cerca(criterio));
        if (!disponibili.length) break;
        const scelta = disponibili[0].carta;
        const prese = dispensa.preleva(scelta, quota.energie - mazzo.composizione.energie);
        const messe = aggiungi(mazzo, scelta, prese);
        if (prese > messe) dispensa.restituisci(scelta, prese - messe);
        if (messe === 0) break;
        mazzo.composizione.energie += messe;
      }
    }
  }

  // --- Allenatori ---
  for (let giro = 0; giro < taglia; giro++) {
    let qualcosaAggiunto = false;
    for (const mazzo of mazzi) {
      if (mazzo.composizione.allenatori >= quota.allenatori) continue;
      // Mescolati: gli Allenatori non hanno un criterio di merito come i
      // Pokémon, quindi senza il caso uscirebbero sempre gli stessi nomi.
      const disponibili = casuale.mescola(dispensa.cerca((c) => c.categoria === 'Allenatore'));
      if (!disponibili.length) continue;
      const scelta = disponibili[0].carta;
      const prese = dispensa.preleva(scelta, 1);
      const messe = aggiungi(mazzo, scelta, prese);
      if (prese > messe) dispensa.restituisci(scelta, prese - messe);
      mazzo.composizione.allenatori += messe;
      if (messe > 0) qualcosaAggiunto = true;
    }
    if (!qualcosaAggiunto) break;
  }

  return { mazzi, carenze: rilevaCarenze(mazzi, taglia, analisi, permessi), analisi };
}

/**
 * Che cosa non ha funzionato, in forma utilizzabile dal motore delle regole.
 *
 * Ogni carenza è un fatto misurato, non un giudizio: sarà il motore delle regole
 * a decidere quale regola della casa attivare, e il foglio stampato a spiegarne
 * il perché.
 *
 * Esportata perché `pianifica()` deve rimisurare DOPO l'inserimento dei proxy:
 * un orfano con la pre-evoluzione stampata non è più orfano, e il foglio
 * regole non deve parlarne.
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
