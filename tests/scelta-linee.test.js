/**
 * Test della scelta per linea evolutiva e della casualità riproducibile.
 *
 * Nascono da un difetto osservato sui mazzi veri: uscivano sempre identici e
 * quasi senza evoluzioni. Due cause distinte, entrambe coperte qui.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Casuale } from '../src/engine/casuale.js';
import { costruisciGruppi, ordinaGruppi, pezziDaPrendere } from '../src/engine/scelta-linee.js';
import { generaMazzi } from '../src/engine/generazione.js';

const carta = (nome, tipo, stadio, evolveDa = null, ps = 60, danno = 20) => ({
  nome,
  numero: nome,
  idSet: 'p',
  categoria: 'Pokémon',
  stadio,
  evolveDa,
  tipi: [tipo],
  ps,
  attacchi: [{ nome: 'C', costo: [tipo], danno }],
});
const disp = (...carte) => carte.map((c) => ({ carta: c, disponibili: 4 }));

const pk = (nome, tipo, stadio, evolveDa, quantita, ps = 60, danno = 20) => ({
  carta: carta(nome, tipo, stadio, evolveDa, ps, danno),
  quantita,
});
const en = (tipo, q) => ({
  carta: { nome: `Energia ${tipo}`, numero: tipo, idSet: '@b', categoria: 'Energia', tipoEnergia: 'Base' },
  quantita: q,
});

// --- Casuale ---

test('lo stesso seme dà la stessa sequenza, semi diversi sequenze diverse', () => {
  const a = new Casuale(42);
  const b = new Casuale(42);
  const c = new Casuale(43);
  const seq = (r) => Array.from({ length: 5 }, () => r.prossimo());
  assert.deepEqual(seq(a), seq(b));
  assert.notDeepEqual(seq(new Casuale(42)), seq(c));
});

test('un seme oltre i 32 bit non degenera la sequenza', () => {
  // Date.now() supera i 32 bit: senza la normalizzazione la sequenza si
  // appiattiva e i mazzi tornavano tutti uguali.
  const r = new Casuale(Date.now());
  const valori = new Set(Array.from({ length: 20 }, () => r.prossimo()));
  assert.ok(valori.size > 15, 'la sequenza deve essere varia');
});

test('mescola non altera l\'originale e conserva gli elementi', () => {
  const originale = [1, 2, 3, 4, 5, 6, 7, 8];
  const copia = [...originale];
  const mescolato = new Casuale(9).mescola(originale);
  assert.deepEqual(originale, copia, 'l\'array di partenza non si tocca');
  assert.deepEqual([...mescolato].sort((x, y) => x - y), copia);
});

test('scegli estrae solo fra i candidati entro la tolleranza', () => {
  const candidati = [{ punteggio: 150 }, { punteggio: 140 }, { punteggio: 60 }];
  const estratti = new Set();
  for (let seme = 1; seme <= 40; seme++) {
    estratti.add(new Casuale(seme).scegli(candidati, 25).punteggio);
  }
  assert.ok(estratti.has(150) && estratti.has(140), 'i quasi pari merito partecipano');
  assert.ok(!estratti.has(60), 'lo scarto netto resta escluso');
});

// --- Gruppi ---

test('un gruppo raccoglie la Base con le sue evoluzioni disponibili', () => {
  const gruppi = costruisciGruppi(
    disp(
      carta('Bulbasaur', 'Erba', 'Base'),
      carta('Ivysaur', 'Erba', 'Livello 1', 'Bulbasaur'),
      carta('Venusaur', 'Erba', 'Livello 2', 'Ivysaur'),
    ),
  );
  assert.equal(gruppi.length, 1, 'una sola radice: le evoluzioni non fanno gruppo a sé');
  assert.equal(gruppi[0].radice.nome, 'Bulbasaur');
  assert.equal(gruppi[0].profondita, 3);
  assert.equal(gruppi[0].livelli[1][0].nome, 'Ivysaur');
  assert.equal(gruppi[0].livelli[2][0].nome, 'Venusaur');
});

test('senza deroga un\'evoluzione orfana non è una radice giocabile', () => {
  const candidati = disp(carta('Luxio', 'Lampo', 'Livello 1', 'Shinx'));
  assert.equal(costruisciGruppi(candidati).length, 0);
  assert.equal(costruisciGruppi(candidati, { evoluzioniComeBase: true }).length, 1);
});

test('una linea profonda batte una Base isolata', () => {
  // È il difetto che questo modulo corregge: scegliendo carta per carta, la
  // Base isolata vinceva sempre e i mazzi non evolvevano mai.
  const gruppi = costruisciGruppi(
    disp(
      carta('Bulbasaur', 'Erba', 'Base'),
      carta('Ivysaur', 'Erba', 'Livello 1', 'Bulbasaur'),
      carta('Tangela', 'Erba', 'Base', null, 70, 30),
    ),
  );
  const ordinati = ordinaGruppi(gruppi, ['Erba']);
  assert.equal(ordinati[0].radice.nome, 'Bulbasaur', 'la linea che evolve viene prima');
});

test('una linea già nel mazzo perde terreno, così il mazzo non è monolinea', () => {
  const gruppi = costruisciGruppi(
    disp(
      carta('Bulbasaur', 'Erba', 'Base'),
      carta('Ivysaur', 'Erba', 'Livello 1', 'Bulbasaur'),
      carta('Caterpie', 'Erba', 'Base'),
      carta('Metapod', 'Erba', 'Livello 1', 'Caterpie'),
    ),
  );
  const ordinati = ordinaGruppi(gruppi, ['Erba'], {}, 0, new Set(['bulbasaur']));
  assert.equal(ordinati[0].radice.nome, 'Caterpie', 'si passa alla linea non ancora presa');
});

test('la piramide limita le copie per livello, non per carta', () => {
  // Possedere due Livello 1 diversi della stessa linea non deve far entrare
  // quattro carte al posto di due.
  const gruppo = costruisciGruppi(
    disp(
      carta('Oddish', 'Erba', 'Base'),
      carta('Gloom', 'Erba', 'Livello 1', 'Oddish'),
      carta('Gloom di Erika', 'Erba', 'Livello 1', 'Oddish'),
    ),
  )[0];
  const pezzi = pezziDaPrendere(gruppo, [2, 2, 1], 10);
  const perLivello1 = pezzi
    .filter((p) => p.carta.stadio === 'Livello 1')
    .reduce((s, p) => s + p.quante, 0);
  assert.equal(perLivello1, 2, 'due copie in tutto al Livello 1');
});

test('pezziDaPrendere non supera lo spazio rimasto nel mazzo', () => {
  const gruppo = costruisciGruppi(
    disp(carta('Oddish', 'Erba', 'Base'), carta('Gloom', 'Erba', 'Livello 1', 'Oddish')),
  )[0];
  const totale = pezziDaPrendere(gruppo, [3, 2, 1], 2).reduce((s, p) => s + p.quante, 0);
  assert.equal(totale, 2);
});

// --- Effetto sui mazzi generati ---

/** Collezione con linee complete accanto a molte Base sciolte. */
const collezioneMista = [
  pk('Bulbasaur', 'Erba', 'Base', null, 4), pk('Ivysaur', 'Erba', 'Livello 1', 'Bulbasaur', 3, 90, 40),
  pk('Caterpie', 'Erba', 'Base', null, 4), pk('Metapod', 'Erba', 'Livello 1', 'Caterpie', 3, 90, 40),
  pk('Oddish', 'Erba', 'Base', null, 3), pk('Bellsprout', 'Erba', 'Base', null, 3),
  pk('Tangela', 'Erba', 'Base', null, 3, 70, 30), pk('Exeggcute', 'Erba', 'Base', null, 3),
  pk('Sunkern', 'Erba', 'Base', null, 3), pk('Hoppip', 'Erba', 'Base', null, 3),
  en('Erba', 30),
];

