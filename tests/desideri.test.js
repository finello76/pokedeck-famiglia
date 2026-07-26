/**
 * Test della lista desideri.
 *
 * Un desiderio è una carta che **non hai**, e il rischio di tutta la funzione è
 * uno solo: che finisca contata come posseduta. Succederebbe in silenzio — il
 * motore genererebbe mazzi con carte che non stanno nella scatola, le
 * statistiche direbbero numeri gonfiati — e nessuno se ne accorgerebbe fino a
 * quando non si prova a costruire il mazzo sul tavolo.
 *
 * Il filtraggio si prova qui, sui dati puri, perché `collezione.js` parla con
 * IndexedDB e nei test non c'è un browser.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtra, FILTRI_VUOTI } from '../src/ui/griglia-collezione/raggruppa.js';
import { validaImport } from '../src/data/scambio.js';

const voce = (nome, opzioni = {}) => ({
  idSet: opzioni.idSet ?? 'prova',
  numero: nome,
  quantita: opzioni.quantita ?? 1,
  ...(opzioni.desiderata ? { desiderata: true } : {}),
  serie: { id: 'sv', nome: 'Scarlatto e Violetto' },
  nomeSet: 'Prova',
  carta: {
    nome,
    numero: nome,
    categoria: opzioni.categoria ?? 'Pokémon',
    tipi: [opzioni.tipo ?? 'Lotta'],
    stadio: 'Base',
    ps: 70,
  },
});

const collezione = () => [
  voce('Machop'),
  voce('Mankey'),
  voce('Charizard', { desiderata: true, quantita: 2 }),
  voce('Pikachu', { desiderata: true, tipo: 'Lampo' }),
];

const nomi = (voci) => voci.map((v) => v.carta.nome).sort();

test('per difetto il filtro mostra tutto, posseduto e desiderato', () => {
  assert.deepEqual(nomi(filtra(collezione(), FILTRI_VUOTI)), [
    'Charizard',
    'Machop',
    'Mankey',
    'Pikachu',
  ]);
});

test('"solo" mostra la lista della spesa', () => {
  assert.deepEqual(nomi(filtra(collezione(), { desiderio: 'solo' })), ['Charizard', 'Pikachu']);
});

test('"escludi" mostra solo ciò che si possiede davvero', () => {
  assert.deepEqual(nomi(filtra(collezione(), { desiderio: 'escludi' })), ['Machop', 'Mankey']);
});

test('il filtro desideri si combina con gli altri', () => {
  // Non è scontato: se fosse applicato dopo, o al posto degli altri, chiedere
  // "i desideri di tipo Lampo" darebbe tutti i desideri.
  assert.deepEqual(nomi(filtra(collezione(), { desiderio: 'solo', tipo: 'Lampo' })), ['Pikachu']);
  // Charizard è desiderato ed è di tipo Lotta: passa entrambi i filtri.
  assert.deepEqual(nomi(filtra(collezione(), { desiderio: 'solo', tipo: 'Lotta' })), ['Charizard']);
  // Machop è di tipo Lotta ma NON è desiderato: il filtro sui desideri lo
  // esclude, cioè i due criteri si sommano invece di sostituirsi.
  assert.deepEqual(nomi(filtra(collezione(), { desiderio: 'escludi', tipo: 'Lampo' })), []);
});

test('il filtro funziona anche senza i dati della carta', () => {
  // Carta di un set non più scaricato: `carta` è null, ma la riga sa comunque
  // di essere un desiderio, perché il campo sta sulla riga e non sulla carta.
  const orfana = { idSet: 'x', numero: '1', quantita: 1, desiderata: true, carta: null };
  assert.equal(filtra([orfana], { desiderio: 'solo' }).length, 1);
  assert.equal(filtra([orfana], { desiderio: 'escludi' }).length, 0);
});

test('l\'export conserva il desiderio, l\'import lo rilegge', () => {
  const file = {
    formato: 'pokedeck-famiglia',
    versione: 1,
    carte: [
      { idSet: 'sv08', numero: '118', quantita: 2 },
      { idSet: 'sv08', numero: '135', quantita: 1, desiderata: true },
    ],
  };
  const voci = validaImport(file);
  assert.equal(voci[0].desiderata, undefined, 'una carta posseduta non diventa un desiderio');
  assert.equal(voci[1].desiderata, true);
});

test('i file esportati prima della lista desideri restano validi', () => {
  // Compatibilità all'indietro: campo assente vuol dire posseduta, che è il
  // comportamento di sempre. Un export di maggio deve reimportarsi a luglio.
  const vecchio = {
    formato: 'pokedeck-famiglia',
    versione: 1,
    carte: [{ idSet: 'sv08', numero: '118', quantita: 3, nome: 'Zweilous' }],
  };
  const voci = validaImport(vecchio);
  assert.equal(voci.length, 1);
  assert.equal(voci[0].quantita, 3);
  assert.equal(voci[0].desiderata, undefined);
});
