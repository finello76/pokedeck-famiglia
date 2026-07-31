/**
 * La mini partita: stato del tavolo e mosse legali.
 *
 * Serve a **far capire il gioco**, non a sostituire il regolamento. Simula il
 * nucleo — mano iniziale, Base a terra, un'Energia per turno, evoluzioni,
 * ritirata, attacco con debolezza e resistenza, stati speciali, Premi — e si
 * ferma dove il gioco vero diventa testo: abilità, poteri e le carte Allenatore
 * complicate le legge chi gioca (vedi `engine/allenatori.js`).
 *
 * ## Perché è un modulo puro
 *
 * Una partita è tutta casi limite: la mano iniziale senza Pokémon Base, il KO
 * che pesca l'ultimo Premio, il Pokémon addormentato che non può ritirarsi, il
 * mazzo che finisce. Provarli a mano vuol dire giocare venti partite per
 * vederne uno; provarli qui vuol dire scrivere sei righe. Per questo qui non
 * c'è DOM, non c'è database e **non c'è `Math.random()`**: il caso arriva da
 * `engine/casuale.js` con un seme, quindi la stessa partita si può rigiocare
 * identica — che serve ai test e serve a chi vuole rivedere cos'è successo.
 *
 * Ogni funzione **restituisce uno stato nuovo** e non tocca quello ricevuto: la
 * schermata può così tenersi lo stato precedente e animare la differenza fra i
 * due, che è esattamente ciò che rende una partita bella da guardare.
 *
 * @module engine/partita
 */

import { Casuale } from './casuale.js';
import { formatoPer } from './formati.js';
import { giocabileOra, interpreta } from './allenatori.js';
import {
  fraIDueTurni,
  puoAgire,
  riconosciStati,
  sbagliaPerConfusione,
  statiDopoLaPanchina,
  vuoleMoneta,
} from './stati-speciali.js';

/** Un Pokémon in gioco, con addosso quello che gli è successo. */
/**
 * @typedef {object} Slot
 * @property {object} carta
 * @property {number} danni segnalini danno, non PS residui: è così che si conta
 *   al tavolo, e si legge sulla carta senza sottrazioni
 * @property {string[]} energie i tipi delle Energie attaccate
 * @property {string[]} stati gli stati speciali addosso
 * @property {number} entrataTurno il turno in cui è arrivato in gioco: serve
 *   alla regola "non si evolve un Pokémon giocato adesso"
 */

/**
 * @typedef {object} Giocatore
 * @property {string} nome
 * @property {object[]} mazzo carte da pescare, la prima è la cima
 * @property {object[]} mano
 * @property {Slot|null} attivo
 * @property {Slot[]} panchina
 * @property {object[]} premi
 * @property {object[]} scarti
 * @property {boolean} energiaGiocata un'Energia per turno
 * @property {boolean} aiutoGiocato un Aiuto per turno
 * @property {boolean} ritirataFatta una ritirata per turno
 */

/** Danno che un attacco fa in più contro chi è debole, quando la carta dice `×2`. */
const MOLTIPLICATORE_DEBOLEZZA = 2;

/**
 * Prepara una partita fra due mazzi.
 *
 * Non schiera niente da sé: la prima cosa che si fa al tavolo è scegliere il
 * proprio Pokémon Base, ed è anche la prima cosa che un bambino deve imparare a
 * fare. Lo stato esce in fase `preparazione` e aspetta `schiera()`.
 *
 * @param {object} opzioni
 * @param {Array<{nome: string, carte: Array<{carta: object, quantita: number}>}>} opzioni.mazzi
 * @param {number} [opzioni.taglia] decide mano, Premi e panchina via `formati.js`
 * @param {string[]} [opzioni.regole] i codici delle regole della casa attive
 * @param {number} [opzioni.seme] per rigiocare identica la stessa partita
 * @returns {object} lo stato iniziale
 */
