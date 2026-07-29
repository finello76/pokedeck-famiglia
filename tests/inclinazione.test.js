/**
 * Test del calcolo d'inclinazione del visore (`src/ui/visore-carta/inclinazione.js`).
 *
 * Il difetto che questi test difendono è stato riferito così: *«col giroscopio
 * scatta se si va verso l'alto»*. Non si può riprodurre senza un telefono in
 * mano — ma **si può riprodurre la sequenza di numeri** che il telefono manda
 * mentre lo si alza, ed è esattamente ciò che fanno i due test sugli scatti.
 *
 * L'idea di fondo: qualunque movimento umano è graduale, quindi due letture
 * consecutive non possono produrre un salto grosso dell'inclinazione. Se lo
 * producono, l'errore è nel calcolo, non nella mano.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { creaInclinazione, arcoCorto, limita, MASSIMO } from '../src/ui/visore-carta/inclinazione.js';

/** Il salto massimo tollerato fra due letture consecutive, in gradi. */
const SCATTO = 1.5;

/**
 * Fa scorrere una sequenza di orientamenti e restituisce il salto più grosso
 * osservato fra due fotogrammi.
 * @param {Array<[number, number]>} sequenza coppie [beta, gamma]
 * @returns {{massimoSalto: number, dove: string}}
 */
function massimoSalto(sequenza) {
  const t = creaInclinazione();
  let precedente = null;
  let massimo = 0;
  let dove = '';
  for (const [beta, gamma] of sequenza) {
    const ora = t.passo(beta, gamma);
    if (precedente) {
      const salto = Math.max(Math.abs(ora.rx - precedente.rx), Math.abs(ora.ry - precedente.ry));
      if (salto > massimo) {
        massimo = salto;
        dove = `beta=${beta} gamma=${gamma}`;
      }
    }
    precedente = ora;
  }
  return { massimoSalto: massimo, dove };
}

test('arcoCorto misura sull\'arco breve, non sottraendo', () => {
  assert.equal(arcoCorto(10, 0), 10);
  assert.equal(arcoCorto(0, 10), -10);
  // Il caso che rompeva tutto: fra 179 e -179 ci sono 2 gradi, non 358.
  assert.equal(arcoCorto(179, -179), -2);
  assert.equal(arcoCorto(-179, 179), 2);
  assert.equal(arcoCorto(10, 350), 20);
});

test('la prima lettura fa da zero: la carta parte sempre piatta', () => {
  const t = creaInclinazione();
  // Comunque si tenga il telefono — qui bello storto — si parte da fermi.
  const primo = t.passo(63, -27);
  assert.equal(primo.rx, 0);
  assert.equal(primo.ry, 0);
});

test('alzare il telefono fino alla verticale non produce scatti', () => {
  // È il movimento riferito: si parte col telefono inclinato in mano e lo si
  // porta oltre la verticale. `beta` attraversa i 90°, ed è lì che `gamma`
  // salta da +80 a -80 di colpo — il blocco cardanico.
  const sequenza = [];
  for (let beta = 60; beta <= 120; beta += 1) {
    // gamma si ribalta di segno passando i 90°, come fa davvero il sensore.
    const gamma = beta < 90 ? 80 : -80;
    sequenza.push([beta, gamma]);
  }

  const { massimoSalto: salto, dove } = massimoSalto(sequenza);
  assert.ok(
    salto < SCATTO,
    `salto di ${salto.toFixed(2)}° a ${dove}: il ribaltamento di gamma passa ancora`,
  );
});

test('il giro completo di beta non produce scatti al confine ±180', () => {
  const sequenza = [];
  for (let i = 0; i <= 400; i += 1) {
    // Da 0 in su, riportato in [-180, 180] come fa il sensore: 179 → -180.
    const beta = (((i + 180) % 360) - 180);
    sequenza.push([beta, 0]);
  }

  const { massimoSalto: salto, dove } = massimoSalto(sequenza);
  assert.ok(salto < SCATTO, `salto di ${salto.toFixed(2)}° a ${dove}: l'avvolgimento passa ancora`);
});

test('vicino alla verticale il rollio si spegne invece di impazzire', () => {
  // A beta = 90 il sensore non sa più dire gamma: oscilla da solo. Il valore
  // deve restare quasi immobile anche se gamma balla di 160 gradi.
  const t = creaInclinazione();
  t.passo(90, 0);
  let massimo = 0;
  for (const gamma of [80, -80, 75, -85, 90, -90]) {
    const { ry } = t.passo(90, gamma);
    massimo = Math.max(massimo, Math.abs(ry));
  }
  assert.ok(massimo < 1, `il rollio arriva a ${massimo.toFixed(2)}° con gamma impazzito`);
});

test('col telefono piatto il rollio funziona a pieno', () => {
  // Lo smorzamento non deve spegnere l'effetto dove il sensore è affidabile:
  // sarebbe curare la malattia uccidendo il paziente.
  const t = creaInclinazione();
  t.passo(0, 0);
  let ry = 0;
  // Il passa-basso ci mette qualche fotogramma ad arrivare: si lascia assestare.
  for (let i = 0; i < 60; i += 1) ry = t.passo(0, 20).ry;
  assert.ok(ry > 5, `rollio fermo a ${ry.toFixed(2)}°: lo smorzamento è troppo aggressivo`);
});

test("l'inclinazione avanti/indietro resta piena anche in verticale", () => {
  // `beta` NON va smorzato: il telefono lo si tiene verticale proprio quando
  // si guarda una carta, e lì l'effetto deve esserci.
  const t = creaInclinazione();
  t.passo(90, 0);
  let rx = 0;
  for (let i = 0; i < 60; i += 1) rx = t.passo(70, 0).rx;
  assert.ok(rx > 5, `inclinazione ferma a ${rx.toFixed(2)}° in verticale`);
});

test('il risultato resta sempre dentro il tetto', () => {
  const t = creaInclinazione();
  t.passo(0, 0);
  for (const [beta, gamma] of [[-180, -90], [180, 90], [0, 90], [90, 0]]) {
    for (let i = 0; i < 80; i += 1) {
      const { rx, ry } = t.passo(beta, gamma);
      assert.ok(Math.abs(rx) <= MASSIMO + 0.001, `rx fuori tetto: ${rx}`);
      assert.ok(Math.abs(ry) <= MASSIMO + 0.001, `ry fuori tetto: ${ry}`);
    }
  }
});

test('letture non valide non sporcano il valore corrente', () => {
  const t = creaInclinazione();
  t.passo(45, 0);
  for (let i = 0; i < 40; i += 1) t.passo(35, 0);
  const buono = t.passo(35, 0);
  const dopoNaN = t.passo(NaN, NaN);
  assert.deepEqual(dopoNaN, buono, 'un evento sballato deve lasciare tutto com\'è');
});

test('limita non lascia passare niente oltre i bordi', () => {
  assert.equal(limita(99, 8), 8);
  assert.equal(limita(-99, 8), -8);
  assert.equal(limita(3, 8), 3);
});
