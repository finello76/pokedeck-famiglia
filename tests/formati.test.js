/**
 * Test dei formati di gioco.
 *
 * Il criterio guida: i numeri che la scheda del formato mostra a schermo e
 * quelli che il foglio stampato annuncia devono essere **gli stessi**. Se
 * divergono, due bambini leggono due regolamenti diversi durante la stessa
 * partita, e nessuno dei due sta sbagliando.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATI, UFFICIALE, MAX_COPIE, formatoPer, alteraNumeriUfficiali } from '../src/engine/formati.js';
import { pianifica } from '../src/engine/pianifica.js';

const pk = (nome, tipo, quantita) => ({
  carta: {
    nome, numero: nome, idSet: 'p', categoria: 'Pokémon', stadio: 'Base',
    evolveDa: null, tipi: [tipo], ps: 60, attacchi: [{ nome: 'C', costo: [tipo], danno: 20 }],
  },
  quantita,
});
const en = (tipo, q) => ({
  carta: { nome: `Energia ${tipo}`, numero: tipo, idSet: '@b', categoria: 'Energia', tipoEnergia: 'Base' },
  quantita: q,
});

/** Collezione abbondante: i mazzi si riempiono in tutti i formati. */
const collezione = [
  pk('Pikachu', 'Lampo', 60), pk('Voltorb', 'Lampo', 60),
  pk('Magnemite', 'Lampo', 60), pk('Mareep', 'Lampo', 60),
  en('Lampo', 200),
];

test('ogni formato dichiara numeri sensati', () => {
  for (const f of FORMATI) {
    assert.ok(f.taglia > 0, `${f.nome}: taglia`);
    assert.ok(f.manoIniziale > 0, `${f.nome}: mano iniziale`);
    assert.ok(f.premi > 0, `${f.nome}: premi`);
    assert.ok(f.panchina > 0, `${f.nome}: panchina`);
    assert.ok(f.siPuo.length > 0 && f.nonSiPuo.length > 0, `${f.nome}: cosa si può e non si può`);
    // Mano e Premi non possono impegnare l'intero mazzo, o non resta da pescare.
    assert.ok(
      f.manoIniziale + f.premi < f.taglia,
      `${f.nome}: mano e Premi impegnerebbero tutto il mazzo`,
    );
  }
});

test('i formati sono ordinati per taglia crescente', () => {
  // formatoPer() prende il primo abbastanza capiente: senza l'ordine
  // restituirebbe il formato sbagliato.
  const taglie = FORMATI.map((f) => f.taglia);
  assert.deepEqual(taglie, [...taglie].sort((a, b) => a - b));
});

test('un solo formato è ufficiale, ed è quello da 60', () => {
  const ufficiali = FORMATI.filter((f) => f.ufficiale);
  assert.equal(ufficiali.length, 1);
  assert.equal(ufficiali[0].taglia, 60);
  assert.ok(!alteraNumeriUfficiali(ufficiali[0]), 'il formato ufficiale non altera nulla');
});

test('formatoPer sceglie il formato giusto, anche per taglie intermedie', () => {
  assert.equal(formatoPer(15).taglia, 15);
  assert.equal(formatoPer(20).taglia, 20);
  assert.equal(formatoPer(60).taglia, 60);
  // Un mazzo rimasto incompleto si gioca col formato capiente più vicino.
  assert.equal(formatoPer(17).taglia, 20, 'un mazzo da 17 si gioca come un 20');
  assert.equal(formatoPer(1).taglia, 15);
  assert.equal(formatoPer(999).taglia, 60, 'oltre l\'ultimo formato si resta sull\'ultimo');
});

test('il foglio stampato annuncia gli stessi numeri della scheda del formato', () => {
  // È la ragione per cui formati.js esiste: i due testi non devono divergere.
  for (const formato of FORMATI) {
    const { regole } = pianifica(collezione, { taglia: formato.taglia, numeroMazzi: 1 });
    const mano = regole.find((r) => r.codice === 'mano-e-premi');
    const panchina = regole.find((r) => r.codice === 'panchina-ridotta');

    if (alteraNumeriUfficiali(formato)) {
      assert.ok(mano, `${formato.nome}: la regola su mano e Premi deve essere stampata`);
      assert.ok(
        mano.testo.includes(`${formato.manoIniziale} carte iniziali`),
        `${formato.nome}: il foglio deve dire ${formato.manoIniziale} carte in mano`,
      );
      assert.ok(
        mano.testo.includes(`${formato.premi} carte Premio`),
        `${formato.nome}: il foglio deve dire ${formato.premi} Premi`,
      );
    } else {
      assert.ok(!mano, `${formato.nome}: usa i numeri veri, non serve stamparlo`);
      assert.ok(!panchina, `${formato.nome}: panchina ufficiale, niente regola`);
    }

    if (formato.panchina < UFFICIALE.panchina) {
      assert.ok(panchina, `${formato.nome}: la panchina ridotta va stampata`);
      assert.ok(
        panchina.testo.includes(`${formato.panchina} Pokémon`),
        `${formato.nome}: il foglio deve dire ${formato.panchina} in panchina`,
      );
    }
  }
});

test('il limite di copie è uno solo per tutto il motore', () => {
  // generazione.js e alternative.js lo importano entrambi da qui: se uno
  // tornasse a dichiararlo per conto proprio, i due potrebbero divergere.
  assert.equal(MAX_COPIE, 4);
  const { mazzi } = pianifica(collezione, { taglia: 60, numeroMazzi: 1 });
  for (const voce of mazzi[0].carte) {
    if (voce.carta.categoria === 'Energia') continue;
    assert.ok(
      voce.quantita <= MAX_COPIE,
      `${voce.carta.nome}: ${voce.quantita} copie, oltre il limite`,
    );
  }
});