export function iniziaPartita({ mazzi, taglia, regole = [], seme = 1 }) {
  const caso = new Casuale(seme);
  const formato = formatoPer(taglia ?? contaCarte(mazzi[0]));
  const casa = permessiDaRegole(regole);

  const giocatori = mazzi.map((m) => {
    const carte = caso.mescola(espandi(m.carte));
    const mano = carte.slice(0, formato.manoIniziale);
    const resto = carte.slice(formato.manoIniziale);
    return {
      nome: m.nome ?? 'Giocatore',
      mano,
      premi: resto.slice(0, formato.premi),
      mazzo: resto.slice(formato.premi),
      attivo: null,
      panchina: [],
      scarti: [],
      energiaGiocata: false,
      aiutoGiocato: false,
      ritirataFatta: false,
    };
  });

  return {
    seme,
    caso,
    formato,
    casa,
    turno: 1,
    diChi: 0,
    fase: 'preparazione',
    vincitore: null,
    giocatori,
    registro: giocatori.map((g, i) => ({
      tipo: 'mano-iniziale',
      chi: i,
      quante: g.mano.length,
      senzaBase: !g.mano.some(eBase),
    })),
  };
}

/**
 * Se la mano di quel giocatore non ha nessun Pokémon da mettere a terra.
 *
 * È la prima cosa che si guarda al tavolo, prima ancora di cominciare: senza un
 * Base non si può schierare, e senza schierare non si gioca.
 *
 * @param {object} stato
 * @param {number} chi
 * @returns {boolean}
 */
export function manoImpossibile(stato, chi) {
  return !stato.giocatori[chi].mano.some((c) => giocabileComeBase(c, stato.casa));
}

/**
 * Rimescola la mano nel mazzo e ne ridà una: il *mulligan*.
 *
 * Nel gioco vero chi rimescola regala all'avversario una carta in più — è il
 * prezzo di una mano fortunata. La regola della casa `mulligan-morbido` toglie
 * il prezzo: con mazzi da quindici carte e pochi Base, pescare male non è colpa
 * di nessuno e punire i bambini per la sfortuna li fa smettere di giocare.
 *
 * @param {object} stato
 * @param {number} chi
 * @returns {object}
 */
export function rimescolaMano(stato, chi) {
  const nuovo = copia(stato);
  const g = nuovo.giocatori[chi];
  const tutte = nuovo.caso.mescola([...g.mazzo, ...g.mano]);
  g.mano = tutte.slice(0, nuovo.formato.manoIniziale);
  g.mazzo = tutte.slice(nuovo.formato.manoIniziale);

  const altro = nuovo.giocatori[1 - chi];
  const premio = !nuovo.casa.mulliganMorbido && altro.mazzo.length;
  if (premio) altro.mano.push(altro.mazzo.shift());

  nuovo.registro.push({ tipo: 'mulligan', chi, cartaInPiuPerLaltro: Boolean(premio) });
  return nuovo;
}

/**
 * Le regole della casa che cambiano **come si gioca**, dai loro codici.
 *
 * Si leggono i codici e non i testi: il testo di una regola è scritto per
 * essere letto da un bambino e può cambiare parola, il codice no. Sono gli
 * stessi codici di `engine/regole-catalogo.js`.
 *
 * @param {string[]} codici
 * @returns {{energiaUniversale: boolean, scontoCosto: number, evoluzioniComeBase: boolean, ritirataGratis: boolean}}
 */
export function permessiDaRegole(codici = []) {
  const ha = (c) => codici.includes(c);
  return {
    energiaUniversale: ha('energia-universale'),
    scontoCosto: ha('costi-ridotti') ? 1 : 0,
    evoluzioniComeBase: ha('evoluzioni-come-base'),
    ritirataGratis: ha('ritirata-agevolata'),
    mulliganMorbido: ha('mulligan-morbido'),
  };
}

/** @param {{carte?: Array<{quantita: number}>}} mazzo @returns {number} */
function contaCarte(mazzo) {
  return (mazzo?.carte ?? []).reduce((s, c) => s + (c.quantita ?? 0), 0);
}

/**
 * Da `{carta, quantita}` a un mazzo di carte una per una, che è come si pesca.
 * @param {Array<{carta: object, quantita: number}>} voci
 * @returns {object[]}
 */
function espandi(voci) {
  const carte = [];
  for (const voce of voci ?? []) {
    for (let i = 0; i < (voce.quantita ?? 0); i += 1) carte.push(voce.carta ?? voce);
  }
  return carte;
}

