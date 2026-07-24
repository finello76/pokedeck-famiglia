/**
 * Test delle funzioni pure di `data/prezzi.js`.
 *
 * Il download e IndexedDB non si provano qui (servirebbero rete e browser):
 * si prova il conto del valore, che è dove un errore produce un numero
 * sbagliato ma credibile — il tipo di difetto che nessuno nota.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiavePrezzo, valoreDi, formattaEuro } from '../src/data/prezzi.js';

const prezzi = () =>
  new Map([
    ['base1:4', { id: 'base1:4', euro: 421.11, aggiornatoIl: '2026-07-24', senzaMercato: false }],
    ['sv08:118', { id: 'sv08:118', euro: 0.05, aggiornatoIl: '2026-07-24', senzaMercato: false }],
    ['A1:283', { id: 'A1:283', euro: null, aggiornatoIl: '2026-07-24', senzaMercato: true }],
  ]);

test('il valore conta le copie possedute, non le carte distinte', () => {
  const { totale, quotate } = valoreDi(
    [
      { idSet: 'base1', numero: '4', quantita: 2 },
      { idSet: 'sv08', numero: '118', quantita: 4 },
    ],
    prezzi(),
  );
  assert.equal(quotate, 2);
  assert.equal(Math.round(totale * 100) / 100, 842.42, 'due Charizard più quattro Zweilous');
});

test('le carte senza prezzo si contano a parte invece di valere zero', () => {
  // Un totale che ingloba in silenzio le carte non quotate si legge come il
  // valore della collezione, e non lo è.
  const { totale, quotate, senzaPrezzo } = valoreDi(
    [
      { idSet: 'base1', numero: '4', quantita: 1 },
      { idSet: 'A1', numero: '283', quantita: 3 },
      { idSet: 'sv01', numero: '54', quantita: 1 },
    ],
    prezzi(),
  );
  assert.equal(quotate, 1);
  assert.equal(senzaPrezzo, 2, 'la digitale e quella mai chiesta');
  assert.equal(totale, 421.11);
});

test('la chiave del prezzo è la stessa della riga di collezione', () => {
  // Se divergessero, i prezzi non si ritroverebbero più: la griglia cerca
  // esattamente con questa forma.
  assert.equal(chiavePrezzo('sv08', 118), 'sv08:118');
  assert.equal(chiavePrezzo('sv08', '118'), 'sv08:118');
});

test('un prezzo assente si scrive con un trattino, non con "0 €"', () => {
  assert.equal(formattaEuro(null), '—');
  assert.equal(formattaEuro(undefined), '—');
  assert.match(formattaEuro(4.2), /4,20/);
});
