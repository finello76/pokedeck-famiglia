/**
 * Test di `distribuisci()`: come la ricerca globale per nome spende i suoi tetti.
 *
 * Il difetto da cui nasce: cercando "Qua" comparivano *Quaxly* e *Quagsire* ma
 * non *Quaxwell*, mentre cercando "Quax" comparivano tutti e due. Scrivere
 * **meno** lettere trovava **meno** carte, che è l'esatto contrario di quello
 * che una ricerca promette.
 *
 * La causa non era il filtro — i nomi corrispondenti erano 54 — ma il modo di
 * spendere i tetti: nome per nome, tutte le stampe del primo, poi tutte quelle
 * del secondo. Le prime due voci esaurivano i dodici set consentiti e la terza
 * non veniva nemmeno guardata.
 *
 * Qui si prova la proprietà che ripara il difetto: **prima la larghezza, poi la
 * profondità**. E si prova che i tetti restano tetti: la ricerca non deve
 * diventare più cara di prima, solo più equa.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribuisci } from '../src/data/dataset.js';

/** Le stampe di un nome, in `n` set diversi. */
const stampe = (prefisso, n) =>
  Array.from({ length: n }, (_, i) => ({ idSet: `${prefisso}${i}`, num: String(i + 1) }));

/** Quanti nomi hanno almeno una stampa fra quelle scelte. */
function nomiCoperti(gruppi, perSet) {
  const prese = new Set([...perSet].flatMap(([idSet, numeri]) => numeri.map((n) => `${idSet}:${n}`)));
  return gruppi.filter((g) => g.some(({ idSet, num }) => prese.has(`${idSet}:${num}`))).length;
}

test('il caso Quaxwell: il terzo nome non resta fuori', () => {
  // Riproduzione fedele: due nomi con tante stampe sparse, e un terzo che con
  // la vecchia regola non veniva raggiunto mai.
  const gruppi = [stampe('quaxly', 9), stampe('quagsire', 14), stampe('quaxwell', 6)];
  const { perSet, troncato } = distribuisci(gruppi, { maxSet: 12, maxCandidate: 60 });

  assert.equal(nomiCoperti(gruppi, perSet), 3, 'ogni nome deve avere almeno una stampa');
  assert.ok(perSet.has('quaxwell0'), 'il nome che prima restava fuori ora è dentro');
  assert.ok(troncato, 'qualcosa resta fuori davvero, e va detto');
});

test('i tetti restano tetti', () => {
  const gruppi = Array.from({ length: 40 }, (_, i) => stampe(`nome${i}_`, 10));
  const { perSet } = distribuisci(gruppi, { maxSet: 12, maxCandidate: 60 });

  assert.ok(perSet.size <= 12, `set aperti: ${perSet.size}`);
  const carte = [...perSet.values()].reduce((s, n) => s + n.length, 0);
  assert.ok(carte <= 60, `carte proposte: ${carte}`);
});

test('una stampa in un set già aperto è gratis, e si preferisce', () => {
  // Il secondo nome ha una stampa nel set del primo: prenderla non costa un
  // file in più, quindi va scelta prima di aprire `nuovo`.
  const gruppi = [
    [{ idSet: 'condiviso', num: '1' }],
    [
      { idSet: 'nuovo', num: '5' },
      { idSet: 'condiviso', num: '2' },
    ],
  ];
  const { perSet } = distribuisci(gruppi, { maxSet: 1, maxCandidate: 60 });

  assert.deepEqual([...perSet.keys()], ['condiviso']);
  assert.deepEqual(perSet.get('condiviso'), ['1', '2']);
});

test('la profondità arriva dopo la larghezza', () => {
  // Con spazio in abbondanza si prendono tutte le stampe di tutti: la regola
  // non deve *perdere* risultati, solo cambiarne l'ordine di raccolta.
  const gruppi = [stampe('a', 3), stampe('b', 2)];
  const { perSet, troncato } = distribuisci(gruppi, { maxSet: 99, maxCandidate: 99 });

  assert.equal([...perSet.values()].reduce((s, n) => s + n.length, 0), 5);
  assert.equal(troncato, false);
});

test('senza spazio per set nuovi non si gira a vuoto', () => {
  // Ogni nome sta in un set suo e il tetto è già pieno: la funzione deve
  // accorgersi che nessun giro prende più niente, invece di ciclare per sempre.
  const gruppi = [stampe('a', 1), stampe('b', 1), stampe('c', 1)];
  const { perSet, troncato } = distribuisci(gruppi, { maxSet: 1, maxCandidate: 60 });

  assert.equal(perSet.size, 1);
  assert.ok(troncato);
});

test('nessun nome, nessun risultato e niente da dichiarare', () => {
  const { perSet, troncato } = distribuisci([]);
  assert.equal(perSet.size, 0);
  assert.equal(troncato, false);
});

test('i gruppi ricevuti non vengono svuotati', () => {
  // La funzione consuma copie: chi la chiama può ancora contare le stampe di
  // ogni nome dopo averla usata.
  const gruppi = [stampe('a', 3)];
  distribuisci(gruppi, { maxSet: 99, maxCandidate: 99 });
  assert.equal(gruppi[0].length, 3);
});
