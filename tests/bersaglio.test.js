/**
 * Test della generazione a bersaglio.
 *
 * La regressione da cui nasce: dalla stessa collezione il motore produceva
 * mazzi da 49 e mazzi da 77 a seconda del seme, e quale dei due uscisse era
 * questione di fortuna. Se in casa si gioca contro un Kit Allenatore da 31, la
 * differenza fra i due è la differenza fra una partita e un'esecuzione.
 *
 * Qui non si verifica che i mazzi siano belli — non è misurabile — ma che la
 * ricerca **scelga** davvero: che tenga il piano più vicino, che si fermi
 * quando è inutile continuare, e che dica quando non ce l'ha fatta.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cercaPiano, bersaglioPer, TOLLERANZA } from '../src/engine/bersaglio.js';
import { forzaMedia } from '../src/engine/forza.js';

const pk = (nome, opzioni = {}) => ({
  nome,
  numero: nome,
  idSet: 'prova',
  categoria: 'Pokémon',
  stadio: opzioni.stadio ?? 'Base',
  evolveDa: opzioni.evolveDa ?? null,
  tipi: [opzioni.tipo ?? 'Lotta'],
  ps: opzioni.ps ?? 70,
  attacchi: [{ nome: 'Colpo', costo: ['Incolore', 'Incolore'], danno: opzioni.danno ?? 40 }],
});
const en = (tipo) => ({
  nome: `Energia ${tipo}`,
  numero: tipo,
  idSet: '@base',
  categoria: 'Energia',
  tipoEnergia: 'Base',
});
const allenatore = (nome) => ({ nome, numero: nome, idSet: 'prova', categoria: 'Allenatore' });

/**
 * Una collezione abbastanza varia da dare risultati diversi con semi diversi:
 * Pokémon deboli e forti di due tipi, così il generatore ha da scegliere.
 */
function collezione() {
  const voci = [];
  for (const tipo of ['Lotta', 'Lampo']) {
    for (let i = 0; i < 6; i++) {
      voci.push({ carta: pk(`${tipo}Debole${i}`, { tipo, ps: 50, danno: 20 }), quantita: 4 });
      voci.push({ carta: pk(`${tipo}Forte${i}`, { tipo, ps: 140, danno: 90 }), quantita: 4 });
    }
    voci.push({ carta: en(tipo), quantita: 40 });
  }
  for (let i = 0; i < 8; i++) voci.push({ carta: allenatore(`Aiuto${i}`), quantita: 4 });
  return voci;
}

const OPZIONI = { taglia: 20, numeroMazzi: 2, seme: 1 };

test('senza bersaglio genera una volta sola', async () => {
  const esito = await cercaPiano(collezione(), OPZIONI);
  assert.equal(esito.tentativi, 1, 'chi non ha scelto un riferimento non deve pagare 8 giri');
  assert.equal(esito.centrato, true);
  assert.ok(esito.piano.mazzi.length === 2);
});

test('col bersaglio restituisce il piano più vicino fra quelli provati', async () => {
  const esito = await cercaPiano(collezione(), OPZIONI, { bersaglio: 40, tentativi: 6 });
  const distanze = esito.provate.map((f) => Math.abs(f - 40));
  assert.equal(
    Math.abs(esito.forza - 40),
    Math.min(...distanze),
    'il piano tenuto non è il più vicino di quelli misurati',
  );
});

test('non sceglie un mazzo ingiocabile solo perché è più vicino al bersaglio', async () => {
  // Il difetto visto provando l'app: puntando in basso, un mazzo le cui Energie
  // non alimentano nessun Pokémon ha una forza bassa ed era il candidato
  // ideale. Più debole sì, giocabile no.
  //
  // La collezione qui ha Energie di un tipo solo (Lotta) e Pokémon di due, così
  // il generatore può produrre sia mazzi coerenti sia mazzi a motore fermo.
  const voci = [];
  for (const tipo of ['Lotta', 'Lampo']) {
    for (let i = 0; i < 6; i++) {
      voci.push({ carta: pk(`${tipo}${i}`, { tipo, ps: 120, danno: 80 }), quantita: 4 });
    }
  }
  voci.push({ carta: en('Lotta'), quantita: 40 });
  for (let i = 0; i < 8; i++) voci.push({ carta: allenatore(`Aiuto${i}`), quantita: 4 });

  const esito = await cercaPiano(voci, OPZIONI, { bersaglio: 1, tentativi: 8 });
  const { forze } = forzaMedia(esito.piano.mazzi, { taglia: OPZIONI.taglia });
  // Se esiste anche un solo piano giocabile fra quelli provati, dev'essere
  // quello restituito — pur essendo il più lontano dal bersaglio di 1.
  assert.ok(
    forze.every((f) => f.motore > 0),
    'ha restituito un mazzo le cui Energie non alimentano nessuno',
  );
});

