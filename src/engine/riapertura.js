/**
 * Da un mazzo salvato alle carte da rimettere nel costruttore.
 *
 * Sembra una copia di dati e invece è il punto in cui un salvataggio può
 * morire. Un record su disco è una **fotografia**: le carte ci stanno piatte,
 * con i campi che c'erano il giorno del salvataggio. Il costruttore invece
 * ragiona per chiavi `idSet/numero`, che sono l'identità di una carta in tutta
 * l'app. Se la fotografia non porta quelle due cose, il mazzo si riapre vuoto.
 *
 * Ed è successo: c'è stata una versione in cui il costruttore lasciava le carte
 * **anonime** — il dataset non mette `idSet` e `numero` dentro la carta, stanno
 * nella riga di collezione — e quei record sono ancora su disco. Non si
 * riscrivono da soli, quindi la riparazione va fatta qui, in lettura: dove la
 * chiave manca si ritrova la carta **per nome** fra quelle che possiedi.
 *
 * Modulo puro: nessun DOM, nessun database. Vive in `engine/` perché è una
 * regola di dominio — *quali carte tue corrispondono a questo salvataggio* — e
 * perché è esattamente il genere di cosa che si vuole poter provare senza
 * aprire un browser.
 *
 * @module engine/riapertura
 */

import { stessoNome } from './nomi.js';

/**
 * @typedef {object} Riapertura
 * @property {Map<string, number>} scelte chiave `idSet/numero` → copie
 * @property {number} proxy copie che erano carte da stampare: non sono tue e
 *   non tornano nel costruttore
 * @property {number} perNome copie ritrovate per nome perché il salvataggio non
 *   aveva la chiave: da controllare, la stampa potrebbe non essere quella
 * @property {number} perse copie che non si sono ritrovate in nessun modo
 */

/**
 * La chiave con cui il costruttore identifica una carta.
 * @param {{idSet?: string, numero?: string|number}} carta
 * @returns {string|null} `null` se la carta non ha un'identità
 */
function chiaveDi(carta) {
  if (!carta?.idSet || carta.numero == null || carta.numero === '') return null;
  return `${carta.idSet}/${carta.numero}`;
}

/**
 * Ricostruisce le scelte del costruttore da un mazzo salvato.
 *
 * @param {Array<object>} carte le voci del mazzo salvato: `{carta, quantita}`
 *   oppure la forma piatta `{nome, idSet, numero, quantita}`
 * @param {Array<{carta: object, quantita?: number}>} disponibili la collezione,
 *   con `idSet` e `numero` **dentro** la carta (è la forma che usa il motore)
 * @returns {Riapertura}
 * @example
 * scelteDaSalvataggio([{ carta: { idSet: 'sv01', numero: '4' }, quantita: 2 }], []);
 * // → scelte: Map { 'sv01/4' => 2 }
 */
export function scelteDaSalvataggio(carte, disponibili = []) {
  const scelte = new Map();
  let proxy = 0;
  let perNome = 0;
  let perse = 0;

  for (const voce of carte ?? []) {
    const quantita = voce?.quantita ?? 0;
    if (quantita <= 0) continue;

    // Le carte da stampare non stanno in collezione: non hanno una copia fisica
    // da rimettere nel costruttore, che conta proprio quelle.
    if (voce.proxy) {
      proxy += quantita;
      continue;
    }

    // Le due forme in cui una voce circola: annidata (motore, UI) e piatta
    // (disco). Chi legge non deve sapere da dove arriva.
    const carta = voce.carta ?? voce;
    let chiave = chiaveDi(carta);

    if (!chiave && carta?.nome) {
      const uguali = disponibili.filter((v) => stessoNome(v.carta?.nome, carta.nome));
      if (uguali.length) {
        // A parità di nome vince la stampa di cui hai più copie: è quella che
        // più probabilmente era nel mazzo, e comunque è una carta tua.
        const scelta = uguali.reduce((a, b) => ((b.quantita ?? 0) > (a.quantita ?? 0) ? b : a));
        chiave = chiaveDi(scelta.carta);
        if (chiave) perNome += quantita;
      }
    }

    if (!chiave) {
      perse += quantita;
      continue;
    }
    // Sommare e non sovrascrivere: due voci possono puntare alla stessa stampa
    // (succede proprio col recupero per nome, dove due carte anonime finiscono
    // sulla stessa).
    scelte.set(chiave, (scelte.get(chiave) ?? 0) + quantita);
  }

  return { scelte, proxy, perNome, perse };
}

/**
 * La riga da mostrare dopo una riapertura, o stringa vuota se non c'è niente da
 * segnalare.
 *
 * Sta qui accanto al calcolo perché i numeri e la frase che li spiega devono
 * cambiare insieme: un conteggio senza spiegazione non dice niente a chi legge,
 * e una spiegazione che non corrisponde ai numeri è peggio del silenzio.
 *
 * @param {string} nome nome del salvataggio
 * @param {Riapertura} esito
 * @returns {string}
 */
export function raccontaRiapertura(nome, esito) {
  const parti = [`Riaperto «${nome}».`];
  if (esito.proxy) {
    parti.push(`${esito.proxy} carte da stampare non sono state ricaricate: non sono tue.`);
  }
  if (esito.perNome) {
    parti.push(
      `${esito.perNome} carte di questo salvataggio erano senza set: ritrovate per nome, ` +
        'controlla che siano le stampe giuste e risalvalo.',
    );
  }
  if (esito.perse) {
    parti.push(`${esito.perse} carte non si sono ritrovate in collezione.`);
  }
  return parti.join(' ');
}
