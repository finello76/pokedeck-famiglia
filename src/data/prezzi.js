/**
 * Le quotazioni Cardmarket in euro, scaricate su richiesta e tenute in locale.
 *
 * È l'**unico** punto dell'app che chiama la rete di sua iniziativa. Tutto il
 * resto legge i JSON del repo; qui no, e per un motivo: un prezzo committato
 * nel repository sarebbe già vecchio il giorno dopo, e mostrare una cifra
 * sbagliata su una carta da 400 euro è peggio che non mostrarla.
 *
 * Le regole che ne derivano, tutte deliberate:
 *
 * - **si scarica solo quando lo chiedi**, mai all'avvio e mai in sottofondo;
 * - **si conserva in IndexedDB con la data**, così offline il prezzo si vede
 *   comunque, dichiarato per quello che è: l'ultimo noto;
 * - **il fallimento non è un errore dell'app**: senza rete si tiene ciò che
 *   c'è e si dice quando è stato preso.
 *
 * Fonte: TCGdex (`pricing.cardmarket`), la stessa del dataset. Non serve una
 * seconda API né una chiave: è già nella risposta della carta.
 *
 * @module data/prezzi
 */

import { STORE_PREZZI, leggiTutto, scriviMolte, svuota } from './deposito.js';

const API = 'https://api.tcgdex.net/v2/it/cards';

/** Quante carte chiedere insieme: oltre, si martella l'API per niente. */
const PARALLELE = 6;

/**
 * Oltre questo numero di carte il calcolo si ferma e lo dice.
 *
 * Una richiesta per carta significa che "quota tutta la collezione" sono
 * migliaia di richieste partite da un tocco distratto. Il tetto costringe a
 * filtrare prima — che poi è il modo giusto di usare questa funzione.
 */
export const MASSIMO_PER_VOLTA = 60;

/**
 * @typedef {object} Prezzo
 * @property {string} id `"<idSet>:<numero>"`, come nella collezione
 * @property {number|null} euro prezzo di tendenza in EUR, `null` se non quotata
 * @property {string} aggiornatoIl data ISO in cui l'abbiamo scaricato
 * @property {boolean} senzaMercato vero se la carta esiste ma non ha prezzo
 */

/**
 * L'id con cui un prezzo si ritrova: lo stesso della riga di collezione.
 * @param {string} idSet
 * @param {string|number} numero
 * @returns {string}
 */
export function chiavePrezzo(idSet, numero) {
  return `${idSet}:${numero}`;
}

/**
 * Tutti i prezzi conosciuti, pronti per essere consultati per chiave.
 * @returns {Promise<Map<string, Prezzo>>}
 */
export async function prezziConosciuti() {
  const righe = await leggiTutto(STORE_PREZZI);
  return new Map(righe.map((r) => [r.id, r]));
}

/** Butta via tutte le quotazioni salvate. @returns {Promise<void>} */
export function dimenticaPrezzi() {
  return svuota(STORE_PREZZI);
}

/**
 * Scarica e salva le quotazioni delle carte indicate.
 *
 * @param {Array<{idSet: string, numero: string|number, carta?: object}>} carte
 *   le voci di collezione. Serve tutta la voce e non solo `numero` perché i due
 *   numeri possono non coincidere: la riga salvata può dire `11` (è quello che
 *   si è digitato) mentre il dataset e l'API vogliono `011`. La chiave del
 *   prezzo resta quella della collezione, l'URL usa quella del dataset
 * @param {object} [opzioni]
 * @param {(fatte: number, totale: number) => void} [opzioni.avanzamento] per la
 *   barra di stato: una richiesta per carta non è istantanea, e senza un segnale
 *   sembra che il tocco non abbia fatto niente
 * @returns {Promise<{prezzi: Map<string, Prezzo>, falliti: number, quotate: number}>}
 * @example
 * const { prezzi } = await aggiornaPrezzi([{ idSet: 'base1', numero: '4' }]);
 * prezzi.get('base1:4').euro; // → 421.11
 */
export async function aggiornaPrezzi(carte, { avanzamento } = {}) {
  const daFare = carte.slice(0, MASSIMO_PER_VOLTA);
  const scaricati = [];
  let falliti = 0;
  let fatte = 0;

  const operai = Array.from({ length: Math.min(PARALLELE, daFare.length) }, async () => {
    while (daFare.length) {
      const voce = daFare.shift();
      try {
        scaricati.push(
          await scaricaPrezzo(voce.idSet, voce.numero, voce.carta?.numero ?? voce.numero),
        );
      } catch {
        // Rete assente o carta non trovata: si va avanti con le altre. Un
        // buco nell'elenco è un'informazione, un dialogo di errore no.
        falliti += 1;
      }
      fatte += 1;
      avanzamento?.(fatte, carte.length);
    }
  });
  await Promise.all(operai);

  if (scaricati.length) await scriviMolte(STORE_PREZZI, scaricati);

  return {
    prezzi: new Map(scaricati.map((p) => [p.id, p])),
    falliti,
    quotate: scaricati.filter((p) => p.euro !== null).length,
  };
}

/**
 * Il prezzo di una singola carta, dall'API.
 *
 * Si prende `trend` e non `avg`: la media comprende vendite vecchie di un mese,
 * la tendenza è quanto la carta vale **adesso**, che è la domanda vera quando
 * ci si chiede se una carta è "quella buona". Se manca si ripiega sulla media.
 *
 * @param {string} idSet
 * @param {string|number} numero come sta nella collezione: fa la chiave
 * @param {string|number} numeroApi come sta nel dataset: fa l'URL
 * @returns {Promise<Prezzo>}
 */
async function scaricaPrezzo(idSet, numero, numeroApi = numero) {
  const risposta = await fetch(`${API}/${idSet}-${numeroApi}`);
  if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
  const carta = await risposta.json();

  const mercato = carta?.pricing?.cardmarket ?? null;
  const euro = mercato ? (mercato.trend ?? mercato.avg ?? null) : null;

  return {
    id: chiavePrezzo(idSet, numero),
    euro: typeof euro === 'number' ? euro : null,
    aggiornatoIl: new Date().toISOString(),
    // Le carte di Pokémon Pocket (i set A1, A2, A3…) sono digitali: un mercato
    // non ce l'hanno proprio, e vanno distinte da quelle di cui semplicemente
    // non siamo riusciti a sapere il prezzo.
    senzaMercato: !mercato,
  };
}

/**
 * Somma dei prezzi noti, moltiplicati per le copie possedute.
 *
 * @param {Array<{idSet: string, numero: string|number, quantita: number}>} voci
 * @param {Map<string, Prezzo>} prezzi
 * @returns {{totale: number, quotate: number, senzaPrezzo: number}}
 */
export function valoreDi(voci, prezzi) {
  let totale = 0;
  let quotate = 0;
  let senzaPrezzo = 0;

  for (const voce of voci ?? []) {
    const prezzo = prezzi.get(chiavePrezzo(voce.idSet, voce.numero));
    if (prezzo?.euro == null) {
      senzaPrezzo += 1;
      continue;
    }
    totale += prezzo.euro * (voce.quantita ?? 1);
    quotate += 1;
  }
  return { totale, quotate, senzaPrezzo };
}

/**
 * Un prezzo come si scrive in italiano, o un trattino se non c'è.
 * @param {number|null|undefined} euro
 * @returns {string}
 */
export function formattaEuro(euro) {
  if (typeof euro !== 'number') return '—';
  return euro.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}
