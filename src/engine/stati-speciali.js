/**
 * Gli stati speciali: veleno, bruciatura, sonno, paralisi, confusione.
 *
 * ## Perché si possono simulare davvero
 *
 * L'effetto di un attacco è **testo libero in italiano**, e nessun programma lo
 * capisce in generale. Ma gli stati speciali non sono testo libero: sono un
 * insieme **chiuso di cinque**, scritti sempre con le stesse parole — *"è ora
 * Avvelenato"*, *"viene addormentato"* — e con regole che stanno sul
 * regolamento, non sulla carta.
 *
 * Quindi il riconoscimento è una ricerca di parole (`riconosciStati`), mentre
 * ciò che succede dopo lo sa questo modulo (`fraIDueTurni`, `puoAttaccare`).
 * La parte fragile è confinata a cinque radici di parola; la parte importante è
 * codice normale, provabile.
 *
 * Quello che il testo dice **oltre** gli stati — "scarta un'Energia", "pesca due
 * carte" — non si tenta nemmeno: lo mostra la partita e lo applica chi gioca,
 * che in una partita che serve a insegnare è la cosa giusta.
 *
 * Modulo puro: nessun DOM, nessuna rete, nessun caso.
 *
 * @module engine/stati-speciali
 */

/** I cinque stati, come li chiama il regolamento italiano. */
export const STATI = {
  VELENO: 'Avvelenato',
  BRUCIATURA: 'Bruciato',
  SONNO: 'Addormentato',
  PARALISI: 'Paralizzato',
  CONFUSIONE: 'Confuso',
};

/**
 * Le radici con cui ogni stato compare nei testi italiani.
 *
 * Radici e non parole intere perché la carta declina: *avvelenato*,
 * *avvelenata*, *avvelenati*. Tagliare prima della desinenza copre tutti i casi
 * senza elencarli.
 */
const RADICI = [
  [STATI.VELENO, 'avvelenat'],
  [STATI.BRUCIATURA, 'bruciat'],
  [STATI.SONNO, 'addormentat'],
  [STATI.PARALISI, 'paralizzat'],
  [STATI.CONFUSIONE, 'confus'],
];

/** Danno che il veleno infligge fra un turno e l'altro. */
export const DANNO_VELENO = 10;

/** Danno della bruciatura, che si tira a sorte per guarire. */
export const DANNO_BRUCIATURA = 20;

/** Danno che un Pokémon confuso si fa da solo sbagliando l'attacco. */
export const DANNO_CONFUSIONE = 30;

/**
 * Gli stati che un attacco infligge, letti dal suo effetto.
 *
 * @param {{effetto?: string}|null|undefined} attacco
 * @returns {string[]} gli stati nominati, senza ripetizioni
 * @example
 * riconosciStati({ effetto: 'Il Pokémon attivo del tuo avversario viene addormentato.' });
 * // → ['Addormentato']
 */
export function riconosciStati(attacco) {
  const testo = String(attacco?.effetto ?? '').toLowerCase();
  if (!testo) return [];
  return RADICI.filter(([, radice]) => testo.includes(radice)).map(([stato]) => stato);
}

/**
 * Se l'effetto chiede di lanciare una moneta.
 *
 * Non si prova a capire *cosa* dipende dal lancio: si sa che una moneta va
 * lanciata, la partita la lancia e mostra il risultato, e chi gioca legge la
 * carta per il resto. Metà del lavoro fatta bene invece di tutto fatto a caso.
 *
 * @param {{effetto?: string}|null|undefined} attacco
 * @returns {boolean}
 */
export function vuoleMoneta(attacco) {
  return /lancia.{0,12}monet/i.test(String(attacco?.effetto ?? ''));
}

