/**
 * In quale formato da torneo si può giocare una carta.
 *
 * I formati ufficiali sono due, e sono uno dentro l'altro:
 *
 * - **Standard** — solo le carte recenti. Ogni aprile la *rotazione* ne butta
 *   fuori un anno intero. È il formato dei tornei veri.
 * - **Expanded** — dal Nero e Bianco (2011) in poi, meno una lista di carte
 *   bandite perché troppo forti. Non ruota, cresce e basta.
 * - Tutto il resto è **fuori formato**: si gioca in casa e basta, che poi è
 *   quello che facciamo noi.
 *
 * Il dato non è tutto della stessa natura, e per questo arriva da due strade.
 *
 * Lo Standard **si calcola qui**, da una regola scritta in chiaro: una carta è
 * Standard se il suo *marchio di regolamentazione* — la letterina nel
 * quadratino in basso a sinistra — è fra quelli ancora in corso. Il marchio
 * sulla carta non cambia mai; a cambiare è quali marchi valgono, una volta
 * l'anno. Tenere la regola in una costante di tre lettere significa che alla
 * prossima rotazione si aggiorna quella, senza riscaricare niente.
 *
 * L'Expanded **si scarica**, perché non è una regola: è un elenco deciso a
 * tavolino. Non basta guardare l'anno, e nemmeno la serie — dentro ogni set
 * c'è qualche carta bandita, e restano fuori set interi che pure sono recenti
 * (Pokémon TCG Pocket, le promo McDonald's, i Kit Allenatore). Lo scarica
 * `tools/aggiorna-legalita.mjs` in `data/legalita.json`, e `data/dataset.js` lo
 * applica alle carte al caricamento del set.
 *
 * Modulo puro: nessun DOM, nessuna rete, nessun database. Legge solo i due
 * campi che il dataset ha già timbrato sulla carta (`marchio`, `espansa`).
 *
 * @module data/legalita
 */

/**
 * I marchi ancora validi in Standard.
 *
 * **Da aggiornare a ogni rotazione**, tipicamente in aprile: si toglie la
 * lettera più vecchia e, quando esce, si aggiunge la nuova. È l'unica cosa da
 * toccare — `data/legalita.json` contiene i marchi delle carte, che non
 * cambiano.
 *
 * Verificato il 28/07/2026 contro `legal.standard` di TCGdex: H, I e J
 * coprono esattamente le 3.182 carte che l'API dà per Standard, senza
 * eccezioni in nessuno dei due sensi.
 *
 * @type {readonly string[]}
 */
export const MARCHI_STANDARD = Object.freeze(['H', 'I', 'J']);

/**
 * @typedef {object} Formato
 * @property {string} codice identificativo stabile, usato come valore di filtro
 * @property {string} etichetta come si mostra all'utente
 * @property {string} spiegazione perché una carta finisce lì
 * @property {number} ordine dal più ristretto (0) al più permissivo
 */

/** I formati, dal più ristretto. */
export const FORMATI = Object.freeze([
  {
    codice: 'standard',
    etichetta: 'Standard',
    spiegazione: 'Valida nei tornei di oggi: il marchio è ancora in corso.',
    ordine: 0,
  },
  {
    codice: 'expanded',
    etichetta: 'Expanded',
    spiegazione: 'Fuori dallo Standard, ma ancora ammessa nel formato Expanded.',
    ordine: 1,
  },
  {
    codice: 'fuori',
    etichetta: 'Fuori formato',
    spiegazione: 'Troppo vecchia o esclusa: si gioca solo in casa.',
    ordine: 2,
  },
]);

/** Per non scorrere l'array ogni volta. */
const PER_CODICE = new Map(FORMATI.map((f) => [f.codice, f]));

/**
 * Se una carta è un'Energia base.
 *
 * Le Energie base sono **sempre legali, in qualunque formato e da qualunque
 * set**: non portano marchio proprio perché la regola non le riguarda. Chi
 * gioca in Standard può mettere nel mazzo l'Energia Erba del Set Base del 1999.
 *
 * La regola qui è più precisa dei dati scaricati: TCGdex dà per Standard solo
 * 178 delle 204 Energie base del catalogo, lasciando fuori — per pura
 * disattenzione, sono carte identiche — quelle dei Kit Allenatore e di qualche
 * set vecchio. Seguire il dato invece della regola vorrebbe dire dire a un
 * bambino che la sua Energia Acqua non vale, mentre quella accanto sì.
 *
 * @param {object|null} carta
 * @returns {boolean}
 */
function eEnergiaBase(carta) {
  return carta?.categoria === 'Energia' && carta?.tipoEnergia === 'Base';
}

/**
 * Il formato in cui si può giocare una carta.
 *
 * Richiede una carta arrivata da `data/dataset.js`, che è l'unico posto in cui
 * `marchio` ed `espansa` vengono timbrati. Su una carta priva di quei campi la
 * risposta è `null` — "non lo so" — e non "fuori formato": una carta di un set
 * che non è stato possibile leggere non va dichiarata illegale.
 *
 * @param {object|null} carta
 * @returns {Formato|null}
 * @example
 * formatoDi({ marchio: 'H', espansa: true });            // → Standard
 * formatoDi({ marchio: 'F', espansa: true });            // → Expanded
 * formatoDi({ marchio: null, espansa: false });          // → Fuori formato
 * formatoDi({ categoria: 'Energia', tipoEnergia: 'Base' }); // → Standard
 */
export function formatoDi(carta) {
  if (!carta) return null;
  if (eEnergiaBase(carta)) return PER_CODICE.get('standard');

  // `espansa` è l'unico campo che c'è sempre, anche quando vale `false`: se
  // manca pure quello, la carta non è passata dal dataset e non si sa niente.
  if (carta.espansa === undefined && !carta.marchio) return null;

  if (MARCHI_STANDARD.includes(carta.marchio)) return PER_CODICE.get('standard');
  if (carta.espansa) return PER_CODICE.get('expanded');
  return PER_CODICE.get('fuori');
}

/**
 * Se una carta appartiene al formato indicato dal codice.
 *
 * @param {object|null} carta
 * @param {string} codice
 * @returns {boolean}
 */
export function eDiFormato(carta, codice) {
  return formatoDi(carta)?.codice === codice;
}

/**
 * I formati presenti in un insieme di carte, dal più ristretto.
 *
 * Come per le rarità, il menu si costruisce dai dati: in una collezione tutta
 * moderna la voce "Fuori formato" non deve nemmeno comparire.
 *
 * @param {Array<object|null>} carte
 * @returns {Formato[]}
 */
export function formatiPresenti(carte) {
  const trovati = new Map();
  for (const carta of carte ?? []) {
    const formato = formatoDi(carta);
    if (formato) trovati.set(formato.codice, formato);
  }
  return [...trovati.values()].sort((a, b) => a.ordine - b.ordine);
}
