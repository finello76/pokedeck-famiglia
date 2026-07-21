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
import { tipoEnergia, eEnergiaBase } from '../data/energie.js';
import { composizione, fettaPerMazzo, piramide } from './proporzioni.js';
import { Casuale } from './casuale.js';
import { aggiungiAlMazzo } from './mazzo.js';
import { rilevaCarenze } from './carenze.js';
import { punteggioMazzo } from './bilancia.js';
import { enumeraLinee, ordinaLinee, richiestaPerLinea, firmaLinea } from './linee.js';

/**
 * @typedef {object} Mazzo
 * @property {string} nome etichetta leggibile
 * @property {string[]} tipi tipi su cui è centrato
 * @property {Array<{carta: object, quantita: number}>} carte
 * @property {number} totale carte effettive
 * @property {object} composizione quante Pokémon/Energie/Allenatori contiene
 */

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
 * Fra i tipi **quasi equivalenti** si estrae, invece di prendere sempre i
 * migliori. Sulla collezione di prova i punteggi sono vicinissimi (Lampo 4,6 ·
 * Psico 4,2 · Lotta 3,9 · Acqua 3,7), ma scegliendo sempre il massimo uscivano
 * ogni volta gli stessi due tipi — e con essi le stesse linee evolutive, perché
 * di Livello 2 giocabili per tipo ce n'è quasi sempre uno solo. "Rigenera
 * diversi" restituiva mazzi identici.
 *
 * Il caso però non basta: **un tipo senza linee evolutive costruibili produce
 * per forza un mazzo di sole Base**. Sulla collezione di prova il tipo Erba ha
 * sette Pokémon e zero evoluzioni: assegnarlo a un mazzo lo condanna prima
 * ancora di cominciare, e accanto a un mazzo con due Livello 2 non c'è partita.
 * Perciò i tipi che possono evolvere vengono prima, e gli altri restano un
 * ripiego.
 *
 * @param {object} analisi risultato di `analizza()`
 * @param {number} numeroMazzi
 * @param {Casuale} [casuale] senza, la scelta resta deterministica (il migliore)
 * @param {Map<string, number>} [lineePerTipo] quante linee evolutive costruibili
 *   ha ciascun tipo, viste le carte libere e il budget di stampa
 * @returns {string[][]} un elenco di tipi per mazzo
 */
export function scegliTipi(analisi, numeroMazzi, casuale = null, lineePerTipo = null) {
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
  // I tipi che sanno evolvere hanno la precedenza; gli altri si usano solo
  // quando i primi sono finiti. Non è una preferenza estetica: senza linee, un
  // mazzo non ha modo di crescere durante la partita.
  const evolvono = (c) => !lineePerTipo || (lineePerTipo.get(c.tipo) ?? 0) > 0;
  const primaScelta = utilizzabili.filter(evolvono);
  const ripiego = utilizzabili.filter((c) => !evolvono(c));
  // I tipi già assegnati escono dal mazzetto: due mazzi dello stesso tipo si
  // contendono le stesse carte e finiscono per somigliarsi.
  let disponibili = [...primaScelta];

  for (let i = 0; i < numeroMazzi; i++) {
    if (!utilizzabili.length) {
      // Nessun tipo si regge da solo: si va sul più numeroso e si conterà
      // sulle regole della casa per le energie.
      scelte.push(candidati.length ? [candidati[0].tipo] : []);
      continue;
    }
    // Finiti i tipi che evolvono si passa al ripiego, e poi si ricomincia il
    // giro: meglio due mazzi dello stesso tipo che un mazzo senza linee.
    if (!disponibili.length) disponibili = ripiego.length ? [...ripiego] : [...primaScelta];
    if (!disponibili.length) disponibili = [...utilizzabili];

    scelte.push([estraiTipo(disponibili, casuale).tipo]);
  }
  return scelte;
}

/**
 * Quante linee evolutive **davvero costruibili** ha ciascun tipo.
 *
 * Non conta i Pokémon: conta le linee che si riesce a portare in gioco con le
 * carte libere e il budget di stampa concesso. Un tipo con dieci Base e nessuna
 * evoluzione vale zero, ed è l'informazione che serve a non condannare un mazzo.
 *
 * @param {Array<{carta: object, disponibili: number}>} candidati
 * @param {object} opzioni `{indiceEvoluzioni, nonPokemon, budget}`
 * @returns {Map<string, number>} tipo → numero di linee con almeno due gradini
 */
