/**
 * Salvataggio e rilettura dei mazzi generati.
 *
 * A differenza della collezione, qui i dati delle carte **vengono duplicati**
 * dentro il mazzo salvato. È una scelta deliberata e contraria a quella fatta
 * per la collezione: un mazzo è una fotografia di un momento, e deve restare
 * leggibile anche se poi vendi le carte, aggiorni i set o cambi la collezione.
 * Se ricalcolassimo tutto dal dataset, un mazzo salvato a maggio potrebbe
 * mostrare carte che non hai più.
 *
 * La fotografia però va **sviluppata** prima di rimetterla in mano al motore:
 * su disco ogni voce è piatta (`{quantita, nome, idSet, ...}`) perché è più
 * compatta e leggibile, mentre motore e UI lavorano sulla forma annidata
 * `{carta: {...}, quantita}`. La conversione la fanno `istantanea()` e
 * `idrataPiano()`, in un punto solo: quando mancava, riaprire un mazzo salvato
 * e premere ⇄ faceva esplodere la sostituzione con
 * `undefined is not an object (evaluating 'carta.idSet')`, perché
 * `disponibilitaResidua()` riceveva `voce.carta` indefinito.
 *
 * @module data/mazzi-salvati
 */

import { STORE_MAZZI, leggiTutto, leggi, scrivi, cancella } from './deposito.js';
import { forza } from '../engine/forza.js';
import { contaComposizione } from '../engine/mazzo.js';

/**
 * I campi di carta che il mazzo salvato porta con sé.
 *
 * Non sono "quelli che servono a disegnare la lista" ma **quelli che servono al
 * motore**: `evolveDa` regge le linee evolutive, `attacchi` e `ritirata`
 * reggono il punteggio di forza. Senza, un mazzo riaperto veniva rivalutato
 * come se fosse fatto di carte senza attacchi.
 */
const CAMPI_CARTA = [
  'idSet',
  'numero',
  'nome',
  'categoria',
  'stadio',
  'evolveDa',
  'tipi',
  'ps',
  'attacchi',
  'ritirata',
  'immagine',
];

/**
 * `undefined` al posto di `null`, ricorsivamente sui campi di primo livello.
 *
 * Serve perché IndexedDB conserva i `null` così come sono, ma il motore usa
 * `carta.idSet ?? '?'`: un `null` supererebbe il `??` e produrrebbe la chiave
 * `"null:12"`, che non corrisponde a nessuna carta in dispensa.
 *
 * @param {object} oggetto
 * @returns {object}
 */
function senzaNulli(oggetto) {
  const esito = {};
  for (const [chiave, valore] of Object.entries(oggetto)) {
    if (valore !== null && valore !== undefined) esito[chiave] = valore;
  }
  return esito;
}

/**
 * Le opzioni da conservare accanto al piano.
 *
 * `indiceEvoluzioni` e `nonPokemon` vengono buttati via: sono l'indice INTERO
 * delle evoluzioni (centinaia di kB) allegato al piano dal livello
 * applicativo, uguale per tutti i piani e ricostruibile in un `await`. Salvarli
 * gonfiava ogni mazzo salvato di dati identici.
 *
 * @param {object} opzioni
 * @returns {object}
 */
function opzioniLeggere(opzioni = {}) {
  const { indiceEvoluzioni, nonPokemon, ...resto } = opzioni;
  return resto;
}

/**
 * La forma su disco di un piano: piatta, senza riferimenti all'analisi.
 *
 * Estratta da `salvaPiano()` per poter essere provata dai test senza un
 * IndexedDB: è la metà "andata" della conversione, e va tenuta in pari con
 * `idrataPiano()`.
 *
 * @param {object} piano risultato di `pianifica()`
 * @param {object} opzioni le scelte fatte nel wizard
 * @param {string} nome come si chiamerà nell'elenco
 * @param {string} [creatoIl] data ISO, per i test
 * @returns {object} il record da scrivere
 */
