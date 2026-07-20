/**
 * Il catalogo delle regole della casa.
 *
 * Ogni regola è una coppia **condizione → testo stampabile**, più la
 * motivazione che la giustifica. Le motivazioni contengono numeri veri presi
 * dalla collezione, non frasi generiche: "hai 13 Energie per 2 mazzi da 15"
 * convince, "poche energie" no.
 *
 * Questo modulo è solo DATI (l'elenco delle regole possibili); la valutazione
 * di quali attivare sta in `regole.js`. Separati perché crescono per motivi
 * diversi: qui si aggiungono regole, là si cambia il meccanismo.
 *
 * I numeri che definiscono una partita (mano, Premi, panchina) NON si scrivono
 * qui: arrivano da `formati.js`, che è la loro fonte unica. Ripeterli
 * porterebbe il foglio stampato a contraddire la scheda del formato consultata
 * nell'app.
 *
 * Modulo puro.
 *
 * @module engine/regole-catalogo
 */

import { formatoPer, alteraNumeriUfficiali, UFFICIALE } from './formati.js';

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
export const CATALOGO = [
  {
    codice: 'evoluzioni-come-base',
    origine: 'misura',
    titolo: 'Le evoluzioni si giocano come Pokémon Base',
    /**
     * Si attiva quando la collezione ha evoluzioni senza pre-evoluzione. È il
     * caso dominante di questo progetto: senza questa regola quelle carte non
     * entrano in nessun mazzo.
     */
    condizione: ({ analisi, carenze, opzioni }) => {
      const orfani = analisi.orfani ?? [];
      if (orfani.length === 0) return null;

      // Quali stadi hanno davvero ottenuto la deroga nei mazzi. Alla prima
      // passata l'elenco è vuoto, perché gli orfani sono ancora esclusi: il
      // testo si arricchisce alla rivalutazione finale.
      const neiMazzi = carenze
        .filter((c) => c.codice === 'orfani-nel-mazzo')
        .flatMap((c) => c.dati.orfani);

      // Coi proxy Pokémon le pre-evoluzioni note vengono stampate e le carenze
      // rimisurate: se nessun orfano è rimasto nei mazzi, la regola non serve.
      // Resta necessaria per gli orfani irrisolvibili (pre-evoluzione
      // sconosciuta, o quota proxy superata).
      if (opzioni.proxyPokemon && neiMazzi.length === 0) return null;

      const nomi = [...new Set(orfani.map((o) => o.voce.carta.nome))];
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
      // Con le Energie proxy la scarsità si risolve stampando, non alterando i
      // costi: la regola non serve.
      if (opzioni.proxyEnergia) return null;
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
      const formato = formatoPer(opzioni.taglia);
      // Il formato da 30 in su usa già i numeri veri: non c'è niente da dire.
      if (!alteraNumeriUfficiali(formato)) return null;
      const impegnate = UFFICIALE.manoIniziale + UFFICIALE.premi;
      return {
        testo:
          `Ogni giocatore pesca ${formato.manoIniziale} carte iniziali invece di ` +
          `${UFFICIALE.manoIniziale}, e mette da parte ${formato.premi} carte Premio ` +
          `invece di ${UFFICIALE.premi}. Vince chi prende tutte le carte Premio.`,
        motivazione:
          `Con un mazzo da ${opzioni.taglia} carte, la mano e i Premi ufficiali ne ` +
          `impegnerebbero ${impegnate} su ${opzioni.taglia}: resterebbe quasi nulla da pescare.`,
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
      // Le Energie proxy eliminano il rischio di stallo da energie mancanti;
      // resta il tempo massimo solo se richiesto dalla difficoltà.
      if (!opzioni.semplificata && opzioni.proxyEnergia) return null;
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
  {
    codice: 'mulligan-morbido',
    origine: 'misura',
    titolo: 'Mano iniziale senza Pokémon: si ripesca',
    /**
     * Con pochi Base nel mazzo la mano iniziale può non contenere nulla di
     * giocabile. La regola ufficiale (mostra, rimescola, l'avversario può
     * pescare) punisce un problema che qui è del mazzo, non del giocatore.
     */
    condizione: ({ carenze }) => {
      const scarse = carenze.filter((c) => c.codice === 'poche-basi');
      if (!scarse.length) return null;
      const dettaglio = scarse
        .map((c) => `${c.mazzo}: ${c.dati.basi} Base su ${c.dati.consigliate} consigliate`)
        .join('; ');
      return {
        testo:
          'Se la mano iniziale non contiene nessun Pokémon giocabile, mostrala, ' +
          'rimescolala nel mazzo e pescane una nuova, senza penalità per nessuno. ' +
          'Alla terza volta tieni la mano e peschi dal mazzo finché non trovi un ' +
          'Pokémon: parti da quello.',
        motivazione: `Alcuni mazzi hanno pochi Pokémon Base (${dettaglio}): capiterà di ` +
          'aprire mani senza nulla da mettere in gioco, e non è colpa di chi pesca.',
      };
    },
  },

  {
    codice: 'panchina-ridotta',
    origine: 'misura',
    titolo: 'Panchina ridotta',
    /**
     * La panchina ufficiale (5) è tarata su mazzi da 60: in un mazzo da 15-20
     * finirebbe in panchina mezzo mazzo, e non resterebbe niente da pescare.
     */
    condizione: ({ opzioni }) => {
      const formato = formatoPer(opzioni.taglia);
      if (formato.panchina >= UFFICIALE.panchina) return null;
      return {
        testo:
          `La panchina può contenere al massimo ${formato.panchina} Pokémon invece di ` +
          `${UFFICIALE.panchina}. Se la panchina è piena, non si possono mettere in ` +
          'gioco altri Pokémon.',
        motivazione:
          `Con mazzi da ${opzioni.taglia} carte una panchina da ${UFFICIALE.panchina} ` +
          'impegnerebbe un terzo del mazzo: dopo la preparazione non resterebbe quasi ' +
          'nulla da pescare.',
      };
    },
  },

  {
    codice: 'ritirata-agevolata',
    origine: 'misura',
    titolo: 'Prima ritirata del turno gratuita',
    /**
     * Ritirarsi costa Energie: quando sono poche, pagarle significa non
     * attaccare mai. Senza questa regola un Pokémon intrappolato davanti
     * blocca la partita.
     */
    condizione: ({ analisi, opzioni }) => {
      if (opzioni.proxyEnergia) return null;
      const energie = analisi.energie.totaleBase;
      const soglia = opzioni.taglia * opzioni.numeroMazzi * 0.35;
      if (energie === 0 || energie >= soglia) return null;
      return {
        testo:
          'Una volta per turno, ritirare il Pokémon attivo non costa Energie. ' +
          'Dalla seconda ritirata nello stesso turno si paga il costo normale.',
        motivazione:
          `In collezione ci sono ${energie} Energie base per ${opzioni.numeroMazzi} mazzi ` +
          `da ${opzioni.taglia}: pagare anche la ritirata lascerebbe i Pokémon senza ` +
          'Energie per attaccare.',
      };
    },
  },

  {
    codice: 'scarta-e-pesca',
    origine: 'misura',
    titolo: 'Una carta scartata, una pescata',
    /**
     * Le carte Allenatore servono a far girare il mazzo (pescare, cercare,
     * riciclare). Se sono poche, le mani si bloccano su carte inutilizzabili
     * e nessun effetto le sblocca.
     */
    condizione: ({ analisi, opzioni }) => {
      const allenatori = analisi.conteggi.allenatori;
      const soglia = (opzioni.taglia * opzioni.numeroMazzi) / 6;
      if (allenatori >= soglia) return null;
      return {
        testo:
          'Una volta per turno, prima di attaccare, puoi scartare una carta dalla ' +
          'mano per pescarne una nuova dal mazzo.',
        motivazione:
          `In collezione ci sono solo ${allenatori} carte Allenatore per ` +
          `${opzioni.numeroMazzi} mazzi da ${opzioni.taglia}: senza i loro effetti di ` +
          'pesca le mani piene di carte inutilizzabili resterebbero bloccate.',
      };
    },
  },

  {
    codice: 'primo-turno-morbido',
    origine: 'scelta',
    titolo: 'Nessun attacco nel primo turno',
    condizione: ({ opzioni }) => {
      if (!opzioni.semplificata) return null;
      return {
        testo:
          'Nel primo turno di ciascun giocatore non si può attaccare: si mette in ' +
          'gioco, si assegnano Energie e si osserva il campo.',
        motivazione:
          'Difficoltà semplificata: il primo turno serve a capire le proprie carte, ' +
          'e chi inizia non parte con un attacco che l\'altro non può ancora pareggiare.',
      };
    },
  },

  {
    codice: 'mazzo-corto-compensato',
    origine: 'misura',
    titolo: 'Il mazzo più corto sceglie chi inizia',
    /**
     * Quando la collezione non basta a riempire tutti i mazzi, qualcuno gioca
     * con meno carte: è uno svantaggio misurabile (meno pescate, Premi più
     * vicini alla fine del mazzo) e va compensato con qualcosa di piccolo ma
     * concreto.
     */
    condizione: ({ carenze, mazzi }) => {
      const incompleti = carenze.filter((c) => c.codice === 'mazzo-incompleto');
      if (!incompleti.length || mazzi.length < 2) return null;
      const totali = mazzi.map((m) => m.totale);
      const differenza = Math.max(...totali) - Math.min(...totali);
      if (differenza < 2) return null;
      return {
        testo:
          'Il giocatore con il mazzo più corto decide chi gioca per primo e vede ' +
          'quante carte ha in mano l\'avversario in qualsiasi momento.',
        motivazione:
          `I mazzi non sono della stessa taglia (${totali.join(' contro ')} carte): ` +
          'chi ha meno carte pesca meno e finisce il mazzo prima, un piccolo ' +
          'vantaggio iniziale pareggia i conti.',
      };
    },
  },
];
