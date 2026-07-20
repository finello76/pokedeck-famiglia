/**
 * I formati di gioco: 15, 20, 30 e 60 carte.
 *
 * Questo modulo è la **fonte unica** dei numeri che definiscono una partita —
 * mano iniziale, carte Premio, panchina, copie massime. Li leggono sia il
 * motore delle regole della casa (che li stampa sul foglio) sia la vista di
 * consultazione. Tenerli in due posti li farebbe divergere alla prima modifica,
 * e il foglio in mano ai giocatori contraddirebbe la scheda consultata sul
 * telefono: un modo sicuro di far litigare due bambini a metà partita.
 *
 * I formati ridotti non sono ufficiali: sono adattamenti di casa, pensati per
 * partite brevi con collezioni incomplete. Il formato da 60 è quello vero.
 *
 * Modulo puro.
 *
 * @module engine/formati
 */

/**
 * Limite di copie della stessa carta in un mazzo.
 *
 * Vale in tutti i formati, comprese le partite ridotte. Le **Energie base ne
 * sono esenti**: è la regola ufficiale, ed è anche l'unica ragione per cui un
 * mazzo costruito con poche carte diverse riesce a stare in piedi.
 */
export const MAX_COPIE = 4;

/**
 * Valori ufficiali del gioco, usati dai formati che non li alterano.
 * Stanno qui e non ripetuti in ogni formato: se un giorno cambiano, cambiano
 * in un punto solo.
 */
export const UFFICIALE = { manoIniziale: 7, premi: 6, panchina: 5 };

/**
 * @typedef {object} Formato
 * @property {number} taglia carte per mazzo
 * @property {string} nome etichetta leggibile
 * @property {string} perChi a chi è rivolto
 * @property {boolean} ufficiale se rispetta il regolamento vero
 * @property {number} manoIniziale carte pescate a inizio partita
 * @property {number} premi carte Premio da mettere da parte
 * @property {number} panchina Pokémon massimi in panchina
 * @property {string} durata tempo indicativo di una partita
 * @property {string[]} siPuo cosa è concesso in questo formato
 * @property {string[]} nonSiPuo cosa resta escluso
 * @property {string} [nota] avvertenza finale
 */

/**
 * I formati, dal più piccolo al più grande.
 *
 * L'ordine conta: `formatoPer()` sceglie il primo che regge la taglia chiesta.
 *
 * @type {Formato[]}
 */
