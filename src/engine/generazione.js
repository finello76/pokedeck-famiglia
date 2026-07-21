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
import { classifica, SCALA } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { tipoEnergia, eEnergiaBase } from '../data/energie.js';
import { composizione, fettaPerMazzo, piramide } from './proporzioni.js';
import { Casuale } from './casuale.js';
import { rilevaCarenze } from './carenze.js';
import { enumeraLinee, ordinaLinee, richiestaPerLinea, firmaLinea } from './linee.js';
// Il limite di copie sta in formati.js insieme agli altri numeri che
// definiscono una partita: uno solo, letto da tutti.
import { MAX_COPIE } from './formati.js';

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
 * @param {object} [extra] campi della voce, es. `{proxy: true, motivo}`. Una
 *   voce proxy resta distinta da quella vera anche a parità di nome: nella
 *   lista stampata "2× Machop" e "1× Machop da stampare" sono due righe, ed è
 *   ciò che serve a chi deve ritagliare
 * @returns {number} copie effettivamente aggiunte
 */
function aggiungi(mazzo, carta, quante, extra = {}) {
  const chiave = (c, proxy) =>
    `${proxy ? 'proxy' : c.idSet ?? '?'}:${c.numero ?? normalizzaNome(c.nome)}`;
  const cercata = chiave(carta, extra.proxy);
  const esistente = mazzo.carte.find((c) => chiave(c.carta, c.proxy) === cercata);

  const gia = esistente?.quantita ?? 0;
  const tetto = eEnergiaBase(carta) ? Infinity : MAX_COPIE;
  const aggiungibili = Math.max(0, Math.min(quante, tetto - gia));
  if (aggiungibili === 0) return 0;

  if (esistente) esistente.quantita += aggiungibili;
  else mazzo.carte.push({ carta, quantita: aggiungibili, ...extra });

  mazzo.totale += aggiungibili;
  return aggiungibili;
}

/**
 * La carta da stampare per un gradino che manca alla collezione.
 *
 * Del gradino si conosce solo il nome, letto dalla catena evolutiva: tipo e
 * stadio si deducono dalla linea, perché il foglio di stampa e la lista del
 * mazzo devono poter mostrare una carta sensata. L'illustrazione la cerca il
 * livello applicativo, che ha accesso al dataset.
 *
 * @param {object} gradino
 * @param {object} cima la carta posseduta in cima alla linea
 * @returns {object} carta sintetica, senza `idSet`
 */
