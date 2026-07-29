/**
 * Test del passaggio dei **mazzi salvati** attraverso export e import.
 *
 * La regressione da cui nasce questo file: "Esporta dati" scriveva solo le
 * carte. Il file conteneva `{formato, versione, esportatoIl, carte}` e basta —
 * i mazzi salvati restavano nel vecchio dispositivo, senza che niente lo
 * dicesse. È il tipo di perdita che si scopre mesi dopo, quando il vecchio
 * telefono è già stato azzerato.
 *
 * Qui non si tocca IndexedDB: si prova la funzione pura che decide **cosa** di
 * un file è un mazzo utilizzabile, che è il punto dove l'errore è possibile.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mazziDaImportare, validaImport } from '../src/data/scambio.js';
import { istantanea, idrataPiano } from '../src/data/mazzi-salvati.js';

/** Un record salvato minimo ma realistico. */
const record = (id, nome = 'Mazzi di Natale') => ({
  id,
  nome,
  creatoIl: id,
  opzioni: { taglia: 20 },
  equilibrio: 0.9,
  mazzi: [{ nome: 'Rosso', tipi: ['Fuoco'], totale: 20, composizione: {}, forza: 12, carte: [] }],
  regole: [],
  carenze: [],
  permessi: {},
});

test('un file con mazzi li restituisce tutti', () => {
  const dati = { mazzi: [record('2026-01-01T10:00:00Z'), record('2026-02-02T10:00:00Z')] };
  assert.equal(mazziDaImportare(dati).length, 2);
});

test('un file senza mazzi non esplode e non inventa niente', () => {
  // Sono i file esportati dalle versioni precedenti: devono restare leggibili.
  assert.deepEqual(mazziDaImportare({ carte: [] }), []);
  assert.deepEqual(mazziDaImportare({}), []);
  assert.deepEqual(mazziDaImportare(null), []);
  assert.deepEqual(mazziDaImportare({ mazzi: 'non un elenco' }), []);
});

test('i record inservibili si scartano senza far fallire tutto', () => {
  const dati = {
    mazzi: [
      record('2026-01-01T10:00:00Z'),
      null,
      { nome: 'senza id', mazzi: [] },
      { id: '', mazzi: [] },
      { id: '2026-03-03T10:00:00Z' }, // senza l'elenco dei mazzi: card vuota
      'una stringa',
    ],
  };
  const buoni = mazziDaImportare(dati);
  assert.equal(buoni.length, 1, 'sopravvive solo il record completo');
  assert.equal(buoni[0].nome, 'Mazzi di Natale');
});

test('un mazzo rotto non deve costare la collezione', () => {
  // Le due metà del file sono indipendenti: le carte si validano a parte e
  // continuano ad arrivare anche se ogni singolo mazzo è da buttare.
  const dati = {
    formato: 'pokedeck-famiglia',
    versione: 1,
    carte: [{ idSet: 'sv08', numero: '118', quantita: 2 }],
    mazzi: [null, { rotto: true }],
  };
  assert.equal(mazziDaImportare(dati).length, 0);
  assert.equal(validaImport(dati).length, 1, 'le carte passano lo stesso');
});

test('il record esportato si riapre uguale: andata e ritorno', () => {
  // `istantanea()` produce la forma su disco, che è quella che finisce nel
  // file. Se il giro completo non tornasse, l'export sarebbe inutile anche
  // contenendo i dati.
  const piano = {
    equilibrio: 0.8,
    mazzi: [
      {
        nome: 'Rosso',
        tipi: ['Fuoco'],
        totale: 2,
        composizione: { pokemon: 1, energie: 1, allenatori: 0 },
        carte: [
          {
            quantita: 1,
            carta: {
              idSet: 'prova',
              numero: '1',
              nome: 'Charfinta',
              categoria: 'Pokémon',
              stadio: 'Base',
              tipi: ['Fuoco'],
              ps: 60,
              attacchi: [{ costo: ['Fuoco'], danno: '20' }],
            },
          },
        ],
      },
    ],
    regole: [],
    carenze: [],
    permessi: {},
  };

  const salvato = istantanea(piano, { taglia: 2 }, 'Prova', '2026-05-05T10:00:00Z');
  // Il giro nel file: JSON e ritorno, come farebbe davvero l'export/import.
  const dopoIlFile = JSON.parse(JSON.stringify({ mazzi: [salvato] }));

  const tornati = mazziDaImportare(dopoIlFile);
  assert.equal(tornati.length, 1);

  const piano2 = idrataPiano(tornati[0]);
  assert.equal(piano2.nome, 'Prova');
  const voce = piano2.mazzi[0].carte[0];
  assert.equal(voce.carta.nome, 'Charfinta', 'la carta deve tornare idratata');
  assert.equal(voce.quantita, 1);
  // `forza` è un oggetto (offesa, resistenza, totale…): dopo il giro nel JSON
  // è un'altra istanza con lo stesso contenuto, quindi si confronta a fondo.
  assert.deepEqual(
    piano2.mazzi[0].forza,
    salvato.mazzi[0].forza,
    'la forza si salva calcolata: deve restare identica, non ricalcolarsi',
  );
});