/** @param {object} carta @returns {boolean} */
function eBase(carta) {
  return carta?.categoria === 'Pokémon' && (carta.stadio ?? 'Base') === 'Base';
}

/** @param {object} carta @returns {boolean} */
function eEnergia(carta) {
  return carta?.categoria === 'Energia';
}

/**
 * Il tipo di Energia che una carta porta.
 * Le Energie base si chiamano "Energia Fuoco": il tipo è l'ultima parola.
 * @param {object} carta
 * @returns {string}
 */
export function tipoEnergia(carta) {
  const parti = String(carta?.nome ?? '').trim().split(/\s+/);
  return parti.length > 1 ? parti[parti.length - 1] : 'Incolore';
}

/** Copia profonda quanto basta: gli stati non si modificano mai sul posto. */
function copia(stato) {
  return {
    ...stato,
    giocatori: stato.giocatori.map((g) => ({
      ...g,
      mano: [...g.mano],
      mazzo: [...g.mazzo],
      premi: [...g.premi],
      scarti: [...g.scarti],
      panchina: g.panchina.map((s) => ({ ...s, energie: [...s.energie], stati: [...s.stati] })),
      attivo: g.attivo
        ? { ...g.attivo, energie: [...g.attivo.energie], stati: [...g.attivo.stati] }
        : null,
    })),
    registro: [...stato.registro],
  };
}

/** Lo slot nuovo per una carta che entra in gioco. */
function slot(carta, turno) {
  return { carta, danni: 0, energie: [], stati: [], entrataTurno: turno };
}

/**
 * Mette in gioco un Pokémon Base dalla mano.
 *
 * @param {object} stato
 * @param {number} indiceMano
 * @param {'attivo'|'panchina'} [dove='panchina']
 * @returns {object} stato nuovo
 */
export function schiera(stato, indiceMano, dove = 'panchina') {
  const nuovo = copia(stato);
  const g = nuovo.giocatori[nuovo.diChi];
  const carta = g.mano[indiceMano];
  if (!carta || !giocabileComeBase(carta, nuovo.casa)) return stato;
  if (dove === 'panchina' && g.panchina.length >= nuovo.formato.panchina) return stato;
  if (dove === 'attivo' && g.attivo) return stato;

  g.mano.splice(indiceMano, 1);
  const messo = slot(carta, nuovo.turno);
  if (dove === 'attivo') g.attivo = messo;
  else g.panchina.push(messo);

  nuovo.registro.push({ tipo: 'schiera', chi: nuovo.diChi, carta, dove });

  if (nuovo.fase === 'preparazione') {
    // In preparazione si sceglie **solo** il Pokémon attivo, a turno: la
    // panchina si riempie giocando. È una semplificazione voluta — al tavolo si
    // schiera tutto insieme a carte coperte — perché qui una mossa per volta è
    // anche una spiegazione per volta, e la panchina si capisce meglio quando
    // serve davvero.
    if (nuovo.giocatori.every((x) => x.attivo)) {
      nuovo.fase = 'turno';
      nuovo.diChi = 0;
      // Il primo turno comincia pescando: è la prima cosa che si fa, sempre.
      return pesca(nuovo);
    }
    nuovo.diChi = 1 - nuovo.diChi;
  }
  return nuovo;
}

/**
 * Se una carta si può mettere a terra come Base.
 *
 * Con la regola della casa "le evoluzioni si giocano come Base" vale anche per
 * un Livello 1 o 2: è la regola che rende giocabili le evoluzioni orfane, ed è
 * il motivo per cui esiste metà del motore dei mazzi.
 *
 * @param {object} carta
 * @param {{evoluzioniComeBase: boolean}} casa
 * @returns {boolean}
 */
export function giocabileComeBase(carta, casa) {
  if (carta?.categoria !== 'Pokémon') return false;
  return eBase(carta) || Boolean(casa?.evoluzioniComeBase);
}

/**
 * Pesca una carta. Chi non può pescare **ha perso**: è una delle tre fini
 * possibili del gioco, e la più sorprendente per chi impara.
 *
 * @param {object} stato
 * @returns {object}
 */
