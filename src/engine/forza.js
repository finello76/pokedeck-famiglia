/**
 * Portare i mazzi a una forza voluta.
 *
 * `bilancia.js` risponde a "sono pari fra loro?"; qui si risponde a un'altra
 * domanda, che il wizard adesso pone: "quanto forti li vuoi?". Serve perché
 * l'equilibrio non basta — due mazzi pari a 150 sono ingiocabili contro un
 * bambino, e due mazzi pari a 40 annoiano un adulto — e perché con un mazzo di
 * riferimento in casa ha senso chiedere mazzi che se la giochino con **quello**.
 *
 * Il metodo è la salita di collina della specifica, con un obiettivo invece di
 * una differenza: si prova ogni scambio possibile fra una carta del mazzo e una
 * ancora libera in collezione, si tiene quello che avvicina di più al numero
 * chiesto, e si ripete finché nessuno scambio migliora.
 *
 * Due vincoli tengono i mazzi giocabili invece di limitarsi a spostare il
 * numero:
 *
 * - esce solo un Pokémon **sciolto**: se qualcuno nel mazzo evolve da lui, o se
 *   lui evolve da una carta presente, toglierlo spezzerebbe una linea evolutiva
 *   — cioè romperebbe la parte migliore del mazzo per far quadrare un conto;
 * - entra solo un Pokémon **Base** di un tipo che il mazzo alimenta già, o
 *   senza tipo: un Base di un tipo estraneo abbasserebbe il punteggio (è anche
 *   la scorciatoia che la salita di collina prenderebbe per prima) lasciando in
 *   mano una carta che non si può attaccare, senza Energie che la servano.
 *
 * Quando la collezione non permette di arrivare all'obiettivo il modulo si
 * ferma e lo dice: `raggiunto: false`. Non è un fallimento da nascondere — è
 * l'informazione che serve a chi sperava in mazzi da 45 e ha in scatola solo
 * carte forti.
 *
 * Modulo puro: riceve mazzi e dispensa, non sa nulla di DOM né di database.
 *
 * @module engine/forza
 */

import { punteggioMazzo } from './bilancia.js';
import { classifica } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { aggiungiAlMazzo, togliDalMazzo, chiaveVoce } from './mazzo.js';

/**
 * Scarto entro cui la forza si considera centrata.
 *
 * Il punteggio non è una misura fine: cinque punti sono meno di una carta di
 * differenza, e inseguirli produrrebbe scambi che nessuno noterebbe giocando.
 */
export const TOLLERANZA_FORZA = 5;

/**
 * @typedef {object} EsitoForza
 * @property {string} mazzo nome del mazzo
 * @property {number} partenza forza prima degli scambi
 * @property {number} arrivo forza dopo
 * @property {boolean} raggiunto se si è entrati nella tolleranza
 * @property {'obiettivo'|'collezione'|'passi'} motivo perché ci si è fermati:
 *   arrivati, nessuno scambio migliora più, o tentativi esauriti
 * @property {Array<{fuori: string, dentro: string}>} scambi le carte cambiate
 */

/**
 * Avvicina ogni mazzo alla forza chiesta, scambiando carte con la collezione.
 *
 * Muta i mazzi e la dispensa ricevuti.
 *
 * @param {object[]} mazzi
 * @param {object} opzioni
 * @param {number} opzioni.obiettivo la forza voluta; 0 o assente = non si tocca nulla
 * @param {import('./dispensa.js').Dispensa} opzioni.dispensa copie ancora libere
 * @param {number} [opzioni.passiMassimi=10] tetto agli scambi per mazzo
 * @param {number} [opzioni.tolleranza=TOLLERANZA_FORZA]
 * @returns {{obiettivo: number|null, esiti: EsitoForza[]}}
 * @example
 * const esito = avvicinaAForza(piano.mazzi, {
 *   obiettivo: 45,
 *   dispensa: disponibilitaResidua(voci, piano.mazzi),
 * });
 * esito.esiti[0]; // { mazzo: 'Erba', partenza: 111, arrivo: 48, raggiunto: true, … }
 */
