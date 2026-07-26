/**
 * Test del giro di andata e ritorno dei mazzi salvati.
 *
 * La regressione da cui nasce questo file: sul disco ogni voce del mazzo è
 * piatta (`{quantita, nome, idSet, ...}`), mentre motore e UI lavorano su
 * `{carta: {...}, quantita}`. Riaperto un mazzo salvato, `voce.carta` era
 * `undefined` e il primo ⇄ moriva con
 * `undefined is not an object (evaluating 'carta.idSet')`.
 *
 * Qui non si tocca IndexedDB: si provano le due funzioni pure che fanno la
 * conversione, che sono il punto in cui l'errore era possibile.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { istantanea, idrataPiano } from '../src/data/mazzi-salvati.js';
import { disponibilitaResidua, alternativePer } from '../src/engine/alternative.js';

const carta = (nome, extra = {}) => ({
  idSet: 'prova',
  numero: nome,
  nome,
  categoria: 'Pokémon',
  stadio: 'Base',
  tipi: ['Fuoco'],
  ps: 100,
  attacchi: [{ costo: ['Fuoco'], danno: '30' }],
  ritirata: 1,
  immagine: `https://esempio/${nome}`,
  ...extra,
});

/** Un piano minimo come quello che esce da `pianifica()`. */
function pianoDiProva() {
  return {
    mazzi: [
      {
        nome: 'Mazzo rosso',
        tipi: ['Fuoco'],
        totale: 4,
        composizione: {},
        carte: [
          { carta: carta('Charmander'), quantita: 2 },
          { carta: carta('Charmeleon', { stadio: 'Livello 1', evolveDa: 'Charmander' }), quantita: 1 },
          { carta: carta('Energia Fuoco', { categoria: 'Energia' }), quantita: 1, proxy: true, motivo: 'Energie insufficienti' },
        ],
      },
    ],
    equilibrio: { punteggi: [{ totale: 45 }] },
    regole: [],
    carenze: [],
    permessi: {},
  };
}

test('il salvataggio conserva i campi che servono al motore', () => {
  const record = istantanea(pianoDiProva(), { taglia: 20 }, 'Torneo di Natale', '2026-07-26T10:00:00.000Z');
  const voce = record.mazzi[0].carte[1];

  assert.equal(record.nome, 'Torneo di Natale');
  assert.equal(voce.evolveDa, 'Charmander');
  assert.deepEqual(voce.attacchi, [{ costo: ['Fuoco'], danno: '30' }]);
  assert.equal(record.mazzi[0].carte[2].proxy, true);
});

test('il nome è obbligatorio: senza, non si salva', () => {
  assert.throws(() => istantanea(pianoDiProva(), {}, '   '), /nome/i);
});

test('le opzioni pesanti non finiscono su disco', () => {
  const record = istantanea(pianoDiProva(), { taglia: 20, indiceEvoluzioni: { da: {} }, nonPokemon: [] }, 'X');
  assert.equal(record.opzioni.taglia, 20);
  assert.equal('indiceEvoluzioni' in record.opzioni, false);
  assert.equal('nonPokemon' in record.opzioni, false);
});

test('un piano riletto torna nella forma attesa dal motore', () => {
  const piano = idrataPiano(istantanea(pianoDiProva(), { taglia: 20 }, 'Torneo'));
  const voci = piano.mazzi[0].carte;

  assert.equal(voci[0].carta.nome, 'Charmander');
  assert.equal(voci[0].carta.idSet, 'prova');
  assert.equal(voci[0].quantita, 2);
  assert.equal(voci[2].proxy, true);
  // I `null` di IndexedDB non devono sopravvivere: `carta.idSet ?? '?'` li
  // lascerebbe passare e la chiave di dispensa diventerebbe "null:...".
  assert.equal('evolveDa' in voci[0].carta, false);
});

test('dopo la rilettura la sostituzione non esplode più', () => {
  const piano = idrataPiano(istantanea(pianoDiProva(), { taglia: 20 }, 'Torneo'));
  const collezione = [
    { carta: carta('Charmander'), quantita: 4 },
    { carta: carta('Vulpix'), quantita: 2 },
  ];

  const dispensa = disponibilitaResidua(collezione, piano.mazzi);
  // Delle 4 Charmander, 2 sono nel mazzo: ne restano 2 libere.
  assert.equal(dispensa.disponibili(carta('Charmander')), 2);

  const proposte = alternativePer(piano.mazzi[0].carte[0], piano.mazzi[0], dispensa);
  assert.ok(proposte.some((p) => p.carta.nome === 'Vulpix'));
});

test('idratare due volte non cambia niente', () => {
  const uno = idrataPiano(istantanea(pianoDiProva(), {}, 'Torneo'));
  const due = idrataPiano(uno);
  assert.deepEqual(due.mazzi[0].carte, uno.mazzi[0].carte);
});