export function pesca(stato) {
  const nuovo = copia(stato);
  const g = nuovo.giocatori[nuovo.diChi];
  if (!g.mazzo.length) {
    nuovo.fase = 'finita';
    nuovo.vincitore = 1 - nuovo.diChi;
    nuovo.registro.push({ tipo: 'mazzo-finito', chi: nuovo.diChi });
    return nuovo;
  }
  const carta = g.mazzo.shift();
  g.mano.push(carta);
  nuovo.registro.push({ tipo: 'pesca', chi: nuovo.diChi, carta });
  return nuovo;
}

/**
 * Attacca un'Energia dalla mano a un Pokémon in gioco. Una per turno.
 *
 * @param {object} stato
 * @param {number} indiceMano
 * @param {'attivo'|number} bersaglio `attivo` o l'indice in panchina
 * @returns {object}
 */
export function attaccaEnergia(stato, indiceMano, bersaglio = 'attivo') {
  const nuovo = copia(stato);
  const g = nuovo.giocatori[nuovo.diChi];
  const carta = g.mano[indiceMano];
  if (!carta || !eEnergia(carta) || g.energiaGiocata) return stato;

  const dove = bersaglio === 'attivo' ? g.attivo : g.panchina[bersaglio];
  if (!dove) return stato;

  g.mano.splice(indiceMano, 1);
  dove.energie.push(tipoEnergia(carta));
  g.energiaGiocata = true;
  nuovo.registro.push({ tipo: 'energia', chi: nuovo.diChi, carta, bersaglio });
  return nuovo;
}

/**
 * Fa evolvere un Pokémon in gioco.
 *
 * Due regole vere che sorprendono sempre: si evolve **solo** un Pokémon che era
 * già in gioco all'inizio del turno, e l'evoluzione **cura gli stati speciali**
 * ma non i danni.
 *
 * @param {object} stato
 * @param {number} indiceMano
 * @param {'attivo'|number} bersaglio
 * @returns {object}
 */
export function evolvi(stato, indiceMano, bersaglio = 'attivo') {
  const nuovo = copia(stato);
  const g = nuovo.giocatori[nuovo.diChi];
  const carta = g.mano[indiceMano];
  const dove = bersaglio === 'attivo' ? g.attivo : g.panchina[bersaglio];
  if (!carta || !dove || !evolveDa(carta, dove.carta)) return stato;
  if (dove.entrataTurno === nuovo.turno) return stato;

  g.mano.splice(indiceMano, 1);
  g.scarti.push(dove.carta);
  dove.carta = carta;
  dove.stati = [];
  dove.entrataTurno = nuovo.turno;
  nuovo.registro.push({ tipo: 'evoluzione', chi: nuovo.diChi, carta, bersaglio });
  return nuovo;
}

/** @param {object} evoluzione @param {object} sotto @returns {boolean} */
function evolveDa(evoluzione, sotto) {
  if (evoluzione?.categoria !== 'Pokémon' || !evoluzione.evolveDa) return false;
  return evoluzione.evolveDa.toLowerCase() === String(sotto?.nome ?? '').toLowerCase();
}

/**
 * Ritira l'attivo, scambiandolo con un Pokémon della panchina.
 *
 * Costa Energie da scartare — quante lo dice la carta — e **cancella gli stati
 * speciali**, che è il motivo per cui ritirarsi è una mossa e non una resa. La
 * regola della casa "prima ritirata gratuita" salta il costo una volta per
 * turno.
 *
 * @param {object} stato
 * @param {number} indicePanchina
 * @returns {object}
 */
export function ritirati(stato, indicePanchina) {
  const nuovo = copia(stato);
  const g = nuovo.giocatori[nuovo.diChi];
  const entrante = g.panchina[indicePanchina];
  if (!g.attivo || !entrante) return stato;

  const { puo } = puoAgire(g.attivo);
  if (!puo) return stato;

  const gratis = nuovo.casa.ritirataGratis && !g.ritirataFatta;
  const costo = gratis ? 0 : Math.max(0, g.attivo.carta.ritirata ?? 0);
  if (g.attivo.energie.length < costo) return stato;

  for (let i = 0; i < costo; i += 1) {
    const tipo = g.attivo.energie.pop();
    g.scarti.push({ nome: `Energia ${tipo}`, categoria: 'Energia' });
  }
  g.attivo.stati = statiDopoLaPanchina();
  const uscente = g.attivo;
  g.attivo = entrante;
  g.panchina[indicePanchina] = uscente;
  g.ritirataFatta = true;
  nuovo.registro.push({ tipo: 'ritirata', chi: nuovo.diChi, costo, gratis });
  return nuovo;
}

