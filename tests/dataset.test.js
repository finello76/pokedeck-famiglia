/**
 * Test di `src/data/dataset.js`.
 *
 * `dataset.js` usa `fetch`, che in Node esiste ma qui punterebbe alla rete:
 * lo si sostituisce con una versione finta che serve dati inventati. Serve
 * anche a documentare il formato che il modulo si aspetta.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/** Dati finti serviti dalla fetch sostituita. */
const FINTI = {
  'indice.json': {
    set: [
      { id: 'alfa', nome: 'Set Alfa', totale: 100, carte: 2 },
      { id: 'beta', nome: 'Set Beta', totale: 100, carte: 1 },
      { id: 'gamma', nome: 'Set Gamma', totale: 50, carte: 1 },
      { id: 'rotto', nome: 'Set Irraggiungibile', totale: 100, carte: 1 },
    ],
  },
  'alfa.json': {
    id: 'alfa',
    nome: 'Set Alfa',
    carte: [
      { numero: '007', nome: 'Sette Alfa', categoria: 'Pokémon' },
      { numero: 'TG01', nome: 'Codice Alfa', categoria: 'Pokémon' },
    ],
  },
  'beta.json': {
    id: 'beta',
    nome: 'Set Beta',
    carte: [{ numero: '007', nome: 'Sette Beta', categoria: 'Pokémon' }],
  },
  'gamma.json': {
    id: 'gamma',
    nome: 'Set Gamma',
    carte: [{ numero: '007', nome: 'Sette Gamma', categoria: 'Pokémon' }],
  },
};

globalThis.fetch = async (url) => {
  const nome = String(url).split('/').pop();
  // 'rotto.json' simula un set non scaricabile: è il caso offline.
  if (!FINTI[nome]) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => FINTI[nome] };
};

// L'import va fatto DOPO aver sostituito fetch: il modulo la usa al primo uso,
// ma meglio non dipendere dall'ordine interno.
const dataset = await import('../src/data/dataset.js');

test('trova una carta per set e numero', async () => {
  const carta = await dataset.trovaCarta('alfa', '007');
  assert.equal(carta.nome, 'Sette Alfa');
});

test('ignora gli zeri iniziali in entrambi i versi', async () => {
  assert.equal((await dataset.trovaCarta('alfa', 7)).nome, 'Sette Alfa');
  assert.equal((await dataset.trovaCarta('alfa', '7')).nome, 'Sette Alfa');
  assert.equal((await dataset.trovaCarta('alfa', '007')).nome, 'Sette Alfa');
});

test('gestisce i numeri non numerici delle sottoserie', async () => {
  assert.equal((await dataset.trovaCarta('alfa', 'TG01')).nome, 'Codice Alfa');
  assert.equal((await dataset.trovaCarta('alfa', 'tg01')).nome, 'Codice Alfa');
});

test('un numero inesistente non esplode', async () => {
  assert.equal(await dataset.trovaCarta('alfa', '999'), null);
});

test('una stringa vuota non trova la carta numero zero', async () => {
  // Number('') vale 0: senza la guardia esplicita, un campo lasciato vuoto
  // avrebbe trovato una carta a caso.
  assert.equal(await dataset.trovaCarta('alfa', ''), null);
});

test('il totale stampato restituisce TUTTI i set candidati', async () => {
  const { trovate } = await dataset.cercaPerNumeroStampato('007', 100);
  const nomi = trovate.map((t) => t.carta.nome).sort();
  // gamma ha totale 50: non deve comparire.
  assert.deepEqual(nomi, ['Sette Alfa', 'Sette Beta']);
});

test('un set non leggibile non fa fallire la ricerca ma viene segnalato', async () => {
  const { trovate, nonLetti } = await dataset.cercaPerNumeroStampato('007', 100);
  assert.equal(trovate.length, 2, 'le carte leggibili si trovano lo stesso');
  assert.deepEqual(nonLetti, ['Set Irraggiungibile'], 'il set mancante viene segnalato');
});

test('un totale senza set candidati torna vuoto senza errori', async () => {
  const { trovate, nonLetti } = await dataset.cercaPerNumeroStampato('007', 12345);
  assert.deepEqual(trovate, []);
  assert.deepEqual(nonLetti, []);
});

test("l'URL dell'immagine cambia con l'uso", () => {
  const carta = { immagine: 'https://esempio/it/x/1' };
  assert.equal(dataset.urlImmagine(carta), 'https://esempio/it/x/1/low.webp');
  assert.equal(dataset.urlImmagine(carta, 'stampa'), 'https://esempio/it/x/1/high.png');
  assert.equal(dataset.urlImmagine({ immagine: null }), null);
});