function cartaDaStampare(gradino, cima) {
  return {
    nome: gradino.nome,
    categoria: 'Pokémon',
    stadio: SCALA[gradino.livello] ?? SCALA[0],
    // I tipi si ereditano dalla cima: nelle linee evolutive il tipo cambia di
    // rado, ed è comunque meglio di nessun tipo per la colorazione della carta.
    tipi: cima.tipi ?? [],
    evolveDa: gradino.evolveDa,
  };
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
 * @param {number} [opzioni.budgetProxy=0] quante carte Pokémon si è disposti a
 *   stampare per ciascun mazzo. È il vincolo che decide se le linee evolutive
 *   entrano intere o restano fuori: a 0 il motore può usare solo linee già
 *   complete in collezione. Lo sceglie chi gioca, dalla procedura guidata
 * @param {Record<string, string>} [opzioni.indiceEvoluzioni] nome normalizzato →
 *   pre-evoluzione. Serve a ricostruire i gradini che non possiedi: senza,
 *   un'evoluzione resta una carta isolata. Lo passa il livello applicativo
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
  const {
    taglia,
    numeroMazzi = 2,
    ammettiEsotici = false,
    permessi = {},
    seme = 1,
    budgetProxy = 0,
    indiceEvoluzioni = {},
  } = opzioni;
  // Il budget è per mazzo, ma non ha senso che superi la quota Pokémon: un
  // mazzo interamente stampato non è più il tuo mazzo.
  const budgetPerMazzo = Math.max(0, Math.min(budgetProxy, Math.round(taglia / 2)));
  const casuale = new Casuale(seme);
  const analisi = analizza(voci, { ammettiEsotici });
  const dispensa = new Dispensa(voci);

  const totali = {
    pokemon: analisi.conteggi.pokemon,
    energie: analisi.conteggi.energie,
    allenatori: analisi.conteggi.allenatori,
  };
  const fetta = fettaPerMazzo(totali, numeroMazzi);
  // Le carte stampabili allargano la scorta di Pokémon: senza contarle, una
  // collezione con pochi Pokémon riceverebbe due soli slot e il budget di
  // stampa non avrebbe dove spendersi.
  fetta.pokemon += budgetPerMazzo;
  const quota = composizione(taglia, fetta);
  const tipiPerMazzo = scegliTipi(analisi, numeroMazzi);

  /** @type {Mazzo[]} */
  const mazzi = Array.from({ length: numeroMazzi }, (_, i) => ({
    nome: `Mazzo ${i + 1}`,
    tipi: tipiPerMazzo[i] ?? [],
    carte: [],
    totale: 0,
    composizione: { pokemon: 0, energie: 0, allenatori: 0 },
    // Contabilità di costruzione: quante carte si sono già stampate per questo
    // mazzo e quali famiglie evolutive contiene. Restano allegate al mazzo
    // perché servono a ogni giro del ciclo, non solo alla fine.
    stampate: 0,
    famiglie: new Set(),
  }));

  const forma = piramide(taglia);

  // --- Pokémon: si sceglie una LINEA EVOLUTIVA per volta, a turni alternati ---
  //
  // L'unità di scelta è la linea intera, dal Base alla cima, coi gradini
  // mancanti messi in conto come carte da stampare. Ragionando sulle sole
  // carte possedute, una collezione senza linee complete — cioè quella vera —
  // produceva solo mucchi di Base sciolte. Vedi linee.js.
  for (let giro = 0; giro < taglia; giro++) {
    let qualcosaAggiunto = false;
    for (const mazzo of mazzi) {
      if (mazzo.composizione.pokemon >= quota.pokemon) continue;

      const candidati = dispensa.cerca(
        (c) => c.categoria === 'Pokémon' && classifica(c).livello !== null,
      );
      const budget = budgetPerMazzo - mazzo.stampate;
      const linee = ordinaLinee(enumeraLinee(candidati, indiceEvoluzioni), mazzo.tipi, {
        budget,
        evoluzioniComeBase: Boolean(permessi.evoluzioniComeBase),
        famiglieInMazzo: mazzo.famiglie,
      });
      // Non sempre la migliore: fra scelte quasi equivalenti si estrae, ed è
      // ciò che rende diversi due giri di generazione.
      const preferita = casuale.scegli(linee);
      if (!preferita) continue;

      // La preferita può non entrarci tutta: negli ultimi slot del mazzo una
      // linea da tre gradini non ci sta più, e si scorre verso linee più
      // corte finché una entra intera.
      const spazio = quota.pokemon - mazzo.composizione.pokemon;
      let scelta = null;
      let richiesta = [];
      for (const linea of [preferita, ...linee.filter((l) => l !== preferita)]) {
        richiesta = richiestaPerLinea(linea, forma, spazio, budget);
        if (richiesta.length) {
          scelta = linea;
          break;
        }
      }
      if (!scelta) continue;

      for (const { gradino, quante } of richiesta) {
        // Le copie vere vengono sempre prima: si stampa solo ciò che la
        // scatola non riesce a dare.
        let messe = 0;
        if (gradino.carta) {
          const prese = dispensa.preleva(gradino.carta, quante);
          messe = aggiungi(mazzo, gradino.carta, prese);
          // Ciò che il tetto delle 4 copie ha respinto torna disponibile.
          if (prese > messe) dispensa.restituisci(gradino.carta, prese - messe);
        }

        // Si stampa un gradino solo se la scatola non ne dà **nemmeno una**
        // copia. Ristampare la seconda copia di una carta che hai già non
        // rende giocabile niente che non lo sia: quel budget rende molto di
        // più speso per un'altra linea.
        const mancanti = messe === 0 ? quante : 0;
        const daStampare = Math.min(mancanti, budgetPerMazzo - mazzo.stampate);
        if (daStampare > 0) {
          const stampate = aggiungi(mazzo, cartaDaStampare(gradino, scelta.cima), daStampare, {
            proxy: true,
            motivo: `Serve per giocare ${scelta.cima.nome}${
              scelta.cima.stadio ? ` (${scelta.cima.stadio})` : ''
            }.`,
          });
          mazzo.stampate += stampate;
          messe += stampate;
        }

        mazzo.composizione.pokemon += messe;
        // Gradino rimasto scoperto: né copie vere né budget per stamparlo. Ciò
        // che gli sta sopra non si potrebbe evolvere, quindi la linea si ferma
        // qui invece di infilare nel mazzo carte morte.
        if (messe === 0) break;
        qualcosaAggiunto = true;
      }
      mazzo.famiglie.add(firmaLinea(scelta));
    }
    if (!qualcosaAggiunto) break;
  }

  // La contabilità di costruzione esce di scena: i mazzi vengono salvati come
  // JSON, e un Set non sopravvive alla serializzazione.
  for (const mazzo of mazzi) delete mazzo.famiglie;

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