/**
 * Gioca una carta Allenatore dalla mano.
 *
 * Quello che la partita sa fare lo fa (vedi `engine/allenatori.js`); quello che
 * non sa lo **dichiara**: la carta finisce comunque negli scarti e nel registro
 * resta il testo, perché la schermata lo mostri e chi gioca lo applichi. È il
 * confine dichiarato di cui parla quel modulo — una partita che esegue metà
 * carta e tace sull'altra metà insegnerebbe la regola sbagliata.
 *
 * @param {object} stato
 * @param {number} indiceMano
 * @param {{panchina?: number}} [scelte] dove serve un bersaglio (lo scambio)
 * @returns {object}
 */
export function giocaAllenatore(stato, indiceMano, scelte = {}) {
  const nuovo = copia(stato);
  const g = nuovo.giocatori[nuovo.diChi];
  const carta = g.mano[indiceMano];
  if (carta?.categoria !== 'Allenatore') return stato;
  if (!giocabileOra(carta, g).possibile) return stato;

  const effetto = interpreta(carta);
  g.mano.splice(indiceMano, 1);
  g.scarti.push(carta);
  if (carta.tipoAllenatore === 'Aiuto') g.aiutoGiocato = true;

  let esito = nuovo;
  switch (effetto.tipo) {
    case 'pesca':
      for (let i = 0; i < effetto.quante; i += 1) esito = pesca(esito);
      break;
    case 'cura':
      if (esito.giocatori[esito.diChi].attivo) {
        const attivo = esito.giocatori[esito.diChi].attivo;
        attivo.danni = Math.max(0, attivo.danni - effetto.quanti);
      }
      break;
    case 'scambia': {
      const mio = esito.giocatori[esito.diChi];
      const i = scelte.panchina ?? 0;
      if (mio.attivo && mio.panchina[i]) {
        // Come una ritirata gratuita: gli stati speciali restano fuori dal campo.
        mio.attivo.stati = statiDopoLaPanchina();
        const uscente = mio.attivo;
        mio.attivo = mio.panchina[i];
        mio.panchina[i] = uscente;
      }
      break;
    }
    default:
      break;
  }

  esito.registro.push({
    tipo: 'allenatore',
    chi: nuovo.diChi,
    carta,
    effetto: effetto.tipo,
    testo: effetto.testo,
    daApplicareAMano: effetto.tipo === 'manuale',
  });
  return esito;
}

/**
 * Se le Energie attaccate bastano per un attacco.
 *
 * Con `energiaUniversale` (regola della casa) ogni Energia vale per qualsiasi
 * tipo: si guarda solo **quante** ne servono. Senza, si controlla tipo per
 * tipo, e le `Incolore` le paga qualunque Energia avanzata.
 *
 * @param {Slot} slotAttivo
 * @param {{costo?: string[]}} attacco
 * @param {{energiaUniversale: boolean, scontoCosto: number}} casa
 * @returns {{basta: boolean, servono: number, ha: number}}
 */
export function energieSufficienti(slotAttivo, attacco, casa) {
  const costoPieno = [...(attacco?.costo ?? [])];
  const sconto = casa?.scontoCosto ?? 0;
  // Lo sconto non può azzerare un attacco: un attacco gratis non esiste, e la
  // regola della casa dice "minimo 1".
  const quanti = Math.max(costoPieno.length ? 1 : 0, costoPieno.length - sconto);
  const costo = costoPieno.slice(0, quanti);
  const ha = slotAttivo?.energie?.length ?? 0;

  if (casa?.energiaUniversale) return { basta: ha >= costo.length, servono: costo.length, ha };

  const disponibili = [...(slotAttivo?.energie ?? [])];
  for (const richiesto of costo.filter((t) => t !== 'Incolore')) {
    const i = disponibili.indexOf(richiesto);
    if (i === -1) return { basta: false, servono: costo.length, ha };
    disponibili.splice(i, 1);
  }
  const incolori = costo.filter((t) => t === 'Incolore').length;
  return { basta: disponibili.length >= incolori, servono: costo.length, ha };
}

