/**
 * Test del riallineamento dopo una sostituzione a mano.
 *
 * La regressione da cui nasce questo file: sostituendo Dragapult, i Dreepy e i
 * Drakloak stampati per lui restavano nel mazzo — fotocopie per giocare una
 * carta che non c'era più.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riallineaLinee } from '../src/engine/riallinea.js';
import { Dispensa } from '../src/engine/dispensa.js';

const pk = (nome, stadio = 'Base', evolveDa = null, tipo = 'Psico') => ({
  nome,
  numero: nome,
  idSet: 'prova',
  categoria: 'Pokémon',
  stadio,
  evolveDa,
  tipi: [tipo],
  ps: 100,
  attacchi: [{ nome: 'Colpo', costo: [tipo], danno: 30 }],
});

/** Mazzo di prova: Dragapult con la sua catena stampata, più due Base vere. */
const mazzoConDragapult = () => ({
  nome: 'Mazzo 1',
  tipi: ['Psico'],
  totale: 7,
  composizione: { pokemon: 7, energie: 0, allenatori: 0 },
  carte: [
    { carta: pk('Dreepy'), quantita: 3, proxy: true, motivo: 'x' },
    { carta: pk('Drakloak', 'Livello 1', 'Dreepy'), quantita: 2, proxy: true, motivo: 'x' },
    { carta: pk('Dragapult', 'Livello 2', 'Drakloak'), quantita: 1 },
    { carta: pk('Uxie'), quantita: 1 },
  ],
});

test('tolta la cima, le sue carte stampate spariscono', () => {
  const mazzo = mazzoConDragapult();
  // La sostituzione a mano ha già scambiato Dragapult con Smoochum.
  mazzo.carte[2] = { carta: pk('Smoochum'), quantita: 1 };

  const esito = riallineaLinee(mazzo, { indiceEvoluzioni: { drakloak: 'Dreepy' }, taglia: 7 });

  assert.deepEqual(esito.tolti.sort(), ['Drakloak', 'Dreepy']);
  assert.ok(
    mazzo.carte.every((c) => !c.proxy),
    'nel mazzo non resta nessuna fotocopia',
  );
});

test('il mazzo torna alla sua taglia con carte vere libere', () => {
  const mazzo = mazzoConDragapult();
  mazzo.carte[2] = { carta: pk('Smoochum'), quantita: 1 };
  const dispensa = new Dispensa([
    { carta: pk('Togepi'), quantita: 2 },
    { carta: pk('Sandygast'), quantita: 3 },
  ]);

  riallineaLinee(mazzo, { dispensa, indiceEvoluzioni: { drakloak: 'Dreepy' }, taglia: 7 });

  assert.equal(mazzo.totale, 7, 'i 5 slot liberati sono stati riempiti');
  assert.equal(
    mazzo.carte.reduce((s, c) => s + c.quantita, 0),
    7,
    'il totale dichiarato coincide con le carte davvero presenti',
  );
});

test('la carta entrata riceve le sue pre-evoluzioni', () => {
  const mazzo = mazzoConDragapult();
  // Al posto di Dragapult entra Meowstic, che ha bisogno di Espurr.
  mazzo.carte[2] = { carta: pk('Meowstic', 'Livello 1', 'Espurr'), quantita: 1 };

  const esito = riallineaLinee(mazzo, {
    indiceEvoluzioni: { drakloak: 'Dreepy' },
    budgetProxy: 6,
    taglia: 7,
  });

  assert.ok(esito.stampati.includes('Espurr'), 'la pre-evoluzione della carta nuova si stampa');
  const espurr = mazzo.carte.find((c) => c.carta.nome === 'Espurr');
  assert.ok(espurr?.proxy, 'ed è contrassegnata come da stampare');
  assert.equal(espurr.carta.stadio, 'Base');
});

test('senza budget non si stampa: la carta resta scoperta e lo si dice', () => {
  const mazzo = mazzoConDragapult();
  mazzo.carte[2] = { carta: pk('Meowstic', 'Livello 1', 'Espurr'), quantita: 1 };

  const esito = riallineaLinee(mazzo, {
    indiceEvoluzioni: { drakloak: 'Dreepy' },
    budgetProxy: 0,
    taglia: 7,
  });

  assert.ok(!mazzo.carte.some((c) => c.carta.nome === 'Espurr'));
  assert.ok(esito.scoperti.includes('Meowstic'), 'la carta senza linea viene segnalata');
});

test('una linea ancora valida non viene toccata', () => {
  const mazzo = mazzoConDragapult();
  // Si sostituisce solo Uxie: Dragapult resta, e la sua catena pure.
  mazzo.carte[3] = { carta: pk('Togepi'), quantita: 1 };

  const esito = riallineaLinee(mazzo, {
    indiceEvoluzioni: { drakloak: 'Dreepy' },
    budgetProxy: 6,
    taglia: 7,
  });

  assert.deepEqual(esito.tolti, [], 'niente da togliere');
  assert.equal(mazzo.carte.find((c) => c.carta.nome === 'Dreepy').quantita, 3, 'copie intatte');
  assert.equal(mazzo.totale, 7);
});
