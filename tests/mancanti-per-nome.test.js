/**
 * Test di `mancantiPerNome()` di `src/data/completamento.js`.
 *
 * È la funzione che risponde a «quali Pikachu mi mancano»: cerca per nome in
 * tutto il catalogo e toglie ciò che hai già. Come in `dataset.test.js`, `fetch`
 * è sostituita con una versione che serve dati inventati — così il test
 * documenta anche il formato di `data/nomi.json`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const FINTI = {
  'indice.json': {
    set: [
      { id: 'alfa', nome: 'Set Alfa', totale: 100, carte: 3, serie: { id: 's1', nome: 'Prima' } },
      { id: 'beta', nome: 'Set Beta', totale: 100, carte: 1, serie: { id: 's1', nome: 'Prima' } },
      { id: 'muto', nome: 'Set Muto', totale: 100, carte: 1 },
    ],
  },
  'alfa.json': {
    id: 'alfa',
    nome: 'Set Alfa',
    carte: [
      { numero: '007', nome: 'Pikafinta', categoria: 'Pokémon', tipi: ['Lampo'] },
      // Oltre il totale del set: una "segreta". Per completare il set non
      // serve, ma se cerchi il nome la vuoi vedere.
      { numero: '150', nome: 'Pikafinta ex', categoria: 'Pokémon', tipi: ['Lampo'] },
    ],
  },
  'beta.json': {
    id: 'beta',
    nome: 'Set Beta',
    carte: [{ numero: '012', nome: 'Pikafinta', categoria: 'Pokémon', tipi: ['Lampo'] }],
  },
  'muto.json': { id: 'muto', nome: 'Set Muto', carte: [] },
  'nomi.json': {
    pikafinta: 'alfa:007 beta:012',
    'pikafinta ex': 'alfa:150',
    // Punta a un set che `fetch` non serve: è il caso offline.
    charfinta: 'rotto:001',
  },
  'evoluzioni.json': { da: {}, nonPokemon: [] },
};

globalThis.fetch = async (url) => {
  const nome = String(url).split('/').pop();
  if (!FINTI[nome]) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => FINTI[nome] };
};

const { mancantiPerNome } = await import('../src/data/completamento.js');

test('trova il nome anche in set di cui non possiedi niente', async () => {
  const { trovate } = await mancantiPerNome('pikafinta', []);
  const chiavi = trovate.map((t) => `${t.set.id}:${t.carta.numero}`);
  // Anche `beta`, di cui la collezione non ha nemmeno una carta: è il punto
  // della funzione, perché per quel set non esiste nessuna sezione a schermo.
  assert.deepEqual(chiavi.sort(), ['alfa:007', 'alfa:150', 'beta:012']);
});

test('non ripropone le carte che hai già', async () => {
  const { trovate } = await mancantiPerNome('pikafinta', [{ idSet: 'alfa', numero: '007' }]);
  assert.deepEqual(
    trovate.map((t) => `${t.set.id}:${t.carta.numero}`).sort(),
    ['alfa:150', 'beta:012'],
  );
});

test('gli zeri iniziali non fanno sfuggire una carta che hai', async () => {
  // In collezione il numero può essere scritto '7', nel dataset è '007'.
  const { trovate } = await mancantiPerNome('pikafinta', [{ idSet: 'alfa', numero: '7' }]);
  assert.ok(!trovate.some((t) => t.set.id === 'alfa' && t.carta.numero === '007'));
});

test('le carte oltre il totale del set si mostrano comunque', async () => {
  // A differenza di `carteMancanti()`, che completa un set: cercando un nome le
  // segrete e le promo interessano, anche se non contano nel completamento.
  const { trovate } = await mancantiPerNome('pikafinta ex', []);
  assert.deepEqual(
    trovate.map((t) => t.carta.numero),
    ['150'],
  );
});

test('un set irraggiungibile si dichiara invece di sparire', async () => {
  const { trovate, nonLetti } = await mancantiPerNome('charfinta', []);
  assert.deepEqual(trovate, []);
  assert.equal(nonLetti.length, 1);
});

test('un testo vuoto non cerca niente', async () => {
  const { trovate, troppi } = await mancantiPerNome('   ', []);
  assert.deepEqual(trovate, []);
  assert.equal(troppi, false);
});
