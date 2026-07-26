/**
 * Test del fabbisogno di Energie.
 *
 * La regressione da cui nasce, trovata con una collezione vera: nei mazzi
 * finivano Skarmory, Dialga, Exeggcute — carte i cui attacchi chiedono
 * Metallo, Erba, Acqua — senza le Energie di quei tipi. Su 960 mazzi generati,
 * 1103 carte si trovavano senza l'Energia che serve loro per attaccare.
 *
 * La causa era una sola e attraversava tutto il motore: si guardava
 * `mazzo.tipi`, il tipo DICHIARATO, e mai il costo degli attacchi delle carte
 * davvero presenti. I due non coincidono, ed è il caso di Dialga: tipo Drago,
 * attacchi che costano Psico e Metallo.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tipiRichiesti,
  fabbisogno,
  tipiPresenti,
  scoperte,
  tipiDisponibili,
} from '../src/engine/fabbisogno.js';

const pk = (nome, tipi, attacchi) => ({
  nome,
  numero: nome,
  idSet: 'prova',
  categoria: 'Pokémon',
  stadio: 'Base',
  tipi: Array.isArray(tipi) ? tipi : [tipi],
  ps: 70,
  attacchi,
});
const en = (tipo) => ({
  nome: `Energia ${tipo}`,
  numero: tipo,
  idSet: '@base',
  categoria: 'Energia',
  tipoEnergia: 'Base',
});

/** Dialga: il caso che ha reso evidente il difetto. Tipo Drago, costi altrove. */
const dialga = pk('Dialga', 'Drago', [
  { nome: 'Raggio', costo: ['Psico', 'Metallo', 'Incolore'], danno: 100 },
]);

test('il tipo richiesto si legge dal costo degli attacchi, non dal tipo della carta', () => {
  assert.deepEqual(tipiRichiesti(dialga), ['Psico', 'Metallo']);
  assert.ok(!tipiRichiesti(dialga).includes('Drago'), 'il tipo della carta non è un bisogno');
});

test('Incolore non è un bisogno: lo paga qualunque Energia', () => {
  const generico = pk('Snorlax', 'Incolore', [
    { nome: 'Botta', costo: ['Incolore', 'Incolore'], danno: 30 },
  ]);
  assert.deepEqual(tipiRichiesti(generico), []);
});

test('le carte che non sono Pokémon non chiedono niente', () => {
  assert.deepEqual(tipiRichiesti(en('Lotta')), []);
  assert.deepEqual(tipiRichiesti({ categoria: 'Allenatore', nome: 'Pozione' }), []);
  assert.deepEqual(tipiRichiesti(undefined), []);
});

test('un Pokémon senza attacchi non chiede niente, invece di far esplodere il conto', () => {
  assert.deepEqual(tipiRichiesti(pk('Muto', 'Lotta', [])), []);
  assert.deepEqual(tipiRichiesti({ categoria: 'Pokémon', nome: 'Vuoto' }), []);
});

test('il fabbisogno pesa per copie: tre Machop contano più di un Uxie', () => {
  const mazzo = {
    carte: [
      { carta: pk('Machop', 'Lotta', [{ costo: ['Lotta'], danno: 20 }]), quantita: 3 },
      { carta: pk('Uxie', 'Psico', [{ costo: ['Psico'], danno: 30 }]), quantita: 1 },
      { carta: en('Lotta'), quantita: 5 },
    ],
  };
  assert.deepEqual(fabbisogno(mazzo), { Lotta: 3, Psico: 1 });
});

test('una carta con due costi diversi conta per entrambi i tipi', () => {
  assert.deepEqual(fabbisogno({ carte: [{ carta: dialga, quantita: 2 }] }), {
    Psico: 2,
    Metallo: 2,
  });
});

test('i tipi presenti guardano le Energie base, riconoscendone il nome vero', () => {
  const mazzo = {
    carte: [
      { carta: { ...en('Lotta'), nome: 'Energia Combattimento' }, quantita: 4 },
      { carta: { categoria: 'Energia', nome: 'Energia Jet', tipoEnergia: 'Speciale' }, quantita: 2 },
    ],
  };
  // "Energia Combattimento" è di tipo Lotta: il confronto sul nome la perderebbe.
  assert.deepEqual([...tipiPresenti(mazzo)], ['Lotta']);
});

test('scoperte trova le carte che non possono attaccare', () => {
  const mazzo = {
    carte: [
      { carta: pk('Machop', 'Lotta', [{ costo: ['Lotta'], danno: 20 }]), quantita: 2 },
      { carta: pk('Skarmory', 'Metallo', [{ costo: ['Metallo'], danno: 40 }]), quantita: 1 },
      { carta: en('Lotta'), quantita: 5 },
    ],
  };
  const fuori = scoperte(mazzo);
  assert.equal(fuori.length, 1);
  assert.deepEqual(fuori[0], { nome: 'Skarmory', quantita: 1, mancano: ['Metallo'] });
});

test('basta un attacco pagabile perché la carta non sia scoperta', () => {
  // Il secondo attacco resta fuori portata, ma la carta si gioca lo stesso:
  // segnalarla direbbe al giocatore di sostituire una carta che funziona.
  const misto = pk('Bewear', 'Incolore', [
    { nome: 'Presa', costo: ['Lotta'], danno: 20 },
    { nome: 'Collera', costo: ['Metallo', 'Metallo'], danno: 120 },
  ]);
  const mazzo = { carte: [{ carta: misto, quantita: 1 }, { carta: en('Lotta'), quantita: 4 }] };
  assert.deepEqual(scoperte(mazzo), []);
});

test('un mazzo senza Energie ha tutte le sue carte scoperte', () => {
  const mazzo = {
    carte: [{ carta: pk('Machop', 'Lotta', [{ costo: ['Lotta'], danno: 20 }]), quantita: 3 }],
  };
  assert.equal(scoperte(mazzo).length, 1);
  assert.equal(scoperte(mazzo)[0].quantita, 3);
});

test('i tipi disponibili sono quelli che la collezione può davvero fornire', () => {
  const voci = [
    { carta: en('Lotta'), quantita: 4 },
    { carta: en('Psico'), quantita: 2 },
    // Quantità zero: la carta è catalogata ma non c'è. Contarla significherebbe
    // scegliere Pokémon che nessuna Energia potrà alimentare.
    { carta: en('Metallo'), quantita: 0 },
    { carta: { categoria: 'Energia', nome: 'Energia Jet', tipoEnergia: 'Speciale' }, quantita: 3 },
    { carta: pk('Machop', 'Lotta', []), quantita: 4 },
  ];
  const tipi = tipiDisponibili(voci);
  assert.deepEqual([...tipi].sort(), ['Lotta', 'Psico']);
  assert.ok(!tipi.has('Metallo'), 'zero copie non è disponibilità');
});
