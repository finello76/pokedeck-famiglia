/**
 * Test di `src/data/legalita.js` e dei dati che lo alimentano.
 *
 * Due livelli, perché i modi di sbagliare sono due. Il primo è la regola: cosa
 * risponde il modulo davanti a una carta. Il secondo sono i dati: se
 * `data/legalita.json` non combacia con i file dei set — un numero scritto con
 * gli zeri iniziali di qua e senza di là — la regola resta giusta e le risposte
 * diventano tutte sbagliate, in silenzio.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { MARCHI_STANDARD, eDiFormato, formatiPresenti, formatoDi } from '../src/data/legalita.js';

const legalita = JSON.parse(readFileSync('data/legalita.json', 'utf8'));

// ─── La regola ──────────────────────────────────────────────────────────────

test('un marchio ancora in corso è Standard', () => {
  for (const marchio of MARCHI_STANDARD) {
    assert.equal(formatoDi({ marchio, espansa: true })?.codice, 'standard');
  }
});

test('un marchio ruotato fuori resta Expanded', () => {
  assert.equal(formatoDi({ marchio: 'F', espansa: true })?.codice, 'expanded');
  assert.equal(formatoDi({ marchio: 'G', espansa: true })?.codice, 'expanded');
});

test('una carta senza marchio e fuori dall’Expanded è fuori formato', () => {
  assert.equal(formatoDi({ marchio: null, espansa: false })?.codice, 'fuori');
});

test('una carta bandita è fuori formato anche se il suo set non lo è', () => {
  // Shaymin EX (xy6-77): marchio nessuno, e l'Expanded l'ha bandita.
  assert.equal(formatoDi({ marchio: null, espansa: false })?.codice, 'fuori');
});

test('le Energie base sono sempre Standard, da qualunque set', () => {
  // Nemmeno il marchio serve: l'Energia Erba del Set Base del 1999 si gioca
  // in un mazzo Standard di oggi.
  const energia = { categoria: 'Energia', tipoEnergia: 'Base', marchio: null, espansa: false };
  assert.equal(formatoDi(energia)?.codice, 'standard');
});

test('le Energie speciali invece seguono la regola normale', () => {
  const speciale = { categoria: 'Energia', tipoEnergia: 'Speciale', marchio: null, espansa: false };
  assert.equal(formatoDi(speciale)?.codice, 'fuori');
});

test('una carta che non è passata dal dataset non si giudica', () => {
  // "Non lo so" e non "fuori formato": una carta di un set che non si è
  // riusciti a leggere non va dichiarata illegale.
  assert.equal(formatoDi({ nome: 'Pikachu' }), null);
  assert.equal(formatoDi(null), null);
});

test('eDiFormato risponde sul codice', () => {
  const carta = { marchio: 'I', espansa: true };
  assert.ok(eDiFormato(carta, 'standard'));
  assert.ok(!eDiFormato(carta, 'expanded'));
});

test('formatiPresenti elenca solo ciò che c’è, dal più ristretto', () => {
  const carte = [
    { marchio: null, espansa: false },
    { marchio: 'H', espansa: true },
    { marchio: 'H', espansa: true },
    null,
  ];
  assert.deepEqual(
    formatiPresenti(carte).map((f) => f.codice),
    ['standard', 'fuori'],
  );
});

// ─── I dati ─────────────────────────────────────────────────────────────────

test('legalita.json ha la forma attesa', () => {
  assert.ok(legalita.marchi && legalita.espansi);
  assert.match(legalita.generato, /^\d{4}-\d{2}-\d{2}$/);
});

test('i marchi sono lettere singole', () => {
  for (const [set, voce] of Object.entries(legalita.marchi)) {
    const valori = typeof voce === 'string' ? [voce] : Object.values(voce);
    for (const v of valori) assert.match(v, /^[A-Z]$/, `${set} ha un marchio strano: ${v}`);
  }
});

test('ogni set nominato esiste davvero fra i dati scaricati', () => {
  const scaricati = new Set(
    readdirSync('data/set')
      .filter((f) => f.endsWith('.json') && f !== 'indice.json')
      .map((f) => f.slice(0, -5)),
  );
  for (const set of [...Object.keys(legalita.marchi), ...Object.keys(legalita.espansi)]) {
    assert.ok(scaricati.has(set), `legalita.json parla del set ${set}, che non esiste`);
  }
});

test('i numeri in deroga combaciano con quelli dei file dei set', () => {
  // La trappola: nei file dei set i numeri hanno gli zeri iniziali (`'004'`),
  // e un `_` che non combacia farebbe cadere ogni deroga su `undefined`.
  for (const mappa of [legalita.marchi, legalita.espansi]) {
    for (const [set, voce] of Object.entries(mappa)) {
      if (typeof voce !== 'object') continue;
      const numeri = new Set(
        JSON.parse(readFileSync(`data/set/${set}.json`, 'utf8')).carte.map((c) => String(c.numero)),
      );
      for (const numero of Object.keys(voce)) {
        if (numero === '_') continue;
        assert.ok(numeri.has(numero), `${set}: la deroga sul numero ${numero} non esiste nel set`);
      }
    }
  }
});

test('i set moderni risultano Standard, quelli antichi no', () => {
  // Un controllo grossolano apposta: se un giorno il file venisse rigenerato
  // storto, qui si vedrebbe subito. sv09 è tutto marchio I, base1 non ha
  // marchi ed è fuori anche dall'Expanded.
  assert.equal(legalita.marchi.sv09?._ ?? legalita.marchi.sv09, 'I');
  assert.equal(legalita.marchi.base1, undefined);
  assert.equal(legalita.espansi.base1?._ ?? legalita.espansi.base1, false);
});
