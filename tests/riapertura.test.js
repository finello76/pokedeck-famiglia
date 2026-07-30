/**
 * Test della riapertura di un mazzo salvato.
 *
 * Il difetto da cui nasce questo file: "Modifica a mano" su un mazzo salvato
 * apriva il costruttore **vuoto**. La causa non era nel codice di allora ma nei
 * record scritti da una versione precedente, dove le carte finivano su disco
 * senza `idSet` né `numero` — anonime. Un salvataggio è una fotografia: se la
 * fotografia non porta l'identità delle carte, riaprirla non ricostruisce
 * niente.
 *
 * Qui si prova ogni forma in cui una voce salvata può presentarsi, comprese
 * quelle storte, perché è lettura di dati vecchi: le forme non si possono
 * scegliere, si possono solo reggere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scelteDaSalvataggio, raccontaRiapertura } from '../src/engine/riapertura.js';

/** Una voce di collezione nella forma che usa il motore: id dentro la carta. */
const mia = (nome, idSet, numero, quantita = 1) => ({
  carta: { nome, idSet, numero, categoria: 'Pokémon' },
  quantita,
});

/** Una voce di mazzo salvato, annidata come la scrive `istantanea()`. */
const salvata = (nome, idSet, numero, quantita = 1) => ({
  carta: { nome, idSet, numero },
  quantita,
});

test('la forma normale: chiave presa dalla carta, copie sommate', () => {
  const { scelte, perNome, perse, proxy } = scelteDaSalvataggio([
    salvata('Pikachu', 'sv01', '4', 2),
    salvata('Raichu', 'sv01', '5', 1),
  ]);

  assert.deepEqual([...scelte], [['sv01/4', 2], ['sv01/5', 1]]);
  assert.equal(perNome, 0);
  assert.equal(perse, 0);
  assert.equal(proxy, 0);
});

test('la forma piatta del disco vale quanto quella annidata', () => {
  // Su disco le voci sono `{quantita, nome, idSet, …}` senza `carta`.
  const { scelte } = scelteDaSalvataggio([
    { nome: 'Pikachu', idSet: 'sv01', numero: '4', quantita: 3 },
  ]);

  assert.deepEqual([...scelte], [['sv01/4', 3]]);
});

test('due voci sulla stessa stampa si sommano invece di sovrascriversi', () => {
  const { scelte } = scelteDaSalvataggio([
    salvata('Pikachu', 'sv01', '4', 1),
    salvata('Pikachu', 'sv01', '4', 2),
  ]);

  assert.deepEqual([...scelte], [['sv01/4', 3]]);
});

test('le carte da stampare non tornano nel costruttore, ma si contano', () => {
  const { scelte, proxy } = scelteDaSalvataggio([
    { ...salvata('Machop', 'sv01', '9', 2), proxy: true },
    salvata('Machamp', 'sv01', '11', 1),
  ]);

  assert.deepEqual([...scelte], [['sv01/11', 1]]);
  assert.equal(proxy, 2, 'due copie erano proxy: si dice, non si nascondono');
});

test('carta anonima: si ritrova per nome fra le tue', () => {
  // Il caso del salvataggio vecchio: nessun idSet, nessun numero.
  const { scelte, perNome, perse } = scelteDaSalvataggio(
    [{ carta: { nome: 'Eevee' }, quantita: 2 }],
    [mia('Eevee', '2016xy', '12', 1)],
  );

  assert.deepEqual([...scelte], [['2016xy/12', 2]]);
  assert.equal(perNome, 2, 'le copie ritrovate per nome si dichiarano');
  assert.equal(perse, 0);
});

test('a parità di nome vince la stampa di cui hai più copie', () => {
  const { scelte } = scelteDaSalvataggio(
    [{ carta: { nome: 'Lycanroc' }, quantita: 1 }],
    [mia('Lycanroc', 'A3', '100', 1), mia('Lycanroc', 'A3', '101', 4)],
  );

  assert.deepEqual([...scelte], [['A3/101', 1]]);
});

