/**
 * Test della forza obiettivo: portare un mazzo a un punteggio voluto.
 *
 * Quello che si prova qui non è "il numero scende", che sarebbe facile e
 * inutile: si prova che scenda **senza rompere il mazzo** — la taglia resta
 * quella, le linee evolutive restano intere, le carte entrate sono carte che si
 * possiedono davvero — e che quando la collezione non permette di arrivarci il
 * motore lo dica invece di fingere.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avvicinaAForza } from '../src/engine/forza.js';
import { punteggioMazzo } from '../src/engine/bilancia.js';
import { Dispensa } from '../src/engine/dispensa.js';

const pk = (nome, { stadio = 'Base', evolveDa = null, tipo = 'Erba', ps = 60, danno = 20 } = {}) => ({
  nome,
  numero: nome,
  idSet: 'prova',
  categoria: 'Pokémon',
  stadio,
  evolveDa,
  tipi: [tipo],
  ps,
  attacchi: [{ nome: 'Colpo', costo: [tipo], danno }],
});

const en = (tipo) => ({
  nome: `Energia ${tipo}`,
  numero: tipo,
  idSet: '@base',
  categoria: 'Energia',
  tipoEnergia: 'Base',
  tipi: [tipo],
});

const mazzo = (nome, tipi, voci) => {
  const m = {
    nome,
    tipi,
    carte: voci,
    totale: 0,
    composizione: { pokemon: 0, energie: 0, allenatori: 0 },
  };
  for (const v of voci) {
    m.totale += v.quantita;
    const dove = { 'Pokémon': 'pokemon', Energia: 'energie', Allenatore: 'allenatori' }[
      v.carta.categoria
    ];
    if (dove) m.composizione[dove] += v.quantita;
  }
  return m;
};

/** Un mazzo di mostri: PS alti e danno alto, forza ben oltre i 100. */
const forzuto = () =>
  mazzo('Erba', ['Erba'], [
    { carta: pk('Bestione', { ps: 200, danno: 200 }), quantita: 4 },
    { carta: pk('Colosso', { ps: 180, danno: 160 }), quantita: 4 },
    { carta: en('Erba'), quantita: 7 },
  ]);

/** In collezione restano dei Base scarsi, dello stesso tipo del mazzo. */
const scorteScarse = () =>
  new Dispensa([
    { carta: pk('Fuscello', { ps: 30, danno: 10 }), quantita: 4 },
    { carta: pk('Ramoscello', { ps: 40, danno: 10 }), quantita: 4 },
  ]);

test('un obiettivo basso abbassa la forza senza cambiare la taglia del mazzo', () => {
  const m = forzuto();
  const partenza = punteggioMazzo(m).totale;
  const carteIniziali = m.totale;

  const esito = avvicinaAForza([m], { obiettivo: 45, dispensa: scorteScarse() });
  const arrivo = punteggioMazzo(m).totale;

  assert.ok(partenza > 100, `il mazzo di prova deve partire forte, era ${partenza}`);
  assert.ok(arrivo < partenza, `la forza doveva scendere: da ${partenza} a ${arrivo}`);
  assert.ok(
    Math.abs(arrivo - 45) < Math.abs(partenza - 45),
    'il mazzo deve essere più vicino all\'obiettivo di prima',
  );
  // La taglia è l'unica cosa che non può cambiare: un mazzo da 15 che ne conta
  // 13 non si gioca, e sarebbe il modo più facile di far scendere il punteggio.
  assert.equal(m.totale, carteIniziali);
  assert.equal(
    m.carte.reduce((s, v) => s + v.quantita, 0),
    carteIniziali,
  );
  assert.equal(esito.esiti[0].arrivo, arrivo);
  assert.ok(esito.esiti[0].scambi.length > 0);
});

