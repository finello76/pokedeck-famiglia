/**
 * Cosa fa una carta Allenatore, letto dal suo effetto.
 *
 * ## Il problema, detto onestamente
 *
 * L'effetto di un Allenatore è **una frase in italiano** scritta per un essere
 * umano: *"Il tuo avversario mostra le carte che ha in mano e tu peschi una
 * carta per ogni carta Allenatore presente tra quelle carte."* Nessun programma
 * ragionevole la esegue, e provarci significherebbe sbagliare in silenzio —
 * che in una partita che serve a **insegnare** è il danno peggiore possibile:
 * il bambino impara la regola sbagliata.
 *
 * ## La scelta: due livelli, e il confine dichiarato
 *
 * 1. **Riconosciute.** Una manciata di formule ricorrenti — *"Pesca tre
 *    carte."*, *"Cura 30 danni…"*, *"Scambia il tuo Pokémon attivo…"* — che
 *    coprono la maggior parte degli Allenatori semplici nei mazzi di casa.
 *    Queste la partita le esegue davvero.
 * 2. **Da leggere.** Tutte le altre. La carta si gioca lo stesso: la schermata
 *    mostra il testo grande e chi gioca lo applica, con i comandi a mano. Non è
 *    un ripiego — è quello che dovranno fare col mazzo vero in mano, ed è il
 *    motivo per cui la partita esiste.
 *
 * Il confine si vede: `interpreta()` dice sempre *cosa ha capito*, e quando non
 * capisce lo dichiara invece di indovinare.
 *
 * Modulo puro: nessun DOM, nessuna rete.
 *
 * @module engine/allenatori
 */

/** I numeri come li scrivono le carte, da parola a cifra. */
const NUMERI = {
  un: 1,
  uno: 1,
  una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10,
};

/**
 * Il numero scritto in un pezzo di frase, in cifre o in lettere.
 * @param {string} testo
 * @returns {number|null}
 */
function numeroIn(testo) {
  const cifra = testo.match(/\d+/);
  if (cifra) return Number(cifra[0]);
  const parola = testo.toLowerCase().match(/\b(un|uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\b/);
  return parola ? NUMERI[parola[1]] : null;
}

/**
 * @typedef {object} Effetto
 * @property {'pesca'|'cura'|'scambia'|'manuale'} tipo
 * @property {number} [quante] carte da pescare
 * @property {number} [quanti] danni da curare
 * @property {string} testo l'effetto come sta sulla carta: si mostra **sempre**,
 *   anche quando è stato capito, perché la carta vera va letta
 */

/**
 * Legge l'effetto di una carta Allenatore e dice cosa sa farne la partita.
 *
 * L'ordine dei controlli conta: *"Pesca due carte"* dentro una frase più lunga
 * e piena di condizioni non è "pesca due carte", quindi le formule si
 * riconoscono solo quando sono **tutta** la frase o quasi. Meglio dichiarare di
 * non aver capito che fare la cosa sbagliata.
 *
 * @param {{effetto?: string, tipoAllenatore?: string}|null|undefined} carta
 * @returns {Effetto}
 * @example
 * interpreta({ effetto: 'Pesca tre carte.' }); // → { tipo: 'pesca', quante: 3 }
 */
export function interpreta(carta) {
  const testo = String(carta?.effetto ?? '').trim();
  const piatto = testo.toLowerCase().replace(/\s+/g, ' ');
  if (!piatto) return { tipo: 'manuale', testo };

  // "Pesca tre carte." — e nient'altro: la frase deve finire lì.
  const pesca = piatto.match(/^pesca ([a-z]+|\d+) cart[ae]\.?$/);
  if (pesca) {
    const quante = numeroIn(pesca[1]);
    if (quante) return { tipo: 'pesca', quante, testo };
  }

  // "Cura 30 danni da uno dei tuoi Pokémon." Il numero è sempre in cifre.
  const cura = piatto.match(/^cura (\d+) danni?\b/);
  if (cura) return { tipo: 'cura', quanti: Number(cura[1]), testo };

  // Lo scambio con la panchina: è una ritirata gratis, e la partita la sa fare.
  if (/^scambia il tuo pok[eé]mon attivo con uno (della|in) (tua )?panchina\.?$/.test(piatto)) {
    return { tipo: 'scambia', testo };
  }

  return { tipo: 'manuale', testo };
}

/**
 * Se questa carta si può giocare adesso, viste le regole del tipo.
 *
 * L'unica regola di quantità che il gioco impone davvero è **un Aiuto per
 * turno**: gli Strumenti si giocano quanti se ne vuole. È una regola che i
 * bambini scoprono sbagliando, quindi la partita la applica e la spiega.
 *
 * @param {{tipoAllenatore?: string}} carta
 * @param {{aiutoGiocato: boolean}} giocatore
 * @returns {{possibile: boolean, perche: string}}
 */
export function giocabileOra(carta, giocatore) {
  if (carta?.tipoAllenatore === 'Aiuto' && giocatore?.aiutoGiocato) {
    return { possibile: false, perche: 'Hai già giocato una carta Aiuto in questo turno.' };
  }
  return { possibile: true, perche: '' };
}

/**
 * Una riga che dice a chi gioca cosa succede — o cosa deve fare lui.
 *
 * @param {object} carta
 * @param {Effetto} effetto
 * @returns {string}
 */
export function raccontaEffetto(carta, effetto) {
  const nome = carta?.nome ?? 'Questa carta';
  switch (effetto.tipo) {
    case 'pesca':
      return `${nome}: peschi ${effetto.quante} carte.`;
    case 'cura':
      return `${nome}: curi ${effetto.quanti} danni.`;
    case 'scambia':
      return `${nome}: scambi il Pokémon attivo con uno della panchina, gratis.`;
    default:
      return `${nome}: «${effetto.testo}» — questa applicala tu, leggendo la carta.`;
  }
}
