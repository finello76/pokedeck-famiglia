/**
 * Test delle linee evolutive come unità di progetto del mazzo.
 *
 * La regressione da cui nasce questo file: sulla collezione vera **nessuna**
 * evoluzione ha in casa la carta da cui evolve, e il motore — che ragionava
 * sulle sole carte possedute — produceva mazzi di soli Pokémon Base. Qui si
 * verifica che una linea incompleta valga più di una Base isolata, e che si
 * completi stampando il minimo indispensabile.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumeraLinee, ordinaLinee, richiestaPerLinea } from '../src/engine/linee.js';

const pk = (nome, stadio = 'Base', evolveDa = null, tipo = 'Lotta') => ({
  nome,
  numero: nome,
  idSet: 'prova',
  categoria: 'Pokémon',
  stadio,
  evolveDa,
  tipi: [tipo],
  ps: 100,
  attacchi: [{ nome: 'Colpo', costo: [tipo], danno: 30 }],
});
const disp = (...carte) => carte.map((carta) => ({ carta, disponibili: 1 }));

test('un Livello 2 senza pre-evoluzioni diventa una linea da tre gradini', () => {
  const [linea] = enumeraLinee(disp(pk('Machamp', 'Livello 2', 'Machoke')), {
    machoke: 'Machop',
  });

  assert.deepEqual(
    linea.gradini.map((g) => g.nome),
    ['Machop', 'Machoke', 'Machamp'],
    'la catena si ricostruisce dal basso, anche se possiedi solo la cima',
  );
  assert.equal(linea.daStampare, 2, 'due gradini mancano alla collezione');
  assert.equal(linea.gradini[2].carta.nome, 'Machamp', 'la cima è la carta vera');
});

test('i gradini posseduti si usano, non si ristampano', () => {
  const [linea] = enumeraLinee(
    disp(pk('Machamp', 'Livello 2', 'Machoke'), pk('Machop')),
    { machoke: 'Machop' },
  ).filter((l) => l.profondita === 3);

  assert.equal(linea.daStampare, 1, 'solo Machoke manca davvero');
  assert.equal(linea.gradini[0].carta.nome, 'Machop', 'la Base posseduta occupa il suo gradino');
});

test('una linea profonda batte una Base isolata, anche dovendo stampare', () => {
  const linee = enumeraLinee(disp(pk('Machamp', 'Livello 2', 'Machoke'), pk('Solitario')), {
    machoke: 'Machop',
  });
  const ordinate = ordinaLinee(linee, ['Lotta'], { budget: 4 });

  assert.equal(
    ordinate[0].cima.nome,
    'Machamp',
    'è il rovesciamento che questo modulo esiste per ottenere',
  );
});

test('senza budget la linea da stampare sparisce, la Base resta', () => {
  const linee = enumeraLinee(disp(pk('Machamp', 'Livello 2', 'Machoke'), pk('Solitario')), {
    machoke: 'Machop',
  });
  const ordinate = ordinaLinee(linee, ['Lotta'], { budget: 0 });

  assert.deepEqual(
    ordinate.map((l) => l.cima.nome),
    ['Solitario'],
    'una linea che non si può completare non si prende a metà',
  );
});

test('con la regola della casa la linea impossibile si gioca dalla mano', () => {
  const linee = enumeraLinee(disp(pk('Machamp', 'Livello 2', 'Machoke')), { machoke: 'Machop' });
  const [linea] = ordinaLinee(linee, ['Lotta'], { budget: 0, evoluzioniComeBase: true });

  assert.equal(linea.profondita, 1, 'resta la sola cima');
  assert.ok(linea.deroga, 'ed è segnata come deroga, non come linea vera');
});

test('una linea che poggia sul vuoto richiede la deroga: nessuna stampa la ripara', () => {
  // Pre-evoluzione sconosciuta: non si sa nemmeno quale carta stampare.
  const linee = enumeraLinee(disp(pk('Krookodile', 'Livello 2', null)), {});
  assert.equal(ordinaLinee(linee, ['Lotta'], { budget: 10 }).length, 0);
  assert.equal(ordinaLinee(linee, ['Lotta'], { budget: 0, evoluzioniComeBase: true }).length, 1);
});

test('la richiesta dà una copia a ogni gradino prima di ingrossare la piramide', () => {
  const [linea] = enumeraLinee(disp(pk('Machamp', 'Livello 2', 'Machoke')), {
    machoke: 'Machop',
  });
  const richiesta = richiestaPerLinea(linea, [3, 2, 1], 10, 4);

  assert.deepEqual(
    richiesta.map((v) => [v.gradino.nome, v.quante]),
    [['Machop', 3], ['Machoke', 1], ['Machamp', 1]],
    'una copia a testa (2 di budget), poi il residuo al gradino più basso',
  );
  assert.equal(
    richiesta.reduce((s, v) => s + v.daStampare, 0),
    4,
    'il budget si spende tutto ma non si sfora',
  );
});

test('se la linea non ci sta tutta non si prende niente', () => {
  const [linea] = enumeraLinee(disp(pk('Machamp', 'Livello 2', 'Machoke')), {
    machoke: 'Machop',
  });

  assert.deepEqual(richiestaPerLinea(linea, [3, 2, 1], 2, 4), [], 'due slot non bastano per tre gradini');
  assert.deepEqual(richiestaPerLinea(linea, [3, 2, 1], 10, 1), [], 'un solo credito di stampa non basta');
});

test('un fossile non è un gradino: non si stampa come Pokémon', () => {
  // Omanyte "evolve" da *Vecchio Helixfossile*, che è una carta Allenatore.
  // Trattarlo da Base produceva "3× Vecchio Helixfossile da stampare".
  const omanyte = pk('Omanyte', 'Livello 1', 'Vecchio Helixfossile', 'Acqua');
  const [linea] = enumeraLinee(disp(omanyte), {}, new Set(['vecchio helixfossile']));

  assert.equal(linea.profondita, 1, 'la catena si ferma prima del fossile');
  assert.equal(linea.daStampare, 0, 'non c\'è niente da stampare');
  assert.ok(linea.radiceOrfana, 'resta giocabile solo con la regola della casa');
  assert.equal(ordinaLinee([linea], ['Acqua'], { budget: 10 }).length, 0);
});
