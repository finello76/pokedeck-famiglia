/**
 * Test dell'indice delle evoluzioni (`data/evoluzioni.json`).
 *
 * Qui si difende un file **generato**: `tools/genera-indice-evoluzioni.mjs` lo
 * riscrive, e chi aggiunge un set nuovo deve rilanciarlo. Il guasto tipico non
 * è un errore ma un silenzio — un campo che manca e una linea che si disegna
 * storta senza che niente si lamenti — quindi i campi si controllano qui.
 *
 * I casi scelti sono quelli che hanno rotto davvero la linea di Omastar:
 * il fossile italiano assente dai non-Pokémon, e le carte TURBO scambiate per
 * un gradino evolutivo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indice = JSON.parse(readFileSync(new URL('../data/evoluzioni.json', import.meta.url), 'utf8'));

test('l’indice ha tutti e quattro i campi che l’app legge', () => {
  assert.equal(typeof indice.da, 'object');
  assert.ok(Array.isArray(indice.nonPokemon));
  assert.equal(typeof indice.stadi, 'object');
  assert.ok(Array.isArray(indice.esotici), 'senza `esotici` i TURBO tornano a fare da gradino');
});

test('i fossili ci sono con tutti i nomi che le carte usano davvero', () => {
  // Lo stesso fossile si chiama in tre modi fra set italiani e inglesi. Chi
  // legge parte dalla carta che ha in mano, non dal nome che ha vinto il
  // conflitto nell'indice: se manca il suo, il fossile diventa un Pokémon Base.
  for (const nome of ['Vecchio Helixfossile', 'Helix Fossil', 'Mysterious Fossil']) {
    assert.ok(indice.nonPokemon.includes(nome), `${nome} deve stare fra i non-Pokémon`);
  }
});

test('i refusi del dataset non passano per carte Allenatore', () => {
  // *Drowsee* è un Drowzee scritto male, non un fossile: fermare lì la catena
  // direbbe che Hypno si mette in gioco da una carta Allenatore.
  for (const refuso of ['Drowsee', 'Jiggylypuff', 'Tailow']) {
    assert.ok(!indice.nonPokemon.includes(refuso), `${refuso} è un refuso, non un Allenatore`);
  }
});

test('gli stadi non canonici stanno fra gli esotici e fuori dagli stadi', () => {
  for (const nome of ['omastar turbo', 'arcanine break', 'charizard vmax']) {
    assert.ok(indice.esotici.includes(nome), `${nome} deve restare fuori dalla piramide`);
    assert.ok(!(nome in indice.stadi), `${nome} non ha un gradino: non deve avere uno stadio`);
  }
});

test('i tre stadi canonici restano nell’indice degli stadi', () => {
  assert.equal(indice.stadi.omanyte, 1, 'Omanyte è un Livello 1, non un Base');
  assert.equal(indice.stadi.omastar, 2);
  assert.equal(indice.stadi.charmander, 0);
});

test('fra due nomi per lo stesso fossile vince l’italiano', () => {
  // I file dei set inglesi si leggono per primi in ordine alfabetico, e la
  // finestra della linea mostra questi nomi: senza la preferenza, a chi ha in
  // mano *Vecchio Helixfossile* veniva detto "Helix Fossil".
  assert.equal(indice.da.omanyte, 'Vecchio Helixfossile');
  assert.equal(indice.da.kabuto, 'Vecchio Domofossile');
  assert.equal(indice.da.aerodactyl, 'Vecchia Ambra Antica');
});
