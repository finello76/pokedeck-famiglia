/**
 * Riconoscimento del tipo elementale delle carte Energia.
 *
 * Perché serve un modulo apposta: nel dataset le carte Energia **non hanno il
 * campo `types`**, a differenza dei Pokémon. L'unico appiglio è il nome, che
 * però è incoerente:
 *
 * - `Energia Erba`          → coincide col tipo dei Pokémon (`Erba`)
 * - `Energia Psiche`        → il tipo dei Pokémon si chiama `Psico`
 * - `Energia Combattimento` → il tipo dei Pokémon si chiama `Lotta`
 * - `Energia base Psychic`  → rimasto in inglese nel dataset
 *
 * Sbagliare qui significa che il motore di generazione (v2) crede di avere
 * energie di un tipo che non ha, e produce mazzi ingiocabili. È quindi codice
 * puro e senza dipendenze, pensato per essere testato in isolamento.
 *
 * @module data/energie
 */

/**
 * Da parola trovata nel nome dell'energia → tipo canonico (quello usato dai
 * Pokémon nel campo `types` e dalle classi CSS in `tipi.css`).
 *
 * Le chiavi sono minuscole e senza accenti: il confronto è normalizzato.
 * @type {Record<string, string>}
 */
const PAROLA_A_TIPO = {
  // italiano, coincidenti col tipo Pokémon
  erba: 'Erba',
  fuoco: 'Fuoco',
  acqua: 'Acqua',
  lampo: 'Lampo',
  metallo: 'Metallo',
  oscurita: 'Oscurità',
  fata: 'Fata',
  drago: 'Drago',
  // italiano, NON coincidenti: qui sta il valore di questa tabella
  psiche: 'Psico',
  combattimento: 'Lotta',
  // nei set XY il tipo Fata si chiamava "Folletto"
  folletto: 'Fata',
  // I nomi canonici dei tipi devono mappare su se stessi: le energie base
  // generiche create dall'app (collezione.js) si chiamano "Energia Lotta" e
  // "Energia Psico", non "Energia Combattimento". Senza queste due righe
  // finirebbero tutte fra quelle di tipo non riconosciuto.
  psico: 'Psico',
  lotta: 'Lotta',
  // rimasugli in inglese nel dataset
  grass: 'Erba',
  fire: 'Fuoco',
  water: 'Acqua',
  lightning: 'Lampo',
  psychic: 'Psico',
  fighting: 'Lotta',
  darkness: 'Oscurità',
  metal: 'Metallo',
  fairy: 'Fata',
  dragon: 'Drago',
};

/**
 * Toglie accenti e maiuscole, per confrontare "Oscurità" con "oscurita".
 * @param {string} testo
 * @returns {string}
 */
function normalizza(testo) {
  return String(testo ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // segni diacritici staccati da NFD
    .toLowerCase();
}

/**
 * Il tipo elementale di una carta Energia.
 *
 * @param {object} carta carta del dataset con `categoria === 'Energia'`
 * @returns {string|null} tipo canonico, o `null` se non è un'energia base
 *   riconoscibile (le Speciali come "Energia Jet" non hanno un tipo elementale)
 * @example
 * tipoEnergia({ categoria: 'Energia', nome: 'Energia Combattimento' }); // 'Lotta'
 * tipoEnergia({ categoria: 'Energia', nome: 'Energia base Psychic' });  // 'Psico'
 * tipoEnergia({ categoria: 'Energia', nome: 'Energia Jet' });           // null
 */
export function tipoEnergia(carta) {
  if (carta?.categoria !== 'Energia') return null;
  for (const parola of normalizza(carta.nome).split(/\s+/)) {
    if (PAROLA_A_TIPO[parola]) return PAROLA_A_TIPO[parola];
  }
  return null;
}

/**
 * Se l'energia è **base** (non Speciale).
 *
 * Distinzione importante per il motore: solo le energie base sfuggono al limite
 * delle 4 copie per mazzo, e solo loro possono essere generate come proxy.
 *
 * @param {object} carta
 * @returns {boolean}
 */
export function eEnergiaBase(carta) {
  return carta?.categoria === 'Energia' && carta.tipoEnergia === 'Base';
}

/**
 * Conta le energie base possedute, raggruppate per tipo.
 *
 * @param {Array<{carta: object, quantita: number}>} voci righe di collezione
 * @returns {{perTipo: Record<string, number>, totaleBase: number, totaleSpeciali: number, senzaTipo: number}}
 * @example
 * conteggioEnergie([{ carta: {categoria:'Energia', tipoEnergia:'Base', nome:'Energia Fuoco'}, quantita: 4 }]);
 * // → { perTipo: { Fuoco: 4 }, totaleBase: 4, totaleSpeciali: 0, senzaTipo: 0 }
 */
export function conteggioEnergie(voci) {
  const perTipo = {};
  let totaleBase = 0;
  let totaleSpeciali = 0;
  let senzaTipo = 0;

  for (const { carta, quantita } of voci) {
    if (carta?.categoria !== 'Energia') continue;

    if (!eEnergiaBase(carta)) {
      totaleSpeciali += quantita;
      continue;
    }

    const tipo = tipoEnergia(carta);
    if (!tipo) {
      // Un'energia base di cui non riconosciamo il tipo: va segnalata, non
      // ignorata in silenzio, altrimenti il motore lavora su numeri falsi.
      senzaTipo += quantita;
      continue;
    }
    perTipo[tipo] = (perTipo[tipo] ?? 0) + quantita;
    totaleBase += quantita;
  }

  return { perTipo, totaleBase, totaleSpeciali, senzaTipo };
}
