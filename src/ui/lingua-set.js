/**
 * La pastiglia che dichiara i set con i dati in inglese.
 *
 * ## Perché esiste
 *
 * Di 79 set — tutta l'era EX, i Neo, Diamante & Perla, le promo vecchie —
 * TCGdex non ha nemmeno una carta in italiano, pur essendo usciti qui davvero.
 * `tools/scarica-set.mjs` ripiega sull'inglese e li marca `lingua: 'en'`.
 *
 * I campi che il motore usa come chiavi (categoria, tipi, stadio, costi,
 * rarità) vengono tradotti in fase di download, quindi conteggi e generazione
 * dei mazzi funzionano normalmente. Restano inglesi il **nome della carta**, i
 * **nomi degli attacchi** e la **scansione**.
 *
 * Ed è qui che serve dirlo: se leggi *Luster Purge* e nessuno ti avverte, credi
 * che sulla tua carta ci sia scritto così. **Il danno non è l'inglese: è
 * l'inglese spacciato per italiano.** Un dato che non sai da dove viene è
 * peggio di un dato mancante, perché non ti viene in mente di dubitarne.
 *
 * ## Perché un modulo suo
 *
 * La stessa pastiglia serve in tre punti che non si conoscono fra loro — il
 * pannello di aggiunta, la griglia della collezione, il visore a schermo
 * intero. Scritta tre volte, tre volte diventerebbe diversa.
 *
 * @module ui/lingua-set
 */

/**
 * Se di quel set si stanno mostrando dati inglesi.
 *
 * Accetta indifferentemente una riga dell'indice (`{lingua}`) o una voce di
 * collezione (`{linguaSet}`): sono le due forme in cui il dato circola, e
 * costringere ogni chiamante a sapere quale ha in mano è un invito a sbagliare.
 *
 * @param {{lingua?: string|null, linguaSet?: string|null}|null|undefined} set
 * @returns {boolean}
 * @example
 * eInglese({ id: 'ex3', lingua: 'en' });   // true
 * eInglese({ nomeSet: 'Set Base' });       // false
 */
export function eInglese(set) {
  return (set?.lingua ?? set?.linguaSet) === 'en';
}

/**
 * Il testo che spiega la pastiglia, per `title` e lettori di schermo.
 * @type {string}
 */
export const SPIEGAZIONE =
  'Di questo set non esistono dati in italiano: nome, attacchi e immagine sono in inglese.';

/**
 * L'HTML della pastiglia, o stringa vuota se il set è italiano.
 *
 * Restituisce `''` invece di `null` perché finisce dentro template literal:
 * un `null` ci stamperebbe dentro la parola «null».
 *
 * @param {{lingua?: string|null, linguaSet?: string|null}|null|undefined} set
 * @returns {string}
 * @example
 * `<span class="chips">${chip}${pastigliaLingua(set)}</span>`
 */
export function pastigliaLingua(set) {
  if (!eInglese(set)) return '';
  return `<span class="chip chip-lingua" title="${SPIEGAZIONE}">EN</span>`;
}
