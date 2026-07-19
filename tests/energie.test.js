/**
 * Test di `src/data/energie.js`.
 *
 * Girano con il runner incluso in Node, senza installare niente:
 *   node --test tests/
 *
 * Il modulo sotto test è puro (nessun DOM, nessun database), quindi si importa
 * direttamente. È il motivo per cui vale la pena tenere separata la logica
 * dalla UI: qui non serve né un browser né un mock.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoEnergia, eEnergiaBase, conteggioEnergie } from '../src/data/energie.js';

const energia = (nome, tipoEnergia = 'Base') => ({ categoria: 'Energia', nome, tipoEnergia });

test('riconosce i nomi italiani che coincidono col tipo dei Pokémon', () => {
  assert.equal(tipoEnergia(energia('Energia Erba')), 'Erba');
  assert.equal(tipoEnergia(energia('Energia Fuoco')), 'Fuoco');
  assert.equal(tipoEnergia(energia('Energia Metallo')), 'Metallo');
});

test('traduce i nomi italiani che NON coincidono col tipo dei Pokémon', () => {
  // Sono i due casi che romperebbero il motore in silenzio.
  assert.equal(tipoEnergia(energia('Energia Psiche')), 'Psico');
  assert.equal(tipoEnergia(energia('Energia Combattimento')), 'Lotta');
});

test('riconosce i nomi rimasti in inglese nel dataset', () => {
  assert.equal(tipoEnergia(energia('Energia base Psychic')), 'Psico');
  assert.equal(tipoEnergia(energia('Energia base Fighting')), 'Lotta');
});

test('gestisce gli accenti', () => {
  assert.equal(tipoEnergia(energia('Energia Oscurità')), 'Oscurità');
});

test('le energie speciali non hanno tipo elementale', () => {
  assert.equal(tipoEnergia(energia('Energia Jet', 'Speciale')), null);
  assert.equal(tipoEnergia(energia('Energia Ricchezza', 'Speciale')), null);
});

test('non tratta i Pokémon come energie', () => {
  assert.equal(tipoEnergia({ categoria: 'Pokémon', nome: 'Zweilous' }), null);
  assert.equal(tipoEnergia(null), null);
  assert.equal(tipoEnergia(undefined), null);
});

test('distingue base e speciali', () => {
  assert.equal(eEnergiaBase(energia('Energia Fuoco')), true);
  assert.equal(eEnergiaBase(energia('Energia Jet', 'Speciale')), false);
  assert.equal(eEnergiaBase({ categoria: 'Allenatore', nome: 'Campanello di Servizio' }), false);
});

test('somma le copie per tipo', () => {
  const esito = conteggioEnergie([
    { carta: energia('Energia Fuoco'), quantita: 4 },
    { carta: energia('Energia Fuoco'), quantita: 2 },
    { carta: energia('Energia Acqua'), quantita: 3 },
  ]);
  assert.deepEqual(esito.perTipo, { Fuoco: 6, Acqua: 3 });
  assert.equal(esito.totaleBase, 9);
});

test('conta le speciali a parte, senza attribuirle a un tipo', () => {
  const esito = conteggioEnergie([
    { carta: energia('Energia Fuoco'), quantita: 2 },
    { carta: energia('Energia Jet', 'Speciale'), quantita: 1 },
  ]);
  assert.deepEqual(esito.perTipo, { Fuoco: 2 });
  assert.equal(esito.totaleBase, 2);
  assert.equal(esito.totaleSpeciali, 1);
});

test('segnala le energie base di tipo non riconosciuto invece di ignorarle', () => {
  // Se il dataset introducesse un nome nuovo, il motore deve accorgersene:
  // un conteggio silenziosamente basso produrrebbe mazzi ingiocabili.
  const esito = conteggioEnergie([{ carta: energia('Energia Fantasia'), quantita: 5 }]);
  assert.equal(esito.senzaTipo, 5);
  assert.equal(esito.totaleBase, 0);
  assert.deepEqual(esito.perTipo, {});
});

test('ignora le carte che non sono energie', () => {
  const esito = conteggioEnergie([
    { carta: { categoria: 'Pokémon', nome: 'Marowak', tipi: ['Lotta'] }, quantita: 3 },
    { carta: energia('Energia Lotta'), quantita: 1 },
  ]);
  assert.deepEqual(esito.perTipo, { Lotta: 1 });
  assert.equal(esito.totaleBase, 1);
});
