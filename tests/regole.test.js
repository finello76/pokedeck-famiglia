/**
 * Test del motore delle regole della casa e dell'orchestrazione.
 *
 * Il criterio guida: il foglio stampato deve contenere **tutte e sole** le
 * regole che servono davvero, ognuna con una motivazione che contenga numeri
 * veri. Una regola attiva senza spiegazione, in famiglia, sembra un
 * favoritismo; una regola necessaria ma non stampata rende il mazzo ingiocabile.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valutaRegole, codiciRegole } from '../src/engine/regole.js';
import { pianifica, carteConDeroga } from '../src/engine/pianifica.js';
import { analizza } from '../src/engine/analisi.js';

const pk = (nome, tipo, stadio = 'Base', evolveDa = null, quantita = 1, numero = nome) => ({
  carta: {
    nome,
    numero,
    idSet: 'prova',
    categoria: 'Pokémon',
    stadio,
    evolveDa,
    tipi: [tipo],
    ps: 100,
    attacchi: [{ nome: 'Colpo', costo: [tipo], danno: 30 }],
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

/** Collezione abbondante e coerente: non dovrebbe servire quasi nessuna regola. */
const collezioneSana = [
  pk('Pikachu', 'Lampo', 'Base', null, 4),
  pk('Voltorb', 'Lampo', 'Base', null, 4),
  pk('Magnemite', 'Lampo', 'Base', null, 4),
  en('Lampo', 40),
];

test('una collezione sana non attiva le regole di emergenza', () => {
  const { regole } = pianifica(collezioneSana, { taglia: 60, numeroMazzi: 1 });
  const codici = regole.map((r) => r.codice);
  assert.ok(!codici.includes('evoluzioni-come-base'), 'niente orfani, niente deroga');
  assert.ok(!codici.includes('energia-universale'), 'le energie bastano e sono del tipo giusto');
  assert.ok(!codici.includes('costi-ridotti'));
  assert.ok(!codici.includes('mano-e-premi'), 'un mazzo da 60 usa le regole ufficiali');
});

test('ogni regola attivata porta con sé testo e motivazione non vuoti', () => {
  const { regole } = pianifica(
    [pk('Zweilous', 'Oscurità', 'Livello 1', 'Deino', 4), en('Erba', 2)],
    { taglia: 15, numeroMazzi: 2, semplificata: true },
  );
  assert.ok(regole.length > 0);
  for (const r of regole) {
    assert.ok(r.titolo?.length > 0, `${r.codice} deve avere un titolo`);
    assert.ok(r.testo?.length > 20, `${r.codice} deve spiegare cosa fare`);
    assert.ok(r.motivazione?.length > 20, `${r.codice} deve dire perché`);
    // Solo le regole nate da una misura devono citare numeri: quelle nate da
    // una scelta del wizard non hanno niente da contare.
    if (r.origine === 'misura') {
      assert.ok(/\d/.test(r.motivazione), `${r.codice}: deve citare i numeri che la giustificano`);
    }
  }
});

test('gli orfani attivano la deroga e diventano giocabili', () => {
  const voci = [pk('Zweilous', 'Oscurità', 'Livello 1', 'Deino', 4), en('Oscurità', 10)];

  const senza = pianifica(voci, { taglia: 10, numeroMazzi: 1 });
  assert.ok(senza.permessi.evoluzioniComeBase, 'la regola deve attivarsi');
  assert.ok(
    senza.mazzi[0].carte.some((c) => c.carta.nome === 'Zweilous'),
    'con la deroga lo Zweilous entra nel mazzo',
  );
});

test('le carte giocabili solo per deroga sono identificabili nella lista', () => {
  // Senza questo, la regola "le evoluzioni si giocano come Base" è
  // inapplicabile: chi ha il mazzo in mano non sa a quali carte si riferisce.
  const voci = [pk('Zweilous', 'Oscurità', 'Livello 1', 'Deino', 4), en('Oscurità', 10)];
  const p = pianifica(voci, { taglia: 10, numeroMazzi: 1 });
  const contrassegnate = carteConDeroga(p.mazzi[0], p.permessi, p.carenze);
  assert.ok(contrassegnate.has('Zweilous'));
});

test('la regola sull\'energia universale resta stampata anche dopo averla applicata', () => {
  // Regressione: sopprimere la carenza perché "già risolta" faceva sparire dal
  // foglio proprio la regola che la risolveva. Il giocatore si sarebbe trovato
  // energie fuori tipo e nessuna regola che le autorizza.
  const voci = [pk('Pikachu', 'Lampo', 'Base', null, 4), en('Lampo', 2), en('Fuoco', 8)];
  const { regole, mazzi } = pianifica(voci, { taglia: 12, numeroMazzi: 1 });

  const fuoriTipo = mazzi[0].carte.filter(
    (c) => c.carta.categoria === 'Energia' && c.carta.numero !== 'Lampo',
  );
  assert.ok(fuoriTipo.length > 0, 'il mazzo contiene energie di altro tipo');
  assert.ok(
    regole.some((r) => r.codice === 'energia-universale'),
    'quindi la regola che le rende utilizzabili DEVE essere stampata',
  );
});

test('i proxy Energia sostituiscono la regola invece di affiancarla', () => {
  // Se le energie mancanti vengono stampate, si gioca con le regole vere: non
  // ha senso attivare anche la deroga sull'energia universale.
  const voci = [pk('Pikachu', 'Lampo', 'Base', null, 4), en('Fuoco', 8)];
  const conProxy = pianifica(voci, { taglia: 12, numeroMazzi: 1, proxyEnergia: true });
  assert.ok(!conProxy.regole.some((r) => r.codice === 'energia-universale'));
});

test('la mano ridotta si attiva solo sui mazzi piccoli', () => {
  const piccolo = pianifica(collezioneSana, { taglia: 15, numeroMazzi: 1 });
  const grande = pianifica(collezioneSana, { taglia: 60, numeroMazzi: 1 });
  assert.ok(piccolo.regole.some((r) => r.codice === 'mano-e-premi'));
  assert.ok(!grande.regole.some((r) => r.codice === 'mano-e-premi'));
});

test('la difficolta\' semplificata aggiunge le regole per chi impara', () => {
  const normale = pianifica(collezioneSana, { taglia: 30, numeroMazzi: 1 });
  const facile = pianifica(collezioneSana, { taglia: 30, numeroMazzi: 1, semplificata: true });
  assert.ok(!normale.regole.some((r) => r.codice === 'senza-abilita'));
  assert.ok(facile.regole.some((r) => r.codice === 'senza-abilita'));
});

test('la valutazione non inventa regole fuori catalogo', () => {
  const analisi = analizza(collezioneSana);
  const { regole } = valutaRegole({
    analisi,
    mazzi: [],
    carenze: [],
    opzioni: { taglia: 60, numeroMazzi: 1 },
  });
  const noti = codiciRegole();
  for (const r of regole) assert.ok(noti.includes(r.codice));
});

test('le due passate sono stabili: rigenerare non cambia le regole', () => {
  const voci = [pk('Zweilous', 'Oscurità', 'Livello 1', 'Deino', 4), en('Erba', 6)];
  const a = pianifica(voci, { taglia: 15, numeroMazzi: 2 });
  const b = pianifica(voci, { taglia: 15, numeroMazzi: 2 });
  assert.deepEqual(
    a.regole.map((r) => r.codice),
    b.regole.map((r) => r.codice),
    'il procedimento deve essere deterministico, non oscillare',
  );
});