/**
 * Il danno che arriva davvero, con debolezza e resistenza.
 *
 * È il calcolo che insegna la prima strategia del gioco — *scegli il tipo
 * giusto* — quindi la partita lo deve mostrare pezzo per pezzo, non come un
 * numero solo. Per questo torna anche il dettaglio.
 *
 * @param {number} base danno stampato sull'attacco
 * @param {object} attaccante la carta che attacca
 * @param {object} difensore la carta che subisce
 * @returns {{danno: number, debolezza: boolean, resistenza: boolean, base: number}}
 */
export function dannoConTipi(base, attaccante, difensore) {
  let danno = dannoStampato(base);
  const tipo = attaccante?.tipi?.[0];
  let debolezza = false;
  let resistenza = false;

  if (danno > 0 && tipo && difensore?.debolezza?.tipo === tipo) {
    const valore = String(difensore.debolezza.valore ?? '×2');
    // Le carte moderne raddoppiano (`×2`), le vecchie sommano (`+20`).
    danno = valore.startsWith('+')
      ? danno + (Number(valore.slice(1)) || 0)
      : danno * MOLTIPLICATORE_DEBOLEZZA;
    debolezza = true;
  }

  if (danno > 0 && tipo && difensore?.resistenza?.tipo === tipo) {
    danno = Math.max(0, danno - Math.abs(Number(String(difensore.resistenza.valore).replace(/\D/g, '')) || 30));
    resistenza = true;
  }

  return { danno, debolezza, resistenza, base: dannoStampato(base) };
}

/**
 * Il numero di danno stampato su un attacco.
 *
 * Sulle carte non è quasi mai un numero pulito: `"20+"` vuol dire "venti e poi
 * leggi l'effetto", `"30×"` vuol dire "trenta per qualcosa", `"10-"` "dieci o
 * meno". `Number("20+")` è `NaN`, e un `NaN` diventa **zero danni**: l'attacco
 * si giocava e non faceva niente, in silenzio.
 *
 * Si tiene la parte fissa e si lascia il resto all'effetto, che la partita
 * mostra a chi gioca — il "+" dipende quasi sempre da un lancio di moneta o da
 * quante Energie hai addosso, cose che stanno scritte nel testo.
 *
 * @param {string|number|null|undefined} valore
 * @returns {number}
 */
export function dannoStampato(valore) {
  const cifre = String(valore ?? '').match(/\d+/);
  return cifre ? Number(cifre[0]) : 0;
}

/**
 * Attacca col Pokémon attivo, e con questo il turno finisce.
 *
 * @param {object} stato
 * @param {number} indiceAttacco
 * @returns {object}
 */
export function attacca(stato, indiceAttacco = 0) {
  const nuovo = copia(stato);
  const io = nuovo.giocatori[nuovo.diChi];
  const lui = nuovo.giocatori[1 - nuovo.diChi];
  const attacco = io.attivo?.carta?.attacchi?.[indiceAttacco];
  if (!io.attivo || !lui.attivo || !attacco) return stato;

  const { puo } = puoAgire(io.attivo);
  if (!puo) return stato;
  if (!energieSufficienti(io.attivo, attacco, nuovo.casa).basta) return stato;

  const testa = () => nuovo.caso.prossimo() < 0.5;

  // Confusione: si rischia. Sbagliando ci si fa male da soli e il turno finisce.
  const confusione = sbagliaPerConfusione(io.attivo, testa);
  if (confusione.sbaglia) {
    io.attivo.danni += confusione.danno;
    nuovo.registro.push({ tipo: 'confusione', chi: nuovo.diChi, danno: confusione.danno });
    return chiudiTurno(controllaKo(nuovo));
  }

  const esito = dannoConTipi(attacco.danno, io.attivo.carta, lui.attivo.carta);
  lui.attivo.danni += esito.danno;

  // Gli stati che l'attacco infligge stanno scritti nel suo effetto.
  const stati = riconosciStati(attacco);
  for (const s of stati) if (!lui.attivo.stati.includes(s)) lui.attivo.stati.push(s);

  nuovo.registro.push({
    tipo: 'attacco',
    chi: nuovo.diChi,
    attacco: attacco.nome,
    ...esito,
    stati,
    moneta: vuoleMoneta(attacco) ? testa() : null,
    // L'effetto viaggia intero fino alla schermata: quello che il motore non sa
    // applicare lo legge chi gioca, e deve poterlo vedere.
    effetto: attacco.effetto ?? null,
  });

  return chiudiTurno(controllaKo(nuovo));
}

