/**
 * Test della descrizione del mazzo di riferimento.
 *
 * Del modulo `data/riferimento.js` si prova solo `descriviMazzo()`: è l'unica
 * parte che ragiona invece di leggere e scrivere, ed è quella che decide cosa
 * si vede scritto sotto "Mazzo di riferimento". Il resto parla con IndexedDB,
 * che qui non c'è.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descriviMazzo } from '../src/data/riferimento.js';

const piano = {
  id: '2026-07-26T10:00:00.000Z',
  nome: 'Torneo di Natale',
  opzioni: { taglia: 15 },
  equilibrio: { punteggi: [{ totale: 132 }, { totale: 125 }] },
  mazzi: [
    { nome: 'Erba', totale: 15, carte: [] },
    { nome: 'Fuoco', totale: 15, carte: [] },
  ],
};

test('descrive il mazzo scelto con la forza misurata al salvataggio', () => {
  assert.deepEqual(descriviMazzo(piano, 1), {
    idPiano: piano.id,
    indice: 1,
    nomePiano: 'Torneo di Natale',
    nomeMazzo: 'Fuoco',
    forza: 125,
    taglia: 15,
  });
});

test('un indice fuori dai mazzi non descrive niente', () => {
  // È il caso che si presenta quando il piano è stato riaperto e salvato con
  // meno mazzi: il riferimento deve sciogliersi, non puntare a un buco.
  assert.equal(descriviMazzo(piano, 5), null);
  assert.equal(descriviMazzo(undefined, 0), null);
});

test('senza punteggi salvati la forza è nulla, non zero', () => {
  // Zero significherebbe "mazzo debolissimo" e finirebbe nel confronto con la
  // forza obiettivo; `null` significa "non lo sappiamo" e si può nascondere.
  const senzaEquilibrio = { ...piano, equilibrio: null };
  assert.equal(descriviMazzo(senzaEquilibrio, 0).forza, null);
});

test('un mazzo senza nome resta identificabile dalla posizione', () => {
  const anonimo = { ...piano, mazzi: [{ totale: 20, carte: [] }] };
  assert.equal(descriviMazzo(anonimo, 0).nomeMazzo, 'Mazzo 1');
});
