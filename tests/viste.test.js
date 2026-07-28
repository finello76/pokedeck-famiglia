/**
 * Test del parsing del frammento (`src/app/viste.js`).
 *
 * Il router tocca il DOM e qui non c'è un DOM, ma la sola logica che si può
 * sbagliare — dove finisce il nome della vista e dove comincia il parametro —
 * è una funzione pura, esportata proprio per poterla provare.
 *
 * Il caso che conta è l'id di un mazzo salvato: è una data ISO, che contiene
 * `:` e `.` ma **anche** nessuna barra, mentre `spezzaFrammento` deve reggere
 * comunque una barra di troppo senza tagliare l'id a metà.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spezzaFrammento } from '../src/app/viste.js';

test('un frammento semplice non ha parametro', () => {
  assert.deepEqual(spezzaFrammento('#catalogo'), { nome: 'catalogo', parametro: '' });
  assert.deepEqual(spezzaFrammento('catalogo'), { nome: 'catalogo', parametro: '' });
});

test('la barra separa vista e parametro', () => {
  assert.deepEqual(spezzaFrammento('#mazzi/nuovo'), { nome: 'mazzi', parametro: 'nuovo' });
});

test('l\'id di un mazzo salvato resta intero', () => {
  const id = '2026-07-28T10:00:00.000Z';
  assert.deepEqual(spezzaFrammento(`#mazzi/${id}`), { nome: 'mazzi', parametro: id });
});

test('solo la prima barra separa: il resto appartiene al parametro', () => {
  assert.deepEqual(spezzaFrammento('#mazzi/a/b'), { nome: 'mazzi', parametro: 'a/b' });
});

test('frammento vuoto o assente non fa esplodere niente', () => {
  assert.deepEqual(spezzaFrammento(''), { nome: '', parametro: '' });
  assert.deepEqual(spezzaFrammento('#'), { nome: '', parametro: '' });
  assert.deepEqual(spezzaFrammento(undefined), { nome: '', parametro: '' });
});
