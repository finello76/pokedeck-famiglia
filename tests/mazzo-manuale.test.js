/**
 * Test dei controlli sul mazzo costruito a mano.
 *
 * Il motore che genera i mazzi rispetta le regole per costruzione; chi sceglie
 * le carte da sé no. Questi avvisi esistono per dirgli prima ciò che
 * altrimenti scoprirebbe alla prima partita — e sono avvisi, non divieti,
 * perché in questo progetto violare il regolamento in modo consapevole è
 * esattamente ciò che fanno le regole della casa.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diagnostica,
  copieAncoraDisponibili,
  GRAVITA,
} from '../src/engine/mazzo-manuale.js';

const pk = (nome, opzioni = {}) => ({
  nome,
  numero: nome,
  idSet: 'prova',
  categoria: 'Pokémon',
  stadio: opzioni.stadio ?? 'Base',
  evolveDa: opzioni.evolveDa ?? null,
  tipi: [opzioni.tipo ?? 'Lotta'],
  ps: opzioni.ps ?? 70,
  attacchi: [{ nome: 'Colpo', costo: [opzioni.costo ?? 'Lotta'], danno: 30 }],
});
const en = (tipo) => ({
  nome: `Energia ${tipo}`,
  numero: tipo,
  idSet: '@base',
  categoria: 'Energia',
  tipoEnergia: 'Base',
});
const al = (nome) => ({ nome, numero: nome, idSet: 'prova', categoria: 'Allenatore' });

const mazzo = (voci) => ({ carte: voci });
const codici = (m, o) => diagnostica(m, o).map((a) => a.codice);

/** Un mazzo da 30 senza niente da segnalare. */
const sano = () =>
  mazzo([
    { carta: pk('Machop'), quantita: 4 },
    { carta: pk('Mankey'), quantita: 4 },
    { carta: pk('Makuhita'), quantita: 4 },
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop' }), quantita: 2 },
    { carta: en('Lotta'), quantita: 8 },
    { carta: al('Pozione'), quantita: 4 },
    { carta: al('Mega Ball'), quantita: 4 },
  ]);

test('un mazzo ben costruito non produce avvisi', () => {
  assert.deepEqual(diagnostica(sano(), { taglia: 30 }), []);
});

test('senza taglia dichiarata non si lamenta mai del numero di carte', () => {
  // Mentre si costruisce, il mazzo è incompleto per definizione: dire a ogni
  // carta "ne mancano 29" sarebbe rumore.
  const parziale = mazzo([{ carta: pk('Machop'), quantita: 1 }, { carta: en('Lotta'), quantita: 1 }]);
  assert.ok(!codici(parziale).includes('taglia'));
  assert.ok(codici(parziale, { taglia: 30 }).includes('taglia'));
});

test('dice quante carte mancano, e quante sono di troppo', () => {
  const corto = mazzo([{ carta: pk('Machop'), quantita: 4 }, { carta: en('Lotta'), quantita: 4 }]);
  assert.match(diagnostica(corto, { taglia: 30 })[0].testo, /Mancano 22 carte/);

  const lungo = mazzo([{ carta: pk('Machop'), quantita: 4 }, { carta: en('Lotta'), quantita: 20 }]);
  assert.match(diagnostica(lungo, { taglia: 15 })[0].testo, /9 carte di troppo/);
});

test('il limite delle 4 copie non vale per le Energie base', () => {
  const m = sano();
  m.carte.find((v) => v.carta.categoria === 'Energia').quantita = 12;
  m.carte.find((v) => v.carta.nome === 'Machop').quantita = 0;
  assert.ok(!codici(m).includes('troppe-copie'), '12 Energie base sono legali');

  m.carte.push({ carta: pk('Mankey'), quantita: 5 });
  const avviso = diagnostica(m).find((a) => a.codice === 'troppe-copie');
  assert.ok(avviso);
  assert.ok(avviso.carte.some((c) => c.includes('Mankey')));
});

test('un mazzo senza Pokémon Base non può nemmeno cominciare', () => {
  const m = mazzo([
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop' }), quantita: 4 },
    { carta: en('Lotta'), quantita: 4 },
  ]);
  const avviso = diagnostica(m).find((a) => a.codice === 'senza-base');
  assert.ok(avviso);
  assert.equal(avviso.gravita, GRAVITA.BLOCCANTE);
});

