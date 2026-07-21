/**
 * Le due operazioni elementari su un mazzo: metterci una carta, toglierne una.
 *
 * Stanno in un modulo a parte perché le fanno in tre — la generazione, le
 * Energie proxy e il riallineamento dopo una sostituzione a mano — e devono
 * farle allo stesso modo. Sbagliare `totale` o `composizione` in uno dei tre
 * punti produce mazzi che dicono 30 carte e ne contengono 29.
 *
 * Modulo puro.
 *
 * @module engine/mazzo
 */

import { normalizzaNome } from './nomi.js';
import { eEnergiaBase } from '../data/energie.js';
import { MAX_COPIE } from './formati.js';

/** Da categoria della carta al campo di `mazzo.composizione`. */
const CAMPO = { 'Pokémon': 'pokemon', Energia: 'energie', Allenatore: 'allenatori' };

/**
 * Identità di una voce del mazzo.
 *
 * Una voce proxy resta distinta da quella vera anche a parità di nome: nella
 * lista stampata "2× Machop" e "1× Machop da stampare" sono due righe, ed è ciò
 * che serve a chi deve ritagliare.
 *
 * @param {object} carta
 * @param {boolean} [proxy]
 * @returns {string}
 */
export function chiaveVoce(carta, proxy = false) {
  return `${proxy ? 'proxy' : carta.idSet ?? '?'}:${carta.numero ?? normalizzaNome(carta.nome)}`;
}

/**
 * Aggiunge copie a un mazzo rispettando il limite delle 4 copie.
 *
 * Le Energie base sono esenti: è la regola ufficiale, ed è anche l'unica ragione
 * per cui un mazzo con poche carte diverse riesce comunque a stare in piedi.
 *
 * @param {object} mazzo
 * @param {object} carta
 * @param {number} quante
 * @param {object} [extra] campi della voce, es. `{proxy: true, motivo}`
 * @returns {number} copie effettivamente aggiunte
 */
export function aggiungiAlMazzo(mazzo, carta, quante, extra = {}) {
  const cercata = chiaveVoce(carta, extra.proxy);
  const esistente = mazzo.carte.find((c) => chiaveVoce(c.carta, c.proxy) === cercata);

  const gia = esistente?.quantita ?? 0;
  const tetto = eEnergiaBase(carta) ? Infinity : MAX_COPIE;
  const aggiungibili = Math.max(0, Math.min(quante, tetto - gia));
  if (aggiungibili === 0) return 0;

  if (esistente) esistente.quantita += aggiungibili;
  else mazzo.carte.push({ carta, quantita: aggiungibili, ...extra });

  mazzo.totale += aggiungibili;
  const campo = CAMPO[carta.categoria];
  if (campo) mazzo.composizione[campo] += aggiungibili;
  return aggiungibili;
}

/**
 * Toglie copie da una voce del mazzo, eliminandola se si svuota.
 *
 * @param {object} mazzo
 * @param {object} voce voce presente in `mazzo.carte`
 * @param {number} [quante=1]
 * @returns {number} copie effettivamente tolte
 */
export function togliDalMazzo(mazzo, voce, quante = 1) {
  const tolte = Math.max(0, Math.min(quante, voce.quantita));
  if (tolte === 0) return 0;

  voce.quantita -= tolte;
  mazzo.totale -= tolte;
  const campo = CAMPO[voce.carta?.categoria];
  if (campo) mazzo.composizione[campo] -= tolte;
  if (voce.quantita <= 0) mazzo.carte.splice(mazzo.carte.indexOf(voce), 1);
  return tolte;
}