/**
 * Applica gli stati che agiscono **fra un turno e l'altro**: veleno e
 * bruciatura fanno danno, il sonno e la bruciatura si tirano a sorte.
 *
 * Nel gioco vero questo momento si chiama *fra i turni* e ha un ordine preciso;
 * qui conta che il danno arrivi una volta sola e che la guarigione sia
 * dichiarata, perché chi impara deve vedere **perché** il suo Pokémon si è
 * svegliato.
 *
 * @param {{danni: number, stati: string[]}} pokemon lo slot in gioco
 * @param {() => boolean} testa lancia una moneta: `true` se esce testa
 * @returns {{danni: number, stati: string[], eventi: Array<{stato: string, danno?: number, guarito?: boolean}>}}
 * @example
 * fraIDueTurni({ danni: 0, stati: ['Avvelenato'] }, () => true);
 * // → danni 10, resta avvelenato
 */
export function fraIDueTurni(pokemon, testa) {
  let danni = pokemon.danni ?? 0;
  const stati = [...(pokemon.stati ?? [])];
  const eventi = [];

  if (stati.includes(STATI.VELENO)) {
    danni += DANNO_VELENO;
    eventi.push({ stato: STATI.VELENO, danno: DANNO_VELENO });
  }

  if (stati.includes(STATI.BRUCIATURA)) {
    danni += DANNO_BRUCIATURA;
    // Testa: la bruciatura passa. È l'unico stato che fa danno **e** può
    // guarire da solo nello stesso momento.
    const guarito = testa();
    if (guarito) stati.splice(stati.indexOf(STATI.BRUCIATURA), 1);
    // `moneta` viaggia insieme all'esito perché chi guarda deve vedere **perché**
    // è guarito: la bruciatura non passa da sola, passa se esce testa.
    eventi.push({ stato: STATI.BRUCIATURA, danno: DANNO_BRUCIATURA, guarito, moneta: guarito });
  }

  if (stati.includes(STATI.SONNO)) {
    const guarito = testa();
    if (guarito) stati.splice(stati.indexOf(STATI.SONNO), 1);
    eventi.push({ stato: STATI.SONNO, guarito, moneta: guarito });
  }

  return { danni, stati, eventi };
}

/**
 * Se un Pokémon in questo stato può attaccare o ritirarsi.
 *
 * Sonno e paralisi bloccano entrambe le cose. La confusione **non** blocca: fa
 * rischiare, ed è un'altra faccenda (vedi `sbagliaPerConfusione`).
 *
 * @param {{stati?: string[]}} pokemon
 * @returns {{puo: boolean, perche: string}}
 */
export function puoAgire(pokemon) {
  const stati = pokemon?.stati ?? [];
  if (stati.includes(STATI.SONNO)) {
    return { puo: false, perche: 'è Addormentato: non può attaccare né ritirarsi.' };
  }
  if (stati.includes(STATI.PARALISI)) {
    return { puo: false, perche: 'è Paralizzato: salta questo turno.' };
  }
  return { puo: true, perche: '' };
}

/**
 * Il confuso attacca solo se esce testa; se sbaglia, si fa 30 danni da solo.
 *
 * @param {{stati?: string[]}} pokemon
 * @param {() => boolean} testa
 * @returns {{sbaglia: boolean, danno: number}}
 */
export function sbagliaPerConfusione(pokemon, testa) {
  if (!(pokemon?.stati ?? []).includes(STATI.CONFUSIONE)) return { sbaglia: false, danno: 0 };
  const riuscito = testa();
  return { sbaglia: !riuscito, danno: riuscito ? 0 : DANNO_CONFUSIONE };
}

/**
 * Gli stati che spariscono quando il Pokémon **lascia la posizione attiva** —
 * ritirandosi, o perché è stato messo KO.
 *
 * Sono tutti: nel gioco vero uno stato speciale sta sul Pokémon attivo, e
 * tornare in panchina lo cancella. È anche la ragione per cui ritirarsi è una
 * mossa e non una rinuncia, e vale la pena che si veda.
 *
 * @returns {string[]} sempre vuoto: è la lista degli stati che restano
 */
export function statiDopoLaPanchina() {
  return [];
}
