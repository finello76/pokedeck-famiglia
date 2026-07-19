/**
 * Test delle alternative di sostituzione.
 *
 * Il criterio guida: si propongono solo carte FISICAMENTE libere (possedute e
 * non impegnate in altri mazzi), della stessa categoria, ordinate per quanto
 * conservano il ruolo della carta in uscita. Chi sceglie deve essere avvisato
 * se la scelta creerebbe un orfano.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  disponibilitaResidua,
  alternativePer,
  applicaSostituzione,
} from '../src/engine/alternative.js';

const pk = (nome, tipo, stadio = 'Base', evolveDa = null, quantita = 1) => ({
  carta: {
    nome,
    numero: nome,
    idSet: 'prova',
    categoria: 'Pokémon',
    stadio,
    evolveDa,
    tipi: [tipo],
    ps: 100,
  },
  quantita,
});
const en = (tipo, quantita) => ({
  carta: {
    nome: `Energia ${tipo}`,
    numero: tipo,
    idSet: '@base',
    categoria: 'Energia',
    tipoEnergia: 'Base',
  },
  quantita,
});

/** Un mazzo minimo per i test. */
const mazzoDi = (...vociMazzo) => ({
  nome: 'Mazzo 1',
  tipi: ['Erba'],
  totale: vociMazzo.reduce((s, v) => s + v.quantita, 0),
  composizione: { pokemon: 0, energie: 0, allenatori: 0 },
  carte: vociMazzo,
});

test('la disponibilità residua sottrae le copie già impegnate nei mazzi', () => {
  const voci = [pk('Caterpie', 'Erba', 'Base', null, 4), en('Erba', 10)];
  const mazzi = [mazzoDi(pk('Caterpie', 'Erba', 'Base', null, 3), en('Erba', 4))];
  const dispensa = disponibilitaResidua(voci, mazzi);
  assert.equal(dispensa.disponibili(voci[0].carta), 1);
  assert.equal(dispensa.disponibili(voci[1].carta), 6);
});

test('i proxy nei mazzi non consumano copie della collezione', () => {
  const voci = [en('Erba', 4)];
  const mazzi = [mazzoDi({ ...en('Erba', 4), proxy: true })];
  const dispensa = disponibilitaResidua(voci, mazzi);
  assert.equal(dispensa.disponibili(voci[0].carta), 4);
});

test('si propone solo la stessa categoria, mai la carta stessa', () => {
  const voci = [
    pk('Caterpie', 'Erba', 'Base', null, 2),
    pk('Weedle', 'Erba', 'Base', null, 2),
    en('Erba', 5),
  ];
  const mazzo = mazzoDi(pk('Caterpie', 'Erba', 'Base', null, 2));
  const dispensa = disponibilitaResidua(voci, [mazzo]);
  const proposte = alternativePer(mazzo.carte[0], mazzo, dispensa);
  assert.ok(proposte.every((p) => p.carta.categoria === 'Pokémon'));
  assert.ok(!proposte.some((p) => p.carta.nome === 'Caterpie'));
  assert.ok(proposte.some((p) => p.carta.nome === 'Weedle'));
});

test('le alternative affini al mazzo vengono prima, gli orfani per ultimi', () => {
  const voci = [
    pk('Weedle', 'Erba', 'Base', null, 2),          // tipo del mazzo, stesso stadio
    pk('Machop', 'Lotta', 'Base', null, 2),         // stadio giusto, tipo estraneo
    pk('Metapod', 'Erba', 'Livello 1', 'Caterpie', 2), // orfano: Caterpie non c'è
  ];
  const mazzo = mazzoDi(pk('Oddish', 'Erba', 'Base', null, 2), en('Erba', 4));
  const dispensa = disponibilitaResidua(voci, [mazzo]);
  const proposte = alternativePer(mazzo.carte[0], mazzo, dispensa);

  assert.equal(proposte[0].carta.nome, 'Weedle');
  assert.equal(proposte.at(-1).carta.nome, 'Metapod');
  assert.ok(
    proposte.at(-1).note.some((n) => n.includes('senza pre-evoluzione')),
    'la proposta orfana porta l\'avviso',
  );
});

test('per le Energie si privilegia il tipo del mazzo', () => {
  const voci = [en('Erba', 4), en('Fuoco', 4)];
  const mazzo = mazzoDi(en('Acqua', 3));
  const dispensa = disponibilitaResidua(voci, [mazzo]);
  const proposte = alternativePer(mazzo.carte[0], mazzo, dispensa);
  assert.equal(proposte[0].carta.nome, 'Energia Erba');
});

test('applicaSostituzione scambia le copie e mantiene il totale', () => {
  const mazzo = mazzoDi(pk('Oddish', 'Erba', 'Base', null, 3), en('Erba', 4));
  const nuova = pk('Weedle', 'Erba', 'Base').carta;
  const scambiate = applicaSostituzione(mazzo, mazzo.carte[0], nuova, 5);
  assert.equal(scambiate, 3);
  assert.ok(!mazzo.carte.some((c) => c.carta.nome === 'Oddish'));
  assert.equal(mazzo.carte.find((c) => c.carta.nome === 'Weedle').quantita, 3);
  assert.equal(mazzo.carte.reduce((s, c) => s + c.quantita, 0), 7, 'il totale non cambia');
});

test('lo scambio parziale rispetta le copie libere e il tetto delle 4', () => {
  const mazzo = mazzoDi(pk('Oddish', 'Erba', 'Base', null, 4));
  const nuova = pk('Weedle', 'Erba', 'Base').carta;

  // Solo 2 copie libere: si scambiano 2, Oddish resta con 2.
  const scambiate = applicaSostituzione(mazzo, mazzo.carte[0], nuova, 2);
  assert.equal(scambiate, 2);
  assert.equal(mazzo.carte.find((c) => c.carta.nome === 'Oddish').quantita, 2);
  assert.equal(mazzo.carte.find((c) => c.carta.nome === 'Weedle').quantita, 2);

  // Weedle è già a 2 nel mazzo: con il tetto a 4 entrano solo altre 2 copie.
  const ancora = applicaSostituzione(
    mazzo,
    mazzo.carte.find((c) => c.carta.nome === 'Oddish'),
    nuova,
    9,
  );
  assert.equal(ancora, 2);
  assert.equal(mazzo.carte.find((c) => c.carta.nome === 'Weedle').quantita, 4);
});