export function avvicinaAForza(mazzi, opzioni = {}) {
  const {
    obiettivo = 0,
    dispensa = null,
    passiMassimi = 10,
    tolleranza = TOLLERANZA_FORZA,
  } = opzioni;

  if (!obiettivo || obiettivo <= 0 || !Array.isArray(mazzi) || !mazzi.length) {
    return { obiettivo: obiettivo || null, esiti: [] };
  }

  // I mazzi si scorrono in ordine e condividono la dispensa: la carta che il
  // primo prende non è più disponibile per il secondo, esattamente come nella
  // generazione. Senza, due mazzi si ritroverebbero la stessa carta fisica.
  const esiti = mazzi.map((mazzo) =>
    avvicinaUno(mazzo, { obiettivo, dispensa, passiMassimi, tolleranza }),
  );
  return { obiettivo, esiti };
}

/**
 * @param {object} mazzo
 * @param {object} opzioni
 * @returns {EsitoForza}
 */
function avvicinaUno(mazzo, { obiettivo, dispensa, passiMassimi, tolleranza }) {
  const partenza = punteggioMazzo(mazzo).totale;
  const scambi = [];
  let corrente = partenza;
  // Perché ci si è fermati. Serve a non far dire alla UI "con le tue carte non
  // si va oltre" quando in realtà si è solo esaurito il numero di tentativi:
  // sono due frasi diverse, e una delle due sarebbe falsa.
  let motivo = 'passi';

  for (let passo = 0; passo < passiMassimi; passo++) {
    if (Math.abs(corrente - obiettivo) <= tolleranza) {
      motivo = 'obiettivo';
      break;
    }

    const scelta = migliorScambio(mazzo, dispensa, obiettivo, corrente);
    if (!scelta) {
      motivo = 'collezione';
      break;
    }

    // Applicato per davvero: la prova l'ha già annullata.
    const voce = vocePer(mazzo, scelta.cartaFuori);
    if (!voce || !scambia(mazzo, voce, scelta.carta)) {
      motivo = 'collezione';
      break;
    }
    dispensa?.preleva(scelta.carta, 1);
    dispensa?.restituisci(scelta.cartaFuori, 1);

    scambi.push({ fuori: scelta.cartaFuori.nome, dentro: scelta.carta.nome });
    corrente = scelta.forza;
  }

  return {
    mazzo: mazzo.nome,
    partenza,
    arrivo: corrente,
    raggiunto: Math.abs(corrente - obiettivo) <= tolleranza,
    motivo,
    scambi,
  };
}

/**
 * Lo scambio che avvicina di più all'obiettivo, se ne esiste uno che migliori.
 *
 * @param {object} mazzo
 * @param {import('./dispensa.js').Dispensa} dispensa
 * @param {number} obiettivo
 * @param {number} corrente forza attuale del mazzo
 * @returns {{cartaFuori: object, carta: object, forza: number}|null}
 */
function migliorScambio(mazzo, dispensa, obiettivo, corrente) {
  if (!dispensa) return null;

  // Si annotano le **carte** e non le voci: provando uno scambio l'ultima copia
  // di una voce la fa sparire da `mazzo.carte`, e annullando rientra come voce
  // nuova. Tenendo il riferimento vecchio, tutte le prove successive su quella
  // carta fallivano in silenzio — e le carte in copia unica non venivano mai
  // considerate.
  const uscite = mazzo.carte.filter((voce) => sostituibile(voce, mazzo)).map((voce) => voce.carta);
  const entrate = dispensa
    .cerca((carta) => carta.categoria === 'Pokémon' && classifica(carta).livello === 0)
    .filter(({ carta }) => tipoCompatibile(carta, mazzo))
    .map(({ carta }) => carta);

  let migliore = null;
  let scartoMigliore = Math.abs(corrente - obiettivo);

  for (const cartaFuori of uscite) {
    for (const carta of entrate) {
      const voce = vocePer(mazzo, cartaFuori);
      if (!voce) continue;
      const annulla = scambia(mazzo, voce, carta);
      // Il tetto delle 4 copie ha respinto la carta: non è uno scambio.
      if (!annulla) continue;
      const forza = punteggioMazzo(mazzo).totale;
      annulla();

      const scarto = Math.abs(forza - obiettivo);
      if (scarto < scartoMigliore) {
        scartoMigliore = scarto;
        migliore = { cartaFuori, carta, forza };
      }
    }
  }
  return migliore;
}

