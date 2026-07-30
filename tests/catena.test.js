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

/** I nomi mostrati, livello per livello. */
const nomiDi = (gradini) => gradini.map((g) => g.specie.map((s) => s.nome));

test('la linea comprende sia le pre-evoluzioni sia le evoluzioni', () => {
  const indice = { machoke: 'Machop', machamp: 'Machoke' };
  const { gradini, livelloCarta } = catenaEvolutiva(pk('Machoke', 'Machop'), indice);

  assert.deepEqual(
    nomiDi(gradini),
    [['Machop'], ['Machoke'], ['machamp']],
    'sotto il nome della carta, sopra quello preso dalle chiavi dell’indice',
  );
  assert.equal(livelloCarta, 1, 'la carta di partenza sta al gradino di mezzo');
});

test('una Base senza evoluzioni resta una linea di un gradino solo', () => {
  const { gradini, livelloCarta } = catenaEvolutiva(pk('Ditto'), { machamp: 'Machoke' });

  assert.deepEqual(nomiDi(gradini), [['Ditto']]);
  assert.equal(livelloCarta, 0);
});

test('le specie dello stesso gradino stanno tutte sulla stessa riga', () => {
  const indice = { espeon: 'Eevee', umbreon: 'Eevee', flareon: 'Eevee' };
  const { gradini } = catenaEvolutiva(pk('Eevee'), indice);

  assert.equal(gradini.length, 2);
  assert.deepEqual(gradini[1].specie.map((s) => s.nome).sort(), ['espeon', 'flareon', 'umbreon']);
  assert.equal(gradini[1].oltre, 0);
});

test('le versioni speciali di una specie non sono gradini', () => {
  // Il difetto che questo test guarda: la linea di Rockruff mostrava quattro
  // caselle — Lycanroc, Lycanroc, Lycanroc-ex, Lycanroc GX — quando il gradino
  // è uno solo. Una linea evolutiva è fatta di specie, non di stampe.
  const indice = {
    lycanroc: 'Rockruff',
    'lycanroc ex': 'Rockruff',
    'lycanroc gx': 'Rockruff',
    'dark lycanroc': 'Rockruff',
  };
  const { gradini } = catenaEvolutiva(pk('Rockruff'), indice);

  assert.deepEqual(nomiDi(gradini), [['Rockruff'], ['lycanroc']]);
  assert.deepEqual(gradini[1].specie[0].varianti.sort(), [
    'dark lycanroc',
    'lycanroc ex',
    'lycanroc gx',
  ]);
  assert.equal(gradini[1].oltre, 0, 'accorpare non è tagliare: non manca niente');
});

test('la specie si riconosce anche quando sta in mezzo al nome', () => {
  // "Mega Gardevoir ex" non comincia né finisce con "Gardevoir": senza guardare
  // dentro, comparirebbe come se fosse un secondo gradino.
  const indice = { gardevoir: 'Kirlia', 'mega gardevoir ex': 'Kirlia', gallade: 'Kirlia' };
  const { gradini } = catenaEvolutiva(pk('Kirlia'), indice);

  assert.deepEqual(nomiDi(gradini)[1].sort(), ['gallade', 'gardevoir']);
});

test('due specie diverse non si accorpano per un pezzo di nome in comune', () => {
  // Senza il confine di parola "nidorino" finirebbe dentro "nidorina".
  const indice = { nidorina: 'Nidoran', nidorino: 'Nidoran' };
  const { gradini } = catenaEvolutiva(pk('Nidoran'), indice);

  assert.deepEqual(gradini[1].specie.map((s) => s.nome).sort(), ['nidorina', 'nidorino']);
});

test('il capofila di una specie è il nome normale, non una sua versione', () => {
  const indice = { 'dark flareon': 'Eevee', 'flareon ex': 'Eevee', flareon: 'Eevee' };
  const { gradini } = catenaEvolutiva(pk('Eevee'), indice);

  assert.deepEqual(nomiDi(gradini)[1], ['flareon']);
});

test('una specie che possiedi non finisce mai fra le tagliate', () => {
  const indice = { alfa: 'Eevee', beta: 'Eevee', 'specie lunghissima': 'Eevee' };
  const { gradini } = catenaEvolutiva(pk('Eevee'), indice, new Set(), {
    maxPerLivello: 1,
    possedute: new Set(['specie lunghissima']),
  });

  assert.deepEqual(nomiDi(gradini)[1], ['specie lunghissima']);
  assert.equal(gradini[1].oltre, 2);
});

test('il ventaglio si taglia al tetto e dichiara quante specie restano fuori', () => {
  // Nomi senza niente in comune, o si accorperebbero invece di essere tagliati.
  const indice = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [`specie${i}`, 'Eevee']),
  );
  const { gradini } = catenaEvolutiva(pk('Eevee'), indice, new Set(), { maxPerLivello: 3 });

  assert.equal(gradini[1].specie.length, 3, 'a schermo vanno solo le prime tre');
  assert.equal(gradini[1].oltre, 9, 'le altre nove si contano, non si nascondono');
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

  assert.deepEqual(nomiDi(gradini), [['Omanyte']], 'niente fossili fra i Pokémon');
});