export function istantanea(piano, opzioni, nome, creatoIl = new Date().toISOString()) {
  const etichetta = String(nome ?? '').trim();
  if (!etichetta) throw new Error('Serve un nome per ritrovare questi mazzi.');

  return {
    id: creatoIl,
    nome: etichetta,
    creatoIl,
    opzioni: opzioniLeggere(opzioni),
    // Il punteggio di forza si salva col piano: è il dato che dice se i mazzi
    // erano pari, e ricalcolarlo dopo mesi darebbe un altro numero.
    equilibrio: piano.equilibrio ?? null,
    // Si salvano solo i campi che servono a rileggere il mazzo: l'oggetto
    // completo dell'analisi conterrebbe l'intera collezione, inutilmente.
    mazzi: piano.mazzi.map((m) => ({
      nome: m.nome,
      tipi: m.tipi,
      totale: m.totale,
      composizione: m.composizione,
      // La forza si salva **calcolata**, non ricalcolabile.
      //
      // `CAMPI_CARTA` include `attacchi`, quindi tecnicamente `forza()` si
      // potrebbe rifare alla rilettura — ma non si deve: il numero mostrato
      // accanto a un mazzo deve restare quello con cui il mazzo è stato
      // accettato. I tetti di calibrazione in `forza.js` cambiano quando
      // cambiano i dati, e un mazzo salvato che cambia punteggio da solo
      // renderebbe insensato il confronto col mazzo di riferimento.
      forza: forza(m, { taglia: opzioni?.taglia ?? m.totale }),
      carte: m.carte.map((c) => {
        const dati = c.carta ?? c;
        return senzaNulli({
          quantita: c.quantita,
          proxy: c.proxy ? true : undefined,
          motivo: c.motivo,
          ...Object.fromEntries(CAMPI_CARTA.map((campo) => [campo, dati[campo]])),
        });
      }),
    })),
    regole: piano.regole,
    carenze: piano.carenze,
    permessi: piano.permessi,
  };
}

/**
 * Rimette un piano riletto nella forma che motore e UI si aspettano.
 *
 * Idempotente: una voce che ha già `carta` viene lasciata stare, così la
 * funzione si può applicare anche a piani appena generati senza rovinarli.
 *
 * @param {object|undefined} record come sta su disco
 * @returns {object|undefined} il piano pronto all'uso
 * @example
 * const piano = idrataPiano(await leggiPiano(id));
 * disponibilitaResidua(voci, piano.mazzi); // non esplode più
 */
export function idrataPiano(record) {
  if (!record) return record;

  return {
    ...record,
    mazzi: (record.mazzi ?? []).map((mazzo) => {
      const carte = (mazzo.carte ?? []).map((voce) => {
        if (voce?.carta) return voce;
        const { quantita, proxy, motivo, ...campi } = voce ?? {};
        return senzaNulli({
          quantita,
          proxy: proxy ? true : undefined,
          motivo,
          carta: senzaNulli(campi),
        });
      });

      return {
        ...mazzo,
        carte,
        // La composizione si ricostruisce quando manca. Serve ai mazzi salvati
        // prima che il costruttore manuale la scrivesse: `aggiungiAlMazzo()` e
        // `togliDalMazzo()` la aggiornano invece di ricalcolarla, quindi
        // premere ⇄ su uno di quei mazzi rompeva la sostituzione. Ricalcolarla
        // qui è coerente col resto della funzione — è sempre "sviluppare la
        // fotografia" — e non tocca chi ce l'ha già.
        composizione: mazzo.composizione ?? contaComposizione(carte),
        totale: mazzo.totale ?? carte.reduce((s, v) => s + (v.quantita ?? 0), 0),
      };
    }),
  };
}

/**
 * Salva il risultato di una generazione.
 *
 * @param {object} piano risultato di `pianifica()`
 * @param {object} opzioni le scelte fatte nel wizard, da mostrare nell'elenco
 * @param {string} nome nome scelto da chi salva, obbligatorio
 * @returns {Promise<string>} l'id assegnato
 * @example
 * const id = await salvaPiano(piano, { taglia: 15 }, 'Torneo di Natale');
 */
export async function salvaPiano(piano, opzioni, nome) {
  const record = istantanea(piano, opzioni, nome);
  await scrivi(STORE_MAZZI, record);
  return record.id;
}

/**
 * Tutti i piani salvati, dal più recente.
 * @returns {Promise<object[]>}
 */
export async function elencoPiani() {
  const piani = await leggiTutto(STORE_MAZZI);
  return piani
    .sort((a, b) => String(b.creatoIl).localeCompare(String(a.creatoIl)))
    .map(idrataPiano);
}

/**
 * @param {string} id
 * @returns {Promise<object|undefined>}
 */
export async function leggiPiano(id) {
  return idrataPiano(await leggi(STORE_MAZZI, id));
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export function eliminaPiano(id) {
  return cancella(STORE_MAZZI, id);
}
