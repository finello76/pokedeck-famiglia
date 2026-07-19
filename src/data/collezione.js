/**
 * La collezione: cosa possiedo e in quante copie.
 *
 * Fa da ponte fra `deposito.js` (che conserva righe) e `dataset.js` (che sa
 * com'è fatta una carta). Nel database finiscono **solo** identificativo e
 * quantità: i dati della carta non si duplicano, si rileggono dal dataset.
 * Così un aggiornamento dei set corregge subito tutta la collezione.
 *
 * @module data/collezione
 */

import { STORE_COLLEZIONE, leggiTutto, leggi, scrivi, cancella, svuota, scriviMolte } from './deposito.js';
import { trovaCarta, elencoSet } from './dataset.js';
import { conteggioEnergie } from './energie.js';

/**
 * Identificativo del "set" fittizio delle energie base generiche.
 *
 * Perché esiste: le energie base che si usano davvero arrivano dai mazzi
 * di partenza e dalle bustine, e nella maggior parte dei casi **non
 * appartengono a nessuno dei set catalogati**. Senza questa via d'uscita non
 * si potrebbero registrare, e il contatore energie — il dato da cui dipende
 * tutto il motore — resterebbe a zero.
 *
 * @type {string}
 */
export const SET_ENERGIE_GENERICHE = '@base';

/**
 * Costruisce la chiave primaria di una riga.
 * @param {string} idSet
 * @param {string|number} numero
 * @returns {string}
 */
export function chiave(idSet, numero) {
  return `${idSet}:${numero}`;
}

/**
 * Fabbrica una carta Energia base generica, non legata a un set.
 * @param {string} tipo es. `'Fuoco'`
 * @returns {object} carta nello stesso formato del dataset
 */
function energiaGenerica(tipo) {
  return {
    numero: tipo,
    nome: `Energia ${tipo}`,
    categoria: 'Energia',
    tipoEnergia: 'Base',
    rarita: null,
    immagine: null,
    generica: true,
  };
}

/**
 * Recupera i dati di una carta, gestendo anche le energie generiche.
 * @param {string} idSet
 * @param {string} numero
 * @returns {Promise<object|null>}
 */
async function cartaDi(idSet, numero) {
  if (idSet === SET_ENERGIE_GENERICHE) return energiaGenerica(numero);
  return trovaCarta(idSet, numero);
}

/**
 * Imposta la quantità posseduta di una carta.
 *
 * Con `quantita <= 0` la riga viene rimossa: "ne ho zero" e "non ce l'ho" sono
 * la stessa cosa, e tenere righe a zero sporcherebbe export e statistiche.
 *
 * @param {string} idSet
 * @param {string|number} numero
 * @param {number} quantita
 * @returns {Promise<void>}
 */
export async function impostaQuantita(idSet, numero, quantita) {
  const id = chiave(idSet, numero);
  if (quantita <= 0) {
    await cancella(STORE_COLLEZIONE, id);
    return;
  }
  await scrivi(STORE_COLLEZIONE, {
    id,
    idSet,
    numero: String(numero),
    quantita: Math.floor(quantita),
    aggiornatoIl: new Date().toISOString(),
  });
}

/**
 * Aggiunge copie a quelle già possedute (o crea la riga se manca).
 *
 * @param {string} idSet
 * @param {string|number} numero
 * @param {number} [copie=1]
 * @returns {Promise<number>} la nuova quantità
 * @example
 * await aggiungiCopie('sv08', 118, 2);  // ne avevo 1 → 3
 */
export async function aggiungiCopie(idSet, numero, copie = 1) {
  const esistente = await leggi(STORE_COLLEZIONE, chiave(idSet, numero));
  const nuova = (esistente?.quantita ?? 0) + copie;
  await impostaQuantita(idSet, numero, nuova);
  return Math.max(0, nuova);
}

/**
 * Toglie una carta dalla collezione.
 * @param {string} idSet
 * @param {string|number} numero
 * @returns {Promise<void>}
 */
export function rimuovi(idSet, numero) {
  return cancella(STORE_COLLEZIONE, chiave(idSet, numero));
}

/**
 * L'intera collezione, con i dati completi di ogni carta.
 *
 * @returns {Promise<Array<{id: string, idSet: string, numero: string, quantita: number, carta: object|null, nomeSet: string}>>}
 *   Le righe con `carta === null` sono carte di set non più scaricati: si
 *   mostrano lo stesso, segnalate, invece di sparire senza spiegazione.
 */
export async function elencoCompleto() {
  const [righe, set] = await Promise.all([leggiTutto(STORE_COLLEZIONE), elencoSet()]);
  const nomiSet = new Map(set.map((s) => [s.id, s.nome]));

  const complete = await Promise.all(
    righe.map(async (riga) => ({
      ...riga,
      carta: await cartaDi(riga.idSet, riga.numero),
      nomeSet:
        riga.idSet === SET_ENERGIE_GENERICHE
          ? 'Energie base'
          : (nomiSet.get(riga.idSet) ?? riga.idSet),
    })),
  );

  // Ordine stabile: prima per set, poi per numero. Senza, l'ordine è quello
  // di inserimento nel database e la griglia sembra rimescolarsi.
  return complete.sort(
    (a, b) =>
      a.nomeSet.localeCompare(b.nomeSet, 'it') ||
      String(a.numero).localeCompare(String(b.numero), 'it', { numeric: true }),
  );
}

/**
 * Statistiche della collezione. In v1 servono a informare chi cataloga; in v2
 * sono l'ingresso del motore di generazione.
 *
 * @param {Array<object>} [voci] risultato di `elencoCompleto()`; se omesso lo rilegge
 * @returns {Promise<object>} conteggi per categoria, tipo, stadio ed energie
 */
export async function statistiche(voci) {
  const righe = voci ?? (await elencoCompleto());
  const valide = righe.filter((r) => r.carta);

  const perCategoria = {};
  const perTipo = {};
  const perStadio = {};
  let totaleCarte = 0;

  for (const { carta, quantita } of valide) {
    totaleCarte += quantita;
    perCategoria[carta.categoria] = (perCategoria[carta.categoria] ?? 0) + quantita;

    for (const tipo of carta.tipi ?? []) {
      perTipo[tipo] = (perTipo[tipo] ?? 0) + quantita;
    }
    if (carta.stadio) {
      perStadio[carta.stadio] = (perStadio[carta.stadio] ?? 0) + quantita;
    }
  }

  return {
    totaleCarte,
    carteDistinte: valide.length,
    perCategoria,
    perTipo,
    perStadio,
    energie: conteggioEnergie(valide),
  };
}

/**
 * Svuota completamente la collezione. Usata dall'import in sostituzione.
 * @returns {Promise<void>}
 */
export function svuotaTutto() {
  return svuota(STORE_COLLEZIONE);
}

/**
 * Scrive molte righe in una transazione sola. Usata dall'import.
 * @param {Array<{idSet: string, numero: string, quantita: number}>} voci
 * @returns {Promise<number>}
 */
export function scriviMoltePer(voci) {
  const adesso = new Date().toISOString();
  return scriviMolte(
    STORE_COLLEZIONE,
    voci.map((v) => ({
      id: chiave(v.idSet, v.numero),
      idSet: v.idSet,
      numero: String(v.numero),
      quantita: Math.floor(v.quantita),
      aggiornatoIl: adesso,
    })),
  );
}