export function lineeEvolutivePerTipo(candidati, opzioni = {}) {
  const { indiceEvoluzioni = {}, nonPokemon = new Set(), budget = 0 } = opzioni;
  const conteggio = new Map();

  for (const linea of enumeraLinee(candidati, indiceEvoluzioni, nonPokemon)) {
    if (linea.radiceOrfana || linea.profondita < 2 || linea.daStampare > budget) continue;
    for (const tipo of linea.cima.tipi ?? []) {
      conteggio.set(tipo, (conteggio.get(tipo) ?? 0) + 1);
    }
  }
  return conteggio;
}

/**
 * Estrae un tipo fra quelli quasi equivalenti al migliore, e lo toglie dal
 * mazzetto.
 *
 * La soglia è **relativa**, non a punti fissi: i punteggi dei tipi stanno fra 3
 * e 5, dove una differenza di mezzo punto è tanta. Una tolleranza assoluta
 * ammetterebbe tutto o niente a seconda della collezione.
 *
 * @param {Array<{tipo: string, punteggio: number}>} disponibili ordinati per
 *   punteggio decrescente. **Viene modificato**: il tipo estratto esce
 * @param {Casuale|null} casuale
 * @returns {{tipo: string, punteggio: number}}
 */
function estraiTipo(disponibili, casuale) {
  const soglia = disponibili[0].punteggio * 0.75;
  const ammessi = disponibili.filter((c) => c.punteggio >= soglia);
  const scelto = casuale ? ammessi[casuale.intero(ammessi.length)] : ammessi[0];
  disponibili.splice(disponibili.indexOf(scelto), 1);
  return scelto;
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
 * @param {Set<string>} [opzioni.nonPokemon] nomi normalizzati di pre-evoluzioni
 *   che sono carte Allenatore (i fossili): non si stampano come Pokémon
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
    nonPokemon = new Set(),
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

  // I tipi si scelgono sapendo quali sanno evolvere: si guarda l'intera
  // collezione, prima che i mazzi comincino a consumarla.
  const lineePerTipo = lineeEvolutivePerTipo(
    dispensa.cerca((c) => c.categoria === 'Pokémon' && classifica(c).livello !== null),
    { indiceEvoluzioni, nonPokemon, budget: budgetPerMazzo },
  );
  const tipiPerMazzo = scegliTipi(analisi, numeroMazzi, casuale, lineePerTipo);

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
    // Sceglie per primo il mazzo messo peggio, rimisurando a ogni giro. Con un
    // ordine fisso il primo mazzo aveva la prima scelta ogni volta e su una
    // collezione con poche linee buone se le prendeva tutte; alternare
    // soltanto non bastava, perché una linea da tre gradini vale molto più di
    // una da due. Pareggiare mentre si costruisce riesce molto meglio che
    // rimettere a posto dopo.
    const ordine = [...mazzi].sort(
      (a, b) => punteggioMazzo(a).totale - punteggioMazzo(b).totale,
    );
    for (const mazzo of ordine) {
      if (mazzo.composizione.pokemon >= quota.pokemon) continue;

      const candidati = dispensa.cerca(
        (c) => c.categoria === 'Pokémon' && classifica(c).livello !== null,
      );
      const budget = budgetPerMazzo - mazzo.stampate;
      const linee = ordinaLinee(enumeraLinee(candidati, indiceEvoluzioni, nonPokemon), mazzo.tipi, {
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
          messe = aggiungiAlMazzo(mazzo, gradino.carta, prese);
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
          const stampate = aggiungiAlMazzo(mazzo, cartaDaStampare(gradino, scelta.cima), daStampare, {
            proxy: true,
            motivo: `Serve per giocare ${scelta.cima.nome}${
              scelta.cima.stadio ? ` (${scelta.cima.stadio})` : ''
            }.`,
          });
          mazzo.stampate += stampate;
          messe += stampate;
        }

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
        const messe = aggiungiAlMazzo(mazzo, scelta, prese);
        if (prese > messe) dispensa.restituisci(scelta, prese - messe);
        if (messe === 0) break;
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
      const messe = aggiungiAlMazzo(mazzo, scelta, prese);
      if (prese > messe) dispensa.restituisci(scelta, prese - messe);
      if (messe > 0) qualcosaAggiunto = true;
    }
    if (!qualcosaAggiunto) break;
  }

  return { mazzi, carenze: rilevaCarenze(mazzi, taglia, analisi, permessi), analisi };
}
