/**
 * Test del numero di build.
 *
 * La regressione da cui nasce questo file, del 26/07/2026: due commit
 * consecutivi hanno ricevuto lo **stesso** numero 81. Il calcolo era
 * `git rev-list --count HEAD + 1`, cioè una previsione di quale numero avrebbe
 * avuto il commit in nascita — e un merge la sbaglia, perché unisce due storie
 * e il conteggio risultante non è quello del genitore più uno.
 *
 * Il danno non è stato tecnico ma di fiducia: il numero serve a rispondere alla
 * domanda «sto guardando la versione nuova?», e per mezza giornata ha risposto
 * di sì mentre il browser mostrava quella vecchia. Da qui l'unica proprietà che
 * conta e che qui si verifica: **due build diverse non hanno mai lo stesso
 * numero**.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prossimoNumero } from '../tools/timbra-versione.mjs';

test('il numero cresce sempre, anche quando il conteggio dei commit non cresce', () => {
  // Il caso reale: il merge aveva già scritto 81 mentre i commit erano 80.
  assert.equal(prossimoNumero(80, 81), 82);
  // Senza il ripiego sul precedente si sarebbe riavuto 81, cioè il bug.
  assert.notEqual(prossimoNumero(80, 81), 81);
});

test('con una storia lineare resta il conteggio dei commit, più uno', () => {
  assert.equal(prossimoNumero(60, 60), 61);
  assert.equal(prossimoNumero(73, 60), 74);
});

test('un repo senza version.json parte dal conteggio', () => {
  assert.equal(prossimoNumero(80, 0), 81);
  assert.equal(prossimoNumero(0, 0), 1);
});

test('valori assenti o non numerici non producono NaN', () => {
  // `version.json` illeggibile, HEAD inesistente al primo commit: il timbro
  // deve comunque uscire un numero, o la pagina mostrerebbe "build NaN".
  for (const caso of [[undefined, undefined], [null, 'x'], ['', NaN]]) {
    const esito = prossimoNumero(...caso);
    assert.ok(Number.isInteger(esito) && esito >= 1, `esito non valido: ${esito}`);
  }
});

test('applicato ripetutamente non si ferma mai su un numero', () => {
  // Simula venti commit di fila su un conteggio fermo — il caso di chi lavora
  // dopo un merge: ogni giro deve dare un numero mai visto prima.
  const visti = new Set();
  let precedente = 81;
  for (let i = 0; i < 20; i++) {
    precedente = prossimoNumero(80, precedente);
    assert.ok(!visti.has(precedente), `numero ripetuto: ${precedente}`);
    visti.add(precedente);
  }
});
