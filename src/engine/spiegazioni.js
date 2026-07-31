/**
 * Le spiegazioni che compaiono **la prima volta** che una regola entra in gioco.
 *
 * È il pezzo che rende la partita *esplicativa* invece che solo giocabile. La
 * regola si spiega quando succede — la prima volta che un attacco fa il doppio,
 * la prima volta che un Pokémon si addormenta — perché è l'unico momento in cui
 * chi guarda ha già in testa la domanda giusta: *perché è successo così?*
 *
 * E si spiega **una volta sola**: alla terza ripetizione un avviso smette di
 * essere una spiegazione e diventa rumore da chiudere senza leggere. Chi tiene
 * il conto è la schermata (`<tavolo-partita>`), che sa cosa ha già mostrato;
 * qui c'è solo la regola pura *«a questo evento corrisponde questa
 * spiegazione»*, che si prova senza browser.
 *
 * I testi sono scritti per un bambino di otto anni: frasi corte, niente gergo,
 * e sempre il **perché**, non solo il cosa.
 *
 * @module engine/spiegazioni
 */

/**
 * @typedef {object} Spiegazione
 * @property {string} chiave identifica la regola: serve a mostrarla una volta sola
 * @property {string} titolo
 * @property {string} testo
 */

/** Tutte le spiegazioni, per chiave. */
const TESTI = {
  debolezza: {
    titolo: 'Debolezza',
    testo:
      'Ogni Pokémon ha un tipo che gli fa più male: sulla carta è scritto in basso. ' +
      'Un attacco di quel tipo fa il doppio dei danni. Scegliere il Pokémon giusto da ' +
      'mandare avanti conta più di attaccare forte.',
  },
  resistenza: {
    titolo: 'Resistenza',
    testo:
      'Alcuni Pokémon incassano meglio certi tipi: da quegli attacchi prendono 30 danni in meno. ' +
      'È il contrario della debolezza, e si legge nello stesso angolo della carta.',
  },
  ritirata: {
    titolo: 'Ritirata',
    testo:
      'Il Pokémon davanti può tornare in panchina scartando le Energie che il suo costo di ' +
      'ritirata richiede. Ritirarsi non è scappare: cancella anche veleno, sonno e gli altri ' +
      'stati speciali.',
  },
  Avvelenato: {
    titolo: 'Avvelenato',
    testo: 'Chi è avvelenato perde 10 PS alla fine di ogni turno, finché non torna in panchina.',
  },
  Bruciato: {
    titolo: 'Bruciato',
    testo:
      'Chi è bruciato perde 20 PS a fine turno, poi si lancia una moneta: se esce testa la ' +
      'bruciatura passa, altrimenti resta.',
  },
  Addormentato: {
    titolo: 'Addormentato',
    testo:
      'Chi dorme non può attaccare né ritirarsi. A fine turno si lancia una moneta: con testa ' +
      'si sveglia.',
  },
  Paralizzato: {
    titolo: 'Paralizzato',
    testo:
      'Chi è paralizzato salta un turno: non attacca e non si ritira. Poi la paralisi passa ' +
      'da sola.',
  },
  Confuso: {
    titolo: 'Confuso',
    testo:
      'Chi è confuso, prima di attaccare, lancia una moneta: con croce l’attacco fallisce e si ' +
      'fa 30 danni da solo.',
  },
  premio: {
    titolo: 'I Premi',
    testo:
      'Ogni volta che metti KO un Pokémon avversario prendi una carta Premio. Chi le prende ' +
      'tutte vince: è per questo che si gioca.',
  },
  evoluzione: {
    titolo: 'Evoluzioni',
    testo:
      'Un’evoluzione si mette sopra il Pokémon che era già in campo: tiene i danni che aveva, ' +
      'ma guarisce dagli stati speciali. Non si può evolvere un Pokémon appena messo giù.',
  },
  mulligan: {
    titolo: 'Mano senza Base',
    testo:
      'Senza nemmeno un Pokémon Base non si può cominciare: si rimescola tutto e si ripesca. ' +
      'Non è colpa di nessuno, capita.',
  },
  'a-mano': {
    titolo: 'Carte da leggere',
    testo:
      'Questa carta fa una cosa che l’app non sa applicare da sola. Il testo è lì: leggilo e ' +
      'applicalo tu — è esattamente quello che farai col mazzo vero in mano.',
  },
  moneta: {
    titolo: 'Testa o croce',
    testo:
      'Diverse carte chiedono di lanciare una moneta. La fortuna fa parte del gioco: per questo ' +
      'un mazzo forte non vince sempre.',
  },
};

/**
 * La spiegazione che questo evento merita, se ne merita una.
 *
 * @param {object} evento una riga del registro della partita
 * @returns {Spiegazione|null}
 * @example
 * spiegazionePer({ tipo: 'attacco', debolezza: true }); // → la spiegazione della debolezza
 */
export function spiegazionePer(evento) {
  if (!evento) return null;

  switch (evento.tipo) {
    case 'attacco':
      // La debolezza ha la precedenza: è la regola che cambia di più il numero a
      // schermo, ed è quella che si vuole capire per prima.
      if (evento.debolezza) return con('debolezza');
      if (evento.resistenza) return con('resistenza');
      if (evento.stati?.length) return con(evento.stati[0]);
      if (evento.moneta !== null && evento.moneta !== undefined) return con('moneta');
      return null;
    case 'stato':
      return con(evento.stato);
    case 'confusione':
      return con('Confuso');
    case 'ritirata':
      return con('ritirata');
    case 'premio':
      return con('premio');
    case 'evoluzione':
      return con('evoluzione');
    case 'mulligan':
      return con('mulligan');
    case 'moneta':
      return con('moneta');
    case 'allenatore':
      return evento.daApplicareAMano ? con('a-mano') : null;
    default:
      return null;
  }
}

/**
 * @param {string} chiave
 * @returns {Spiegazione|null}
 */
function con(chiave) {
  const testo = TESTI[chiave];
  return testo ? { chiave, ...testo } : null;
}

/**
 * Quante regole la partita sa spiegare: serve a mostrare un progresso onesto
 * («ne hai incontrate 4 su 12») invece di un numero inventato.
 * @returns {number}
 */
export function quanteRegole() {
  return Object.keys(TESTI).length;
}
