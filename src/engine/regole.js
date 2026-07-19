/**
 * Motore delle regole della casa.
 *
 * Ogni regola è una coppia **condizione → testo stampabile**, più la
 * motivazione che la giustifica. Il foglio da stampare elencherà solo le regole
 * attivate, ciascuna con il proprio perché: una regola senza spiegazione, in
 * famiglia, sembra un favoritismo.
 *
 * Le motivazioni contengono numeri veri presi dalla collezione, non frasi
 * generiche: "hai 13 Energie per 2 mazzi da 15" convince, "poche energie" no.
 *
 * Alcune regole non si limitano a essere stampate: dichiarano anche dei
 * **permessi** che cambiano il modo in cui i mazzi vengono generati (per
 * esempio riabilitando le evoluzioni orfane). Per questo la generazione avviene
 * in due passate — vedi `pianifica()`.
 *
 * Modulo puro.
 *
 * @module engine/regole
 */

/**
 * @typedef {object} Regola
 * @property {string} codice identificativo stabile
 * @property {'misura'|'scelta'} origine perché esiste. `misura`: nasce da una
 *   carenza contata nella collezione, e la motivazione contiene i numeri.
 *   `scelta`: nasce da una preferenza dichiarata nel wizard (per esempio la
 *   difficoltà semplificata), e i numeri non c'entrano. La distinzione conta
 *   sul foglio stampato: "hai solo 13 Energie" si accetta, "ho deciso così" si
 *   discute
 * @property {string} titolo intestazione sul foglio stampato
 * @property {string} testo la regola, scritta per essere letta ad alta voce
 * @property {string} motivazione perché è attiva, con i numeri
 * @property {object} [permessi] come cambia la generazione
 */

/**
 * Le regole disponibili, in ordine di stampa.
 *
 * Ogni voce ha una `condizione(contesto)` che restituisce `null` se la regola
 * non serve, oppure l'oggetto con testo e motivazione se serve.
 */