/**
 * La voce del mazzo che contiene questa carta vera.
 * @param {object} mazzo
 * @param {object} carta
 * @returns {object|undefined}
 */
function vocePer(mazzo, carta) {
  const chiave = chiaveVoce(carta, false);
  return mazzo.carte.find((voce) => !voce.proxy && chiaveVoce(voce.carta, false) === chiave);
}

/**
 * Se una voce del mazzo si può togliere senza spezzare una linea evolutiva.
 *
 * @param {object} voce
 * @param {object} mazzo
 * @returns {boolean}
 */
function sostituibile(voce, mazzo) {
  // Le carte da stampare esistono per una carta precisa: non sono zavorra da
  // scambiare, e toglierle è compito di `riallinea.js`.
  if (voce.proxy) return false;
  const carta = voce.carta;
  if (carta?.categoria !== 'Pokémon') return false;

  const nome = normalizzaNome(carta.nome);
  const regge = mazzo.carte.some(
    (altra) => altra !== voce && normalizzaNome(altra.carta?.evolveDa) === nome,
  );
  if (regge) return false;

  // Evoluzione appoggiata su una Base presente: portandola via si lascia nel
  // mazzo una Base che non evolve più in niente.
  if (carta.evolveDa) {
    const suaBase = normalizzaNome(carta.evolveDa);
    if (mazzo.carte.some((altra) => normalizzaNome(altra.carta?.nome) === suaBase)) return false;
  }
  return true;
}

/**
 * Se una carta può entrare in questo mazzo senza restare senza Energie.
 * @param {object} carta
 * @param {object} mazzo
 * @returns {boolean}
 */
function tipoCompatibile(carta, mazzo) {
  const tipi = carta.tipi ?? [];
  if (!tipi.length) return true;
  const delMazzo = mazzo.tipi ?? [];
  if (!delMazzo.length) return true;
  return tipi.some((tipo) => delMazzo.includes(tipo));
}

/**
 * Scambia una copia: fuori la voce, dentro la carta.
 *
 * @param {object} mazzo
 * @param {object} voce voce presente in `mazzo.carte`
 * @param {object} carta
 * @returns {(() => void)|null} come rimettere le cose a posto, `null` se lo
 *   scambio non si è potuto fare
 */
function scambia(mazzo, voce, carta) {
  // La voce può sparire da `mazzo.carte` (ultima copia): i suoi dati servono
  // dopo, per rimetterla dentro identica.
  const originale = voce.carta;
  const extra = voce.proxy ? { proxy: true, motivo: voce.motivo } : {};

  if (togliDalMazzo(mazzo, voce, 1) === 0) return null;
  if (aggiungiAlMazzo(mazzo, carta, 1) === 0) {
    aggiungiAlMazzo(mazzo, originale, 1, extra);
    return null;
  }

  return () => {
    const chiave = chiaveVoce(carta, false);
    const entrata = mazzo.carte.find((c) => chiaveVoce(c.carta, c.proxy) === chiave);
    if (entrata) togliDalMazzo(mazzo, entrata, 1);
    aggiungiAlMazzo(mazzo, originale, 1, extra);
  };
}