/**
 * Toglie di mezzo i Pokémon esausti e fa prendere i Premi.
 * @param {object} stato
 * @returns {object}
 */
function controllaKo(stato) {
  const nuovo = stato;
  for (let i = 0; i < nuovo.giocatori.length; i += 1) {
    const g = nuovo.giocatori[i];
    if (!g.attivo || g.attivo.danni < (g.attivo.carta.ps ?? 0)) continue;

    nuovo.registro.push({ tipo: 'ko', chi: i, carta: g.attivo.carta });
    g.scarti.push(g.attivo.carta, ...g.attivo.energie.map((t) => ({ nome: `Energia ${t}`, categoria: 'Energia' })));
    g.attivo = null;

    // Il Premio lo prende l'altro.
    const altro = nuovo.giocatori[1 - i];
    if (altro.premi.length) {
      const premio = altro.premi.shift();
      altro.mano.push(premio);
      nuovo.registro.push({ tipo: 'premio', chi: 1 - i, carta: premio, restano: altro.premi.length });
    }

    if (!altro.premi.length) {
      nuovo.fase = 'finita';
      nuovo.vincitore = 1 - i;
      nuovo.registro.push({ tipo: 'vittoria', chi: 1 - i, perche: 'premi' });
      return nuovo;
    }

    // Senza attivo si promuove dalla panchina; senza panchina si ha perso.
    if (g.panchina.length) {
      g.attivo = g.panchina.shift();
      g.attivo.stati = statiDopoLaPanchina();
      nuovo.registro.push({ tipo: 'promosso', chi: i, carta: g.attivo.carta });
    } else {
      nuovo.fase = 'finita';
      nuovo.vincitore = 1 - i;
      nuovo.registro.push({ tipo: 'vittoria', chi: 1 - i, perche: 'senza-pokemon' });
      return nuovo;
    }
  }
  return nuovo;
}

/**
 * Chiude il turno: stati speciali fra i due turni, poi tocca all'altro.
 * @param {object} stato
 * @returns {object}
 */
function chiudiTurno(stato) {
  if (stato.fase === 'finita') return stato;
  const nuovo = stato;
  const g = nuovo.giocatori[nuovo.diChi];
  const testa = () => nuovo.caso.prossimo() < 0.5;

  if (g.attivo) {
    const esito = fraIDueTurni(g.attivo, testa);
    g.attivo.danni = esito.danni;
    g.attivo.stati = esito.stati;
    for (const evento of esito.eventi) nuovo.registro.push({ tipo: 'stato', chi: nuovo.diChi, ...evento });
  }

  // La paralisi dura un turno: passando il turno, passa.
  if (g.attivo) g.attivo.stati = g.attivo.stati.filter((s) => s !== 'Paralizzato');

  const dopoKo = controllaKo(nuovo);
  if (dopoKo.fase === 'finita') return dopoKo;

  dopoKo.diChi = 1 - dopoKo.diChi;
  dopoKo.turno += 1;
  const prossimo = dopoKo.giocatori[dopoKo.diChi];
  prossimo.energiaGiocata = false;
  prossimo.aiutoGiocato = false;
  prossimo.ritirataFatta = false;
  dopoKo.registro.push({ tipo: 'turno', chi: dopoKo.diChi, numero: dopoKo.turno });
  // Ogni turno comincia con una pescata: è la regola, ed è anche il momento in
  // cui un mazzo finito fa perdere la partita.
  return pesca(dopoKo);
}

/**
 * Passa il turno senza attaccare.
 * @param {object} stato
 * @returns {object}
 */
export function passa(stato) {
  return chiudiTurno(copia(stato));
}

