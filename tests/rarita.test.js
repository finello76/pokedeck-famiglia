/**
 * Test della classificazione delle rarità.
 *
 * Il valore grezzo di TCGdex è testo libero e nei dati italiani è mescolato al
 * francese ("deux Étoiles", "Une Diamant"): questi test fissano la traduzione
 * in classi ordinate, che è l'unica cosa che rende il menu utilizzabile.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { classeRarita, classiPresenti, eDiRarita } from '../src/data/rarita.js';

test('le stelle francesi diventano stelle italiane, in ordine', () => {
  assert.equal(classeRarita({ rarita: 'Une Étoile' }).codice, 'stella-1');
  assert.equal(classeRarita({ rarita: 'deux Étoiles' }).codice, 'stella-2');
  assert.equal(classeRarita({ rarita: 'Trois Étoiles' }).codice, 'stella-3');

  const [una, due, tre] = ['Une Étoile', 'deux Étoiles', 'Trois Étoiles'].map((r) =>
    classeRarita({ rarita: r }),
  );
  assert.ok(una.ordine < due.ordine && due.ordine < tre.ordine, 'più stelle = più raro');
});

test('una carta senza rarità non ha classe', () => {
  // Le energie base generiche non hanno rarità: devono restare fuori dal menu,
  // non finire in un gruppo "Altra rarità" che non vuol dire niente.
  assert.equal(classeRarita({ nome: 'Energia Erba' }), null);
  assert.equal(classeRarita(null), null);
});

test('il menu contiene solo le rarità davvero presenti, dal comune al raro', () => {
  const classi = classiPresenti([
    { rarita: 'Segreto rara' },
    { rarita: 'Comune' },
    { rarita: 'deux Étoiles' },
    { rarita: 'Comune' },
    null,
  ]);
  assert.deepEqual(classi.map((c) => c.codice), ['comune', 'stella-2', 'segreta']);
});

test('eDiRarita risponde sul codice, non sul testo grezzo', () => {
  // È il filtro della griglia: due scritture diverse della stessa rarità
  // ("Olografica Rara V" e "Rara") devono cadere nello stesso gruppo.
  assert.ok(eDiRarita({ rarita: 'Olografica Rara V' }, 'rara'));
  assert.ok(eDiRarita({ rarita: 'Rara' }, 'rara'));
  assert.ok(!eDiRarita({ rarita: 'Rara' }, 'ultrarara'));
});

test('ogni rarità dei dati reali trova una classe: nessuna finisce in "altra"', () => {
  // È il test che conta: le rarità nuove arrivano a ogni set, e una carta
  // classificata "Altra rarità" sparisce di fatto dal filtro. Se questo
  // fallisce, va aggiunta una regola in src/data/rarita.js.
  const sconosciute = new Set();
  for (const file of readdirSync('data/set')) {
    if (file === 'indice.json') continue;
    const set = JSON.parse(readFileSync(`data/set/${file}`, 'utf8'));
    for (const carta of set.carte) {
      if (classeRarita(carta)?.codice === 'altra') sconosciute.add(carta.rarita);
    }
  }
  assert.deepEqual([...sconosciute], [], 'rarità non riconosciute');
});