test('i mazzi contengono evoluzioni, non solo Base', () => {
  // Regressione: con tante Base sciolte in collezione la quota Pokémon si
  // riempiva di sole Base e le evoluzioni non entravano mai.
  const { mazzi } = generaMazzi(collezioneMista, { taglia: 20, numeroMazzi: 2, seme: 1 });
  for (const mazzo of mazzi) {
    const evoluzioni = mazzo.carte
      .filter((c) => c.carta.categoria === 'Pokémon' && c.carta.stadio !== 'Base')
      .reduce((s, c) => s + c.quantita, 0);
    assert.ok(evoluzioni > 0, `${mazzo.nome} deve contenere almeno un'evoluzione`);
  }
});

test('ogni evoluzione nel mazzo ha la sua pre-evoluzione', () => {
  const { mazzi } = generaMazzi(collezioneMista, { taglia: 20, numeroMazzi: 2, seme: 4 });
  for (const mazzo of mazzi) {
    const nomi = new Set(mazzo.carte.map((c) => c.carta.nome));
    for (const voce of mazzo.carte) {
      if (voce.carta.categoria !== 'Pokémon' || voce.carta.stadio === 'Base') continue;
      assert.ok(
        nomi.has(voce.carta.evolveDa),
        `${voce.carta.nome} è entrato senza ${voce.carta.evolveDa}`,
      );
    }
  }
});

test('semi diversi danno mazzi diversi, lo stesso seme li riproduce', () => {
  const impronta = (seme) =>
    JSON.stringify(
      generaMazzi(collezioneMista, { taglia: 20, numeroMazzi: 2, seme }).mazzi.map((m) =>
        m.carte.map((c) => `${c.quantita}${c.carta.nome}`).sort(),
      ),
    );

  assert.equal(impronta(5), impronta(5), 'stesso seme, stessi mazzi');

  const distinte = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(impronta));
  assert.ok(distinte.size > 1, 'semi diversi devono produrre mazzi diversi');
});
