/**
 * Test della linea evolutiva mostrata attorno a una carta.
 *
 * Le due cose che questo modulo deve fare e che nessun altro fa: guardare
 * **verso l'alto** (le evoluzioni, che l'indice non elenca ma nasconde nelle
 * sue chiavi) e non annegare l'utente quando il ventaglio è enorme — da Eevee
 * discendono trentatré nomi.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catenaEvolutiva } from '../src/engine/catena.js';

const pk = (nome, evolveDa = null) => ({ nome, categoria: 'Pokémon', evolveDa });

test('la linea comprende sia le pre-evoluzioni sia le evoluzioni', () => {
  const indice = { machoke: 'Machop', machamp: 'Machoke' };
  const { gradini, livelloCarta } = catenaEvolutiva(pk('Machoke', 'Machop'), indice);

  assert.deepEqual(
    gradini.map((g) => g.nomi),
    [['Machop'], ['Machoke'], ['machamp']],
    'sotto il nome della carta, sopra quello preso dalle chiavi dell’indice',
  );
  assert.equal(livelloCarta, 1, 'la carta di partenza sta al gradino di mezzo');
});

test('una Base senza evoluzioni resta una linea di un gradino solo', () => {
  const { gradini, livelloCarta } = catenaEvolutiva(pk('Ditto'), { machamp: 'Machoke' });

  assert.deepEqual(gradini.map((g) => g.nomi), [['Ditto']]);
  assert.equal(livelloCarta, 0);
});

test('le evoluzioni dello stesso gradino stanno tutte sulla stessa riga', () => {
  const indice = { raichu: 'Pikachu', 'raichu di alola': 'Pikachu', 'raichu gx': 'Pikachu' };
  const { gradini } = catenaEvolutiva(pk('Pikachu'), indice);

  assert.equal(gradini.length, 2);
  assert.deepEqual(gradini[1].nomi.sort(), ['raichu', 'raichu di alola', 'raichu gx']);
  assert.equal(gradini[1].oltre, 0);
});

test('le forme normali passano davanti alle varianti', () => {
  // Il caso Eevee: in ordine d'indice le prime caselle se le prendono i "Dark"
  // e gli "ex", e Flareon resta fuori.
  const indice = { 'dark flareon': 'Eevee', 'flareon ex': 'Eevee', flareon: 'Eevee' };
  const { gradini } = catenaEvolutiva(pk('Eevee'), indice, new Set(), { maxPerLivello: 1 });

  assert.deepEqual(gradini[1].nomi, ['flareon']);
});

test('un’evoluzione che possiedi non finisce mai fra le tagliate', () => {
  const indice = { 'aaa corto': 'Eevee', 'bbb corto': 'Eevee', 'una evoluzione lunghissima': 'Eevee' };
  const { gradini } = catenaEvolutiva(pk('Eevee'), indice, new Set(), {
    maxPerLivello: 1,
    possedute: new Set(['una evoluzione lunghissima']),
  });

  assert.deepEqual(gradini[1].nomi, ['una evoluzione lunghissima']);
  assert.equal(gradini[1].oltre, 2);
});

test('il ventaglio si taglia al tetto e dichiara quanti nomi restano fuori', () => {
  const indice = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`evoluzione ${i}`, 'Eevee']),
  );
  const { gradini } = catenaEvolutiva(pk('Eevee'), indice, new Set(), { maxPerLivello: 3 });

  assert.equal(gradini[1].nomi.length, 3, 'a schermo vanno solo i primi tre');
  assert.equal(gradini[1].oltre, 9, 'gli altri nove si contano, non si nascondono');
});

test('la linea non supera mai i tre gradini', () => {
  // Una catena di cinque: dal Base si sale, ma il gioco non ha un quarto stadio
  // e una linea più lunga vorrebbe dire che l'indice è sporco.
  const indice = { b: 'A', c: 'B', d: 'C', e: 'D' };
  const { gradini } = catenaEvolutiva(pk('A'), indice);

  assert.equal(gradini.length, 3);
});

test('un indice con un ciclo non manda il calcolo all’infinito', () => {
  const indice = { alfa: 'Beta', beta: 'Alfa' };
  const { gradini } = catenaEvolutiva(pk('Alfa'), indice);

  assert.ok(gradini.length <= 3, 'il ciclo si interrompe invece di crescere');
});

test('la catena si ferma prima dei fossili, che sono carte Allenatore', () => {
  const indice = { omanyte: 'Vecchio Helixfossile' };
  const { gradini } = catenaEvolutiva(
    pk('Omanyte', 'Vecchio Helixfossile'),
    indice,
    new Set(['vecchio helixfossile']),
  );

  assert.deepEqual(gradini.map((g) => g.nomi), [['Omanyte']], 'niente fossili fra i Pokémon');
});