test('la forza dichiarata è davvero quella dei mazzi restituiti', async () => {
  // Difesa contro l'errore più insidioso: restituire il piano di un giro e il
  // punteggio di un altro. Nessuno se ne accorgerebbe guardando lo schermo.
  const esito = await cercaPiano(collezione(), OPZIONI, { bersaglio: 45, tentativi: 5 });
  const { media } = forzaMedia(esito.piano.mazzi, { taglia: OPZIONI.taglia });
  assert.equal(esito.forza, media);
});

test('si ferma appena rientra in tolleranza', async () => {
  const esito = await cercaPiano(collezione(), OPZIONI, { bersaglio: 45, tentativi: 8 });
  if (esito.centrato) {
    assert.ok(Math.abs(esito.scarto) <= TOLLERANZA);
    // L'ultimo tentativo è quello buono: se avesse continuato dopo aver
    // centrato, avrebbe sprecato generazioni.
    assert.ok(
      Math.abs(esito.provate.at(-1) - 45) <= TOLLERANZA,
      'ha continuato a cercare dopo aver centrato il bersaglio',
    );
  }
});

test('un bersaglio irraggiungibile non blocca: si tiene il meglio e lo si dichiara', async () => {
  const esito = await cercaPiano(collezione(), OPZIONI, { bersaglio: 3, tentativi: 4 });
  assert.equal(esito.centrato, false);
  assert.equal(esito.tentativi, 4, 'deve provarli tutti prima di arrendersi');
  assert.ok(esito.piano.mazzi.length === 2, 'restituisce comunque dei mazzi giocabili');
  assert.ok(esito.scarto > 0, 'lo scarto ha segno: dice da che parte ha sbagliato');
});

test('è deterministica: stesso seme, stesso risultato', async () => {
  const a = await cercaPiano(collezione(), OPZIONI, { bersaglio: 40, tentativi: 5 });
  const b = await cercaPiano(collezione(), OPZIONI, { bersaglio: 40, tentativi: 5 });
  assert.deepEqual(a.provate, b.provate);
  assert.equal(a.forza, b.forza);
});

test('semi iniziali diversi esplorano combinazioni diverse', async () => {
  // Serve a "rigenera diversi": col bersaglio attivo deve comunque cambiare
  // qualcosa, o il pulsante non farebbe niente.
  const a = await cercaPiano(collezione(), { ...OPZIONI, seme: 1 }, { bersaglio: 40, tentativi: 4 });
  const b = await cercaPiano(collezione(), { ...OPZIONI, seme: 999 }, { bersaglio: 40, tentativi: 4 });
  assert.notDeepEqual(a.provate, b.provate);
});

test('`rifinisci` viene applicato prima di misurare, su ogni tentativo', async () => {
  // È il passaggio che dà PS e attacchi alle carte da stampare: senza, la
  // ricerca misurerebbe mazzi più deboli di quelli che finiscono a schermo e
  // sceglierebbe il seme sbagliato.
  let chiamate = 0;
  const esito = await cercaPiano(collezione(), OPZIONI, {
    bersaglio: 3,
    tentativi: 3,
    rifinisci: async (piano) => {
      chiamate += 1;
      assert.ok(piano.mazzi.length > 0, 'riceve un piano già costruito');
    },
  });
  assert.equal(chiamate, esito.tentativi);
});

test('onTentativo riceve l\'avanzamento, per poterlo dire a schermo', async () => {
  const passi = [];
  await cercaPiano(collezione(), OPZIONI, {
    bersaglio: 3,
    tentativi: 3,
    onTentativo: (fatti, totali, forza) => passi.push([fatti, totali, forza]),
  });
  assert.deepEqual(passi.map((p) => p[0]), [1, 2, 3]);
  assert.ok(passi.every((p) => p[1] === 3));
  assert.ok(passi.every((p) => typeof p[2] === 'number'));
});

test('bersaglioPer traduce la scelta del wizard, e resta dentro la scala', () => {
  assert.equal(bersaglioPer(31, 'pari'), 31);
  assert.equal(bersaglioPer(31, 'sotto'), 21);
  assert.equal(bersaglioPer(31, 'sopra'), 41);
  assert.equal(bersaglioPer(5, 'sotto'), 0, 'non si scende sotto zero');
  assert.equal(bersaglioPer(95, 'sopra'), 100, 'non si sale sopra cento');
  assert.equal(bersaglioPer(31, 'boh'), 31, 'un verso sconosciuto non sposta niente');
});

test('lo scarto fra "pari" e "sopra" supera la tolleranza', () => {
  // Se lo scarto fosse ≤ tolleranza, "un po' più forte" produrrebbe mazzi
  // indistinguibili da "alla pari" e la domanda del wizard sarebbe finta.
  assert.ok(bersaglioPer(40, 'sopra') - bersaglioPer(40, 'pari') > TOLLERANZA);
  assert.ok(bersaglioPer(40, 'pari') - bersaglioPer(40, 'sotto') > TOLLERANZA);
});
