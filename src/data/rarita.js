/**
 * Le rarità delle carte, rese comprensibili e ordinabili.
 *
 * Il campo `rarita` che arriva da TCGdex è un testo libero, e nei dati italiani
 * è un piccolo disastro: convivono nomi italiani ("Comune", "Olografica Rara
 * V"), francesi non tradotti ("deux Étoiles", "Une Diamant", "Couronne") e
 * varianti che dicono la stessa cosa con parole diverse. Sono 35 valori
 * distinti su 21.000 carte: messi in un menu così come sono, non si trova
 * niente.
 *
 * Qui ogni valore grezzo diventa una **classe di rarità** con un'etichetta
 * leggibile e un ordine (dal comune al più raro), che è quello con cui si
 * guarda una collezione: prima si cercano le carte buone.
 *
 * I simboli ◆ e ★ non sono decorazione: sono quelli **stampati sulla carta**,
 * ed è così che li chiama chi le sfoglia — "questa è a due stelle".
 *
 * Modulo puro: nessun DOM, nessun database.
 *
 * @module data/rarita
 */

/**
 * @typedef {object} ClasseRarita
 * @property {string} codice identificativo stabile, usato come valore di filtro
 * @property {string} etichetta come si mostra all'utente
 * @property {number} ordine dal più comune (0) al più raro
 */

/**
 * Le classi, in ordine di rarità crescente.
 *
 * `prova` riconosce i valori grezzi che ricadono nella classe. Si usa una
 * funzione e non un elenco chiuso perché i nomi nuovi arrivano a ogni set
 * («Rara illustrazione speciale» non esisteva tre anni fa): meglio una regola
 * che li assorba, che un elenco che li lasci fuori in silenzio.
 */
const CLASSI = [
  {
    codice: 'comune',
    etichetta: 'Comune',
    prova: (r) => /^comune$|^nessuna$|^une? diamant$/i.test(r),
  },
  {
    codice: 'non-comune',
    etichetta: 'Non comune',
    prova: (r) => /^non comune$|^deux diamant$/i.test(r),
  },
  {
    codice: 'diamante-3',
    etichetta: '◆◆◆ Tre diamanti',
    prova: (r) => /^trois diamant$/i.test(r),
  },
  {
    codice: 'diamante-4',
    etichetta: '◆◆◆◆ Quattro diamanti',
    prova: (r) => /^quatre diamant$/i.test(r),
  },
  {
    codice: 'rara',
    etichetta: 'Rara',
    // "Rara" secca e le olografiche: sono il gradino "rara" classico.
    // `shiny rare` arriva anche declinato (`Shiny rare V`, `… VMAX`): si
    // riconosce il prefisso, o quelle carte finirebbero in "Altra rarità".
    prova: (r) => /^rara$|olografica|^rara bianco e nero$|lucente|^shiny rare/i.test(r),
  },
  {
    codice: 'stella-1',
    etichetta: '★ Una stella',
    prova: (r) => /^une? [ée]toile$|^un chromatique$/i.test(r),
  },
  {
    codice: 'stella-2',
    etichetta: '★★ Due stelle',
    prova: (r) => /^deux [ée]toiles?$|^deux chromatique$/i.test(r),
  },
  {
    codice: 'stella-3',
    etichetta: '★★★ Tre stelle',
    prova: (r) => /^trois [ée]toiles?$/i.test(r),
  },
  {
    codice: 'ultrarara',
    etichetta: 'Ultrarara',
    prova: (r) => /ultrarara|^rara doppia$|asso tattico|^policrome$/i.test(r),
  },
  {
    codice: 'illustrazione',
    etichetta: 'Rara illustrazione',
    prova: (r) => /illustrazione|arte completa/i.test(r),
  },
  {
    codice: 'segreta',
    etichetta: 'Segreta / iper rara',
    prova: (r) => /segreto|iper|^couronne$/i.test(r),
  },
  {
    codice: 'promo',
    etichetta: 'Promo',
    prova: (r) => /^promo$/i.test(r),
  },
];

/** Dove finisce ciò che non somiglia a niente di noto. */
const SCONOSCIUTA = { codice: 'altra', etichetta: 'Altra rarità', ordine: CLASSI.length };

/**
 * La classe di rarità di una carta.
 *
 * @param {object|null} carta
 * @returns {ClasseRarita|null} `null` se la carta non dichiara nessuna rarità
 * @example
 * classeRarita({ rarita: 'deux Étoiles' }); // → { codice: 'stella-2', etichetta: '★★ Due stelle', … }
 */
export function classeRarita(carta) {
  const grezza = String(carta?.rarita ?? '').trim();
  if (!grezza) return null;

  const posizione = CLASSI.findIndex((c) => c.prova(grezza));
  if (posizione === -1) return { ...SCONOSCIUTA };
  const { codice, etichetta } = CLASSI[posizione];
  return { codice, etichetta, ordine: posizione };
}

/**
 * Le classi presenti in un insieme di carte, dalla più comune alla più rara.
 *
 * Si costruiscono dai dati e non dall'elenco completo: un menu con dodici voci
 * di cui dieci vuote fa perdere tempo a ogni ricerca.
 *
 * @param {Array<object|null>} carte
 * @returns {ClasseRarita[]}
 */
export function classiPresenti(carte) {
  const trovate = new Map();
  for (const carta of carte ?? []) {
    const classe = classeRarita(carta);
    if (classe) trovate.set(classe.codice, classe);
  }
  return [...trovate.values()].sort((a, b) => a.ordine - b.ordine);
}

/**
 * Se una carta appartiene alla classe indicata dal codice.
 *
 * @param {object|null} carta
 * @param {string} codice
 * @returns {boolean}
 */
export function eDiRarita(carta, codice) {
  return classeRarita(carta)?.codice === codice;
}