test('il nome si confronta normalizzato, come ovunque nell’app', () => {
  const { scelte, perNome } = scelteDaSalvataggio(
    [{ carta: { nome: 'Shaymin-V' }, quantita: 1 }],
    [mia('Shaymin V', 'swsh9', '13', 1)],
  );

  assert.deepEqual([...scelte], [['swsh9/13', 1]]);
  assert.equal(perNome, 1);
});

test('carta anonima che non possiedi più: persa, e lo si dice', () => {
  const { scelte, perNome, perse } = scelteDaSalvataggio(
    [{ carta: { nome: 'Mewtwo' }, quantita: 2 }],
    [mia('Eevee', '2016xy', '12', 1)],
  );

  assert.equal(scelte.size, 0);
  assert.equal(perNome, 0);
  assert.equal(perse, 2, 'sparire in silenzio sarebbe peggio che dirlo');
});

test('due carte anonime della stessa specie finiscono sulla stessa stampa', () => {
  const { scelte, perNome } = scelteDaSalvataggio(
    [
      { carta: { nome: 'Eevee' }, quantita: 1 },
      { carta: { nome: 'Eevee' }, quantita: 2 },
    ],
    [mia('Eevee', '2016xy', '12', 3)],
  );

  assert.deepEqual([...scelte], [['2016xy/12', 3]], 'si sommano, non si perdono');
  assert.equal(perNome, 3);
});

test('carta senza nome e senza chiave: persa senza far esplodere niente', () => {
  const { scelte, perse } = scelteDaSalvataggio([{ carta: {}, quantita: 1 }], []);

  assert.equal(scelte.size, 0);
  assert.equal(perse, 1);
});

test('mezze identità non valgono: manca il numero, manca la chiave', () => {
  // `sv01/undefined` sarebbe una chiave che non corrisponde a nessuna carta, e
  // il costruttore mostrerebbe un mazzo di una carta fantasma.
  const { scelte, perse } = scelteDaSalvataggio([{ carta: { idSet: 'sv01' }, quantita: 1 }], []);

  assert.equal(scelte.size, 0);
  assert.equal(perse, 1);
});

test('il numero zero è un numero, non un’assenza', () => {
  const { scelte } = scelteDaSalvataggio([{ carta: { idSet: 'promo', numero: 0 }, quantita: 1 }]);

  assert.deepEqual([...scelte], [['promo/0', 1]]);
});

test('quantità mancanti o nulle non entrano nel mazzo', () => {
  const { scelte, perse } = scelteDaSalvataggio([
    salvata('Pikachu', 'sv01', '4', 0),
    { carta: { nome: 'Raichu', idSet: 'sv01', numero: '5' } },
    { carta: { nome: 'Eevee', idSet: 'sv01', numero: '6' }, quantita: -2 },
  ]);

  assert.equal(scelte.size, 0);
  assert.equal(perse, 0, 'una carta con zero copie non è una carta persa');
});

test('un mazzo salvato vuoto non è un errore', () => {
  const esito = scelteDaSalvataggio([], [mia('Eevee', '2016xy', '12')]);
  assert.equal(esito.scelte.size, 0);
  assert.equal(raccontaRiapertura('Vuoto', esito), 'Riaperto «Vuoto».');
});

test('il racconto dice solo quello che è successo davvero', () => {
  const esito = scelteDaSalvataggio(
    [
      salvata('Pikachu', 'sv01', '4', 1),
      { ...salvata('Machop', 'sv01', '9', 2), proxy: true },
      { carta: { nome: 'Eevee' }, quantita: 1 },
      { carta: { nome: 'Mewtwo' }, quantita: 3 },
    ],
    [mia('Eevee', '2016xy', '12')],
  );
  const riga = raccontaRiapertura('Mazzo di prova', esito);

  assert.match(riga, /Riaperto «Mazzo di prova»/);
  assert.match(riga, /2 carte da stampare/);
  assert.match(riga, /1 carte di questo salvataggio erano senza set/);
  assert.match(riga, /3 carte non si sono ritrovate/);
});

test('una riapertura senza sorprese non racconta niente in più', () => {
  const esito = scelteDaSalvataggio([salvata('Pikachu', 'sv01', '4', 1)]);
  assert.equal(raccontaRiapertura('Netto', esito), 'Riaperto «Netto».');
});