test('pochi Base è un avviso, e cita la probabilità di partire', () => {
  const m = mazzo([
    { carta: pk('Machop'), quantita: 1 },
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop' }), quantita: 4 },
    { carta: en('Lotta'), quantita: 10 },
    { carta: al('Pozione'), quantita: 15 },
  ]);
  const avviso = diagnostica(m, { taglia: 30 }).find((a) => a.codice === 'pochi-base');
  assert.ok(avviso);
  assert.equal(avviso.gravita, GRAVITA.AVVISO, 'si può giocare lo stesso, male');
  assert.match(avviso.testo, /\d+%/, 'deve dire quanto spesso la partita parte');
});

test('le evoluzioni orfane sono elencate col nome di ciò che manca', () => {
  const m = sano();
  m.carte.push({
    carta: pk('Machamp', { stadio: 'Livello 2', evolveDa: 'Machoke2' }),
    quantita: 1,
  });
  const avviso = diagnostica(m).find((a) => a.codice === 'evoluzioni-orfane');
  assert.ok(avviso);
  assert.ok(
    avviso.carte.some((c) => c.includes('Machamp') && c.includes('Machoke2')),
    'senza il nome di ciò che manca l\'avviso non è azionabile',
  );
});

test('un\'evoluzione con la sua pre-evoluzione nel mazzo non è orfana', () => {
  assert.ok(!codici(sano()).includes('evoluzioni-orfane'), 'Machoke ha il suo Machop');
});

test('un mazzo di soli Pokémon senza Energie è bloccante', () => {
  const m = mazzo([{ carta: pk('Machop'), quantita: 4 }, { carta: al('Pozione'), quantita: 4 }]);
  const avviso = diagnostica(m).find((a) => a.codice === 'senza-energie');
  assert.ok(avviso);
  assert.equal(avviso.gravita, GRAVITA.BLOCCANTE);
});

test('segnala le carte che chiedono un\'Energia che il mazzo non ha', () => {
  const m = sano();
  // Skarmory chiede Metallo, nel mazzo ci sono solo Energie Lotta.
  m.carte.push({ carta: pk('Skarmory', { tipo: 'Metallo', costo: 'Metallo' }), quantita: 1 });
  const avviso = diagnostica(m).find((a) => a.codice === 'carte-senza-energia');
  assert.ok(avviso);
  assert.ok(avviso.carte.some((c) => c.includes('Skarmory') && c.includes('Metallo')));
});

test('i problemi bloccanti vengono prima di quelli che rendono solo debole', () => {
  const m = mazzo([
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop' }), quantita: 4 },
    { carta: en('Lotta'), quantita: 4 },
  ]);
  const esito = diagnostica(m, { taglia: 30 });
  const primaAvviso = esito.findIndex((a) => a.gravita === GRAVITA.AVVISO);
  const ultimoBloccante = esito.map((a) => a.gravita).lastIndexOf(GRAVITA.BLOCCANTE);
  assert.ok(primaAvviso === -1 || ultimoBloccante < primaAvviso);
});

test('un mazzo vuoto non fa esplodere i controlli', () => {
  assert.doesNotThrow(() => diagnostica({ carte: [] }, { taglia: 30 }));
  assert.doesNotThrow(() => diagnostica(undefined));
  assert.deepEqual(diagnostica(undefined), []);
});

test('copieAncoraDisponibili rispetta sia la scatola sia il regolamento', () => {
  const pikachu = pk('Pikachu');
  assert.equal(copieAncoraDisponibili(pikachu, 6, 0), 4, 'il tetto di regolamento');
  assert.equal(copieAncoraDisponibili(pikachu, 2, 0), 2, 'non più di quante ne hai');
  assert.equal(copieAncoraDisponibili(pikachu, 6, 4), 0, 'raggiunto il tetto');
  assert.equal(copieAncoraDisponibili(pikachu, 3, 3), 0, 'finite le copie');
  // Le Energie base non hanno tetto: il limite resta solo quello della scatola.
  assert.equal(copieAncoraDisponibili(en('Fuoco'), 12, 8), 4);
});
