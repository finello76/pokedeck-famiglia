/**
 * Quanto manca alla collezione: per set e per serie.
 *
 * "Ho 12 carte di Scintille Folgoranti" non dice niente; "12 su 191" dice tutto.
 * Questo modulo mette accanto alla collezione la **collezione di riferimento** —
 * cioè le carte che quel set contiene davvero — e calcola la differenza.
 *
 * Il riferimento è il **totale ufficiale**, quello stampato sulla carta
 * (`118/191`), non il numero di carte nel file. I due differiscono: un set da
 * 191 carte ufficiali ne ha spesso 250 nel dataset, perché ci sono le segrete e
 * le varianti. Contarle nel denominatore vorrebbe dire mostrare per sempre un
 * completamento che non arriva al 100% nemmeno comprando il set intero.
 *
 * @module data/completamento
 */

import { elencoSet, caricaSet } from './dataset.js';

/** Set fittizio delle energie base: non appartiene a nessuna serie reale. */
const SENZA_SERIE = { id: 'altre', nome: 'Altre serie' };

/**
 * Se una carta fa parte della numerazione ufficiale del set.
 *
 * Le carte oltre il totale (segrete, promo, sottoserie tipo `TG01`) esistono e
 * si possono possedere, ma non contano come "mancanti": nessuno le considera
 * necessarie a completare il set.
 *
 * @param {object} carta
 * @param {number} totaleUfficiale
 * @returns {boolean}
 */
export function eNumerazioneUfficiale(carta, totaleUfficiale) {
  const n = Number(carta?.numero);
  return Number.isFinite(n) && n >= 1 && n <= totaleUfficiale;
}

/**
 * Quante carte diverse della collezione appartengono a ciascun set.
 *
 * @param {Array<{idSet: string, numero: string, quantita: number}>} voci
 * @returns {Map<string, {distinte: number, copie: number, numeri: Set<string>}>}
 */
export function conteggiaPerSet(voci) {
  const conteggi = new Map();
  for (const voce of voci ?? []) {
    if (!conteggi.has(voce.idSet)) {
      conteggi.set(voce.idSet, { distinte: 0, copie: 0, numeri: new Set() });
    }
    const c = conteggi.get(voce.idSet);
    c.distinte += 1;
    c.copie += voce.quantita;
    c.numeri.add(String(Number(voce.numero) || voce.numero));
  }
  return conteggi;
}

/**
 * @typedef {object} SetConteggiato
 * @property {string} id
 * @property {string} nome
 * @property {number} totale carte della numerazione ufficiale
 * @property {number} distinte quante ne possiedi
 * @property {number} copie quante copie in tutto
 */

/**
 * @typedef {object} SerieConteggiata
 * @property {string} id
 * @property {string} nome
 * @property {SetConteggiato[]} set solo quelli di cui possiedi almeno una carta
 * @property {number} distinte
 * @property {number} totale
 */

/**
 * La collezione divisa per serie, con quanto manca a ciascun set.
 *
 * Compaiono **solo i set di cui possiedi qualcosa**: l'elenco completo sarebbe
 * di 110 set quasi tutti vuoti, e nasconderebbe le tue carte invece di
 * mostrarle.
 *
 * @param {Array<object>} voci risultato di `elencoCompleto()`
 * @returns {Promise<SerieConteggiata[]>} ordinate come l'indice (dalle più
 *   vecchie alle più recenti), ciascuna coi suoi set in ordine di uscita
 * @example
 * const serie = await completamentoPerSerie(voci);
 * // [{ nome: 'Scarlatto e Violetto', distinte: 31, totale: 1200, set: [...] }]
 */
export async function completamentoPerSerie(voci) {
  const set = await elencoSet();
  const conteggi = conteggiaPerSet(voci);
  const perSerie = new Map();

  for (const infoSet of set) {
    const mio = conteggi.get(infoSet.id);
    if (!mio) continue; // set di cui non possiedi nulla: non si mostra

    const serie = infoSet.serie ?? SENZA_SERIE;
    if (!perSerie.has(serie.id)) {
      perSerie.set(serie.id, { ...serie, set: [], distinte: 0, totale: 0 });
    }
    const gruppo = perSerie.get(serie.id);
    gruppo.set.push({
      id: infoSet.id,
      nome: infoSet.nome,
      totale: infoSet.totale,
      distinte: mio.distinte,
      copie: mio.copie,
    });
    gruppo.distinte += mio.distinte;
    gruppo.totale += infoSet.totale;
  }

  // Le energie base (e ogni altra voce senza un set del dataset) restano fuori
  // dal giro qui sopra: si aggiungono a mano, o sparirebbero dalla vista.
  for (const [idSet, mio] of conteggi) {
    if (set.some((s) => s.id === idSet)) continue;
    if (!perSerie.has(SENZA_SERIE.id)) {
      perSerie.set(SENZA_SERIE.id, { ...SENZA_SERIE, set: [], distinte: 0, totale: 0 });
    }
    const gruppo = perSerie.get(SENZA_SERIE.id);
    gruppo.set.push({
      id: idSet,
      nome: idSet === '@base' ? 'Energie base' : idSet,
      // Senza un set di riferimento non esiste un "quante ne mancano": si
      // mostra il conteggio e basta, invece di inventare un denominatore.
      totale: null,
      distinte: mio.distinte,
      copie: mio.copie,
    });
    gruppo.distinte += mio.distinte;
  }

  return [...perSerie.values()];
}

/**
 * Le carte di un set che **non** possiedi.
 *
 * È il confronto con la collezione di riferimento: si carica il set intero dal
 * dataset e si tolgono quelle che hai già.
 *
 * @param {string} idSet
 * @param {Array<object>} voci la collezione
 * @returns {Promise<object[]>} carte mancanti, in ordine di numero
 * @example
 * const mancanti = await carteMancanti('sv08', voci);
 * // → le 179 carte di Scintille Folgoranti che non hai
 */
export async function carteMancanti(idSet, voci) {
  const [set, info] = await Promise.all([
    caricaSet(idSet),
    elencoSet().then((tutti) => tutti.find((s) => s.id === idSet)),
  ]);
  const totale = info?.totale ?? set.totaleUfficiale ?? Infinity;

  const possedute = new Set(
    (voci ?? [])
      .filter((v) => v.idSet === idSet)
      .map((v) => String(Number(v.numero) || v.numero)),
  );

  return (set.carte ?? [])
    .filter((c) => eNumerazioneUfficiale(c, totale))
    .filter((c) => !possedute.has(String(Number(c.numero) || c.numero)))
    .sort((a, b) => Number(a.numero) - Number(b.numero));
}
