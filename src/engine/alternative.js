/**
 * Alternative per una carta del mazzo: con cosa la si può sostituire.
 *
 * La sostituzione parte sempre dalla collezione REALE: si propongono solo
 * carte fisiche ancora libere, cioè possedute e non già impegnate in un altro
 * mazzo del piano. Il criterio di compatibilità non è "stessa carta" ma
 * **stesso ruolo**: stessa categoria, e per i Pokémon si privilegia chi
 * mantiene tipo, stadio o linea evolutiva del mazzo.
 *
 * Modulo puro: nessun DOM, nessun database.
 *
 * @module engine/alternative
 */

import { Dispensa, chiaveCarta } from './dispensa.js';
import { classifica } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { tipoEnergia, eEnergiaBase } from '../data/energie.js';

/** Limite standard del TCG, come in generazione.js. */
const MAX_COPIE = 4;

/**
 * Le copie della collezione non ancora impegnate nei mazzi del piano.
 *
 * I proxy non contano: sono fotocopie, non consumano carte vere.
 *
 * @param {Array<{carta: object, quantita: number}>} voci collezione
 * @param {object[]} mazzi mazzi del piano corrente
 * @returns {Dispensa}
 */
export function disponibilitaResidua(voci, mazzi) {
  const dispensa = new Dispensa(voci);
  for (const mazzo of mazzi ?? []) {
    for (const voce of mazzo.carte) {
      if (voce.proxy) continue;
      dispensa.preleva(voce.carta, voce.quantita);
    }
  }
  return dispensa;
}

/**
 * @typedef {object} Alternativa
 * @property {object} carta
 * @property {number} disponibili copie libere in collezione
 * @property {number} punteggio per l'ordinamento, più alto = più affine
 * @property {string[]} note motivi di affinità o avvisi, da mostrare
 */

/**
 * Le carte con cui si può sostituire una voce del mazzo, ordinate per affinità.
 *
 * @param {{carta: object, quantita: number}} voce voce del mazzo da sostituire
 * @param {object} mazzo il mazzo a cui appartiene
 * @param {Dispensa} dispensa disponibilità residua (`disponibilitaResidua()`)
 * @returns {Alternativa[]}
 * @example
 * const dispensa = disponibilitaResidua(voci, piano.mazzi);
 * const proposte = alternativePer(voce, mazzo, dispensa);
 */
export function alternativePer(voce, mazzo, dispensa) {
  const daSostituire = voce.carta;
  const chiaveVecchia = chiaveCarta(daSostituire);

  // I nomi presenti nel mazzo SENZA la carta in uscita: servono a capire se
  // un'evoluzione candidata avrebbe la sua pre-evoluzione.
  const nomiRestanti = new Set(
    mazzo.carte
      .filter((c) => chiaveCarta(c.carta) !== chiaveVecchia)
      .map((c) => normalizzaNome(c.carta.nome)),
  );

  const candidate = dispensa.cerca(
    (c) => c.categoria === daSostituire.categoria && chiaveCarta(c) !== chiaveVecchia,
  );

  return candidate
    .map(({ carta, disponibili }) => valuta(carta, disponibili, daSostituire, mazzo, nomiRestanti))
    .filter(Boolean)
    .sort((a, b) => b.punteggio - a.punteggio);
}

/**
 * Punteggio e note di una candidata. `null` se non è proponibile.
 *
 * @param {object} carta
 * @param {number} disponibili
 * @param {object} daSostituire
 * @param {object} mazzo
 * @param {Set<string>} nomiRestanti
 * @returns {Alternativa|null}
 */
