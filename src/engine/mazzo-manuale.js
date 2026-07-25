/**
 * Controlli su un mazzo costruito a mano.
 *
 * Il motore che genera i mazzi conosce le regole e le rispetta per
 * costruzione. Chi sceglie le carte da sé no: mette dentro il Livello 2 che
 * gli piace e si accorge alla prima partita che senza la sua Base non entra
 * mai in gioco, o che il mazzo non parte perché di Pokémon Base ce n'è uno solo.
 *
 * Questi avvisi esistono per dirglielo **prima**, e sono deliberatamente
 * avvisi e non divieti: le regole della casa di questo progetto nascono proprio
 * dal violare il regolamento in modo consapevole, e un costruttore che
 * impedisce di sbagliare impedirebbe anche di giocare come si gioca in casa.
 *
 * Ogni avviso porta con sé le **carte a cui si riferisce**: "ci sono problemi"
 * non è azionabile, "Machamp non ha Machoke nel mazzo" sì.
 *
 * Modulo puro.
 *
 * @module engine/mazzo-manuale
 */

import { classifica, eBase } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { eEnergiaBase } from '../data/energie.js';
import { MAX_COPIE, formatoPer } from './formati.js';
import { minimoBasi } from './proporzioni.js';
import { scoperte } from './fabbisogno.js';
import { probabilitaAlmenoUna } from './forza.js';

/**
 * Gravità di un avviso.
 *
 * `impedisce` non blocca l'app — nessun avviso lo fa — ma segna le cose che
 * rendono il mazzo **ingiocabile secondo il regolamento**, distinte da quelle
 * che lo rendono soltanto debole. Sono due conversazioni diverse: la prima è
 * "questo mazzo non si può usare così", la seconda "puoi farlo, ma sappi che".
 * @enum {string}
 */
export const GRAVITA = { BLOCCANTE: 'bloccante', AVVISO: 'avviso' };

/**
 * Il numero di copie di ogni carta nel mazzo, per chiave.
 * @param {object} mazzo
 * @returns {Array<{voce: object, copie: number}>}
 */
const voci = (mazzo) => (mazzo?.carte ?? []).filter((v) => v.quantita > 0);

/**
 * Controlla un mazzo costruito a mano.
 *
 * @param {object} mazzo con `carte: [{carta, quantita}]`
 * @param {object} [opzioni]
 * @param {number} [opzioni.taglia] la taglia a cui si punta; se assente si
 *   giudica sul totale corrente, cioè non si segnala mai "mazzo incompleto"
 * @returns {Array<{codice: string, gravita: string, testo: string, carte: string[]}>}
 *   in ordine di gravità, i bloccanti per primi
 * @example
 * diagnostica(mazzo, { taglia: 30 });
 * // [{ codice: 'evoluzioni-orfane', testo: 'Machamp non ha…', carte: ['Machamp'] }]
 */
