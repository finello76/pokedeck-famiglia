/**
 * Portare i mazzi a una forza voluta.
 *
 * `bilancia.js` risponde a "sono pari fra loro?"; qui si risponde a un'altra
 * domanda, che il wizard adesso pone: "quanto forti li vuoi?". Serve perché
 * l'equilibrio non basta — due mazzi pari a 80 sono ingiocabili contro un
 * bambino, e due mazzi pari a 20 annoiano un adulto — e perché con un mazzo di
 * riferimento in casa ha senso chiedere mazzi che se la giochino con **quello**.
 *
 * ## Perché è il secondo stadio, non l'unico
 *
 * `bersaglio.js` arriva prima: prova più semi di `pianifica()` e tiene il piano
 * più vicino al bersaglio. È il modo onesto di centrare un numero, perché ogni
 * piano che propone è un piano che il generatore avrebbe potuto produrre da
 * solo. Ma la sua precisione è quella della dispersione fra i semi, che è più
 * larga della tolleranza: quando il seme migliore resta a quindici punti dal
 * bersaglio, o non si arriva, o si scambiano carte.
 *
 * Questo modulo è quel secondo passo, e va usato **dopo** `cercaPiano()`: la
 * salita di collina della specifica, con un obiettivo invece di una differenza.
 * Si prova ogni scambio possibile fra una carta del mazzo e una ancora libera
 * in collezione, si tiene quello che avvicina di più al numero chiesto, e si
 * ripete finché nessuno scambio migliora. Partendo da un piano già vicino gli
 * scambi necessari sono pochi, ed è esattamente il punto: meno si scambia, meno
 * si allontana il mazzo da quello che il generatore aveva pensato.
 *
 * ## L'unità di misura
 *
 * Si misura con `forza()` di `forza.js` — la scala assoluta 0–100 — e **non**
 * con `punteggioMazzo()` di `bilancia.js`. Sono due scale diverse: quella di
 * `bilancia.js` è relativa e serve a confrontare mazzi fra loro nello stesso
 * piano, mentre l'obiettivo che il wizard chiede è il numero che la UI mostra
 * accanto al mazzo e al riferimento. Inseguire una scala e mostrarne un'altra
 * significherebbe fermarsi a "obiettivo raggiunto" su uno schermo che continua
 * a scrivere un numero lontano.
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
 * @module engine/obiettivo-forza
 */

import { forza } from './forza.js';
import { classifica } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { aggiungiAlMazzo, togliDalMazzo, chiaveVoce } from './mazzo.js';

/**
 * Scarto entro cui la forza si considera centrata.
 *
 * Cinque punti su cento, la stessa soglia di `confronta()` in `forza.js` e di
 * `TOLLERANZA` in `bersaglio.js`, e deve restare la stessa: se ci si fermasse a
 * una distanza che poi la UI chiama "più forte", l'app si contraddirebbe da
 * sola.
 */
export const TOLLERANZA_FORZA = 5;

/**
 * @typedef {object} EsitoForza
 * @property {string} mazzo nome del mazzo
 * @property {number} partenza forza prima degli scambi
 * @property {number} arrivo forza dopo
 * @property {boolean} raggiunto se si è entrati nella tolleranza
 * @property {'obiettivo'|'collezione'|'passi'|'nonMisurabile'} motivo perché ci
 *   si è fermati: arrivati, nessuno scambio migliora più, tentativi esauriti, o
 *   il mazzo non ha abbastanza attacchi noti perché il numero voglia dire nulla
 * @property {Array<{fuori: string, dentro: string}>} scambi le carte cambiate
 */

/**
 * Avvicina ogni mazzo alla forza chiesta, scambiando carte con la collezione.
 *
 * Muta i mazzi e la dispensa ricevuti.
 *
 * @param {object[]} mazzi
 * @param {object} opzioni
 * @param {number} opzioni.obiettivo la forza voluta 0–100; 0 o assente = non si tocca nulla
 * @param {import('./dispensa.js').Dispensa} opzioni.dispensa copie ancora libere
 * @param {number} [opzioni.taglia] la taglia dei mazzi, passata a `forza()`
 * @param {number} [opzioni.passiMassimi=10] tetto agli scambi per mazzo
 * @param {number} [opzioni.tolleranza=TOLLERANZA_FORZA]
 * @returns {{obiettivo: number|null, esiti: EsitoForza[]}}
 * @example
 * const piano = await cercaPiano(voci, opzioni, { bersaglio: 45 });
 * const esito = avvicinaAForza(piano.mazzi, {
 *   obiettivo: 45,
 *   taglia: opzioni.taglia,
 *   dispensa: disponibilitaResidua(voci, piano.mazzi),
 * });
 * esito.esiti[0]; // { mazzo: 'Erba', partenza: 61, arrivo: 47, raggiunto: true, … }
 */
export function avvicinaAForza(mazzi, opzioni = {}) {
  const {
    obiettivo = 0,
    dispensa = null,
    taglia = undefined,
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
    avvicinaUno(mazzo, { obiettivo, dispensa, taglia, passiMassimi, tolleranza }),
  );
  return { obiettivo, esiti };
}

/**
 * La forza di un mazzo sulla scala 0–100.
 *
 * @param {object} mazzo
 * @param {number|undefined} taglia
 * @returns {{totale: number, attendibile: boolean}}
 */
function misura(mazzo, taglia) {
  const f = forza(mazzo, taglia ? { taglia } : {});
  return { totale: f.totale, attendibile: f.attendibile };
}

/**
 * @param {object} mazzo
 * @param {object} opzioni
 * @returns {EsitoForza}
 */
function avvicinaUno(mazzo, { obiettivo, dispensa, taglia, passiMassimi, tolleranza }) {
  const iniziale = misura(mazzo, taglia);
  const partenza = iniziale.totale;

  // Se il dataset non conosce abbastanza attacchi, `forza()` lo dichiara e il
  // totale non è un'informazione: scambiare carte per spostarlo sarebbe
  // rimescolare il mazzo inseguendo rumore. Meglio lasciarlo com'è e dirlo.
  if (!iniziale.attendibile) {
    return {
      mazzo: mazzo.nome,
      partenza,
      arrivo: partenza,
      raggiunto: false,
      motivo: 'nonMisurabile',
      scambi: [],
    };
  }

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

    const scelta = migliorScambio(mazzo, dispensa, obiettivo, corrente, taglia);
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
 * @param {number|undefined} taglia
 * @returns {{cartaFuori: object, carta: object, forza: number}|null}
 */
function migliorScambio(mazzo, dispensa, obiettivo, corrente, taglia) {
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
      const { totale } = misura(mazzo, taglia);
      annulla();

      const scarto = Math.abs(totale - obiettivo);
      if (scarto < scartoMigliore) {
        scartoMigliore = scarto;
        migliore = { cartaFuori, carta, forza: totale };
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