export const FORMATI = [
  {
    taglia: 15,
    nome: 'Mini — 15 carte',
    perChi: 'Bambini piccoli, o una partita in venti minuti.',
    ufficiale: false,
    manoIniziale: 5,
    premi: 2,
    panchina: 3,
    durata: '10–20 minuti',
    siPuo: [
      'Attaccare, ritirarsi, mettere Energie: il turno funziona come nel gioco vero.',
      'Usare le carte Allenatore semplici (cura, pesca, ricerca).',
      'Far evolvere i Pokémon, se la linea evolutiva è nel mazzo.',
      'Tenere fino a 4 copie della stessa carta; le Energie base non hanno limite.',
    ],
    nonSiPuo: [
      'Avere più di 3 Pokémon in panchina: con 15 carte una panchina piena sarebbe mezzo mazzo.',
      'Contare su abilità e poteri: con la difficoltà semplificata si ignorano.',
      'Usare carte con regole proprie (VMAX, V ASTRO, MEGA): restano fuori dai mazzi generati.',
    ],
    nota:
      'Con soli 2 Premi la partita finisce in fretta: è voluto, serve a chiudere ' +
      'prima che l\'attenzione cali.',
  },
  {
    taglia: 20,
    nome: 'Facile — 20 carte',
    perChi: 'Chi ha già capito il turno e vuole una partita un po\' più lunga.',
    ufficiale: false,
    manoIniziale: 5,
    premi: 3,
    panchina: 3,
    durata: '20–30 minuti',
    siPuo: [
      'Tutto quello che si può fare nel formato Mini.',
      'Costruire linee evolutive complete: 20 carte bastano a farci stare Base ed evoluzione.',
      'Usare più carte Allenatore, perché ci sono più posti liberi nel mazzo.',
    ],
    nonSiPuo: [
      'Superare i 3 Pokémon in panchina.',
      'Usare carte con regole proprie (VMAX, V ASTRO, MEGA).',
    ],
    nota:
      'È il formato più equilibrato fra quelli ridotti: abbastanza carte per una ' +
      'strategia, abbastanza poche per finire in mezz\'ora.',
  },
  {
    taglia: 30,
    nome: 'Intermedio — 30 carte',
    perChi: 'Chi vuole giocare quasi con le regole vere, ma con mezzo mazzo.',
    ufficiale: false,
    manoIniziale: UFFICIALE.manoIniziale,
    premi: UFFICIALE.premi,
    panchina: UFFICIALE.panchina,
    durata: '30–45 minuti',
    siPuo: [
      'Giocare con mano da 7, 6 Premi e panchina da 5: da qui in su valgono i numeri ufficiali.',
      'Usare abilità e poteri dei Pokémon.',
      'Costruire linee complete fino al Livello 2.',
      'Usare qualsiasi carta Allenatore.',
    ],
    nonSiPuo: [
      'Giocare in tornei: la taglia non è legale in nessun formato ufficiale.',
      'Usare carte con regole proprie, se il mazzo è stato generato dall\'app.',
    ],
    nota:
      'Mano e Premi ufficiali impegnano 13 carte su 30: quasi metà mazzo. La ' +
      'partita è più tesa che nei formati ridotti.',
  },
  {
    taglia: 60,
    nome: 'Standard — 60 carte',
    perChi: 'Il gioco vero, come si gioca nei tornei.',
    ufficiale: true,
    manoIniziale: UFFICIALE.manoIniziale,
    premi: UFFICIALE.premi,
    panchina: UFFICIALE.panchina,
    durata: '30–60 minuti',
    siPuo: [
      'Tutto ciò che il regolamento ufficiale consente.',
      'Usare abilità, poteri, Strumenti e Stadi.',
      'Giocare le carte con regole proprie, se le si aggiunge a mano al mazzo.',
    ],
    nonSiPuo: [
      'Scendere sotto o salire sopra le 60 carte esatte.',
      'Mettere più di 4 copie della stessa carta, Energie base escluse.',
    ],
    nota:
      'Per una collezione di famiglia è il formato più difficile da riempire: ' +
      'servono 60 carte per giocatore, tutte contemporaneamente.',
  },
];

/**
 * Il formato che corrisponde a una taglia di mazzo.
 *
 * Se la taglia non coincide con nessun formato (mazzo rimasto incompleto per
 * mancanza di carte) si prende il primo formato abbastanza capiente: un mazzo
 * da 17 si gioca con le regole del formato da 20, non con quelle da 60.
 *
 * @param {number} taglia
 * @returns {Formato} l'ultimo formato se la taglia li supera tutti
 * @example
 * formatoPer(15).premi;  // 2
 * formatoPer(17).premi;  // 3  → si gioca come un mazzo da 20
 * formatoPer(60).premi;  // 6
 */
export function formatoPer(taglia) {
  return FORMATI.find((f) => taglia <= f.taglia) ?? FORMATI[FORMATI.length - 1];
}

/**
 * Se un formato altera i numeri ufficiali del gioco.
 *
 * Serve al motore delle regole: solo i formati che li alterano hanno bisogno di
 * una regola della casa stampata che lo spieghi.
 *
 * @param {Formato} formato
 * @returns {boolean}
 */
export function alteraNumeriUfficiali(formato) {
  return (
    formato.manoIniziale !== UFFICIALE.manoIniziale ||
    formato.premi !== UFFICIALE.premi ||
    formato.panchina !== UFFICIALE.panchina
  );
}
