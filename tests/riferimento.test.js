/**
 * Test della descrizione del mazzo di riferimento.
 *
 * Del modulo `data/riferimento.js` si provano solo `descriviMazzo()` e
 * `descriviPrefatto()`: sono le uniche parti che ragionano invece di leggere e
 * scrivere, e sono quelle che decidono cosa si vede scritto sotto "Mazzo di
 * riferimento". Il resto parla con IndexedDB, che qui non c'è.
 *
 * Il punto delicato è **quale** forza si legge. Il riferimento serve al wizard
 * come bersaglio, e il wizard lavora sulla scala assoluta 0–100 di
 * `engine/forza.js`. Il punteggio di `bilancia.js` che sta in
 * `piano.equilibrio.punteggi` è un'altra cosa — è relativo, confronta i mazzi
 * di uno stesso piano fra loro — e leggerlo qui significherebbe inseguire un
 * bersaglio espresso in un'unità che la UI non mostra da nessuna parte.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descriviMazzo, descriviPrefatto, SORGENTI } from '../src/data/riferimento.js';

const pk = (nome, { ps = 60, danno = 20 } = {}) => ({
  nome,
  numero: nome,
  idSet: 'prova',
  categoria: 'Pokémon',
  stadio: 'Base',
  evolveDa: null,
  tipi: ['Fuoco'],
  ps,
  attacchi: [{ nome: 'Colpo', costo: ['Fuoco'], danno }],
});

const carte = [
  { carta: pk('Fiammetta'), quantita: 8 },
  {
    carta: {
      nome: 'Energia Fuoco',
      numero: 'Fuoco',
      idSet: '@base',
      categoria: 'Energia',
      tipoEnergia: 'Base',
      tipi: ['Fuoco'],
    },
    quantita: 7,
  },
];

const piano = {
  id: '2026-07-26T10:00:00.000Z',
  nome: 'Torneo di Natale',
  opzioni: { taglia: 15 },
  // Presente apposta: deve restare **ignorato**. È la scala di `bilancia.js`.
  equilibrio: { punteggi: [{ totale: 132 }, { totale: 125 }] },
  mazzi: [
    { nome: 'Erba', totale: 15, carte, forza: 48 },
    { nome: 'Fuoco', totale: 15, carte, forza: 51 },
  ],
};

test('descrive il mazzo scelto con la forza salvata sulla scala 0–100', () => {
  assert.deepEqual(descriviMazzo(piano, 1), {
    sorgente: SORGENTI.SALVATO,
    idPiano: piano.id,
    indice: 1,
    nomePiano: 'Torneo di Natale',
    nome: 'Fuoco',
    forza: 51,
    taglia: 15,
  });
});

test('la forza non viene dai punteggi di equilibrio', () => {
  // Il difetto che questo test blocca: leggere 125 da `equilibrio.punteggi` e
  // consegnarlo al wizard come bersaglio su una scala che arriva a 100.
  const descrizione = descriviMazzo(piano, 1);
  assert.notEqual(descrizione.forza, 125);
  assert.ok(descrizione.forza <= 100, `${descrizione.forza} non sta sulla scala 0–100`);
});

test('un piano salvato prima che si scrivesse la forza la fa ricalcolare', () => {
  // I piani salvati dalle versioni precedenti non hanno `mazzo.forza`: il
  // riferimento non deve diventare inservibile per colpa loro.
  const vecchio = {
    ...piano,
    mazzi: [{ nome: 'Erba', totale: 15, carte }],
  };
  const forza = descriviMazzo(vecchio, 0).forza;
  assert.ok(forza > 0 && forza <= 100, `forza ricalcolata fuori scala: ${forza}`);
});

test('un indice fuori dai mazzi non descrive niente', () => {
  // È il caso che si presenta quando il piano è stato riaperto e salvato con
  // meno mazzi: il riferimento deve sciogliersi, non puntare a un buco.
  assert.equal(descriviMazzo(piano, 5), null);
  assert.equal(descriviMazzo(undefined, 0), null);
});

test('un mazzo non misurabile ha forza nulla, non zero', () => {
  // Zero significherebbe "mazzo debolissimo" e finirebbe nel confronto con la
  // forza obiettivo; `null` significa "non lo sappiamo" e si può nascondere.
  const vuoto = { ...piano, mazzi: [{ nome: 'Erba', totale: 15, carte: [] }] };
  assert.equal(descriviMazzo(vuoto, 0).forza, null);
});

test('un mazzo senza nome resta identificabile dalla posizione', () => {
  const anonimo = { ...piano, mazzi: [{ totale: 20, carte, forza: 40 }] };
  assert.equal(descriviMazzo(anonimo, 0).nome, 'Mazzo 1');
});

test('un prefatto si descrive con la stessa forma di un mazzo salvato', () => {
  // Stessa forma perché chi la consuma — il wizard, la sezione Impostazioni —
  // non deve sapere da quale delle due sorgenti arriva il metro.
  const descrizione = descriviPrefatto({
    id: 'tk-sm-l',
    nome: 'Kit Allenatore Lycanroc',
    prodotto: 'Sole e Luna — Kit Allenatore (2017)',
    taglia: 15,
    carte,
  });

  assert.equal(descrizione.sorgente, SORGENTI.PREFATTO);
  assert.equal(descrizione.idPrefatto, 'tk-sm-l');
  assert.equal(descrizione.nome, 'Kit Allenatore Lycanroc');
  assert.equal(descrizione.taglia, 15);
  assert.ok(descrizione.forza > 0 && descrizione.forza <= 100);
});

test('un prefatto che non esiste più non si descrive', () => {
  assert.equal(descriviPrefatto(null), null);
  assert.equal(descriviPrefatto(undefined), null);
});