/**
 * Le mosse che il giocatore di turno può fare **adesso**, con il perché di
 * quelle che non può.
 *
 * È il cuore della partita *guidata*: la schermata non deve indovinare cosa
 * proporre, e soprattutto deve saper dire «non puoi attaccare perché ti manca
 * un'Energia Lotta» invece di lasciare un pulsante spento. Un comando
 * disattivato senza spiegazione non insegna niente.
 *
 * @param {object} stato
 * @returns {Array<{tipo: string, indice?: number, etichetta: string, possibile: boolean, perche?: string}>}
 */
export function mosseDisponibili(stato) {
  if (stato.fase === 'finita') return [];
  const g = stato.giocatori[stato.diChi];
  const mosse = [];

  if (stato.fase === 'preparazione') {
    g.mano.forEach((carta, i) => {
      if (giocabileComeBase(carta, stato.casa)) {
        mosse.push({
          tipo: g.attivo ? 'schiera-panchina' : 'schiera-attivo',
          indice: i,
          etichetta: g.attivo ? `${carta.nome} in panchina` : `${carta.nome} come Pokémon attivo`,
          possibile: g.attivo ? g.panchina.length < stato.formato.panchina : true,
          perche: 'La panchina è piena.',
        });
      }
    });
    return mosse;
  }

  g.mano.forEach((carta, i) => {
    if (eEnergia(carta)) {
      mosse.push({
        tipo: 'energia',
        indice: i,
        etichetta: `Attacca ${carta.nome}`,
        possibile: !g.energiaGiocata && Boolean(g.attivo),
        perche: g.energiaGiocata ? 'Hai già messo un\'Energia in questo turno.' : '',
      });
    } else if (giocabileComeBase(carta, stato.casa)) {
      mosse.push({
        tipo: 'schiera-panchina',
        indice: i,
        etichetta: `${carta.nome} in panchina`,
        possibile: g.panchina.length < stato.formato.panchina,
        perche: 'La panchina è piena.',
      });
    } else if (carta.categoria === 'Allenatore') {
      const quando = giocabileOra(carta, g);
      const effetto = interpreta(carta);
      mosse.push({
        tipo: 'allenatore',
        indice: i,
        etichetta: `Gioca ${carta.nome}`,
        possibile: quando.possibile,
        perche: quando.perche,
        // La schermata deve poter avvisare **prima** che questa carta va
        // applicata a mano: scoprirlo dopo averla giocata è una sorpresa.
        aMano: effetto.tipo === 'manuale',
        testo: effetto.testo,
      });
    } else if (carta.categoria === 'Pokémon' && g.attivo && evolveDa(carta, g.attivo.carta)) {
      mosse.push({
        tipo: 'evoluzione',
        indice: i,
        etichetta: `Fai evolvere in ${carta.nome}`,
        possibile: g.attivo.entrataTurno !== stato.turno,
        perche: 'È arrivato in gioco adesso: si evolve dal prossimo turno.',
      });
    }
  });

  const agire = puoAgire(g.attivo ?? {});
  (g.attivo?.carta?.attacchi ?? []).forEach((attacco, i) => {
    const energie = energieSufficienti(g.attivo, attacco, stato.casa);
    mosse.push({
      tipo: 'attacco',
      indice: i,
      etichetta: `${attacco.nome} (${attacco.danno ?? 0} danni)`,
      possibile: agire.puo && energie.basta,
      perche: !agire.puo
        ? `${g.attivo.carta.nome} ${agire.perche}`
        : `Servono ${energie.servono} Energie, ne hai ${energie.ha}.`,
    });
  });

  g.panchina.forEach((s, i) => {
    const costo = stato.casa.ritirataGratis && !g.ritirataFatta ? 0 : g.attivo?.carta?.ritirata ?? 0;
    mosse.push({
      tipo: 'ritirata',
      indice: i,
      etichetta: `Ritirati e manda avanti ${s.carta.nome}`,
      possibile: agire.puo && (g.attivo?.energie.length ?? 0) >= costo,
      perche: !agire.puo
        ? `${g.attivo.carta.nome} ${agire.perche}`
        : `Ritirarsi costa ${costo} Energie.`,
    });
  });

  mosse.push({ tipo: 'passa', etichetta: 'Passa il turno', possibile: true });
  return mosse;
}