const CATALOGO = [
  {
    codice: 'evoluzioni-come-base',
    origine: 'misura',
    titolo: 'Le evoluzioni si giocano come Pokémon Base',
    /**
     * Si attiva quando la collezione ha evoluzioni senza pre-evoluzione. È il
     * caso dominante di questo progetto: senza questa regola quelle carte non
     * entrano in nessun mazzo.
     */
    condizione: ({ analisi, carenze }) => {
      const orfani = analisi.orfani ?? [];
      if (orfani.length === 0) return null;
      const nomi = [...new Set(orfani.map((o) => o.voce.carta.nome))];

      // Quali stadi hanno davvero ottenuto la deroga nei mazzi. Alla prima
      // passata l'elenco è vuoto, perché gli orfani sono ancora esclusi: il
      // testo si arricchisce alla rivalutazione finale.
      const neiMazzi = carenze
        .filter((c) => c.codice === 'orfani-nel-mazzo')
        .flatMap((c) => c.dati.orfani);
      const conLivello2 = neiMazzi.filter((o) => o.stadio === 'Livello 2');

      // Un Livello 2 è costruito per stare in cima a una catena di tre carte:
      // giocarlo subito è molto più forte di un Base vero. Serve un
      // contrappeso, altrimenti la regola non pareggia i conti, li sbilancia.
      const clausola = conLivello2.length
        ? ' I Pokémon di **Livello 2** giocati in questo modo non possono attaccare nel ' +
          'turno in cui entrano in gioco: rappresentano il tempo che sarebbe servito ' +
          `per farli evolvere (${conLivello2.map((o) => o.nome).join(', ')}).`
        : '';

      return {
        testo:
          'Le carte evolute contrassegnate nella lista del mazzo si mettono in gioco ' +
          'direttamente dalla mano, come se fossero Pokémon Base. Non serve avere la ' +
          'carta da cui evolvono.' + clausola,
        motivazione:
          `Nella collezione ci sono ${orfani.length} carte evolute senza la loro ` +
          `pre-evoluzione (${nomi.slice(0, 4).join(', ')}${nomi.length > 4 ? ', e altre' : ''}). ` +
          'Senza questa regola resterebbero inutilizzabili.',
        permessi: { evoluzioniComeBase: true },
      };
    },
  },

  {
    codice: 'energia-universale',
    origine: 'misura',
    titolo: 'Ogni Energia vale per qualsiasi tipo',
    /**
     * Si attiva quando le energie non bastano a coprire i tipi dei mazzi.
     * Viene saltata se i proxy Energia sono attivi: in quel caso si stampano le
     * energie mancanti e si gioca con le regole vere, che è preferibile.
     */
    condizione: ({ analisi, carenze, opzioni }) => {
      if (opzioni.proxyEnergia) return null;
      const fuoriTipo = carenze.filter((c) => c.codice === 'energie-fuori-tipo');
      const poche = carenze.filter((c) => c.codice === 'poche-energie');
      if (!fuoriTipo.length && !poche.length) return null;

      const tipiPresenti = Object.keys(analisi.energie.perTipo ?? {});
      return {
        testo:
          'Qualunque carta Energia può essere assegnata a qualunque Pokémon e conta ' +
          'come Energia del tipo richiesto dall\'attacco.',
        motivazione:
          `Ci sono ${analisi.energie.totaleBase} Energie base divise su ${tipiPresenti.length} ` +
          `tipi (${tipiPresenti.join(', ')}): nessun tipo ne ha abbastanza per un mazzo ` +
          'intero, quindi molti attacchi non si potrebbero mai pagare.',
        permessi: { energiaUniversale: true },
      };
    },
  },

  {
    codice: 'costi-ridotti',
    origine: 'misura',
    titolo: 'Gli attacchi costano un\'Energia in meno',
    /**
     * Regola più invasiva della precedente: si attiva solo quando le energie
     * sono davvero pochissime rispetto alle carte in gioco, perché altera gli
     * equilibri fra le carte, non solo la loro compatibilità.
     */
    condizione: ({ analisi, opzioni }) => {
      const energie = analisi.energie.totaleBase;
      const servono = opzioni.taglia * opzioni.numeroMazzi * 0.25;
      if (energie >= servono) return null;
      return {
        testo:
          'Il costo di ogni attacco è ridotto di 1 Energia, fino a un minimo di 1. ' +
          'Un attacco che costa 3 Energie ne costa 2; uno che ne costa 1 resta a 1.',
        motivazione:
          `Servirebbero circa ${Math.round(servono)} Energie per ${opzioni.numeroMazzi} mazzi ` +
          `da ${opzioni.taglia}, e in collezione ce ne sono ${energie}. Senza questa ` +
          'riduzione i Pokémon resterebbero quasi sempre senza abbastanza Energie per attaccare.',
      };
    },
  },

  {
    codice: 'mano-e-premi',
    origine: 'misura',
    titolo: 'Mano iniziale e carte Premio ridotte',
    /**
     * Le regole ufficiali (mano da 7, 6 Premi) sono tarate su mazzi da 60. Su
     * un mazzo da 15 lascerebbero pochissime carte da pescare.
     */
    condizione: ({ opzioni }) => {
      if (opzioni.taglia > 20) return null;
      const mano = 5;
      const premi = opzioni.taglia <= 15 ? 2 : 3;
      return {
        testo:
          `Ogni giocatore pesca ${mano} carte iniziali invece di 7, e mette da parte ` +
          `${premi} carte Premio invece di 6. Vince chi prende tutte le carte Premio.`,
        motivazione:
          `Con un mazzo da ${opzioni.taglia} carte, la mano e i Premi ufficiali ne ` +
          `impegnerebbero 13 su ${opzioni.taglia}: resterebbe quasi nulla da pescare.`,
      };
    },
  },

  {
    codice: 'senza-abilita',
    origine: 'scelta',
    titolo: 'Si ignorano abilità e poteri',
    condizione: ({ opzioni }) => {
      if (!opzioni.semplificata) return null;
      return {
        testo:
          'I riquadri con Abilità, Poteri Pokémon e regole speciali stampati sulle carte ' +
          'non si applicano. Contano solo gli attacchi, i Punti Salute e il costo di ritirata.',
        motivazione:
          'Difficoltà semplificata: le abilità hanno testi lunghi e regole particolari ' +
          'che rallentano la partita e sono difficili da ricordare per chi impara.',
      };
    },
  },

  {
    codice: 'allenatori-semplici',
    origine: 'scelta',
    titolo: 'Solo carte Allenatore semplici',
    condizione: ({ opzioni, mazzi }) => {
      if (!opzioni.semplificata) return null;
      const quanti = mazzi.reduce(
        (s, m) => s + m.carte.filter((c) => c.carta.categoria === 'Allenatore').length,
        0,
      );
      if (quanti === 0) return null;
      return {
        testo:
          'Se il testo di una carta Allenatore non è chiaro dopo una lettura, si scarta ' +
          'e si pesca un\'altra carta al suo posto.',
        motivazione:
          `Nei mazzi ci sono ${quanti} carte Allenatore, alcune con effetti complessi. ` +
          'Questa regola evita di interrompere la partita per interpretarle.',
      };
    },
  },

  {
    codice: 'pareggio-a-tempo',
    origine: 'misura',
    titolo: 'Fine partita a tempo',
    /**
     * Con mazzi piccoli e pochi Premi la partita è breve, ma senza abbastanza
     * energie può impantanarsi: due Pokémon che non riescono ad attaccare.
     */
    condizione: ({ opzioni, analisi }) => {
      if (!opzioni.semplificata && analisi.energie.totaleBase >= opzioni.taglia) return null;
      return {
        testo:
          'Se dopo 20 minuti nessuno ha preso tutte le carte Premio, vince chi ne ha prese ' +
          'di più. A parità, vince chi ha più Pokémon ancora in gioco.',
        motivazione:
          `Con ${analisi.energie.totaleBase} Energie per ${opzioni.numeroMazzi} mazzi da ` +
          `${opzioni.taglia} carte può capitare che nessuno dei due riesca ad attaccare per ` +
          'diversi turni: questa regola evita partite che non finiscono mai.',
      };
    },
  },
];

/**
 * Valuta quali regole della casa servono.
 *
 * @param {object} contesto
 * @param {object} contesto.analisi risultato di `analizza()`
 * @param {Array} contesto.mazzi mazzi generati
 * @param {Array} contesto.carenze carenze rilevate dalla generazione
 * @param {object} contesto.opzioni `{taglia, numeroMazzi, semplificata, proxyEnergia}`
 * @returns {{regole: Regola[], permessi: object}}
 * @example
 * const { regole, permessi } = valutaRegole({ analisi, mazzi, carenze, opzioni });
 * // regole → solo quelle attivate, ognuna con testo e motivazione
 */
export function valutaRegole(contesto) {
  const regole = [];
  const permessi = {};

  for (const voce of CATALOGO) {
    const esito = voce.condizione(contesto);
    if (!esito) continue;
    regole.push({
      codice: voce.codice,
      origine: voce.origine,
      titolo: voce.titolo,
      testo: esito.testo,
      motivazione: esito.motivazione,
    });
    Object.assign(permessi, esito.permessi ?? {});
  }

  return { regole, permessi };
}

/**
 * I codici di tutte le regole esistenti, attivate o no. Utile ai test e alla
 * documentazione.
 * @returns {string[]}
 */
export function codiciRegole() {
  return CATALOGO.map((r) => r.codice);
}
