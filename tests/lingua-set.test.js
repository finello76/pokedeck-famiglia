/**
 * Test di `src/ui/lingua-set.js`.
 *
 * Sembra grafica, è una decisione: *questo dato viene da un'altra lingua, e va
 * detto*. Sbagliarla in un verso mette un'etichetta su carte italiane; nell'altro
 * lascia credere che «Luster Purge» sia stampato sulla carta che si ha in mano.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { eInglese, pastigliaLingua, SPIEGAZIONE } from '../src/ui/lingua-set.js';

test('riconosce le due forme in cui il dato circola', () => {
  // Riga dell'indice dei set…
  assert.equal(eInglese({ id: 'ex3', lingua: 'en' }), true);
  // …e voce di collezione, che lo porta con un altro nome.
  assert.equal(eInglese({ idSet: 'ex3', linguaSet: 'en' }), true);
});

test('un set italiano non porta nessuna etichetta', () => {
  // L'assenza del campo È l'italiano: è la convenzione scelta nell'indice per
  // non toccare i 110 set che c'erano già.
  assert.equal(eInglese({ id: 'base1' }), false);
  assert.equal(eInglese({ id: 'base1', lingua: null }), false);
  assert.equal(eInglese({ id: 'base1', linguaSet: null }), false);
  assert.equal(pastigliaLingua({ id: 'base1' }), '');
});

test('un set assente non fa esplodere niente', () => {
  // Capita: carta di un set non più scaricato, o voce a metà.
  assert.equal(eInglese(null), false);
  assert.equal(eInglese(undefined), false);
  assert.equal(pastigliaLingua(null), '');
});

test('la pastiglia restituisce stringa vuota, non null', () => {
  // Finisce dentro template literal: un `null` stamperebbe la parola "null"
  // in mezzo ai chip.
  const html = pastigliaLingua({ id: 'base1' });
  assert.equal(typeof html, 'string');
  assert.ok(!html.includes('null'));
});

test('la pastiglia inglese porta sigla e spiegazione', () => {
  const html = pastigliaLingua({ id: 'ex3', lingua: 'en' });
  assert.match(html, />EN</, 'la sigla deve essere leggibile');
  assert.ok(html.includes(SPIEGAZIONE), 'senza spiegazione "EN" non vuol dire niente');
  assert.match(html, /class="chip chip-lingua"/);
});

test('una lingua diversa da "en" non viene trattata come inglese', () => {
  // Se un giorno arrivasse un ripiego francese, deve avere la SUA etichetta,
  // non essere spacciato per inglese.
  assert.equal(eInglese({ id: 'x', lingua: 'fr' }), false);
  assert.equal(eInglese({ id: 'x', lingua: 'it' }), false);
});