export function diagnostica(mazzo, opzioni = {}) {
  const avvisi = [];
  const carte = voci(mazzo);
  const totale = carte.reduce((s, v) => s + v.quantita, 0);
  const taglia = opzioni.taglia ?? totale;

  // Mazzo ancora vuoto: non c'è niente da dire. Tecnicamente gli mancherebbe
  // tutto — nessun Base, nessuna Energia — ma dirlo a chi non ha ancora scelto
  // la prima carta è rumore, e insegna a ignorare gli avvisi.
  if (!carte.length) return avvisi;

  // --- Taglia ---------------------------------------------------------------
  if (opzioni.taglia && totale !== taglia) {
    const manca = taglia - totale;
    avvisi.push({
      codice: 'taglia',
      gravita: GRAVITA.BLOCCANTE,
      testo:
        manca > 0
          ? `Mancano ${manca} cart${manca === 1 ? 'a' : 'e'} per arrivare a ${taglia}.`
          : `Ci sono ${-manca} cart${manca === -1 ? 'a' : 'e'} di troppo: il mazzo deve averne ${taglia}.`,
      carte: [],
    });
  }

  // --- Limite delle 4 copie -------------------------------------------------
  // Le Energie base ne sono esenti: è la regola ufficiale, ed è anche l'unico
  // motivo per cui un mazzo costruito con poche carte diverse sta in piedi.
  const troppe = carte.filter((v) => v.quantita > MAX_COPIE && !eEnergiaBase(v.carta));
  if (troppe.length) {
    avvisi.push({
      codice: 'troppe-copie',
      gravita: GRAVITA.BLOCCANTE,
      testo:
        `Non si possono tenere più di ${MAX_COPIE} copie della stessa carta ` +
        '(le Energie base sono l\'unica eccezione).',
      carte: troppe.map((v) => `${v.carta.nome} ×${v.quantita}`),
    });
  }

  // --- Pokémon Base ---------------------------------------------------------
  // Senza nemmeno un Base non si comincia la partita: si rimescola all'infinito
  // e non c'è nulla da mettere in campo.
  const basi = carte.filter((v) => eBase(v.carta)).reduce((s, v) => s + v.quantita, 0);
  if (basi === 0) {
    avvisi.push({
      codice: 'senza-base',
      gravita: GRAVITA.BLOCCANTE,
      testo:
        'Nessun Pokémon Base: la partita non può nemmeno cominciare, perché a ' +
        'inizio turno non c\'è niente da mettere in campo.',
      carte: [],
    });
  } else {
    const minimo = minimoBasi(taglia);
    const mano = formatoPer(taglia).manoIniziale;
    // La probabilità si calcola sulla taglia a cui si punta, non sulle carte
    // scelte finora. Mentre si costruisce il mazzo è quasi sempre più piccolo
    // della mano iniziale, e sul totale parziale il conto dava "100% di poter
    // cominciare" con un Base e una carta in tutto — vero e inutile, perché il
    // mazzo con cui si giocherà non è quello.
    const probabilita = probabilitaAlmenoUna(Math.max(totale, taglia), basi, mano);
    if (basi < minimo) {
      avvisi.push({
        codice: 'pochi-base',
        gravita: GRAVITA.AVVISO,
        testo:
          `Solo ${basi} Pokémon Base su ${taglia} carte: con una mano da ${mano} ` +
          `hai il ${Math.round(probabilita * 100)}% di poter cominciare. ` +
          `Con ${minimo} si sale a una partita che parte quasi sempre.`,
        carte: [],
      });
    }
  }

  // --- Evoluzioni orfane ----------------------------------------------------
  // Un Livello 2 senza la sua linea nel mazzo non entra mai in gioco: è una
  // carta che occupa uno slot e resta in mano tutta la partita.
  const presenti = new Set(carte.map((v) => normalizzaNome(v.carta.nome)));
  const orfane = carte.filter((v) => {
    const livello = classifica(v.carta).livello ?? 0;
    if (livello === 0) return false;
    return !v.carta.evolveDa || !presenti.has(normalizzaNome(v.carta.evolveDa));
  });
  if (orfane.length) {
    avvisi.push({
      codice: 'evoluzioni-orfane',
      gravita: GRAVITA.AVVISO,
      testo:
        'Queste evoluzioni non hanno nel mazzo la carta da cui evolvono: senza ' +
        'una regola della casa resterebbero in mano tutta la partita.',
      carte: orfane.map((v) => `${v.carta.nome} (serve ${v.carta.evolveDa ?? 'la sua Base'})`),
    });
  }

  // --- Energie --------------------------------------------------------------
  const energie = carte.filter((v) => v.carta.categoria === 'Energia');
  const quanteEnergie = energie.reduce((s, v) => s + v.quantita, 0);
  const pokemon = carte.filter((v) => v.carta.categoria === 'Pokémon');
  if (pokemon.length && quanteEnergie === 0) {
    avvisi.push({
      codice: 'senza-energie',
      gravita: GRAVITA.BLOCCANTE,
      testo: 'Nessuna Energia: i Pokémon non potranno attaccare.',
      carte: [],
    });
  }

  // Carte che chiedono un'Energia che il mazzo non contiene. Si guarda il costo
  // degli attacchi, non il tipo della carta: sono cose diverse, ed è l'errore
  // da cui nasce `fabbisogno.js`.
  const senzaEnergia = scoperte(mazzo);
  if (senzaEnergia.length) {
    avvisi.push({
      codice: 'carte-senza-energia',
      gravita: GRAVITA.AVVISO,
      testo:
        'Queste carte attaccano solo con Energie che nel mazzo non ci sono. ' +
        'Aggiungile, oppure serve la regola della casa "ogni Energia vale per ' +
        'qualsiasi tipo".',
      carte: senzaEnergia.map((c) => `${c.nome} (chiede ${c.mancano.join(' o ')})`),
    });
  }

  const ordine = { [GRAVITA.BLOCCANTE]: 0, [GRAVITA.AVVISO]: 1 };
  return avvisi.sort((a, b) => ordine[a.gravita] - ordine[b.gravita]);
}

/**
 * Quante copie di una carta si possono ancora mettere nel mazzo.
 *
 * Due limiti insieme: le copie che **possiedi** — un mazzo dev'essere
 * costruibile davvero prendendo le carte dalla scatola — e il tetto di
 * regolamento delle 4 copie, da cui le Energie base sono esenti.
 *
 * @param {object} carta
 * @param {number} possedute copie in collezione
 * @param {number} giaNelMazzo copie già scelte
 * @returns {number} zero o più
 * @example
 * copieAncoraDisponibili(pikachu, 6, 4); // 0 → il tetto di regolamento
 * copieAncoraDisponibili(energiaFuoco, 6, 4); // 2 → le Energie base non hanno tetto
 */
export function copieAncoraDisponibili(carta, possedute, giaNelMazzo) {
  const tetto = eEnergiaBase(carta) ? Infinity : MAX_COPIE;
  return Math.max(0, Math.min(possedute - giaNelMazzo, tetto - giaNelMazzo));
}
