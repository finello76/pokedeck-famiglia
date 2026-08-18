/**
 * Test delle finiture: normale, holo, reverse holo.
 *
 * Il rischio di tutta la funzione è uno: che il conto delle finiture e il
 * totale delle copie si allontanino. `quantita` è il numero che legge **tutto
 * il resto dell'app** — statistiche, motore dei mazzi, carte mancanti — e che
 * non sa niente di finiture; se le due cose divergono, l'app comincia a
 * raccontare due storie diverse sulla stessa pila di carte, senza dirlo.
 *
 * Qui si prova che non possono divergere: né aggiungendo, né togliendo, né
 * rileggendo un file scritto a mano.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTI, applica, ripartizione, segniVarianti } from '../src/data/varianti.js';
import { validaImport } from '../src/data/scambio.js';

const file = (carte) => ({ formato: 'pokedeck-famiglia', versione: 1, carte });

test('una riga senza finiture è tutta normale', () => {
  assert.deepEqual(ripartizione({ quantita: 3 }), { normale: 3, holo: 0, reverse: 0 });
});

test('le speciali si sottraggono alle normali, non si sommano al totale', () => {
  assert.deepEqual(ripartizione({ quantita: 3, varianti: { reverse: 2 } }), {
    normale: 1,
    holo: 0,
    reverse: 2,
  });
});

test('conteggi che superano il totale vengono ritagliati, non creduti', () => {
  // Arriva da un file importato, o da una versione futura: il totale comanda.
  const conti = ripartizione({ quantita: 2, varianti: { holo: 5, reverse: 4 } });
  assert.deepEqual(conti, { normale: 0, holo: 2, reverse: 0 });
  assert.equal(conti.normale + conti.holo + conti.reverse, 2);
});

test('valori assurdi non fanno comparire copie dal niente', () => {
  for (const varianti of [{ holo: -3 }, { reverse: 'due' }, { holo: NaN }, null]) {
    const conti = ripartizione({ quantita: 1, varianti });
    assert.equal(conti.normale + conti.holo + conti.reverse, 1, JSON.stringify(varianti));
  }
});

test('aggiungere una reverse alza il totale e la conta a parte', () => {
  assert.deepEqual(applica({ quantita: 1 }, 'reverse', 1), {
    quantita: 2,
    varianti: { reverse: 1 },
  });
});

test('togliere prende prima dalla finitura chiesta', () => {
  const riga = { quantita: 3, varianti: { holo: 1, reverse: 1 } };
  assert.deepEqual(applica(riga, 'reverse', -1), { quantita: 2, varianti: { holo: 1 } });
});

test('il «−» della griglia chiede "normale", ma se non ce ne sono toglie lo stesso', () => {
  // È il caso vero: gli stepper non sanno di finiture e chiedono sempre
  // "normale". Un pulsante che non fa niente sarebbe peggio.
  const riga = { quantita: 1, varianti: { reverse: 1 } };
  assert.deepEqual(applica(riga, 'normale', -1), { quantita: 0, varianti: null });
});

test('l\'holo è l\'ultima ad andarsene', () => {
  const riga = { quantita: 3, varianti: { holo: 1, reverse: 1 } };
  const dopo = applica(riga, 'normale', -2);
  assert.deepEqual(dopo, { quantita: 1, varianti: { holo: 1 } });
});

test('non si scende sotto zero, per quanto si insista', () => {
  assert.deepEqual(applica({ quantita: 2, varianti: { holo: 2 } }, 'normale', -9), {
    quantita: 0,
    varianti: null,
  });
});

test('una finitura sconosciuta si tratta come normale invece di sparire', () => {
  assert.deepEqual(applica({ quantita: 1 }, 'arcobaleno', 1), { quantita: 2, varianti: null });
});

test('`varianti: null` quando sono tutte normali: la riga resta come prima', () => {
  // È la promessa di compatibilità: chi non ha mai toccato le finiture non deve
  // ritrovarsi un campo nuovo in ogni riga del suo export.
  assert.equal(applica({ quantita: 1 }, 'normale', 1).varianti, null);
});

test('i segni da stampare ci sono solo per le finiture speciali', () => {
  assert.deepEqual(segniVarianti({ quantita: 4 }), []);
  const segni = segniVarianti({ quantita: 4, varianti: { holo: 1, reverse: 2 } });
  assert.deepEqual(
    segni.map((s) => `${s.quante}${s.sigla}`),
    ['1H', '2R'],
  );
});

test('le finiture sopravvivono al cambio di telefono', () => {
  const [voce] = validaImport(
    file([{ idSet: 'sv08', numero: '3', quantita: 3, varianti: { holo: 1, reverse: 1 } }]),
  );
  assert.deepEqual(voce.varianti, { holo: 1, reverse: 1 });
});

test('un file senza finiture resta valido, e senza campi nuovi', () => {
  const [voce] = validaImport(file([{ idSet: 'sv08', numero: '3', quantita: 2 }]));
  assert.equal('varianti' in voce, false);
});

test('un file con finiture impossibili si ritaglia invece di far fallire l\'import', () => {
  const voci = validaImport(
    file([
      { idSet: 'sv08', numero: '3', quantita: 1, varianti: { reverse: 9 } },
      { idSet: 'sv08', numero: '4', quantita: 2 },
    ]),
  );
  assert.equal(voci.length, 2, 'le altre carte entrano lo stesso');
  assert.deepEqual(voci[0].varianti, { reverse: 1 });
});

test('le tre finiture hanno codici distinti e la normale è la prima', () => {
  assert.equal(VARIANTI[0].codice, 'normale');
  assert.equal(new Set(VARIANTI.map((v) => v.codice)).size, VARIANTI.length);
});