test('le carte entrate sono quelle della collezione, e la dispensa lo registra', () => {
  const m = forzuto();
  const dispensa = scorteScarse();

  const esito = avvicinaAForza([m], { obiettivo: 45, dispensa });
  const entrate = new Set(esito.esiti[0].scambi.map((s) => s.dentro));

  for (const nome of entrate) {
    assert.ok(
      ['Fuscello', 'Ramoscello'].includes(nome),
      `${nome} non è una carta della collezione`,
    );
  }
  // Le copie prese non devono restare disponibili per un altro mazzo: sono
  // carte fisiche, non un catalogo.
  const messe = esito.esiti[0].scambi.length;
  assert.equal(dispensa.disponibili(pk('Fuscello')) + dispensa.disponibili(pk('Ramoscello')), 8 - messe);
});

test('non si spezza una linea evolutiva per far quadrare il numero', () => {
  const m = mazzo('Erba', ['Erba'], [
    { carta: pk('Radicetta', { ps: 70, danno: 30 }), quantita: 2 },
    { carta: pk('Radicione', { stadio: 'Livello 1', evolveDa: 'Radicetta', ps: 160, danno: 150 }), quantita: 2 },
    { carta: pk('Sciolto', { ps: 190, danno: 190 }), quantita: 3 },
    { carta: en('Erba'), quantita: 5 },
  ]);

  avvicinaAForza([m], { obiettivo: 30, dispensa: scorteScarse() });

  const nomi = m.carte.map((v) => v.carta.nome);
  assert.ok(nomi.includes('Radicetta'), 'la Base della linea non doveva uscire');
  assert.ok(nomi.includes('Radicione'), 'l\'evoluzione non doveva uscire');
  // Il Pokémon sciolto invece è esattamente ciò che si può scambiare.
  assert.ok(!nomi.includes('Sciolto') || m.carte.find((v) => v.carta.nome === 'Sciolto').quantita < 3);
});

test('se la collezione non basta lo si dice, invece di fingere', () => {
  const m = forzuto();
  // Nessuna carta libera: non c'è niente con cui scambiare.
  const esito = avvicinaAForza([m], { obiettivo: 20, dispensa: new Dispensa([]) });

  assert.equal(esito.esiti[0].raggiunto, false);
  assert.equal(esito.esiti[0].scambi.length, 0);
  assert.equal(esito.esiti[0].partenza, esito.esiti[0].arrivo);
});

test('distingue "non si può" da "ho smesso di provare"', () => {
  // Le due cose portano allo stesso numero ma non allo stesso consiglio: nel
  // secondo caso rigenerare o scambiare a mano serve ancora a qualcosa.
  const finito = avvicinaAForza([forzuto()], { obiettivo: 20, dispensa: new Dispensa([]) });
  assert.equal(finito.esiti[0].motivo, 'collezione');

  const troncato = avvicinaAForza([forzuto()], {
    obiettivo: 20,
    dispensa: scorteScarse(),
    passiMassimi: 1,
  });
  assert.equal(troncato.esiti[0].motivo, 'passi');
  assert.equal(troncato.esiti[0].scambi.length, 1);

  const m = forzuto();
  const centrato = avvicinaAForza([m], {
    obiettivo: punteggioMazzo(m).totale,
    dispensa: scorteScarse(),
  });
  assert.equal(centrato.esiti[0].motivo, 'obiettivo');
  assert.equal(centrato.esiti[0].scambi.length, 0);
});

test('senza obiettivo non si tocca niente', () => {
  const m = forzuto();
  const prima = JSON.stringify(m);

  const esito = avvicinaAForza([m], { obiettivo: 0, dispensa: scorteScarse() });

  assert.deepEqual(esito, { obiettivo: null, esiti: [] });
  assert.equal(JSON.stringify(m), prima);
});

test('due mazzi non si contendono la stessa copia fisica', () => {
  const primo = forzuto();
  const secondo = forzuto();
  const dispensa = new Dispensa([{ carta: pk('Fuscello', { ps: 30, danno: 10 }), quantita: 2 }]);

  const esito = avvicinaAForza([primo, secondo], { obiettivo: 45, dispensa });
  const totale = esito.esiti.reduce((s, e) => s + e.scambi.length, 0);

  assert.ok(totale <= 2, `sono entrate ${totale} copie di una carta che se ne possiede 2`);
  assert.equal(dispensa.disponibili(pk('Fuscello')), 2 - totale);
});
