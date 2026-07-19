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
 * Ordina i Pokémon disponibili per quanto convengono a un mazzo.
 *
 * @param {Array<{carta: object, disponibili: number}>} candidati
 * @param {string[]} tipi tipi del mazzo
 * @param {Set<string>} nomiInMazzo nomi già presenti, per completare le linee
 * @returns {Array<{carta: object, disponibili: number}>}
 */
function ordinaPokemon(candidati, tipi, nomiInMazzo, permessi = {}, orfaniGia = 0) {
  const punteggio = ({ carta }) => {
    let p = 0;

    // Un'evoluzione senza la sua pre-evoluzione nel mazzo NON SI PUÒ GIOCARE:
    // resta in mano tutta la partita. La penalità deve quindi superare
    // qualunque bonus, altrimenti un orfano del tipo giusto batte una carta
    // giocabile di tipo sbagliato — ed è meglio un mazzo sporco di tipi che un
    // mazzo pieno di carte morte. Le regole della casa potranno riabilitarli
    // più avanti, ma è una decisione del motore delle regole, non di questo.
    //
    // Il controllo si basa sullo STADIO, non sulla presenza di `evolveDa`: il
    // 41% delle evoluzioni del dataset non dichiara da cosa evolve, e fidandosi
    // di quel campo un Livello 2 come Krookodile passerebbe per giocabile.
    const livello = classifica(carta).livello ?? 0;
    const preEvoluzionePresente =
      Boolean(carta.evolveDa) && nomiInMazzo.has(normalizzaNome(carta.evolveDa));
    const orfana = livello > 0 && !preEvoluzionePresente;

    if (orfana && !permessi.evoluzioniComeBase) {
      p -= 250;
    } else if (orfana) {
      // Con la deroga attiva la carta è giocabile, ma non è gratis:
      //
      // 1. si preferisce il Livello 1 al Livello 2. Un Livello 2 è costruito
      //    per stare in cima a una catena di tre carte, e giocarlo subito come
      //    Base lo rende molto più forte di un Base vero;
      // 2. la penalità cresce con le deroghe già presenti nel mazzo, così non
      //    si concentrano tutte in uno solo. Senza, un mazzo si prendeva tre
      //    carte potenti e l'altro una: la partita era decisa dalla pesca.
      p -= 15 * livello + 35 * orfaniGia;
    }

    if (tipi.some((t) => (carta.tipi ?? []).includes(t))) p += 100;
    if (eBase(carta) || (orfana && permessi.evoluzioniComeBase)) p += 50;
    // Completa una linea già presente: molto più utile di una carta isolata.
    if (carta.evolveDa && nomiInMazzo.has(normalizzaNome(carta.evolveDa))) p += 40;
    p += Math.min(20, (carta.ps ?? 0) / 10);
    const danno = Math.max(0, ...(carta.attacchi ?? []).map((a) => Number(a.danno) || 0));
    const costo = Math.min(
      ...(carta.attacchi ?? []).map((a) => a.costo?.length || 9),
      9,
    );
    p += Math.min(25, danno / 10) - costo * 2; // premia il danno a buon mercato
    return p;
  };
  return [...candidati].sort((a, b) => punteggio(b) - punteggio(a));
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
 * @returns {{mazzi: Mazzo[], carenze: object[], analisi: object}}
 *   `carenze` alimenta il motore delle regole della casa
 * @example
 * const { mazzi } = generaMazzi(collezione, { taglia: 15, numeroMazzi: 2 });
 */
export function generaMazzi(voci, opzioni) {
  const { taglia, numeroMazzi = 2, ammettiEsotici = false, permessi = {} } = opzioni;
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

  // --- Pokémon, a turni alternati ---
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
      const ordinati = ordinaPokemon(candidati, mazzo.tipi, nomi, permessi, orfaniGia);
      if (!ordinati.length) continue;

      const scelta = ordinati[0].carta;
      const livello = classifica(scelta).livello ?? 0;
      const desiderate = Math.min(
        forma[livello] ?? 1,
        quota.pokemon - mazzo.composizione.pokemon,
      );
      const prese = dispensa.preleva(scelta, desiderate);
      const messe = aggiungi(mazzo, scelta, prese);
      // Ciò che il tetto delle 4 copie ha respinto torna disponibile.
      if (prese > messe) dispensa.restituisci(scelta, prese - messe);
      mazzo.composizione.pokemon += messe;
      if (messe > 0) qualcosaAggiunto = true;
    }
    if (!qualcosaAggiunto) break;
  }

  // --- Energie: prima quelle del tipo del mazzo ---
  for (const mazzo of mazzi) {
    const suoTipo = (c) => eEnergiaBase(c) && mazzo.tipi.includes(tipoEnergia(c));
    for (const criterio of [suoTipo, (c) => c.categoria === 'Energia']) {
      while (mazzo.composizione.energie < quota.energie) {
        const disponibili = dispensa.cerca(criterio);
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
      const disponibili = dispensa.cerca((c) => c.categoria === 'Allenatore');
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