function valuta(carta, disponibili, daSostituire, mazzo, nomiRestanti) {
  const note = [];
  let punteggio = 0;

  if (carta.categoria === 'Pokémon') {
    const info = classifica(carta);
    // Stadi ignoti: non si sa come giocarli, meglio non proporli.
    if (info.livello === null) return null;

    if (carta.stadio === daSostituire.stadio) {
      punteggio += 50;
      note.push('stesso stadio');
    }
    if ((carta.tipi ?? []).some((t) => mazzo.tipi.includes(t))) {
      punteggio += 40;
      note.push(`tipo del mazzo (${carta.tipi.join(', ')})`);
    }
    // Della stessa linea evolutiva della carta in uscita: la sostituzione più
    // naturale (es. un altro esemplare o uno stadio vicino).
    const lineaVecchia = [daSostituire.nome, daSostituire.evolveDa].map(normalizzaNome);
    if (lineaVecchia.includes(normalizzaNome(carta.nome)) ||
        lineaVecchia.includes(normalizzaNome(carta.evolveDa))) {
      punteggio += 30;
      note.push('stessa linea evolutiva');
    }
    // Un'evoluzione senza pre-evoluzione nel mazzo resterebbe in mano.
    const orfana =
      (info.livello ?? 0) > 0 &&
      !(carta.evolveDa && nomiRestanti.has(normalizzaNome(carta.evolveDa)));
    if (orfana) {
      punteggio -= 100;
      note.push('attenzione: senza pre-evoluzione nel mazzo');
    }
  } else if (carta.categoria === 'Energia') {
    const tipo = tipoEnergia(carta);
    if (eEnergiaBase(carta) && tipo && mazzo.tipi.includes(tipo)) {
      punteggio += 40;
      note.push(`Energia ${tipo}: il tipo del mazzo`);
    } else if (!eEnergiaBase(carta)) {
      note.push('Energia speciale');
    } else if (tipo) {
      punteggio -= 20;
      note.push(`tipo ${tipo}, diverso dal mazzo`);
    }
  }
  // Gli Allenatori sono tutti intercambiabili: nessun criterio oltre la categoria.

  return { carta, disponibili, punteggio, note };
}

/**
 * Sostituisce nel mazzo le copie di una voce con un'altra carta.
 *
 * Si scambia il più possibile: il numero di copie della voce uscente, limitato
 * dalle copie libere della nuova carta e dal tetto delle 4 copie (che non vale
 * per le Energie base). Se lo scambio è parziale, la voce vecchia resta con le
 * copie rimanenti — il totale del mazzo non cambia mai.
 *
 * Muta il mazzo. La rivalutazione di carenze e regole spetta al chiamante.
 *
 * @param {object} mazzo
 * @param {{carta: object, quantita: number}} voce voce del mazzo da sostituire
 * @param {object} nuova carta subentrante
 * @param {number} disponibili copie libere della nuova carta
 * @returns {number} copie effettivamente scambiate (0 se nulla da fare)
 */
export function applicaSostituzione(mazzo, voce, nuova, disponibili) {
  const esistente = mazzo.carte.find(
    (c) => !c.proxy && chiaveCarta(c.carta) === chiaveCarta(nuova),
  );
  const tetto = eEnergiaBase(nuova) ? Infinity : MAX_COPIE;
  const spazio = tetto - (esistente?.quantita ?? 0);
  const quante = Math.max(0, Math.min(voce.quantita, disponibili, spazio));
  if (quante === 0) return 0;

  voce.quantita -= quante;
  if (voce.quantita <= 0) mazzo.carte.splice(mazzo.carte.indexOf(voce), 1);

  if (esistente) esistente.quantita += quante;
  else mazzo.carte.push({ carta: nuova, quantita: quante });

  // Il totale non cambia; la composizione sì, se cambia la categoria… che qui
  // è sempre la stessa per costruzione. Si aggiorna comunque per robustezza.
  const categoria = { 'Pokémon': 'pokemon', Energia: 'energie', Allenatore: 'allenatori' };
  const via = categoria[voce.carta?.categoria] ?? categoria[nuova.categoria];
  const dentro = categoria[nuova.categoria];
  if (via && dentro && via !== dentro) {
    mazzo.composizione[via] -= quante;
    mazzo.composizione[dentro] += quante;
  }

  return quante;
}
