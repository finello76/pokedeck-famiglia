/**
 * Test della mini partita.
 *
 * Una partita è fatta di casi limite: la mano senza Pokémon Base, il KO che
 * prende l'ultimo Premio, l'addormentato che non può ritirarsi, il mazzo che
 * finisce. Giocandola a mano se ne vede uno ogni venti partite; qui si provano
 * tutti, e in mezzo secondo.
 *
 * Il caso ha un seme, quindi ogni partita è ripetibile: dove serve un lancio di
 * moneta preciso si sceglie il seme che lo produce.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attacca,
  attaccaEnergia,
  dannoConTipi,
  energieSufficienti,
  evolvi,
  iniziaPartita,
  mosseDisponibili,
  manoImpossibile,
  passa,
  permessiDaRegole,
  pesca,
  rimescolaMano,
  ritirati,
  schiera,
  tipoEnergia,
} from '../src/engine/partita.js';

const pk = (nome, extra = {}) => ({
  nome,
  categoria: 'Pokémon',
  stadio: 'Base',
  tipi: ['Lotta'],
  ps: 60,
  ritirata: 1,
  attacchi: [{ nome: 'Colpo', costo: ['Lotta'], danno: 20 }],
  ...extra,
});
const energia = (tipo = 'Lotta') => ({ nome: `Energia ${tipo}`, categoria: 'Energia' });
const mazzo = (nome, voci) => ({ nome, carte: voci });

/** Due mazzi identici e prevedibili, per non dipendere dal mescolamento. */
function partitaDiProva(extra = {}) {
  const voci = [
    { carta: pk('Machop'), quantita: 4 },
    { carta: energia(), quantita: 11 },
  ];
  return iniziaPartita({
    mazzi: [mazzo('Rosso', voci), mazzo('Blu', voci)],
    taglia: 15,
    seme: 7,
    ...extra,
  });
}

/** Porta la partita al primo turno vero, con un attivo per parte. */
function conAttivi(stato) {
  let s = stato;
  for (let giro = 0; giro < 2; giro += 1) {
    // Mano senza Base: si rimescola, come al tavolo.
    while (manoImpossibile(s, s.diChi)) s = rimescolaMano(s, s.diChi);
    const i = s.giocatori[s.diChi].mano.findIndex((c) => c.categoria === 'Pokémon');
    s = schiera(s, i, 'attivo');
    // In preparazione il turno non passa da solo: si alterna a mano.
    if (s.fase === 'preparazione') s = { ...s, diChi: 1 - s.diChi };
  }
  return { ...s, diChi: 0 };
}

test('la preparazione distribuisce mano e Premi secondo il formato', () => {
  const s = partitaDiProva();

  assert.equal(s.formato.manoIniziale, 5, 'il formato da 15 dà 5 carte');
  assert.equal(s.formato.premi, 2);
  assert.equal(s.giocatori[0].mano.length, 5);
  assert.equal(s.giocatori[0].premi.length, 2);
  assert.equal(s.giocatori[0].mazzo.length, 15 - 5 - 2);
  assert.equal(s.fase, 'preparazione');
});

test('la partita è ripetibile: stesso seme, stessa mano', () => {
  const a = partitaDiProva();
  const b = partitaDiProva();
  assert.deepEqual(
    a.giocatori[0].mano.map((c) => c.nome),
    b.giocatori[0].mano.map((c) => c.nome),
  );
});

test('finché mancano gli attivi si resta in preparazione', () => {
  let s = partitaDiProva();
  const i = s.giocatori[0].mano.findIndex((c) => c.categoria === 'Pokémon');
  s = schiera(s, i, 'attivo');

  assert.equal(s.fase, 'preparazione', 'manca ancora l’avversario');
  assert.ok(s.giocatori[0].attivo);
});

test('un’Energia non si mette a terra come Pokémon', () => {
  let s = partitaDiProva();
  const i = s.giocatori[0].mano.findIndex((c) => c.categoria === 'Energia');
  const dopo = schiera(s, i, 'attivo');

  assert.equal(dopo, s, 'lo stato non cambia nemmeno di una copia');
});

test('una sola Energia per turno', () => {
  let s = conAttivi(partitaDiProva());
  const primo = s.giocatori[0].mano.findIndex((c) => c.categoria === 'Energia');
  s = attaccaEnergia(s, primo, 'attivo');
  assert.equal(s.giocatori[0].attivo.energie.length, 1);

  const secondo = s.giocatori[0].mano.findIndex((c) => c.categoria === 'Energia');
  const dopo = attaccaEnergia(s, secondo, 'attivo');
  assert.equal(dopo, s, 'la seconda Energia non passa');
});

test('la panchina ha il tetto del formato', () => {
  let s = conAttivi(partitaDiProva());
  // Il formato da 15 tiene 3 in panchina: si prova a metterne quattro.
  for (let i = 0; i < 5; i += 1) {
    const j = s.giocatori[0].mano.findIndex((c) => c.categoria === 'Pokémon');
    if (j === -1) {
      s = pesca(s);
      continue;
    }
    s = schiera(s, j, 'panchina');
  }
  assert.ok(s.giocatori[0].panchina.length <= s.formato.panchina);
});

test('pescare a mazzo vuoto fa perdere la partita', () => {
  let s = conAttivi(partitaDiProva());
  s.giocatori[0].mazzo = [];
  s = pesca(s);

  assert.equal(s.fase, 'finita');
  assert.equal(s.vincitore, 1, 'vince l’altro');
  assert.ok(s.registro.some((e) => e.tipo === 'mazzo-finito'));
});

// --- Debolezza, resistenza, danno ----------------------------------------

test('la debolezza ×2 raddoppia il danno', () => {
  const esito = dannoConTipi(20, pk('Charmander', { tipi: ['Fuoco'] }), {
    debolezza: { tipo: 'Fuoco', valore: '×2' },
  });

  assert.equal(esito.danno, 40);
  assert.equal(esito.debolezza, true);
});

test('le carte vecchie sommano invece di raddoppiare', () => {
  const esito = dannoConTipi(20, pk('Charmander', { tipi: ['Fuoco'] }), {
    debolezza: { tipo: 'Fuoco', valore: '+20' },
  });

  assert.equal(esito.danno, 40, 'somma 20, non raddoppia');
});

test('la resistenza toglie danno e non scende sotto zero', () => {
  const esito = dannoConTipi(20, pk('Machop', { tipi: ['Lotta'] }), {
    resistenza: { tipo: 'Lotta', valore: '-30' },
  });

  assert.equal(esito.danno, 0);
  assert.equal(esito.resistenza, true);
});

test('debolezza e resistenza dello stesso tipo si applicano in ordine', () => {
  const esito = dannoConTipi(20, pk('Machop', { tipi: ['Lotta'] }), {
    debolezza: { tipo: 'Lotta', valore: '×2' },
    resistenza: { tipo: 'Lotta', valore: '-30' },
  });

  assert.equal(esito.danno, 10, '20 → 40 con la debolezza, poi −30');
});

test('un attacco da zero danni resta zero anche contro chi è debole', () => {
  const esito = dannoConTipi(0, pk('Metapod', { tipi: ['Erba'] }), {
    debolezza: { tipo: 'Erba', valore: '×2' },
  });

  assert.equal(esito.danno, 0, 'il doppio di niente è niente');
  assert.equal(esito.debolezza, false, 'e non si racconta una debolezza che non ha agito');
});

// --- Energie e costi ------------------------------------------------------

test('il costo si paga col tipo giusto, e le Incolore con qualsiasi Energia', () => {
  const slot = { energie: ['Lotta', 'Acqua'] };
  const casa = permessiDaRegole([]);

  assert.equal(energieSufficienti(slot, { costo: ['Lotta', 'Incolore'] }, casa).basta, true);
  assert.equal(energieSufficienti(slot, { costo: ['Fuoco'] }, casa).basta, false);
});

test('la regola della casa "ogni Energia vale per tutti" guarda solo il numero', () => {
  const slot = { energie: ['Acqua', 'Acqua'] };
  const casa = permessiDaRegole(['energia-universale']);

  assert.equal(energieSufficienti(slot, { costo: ['Fuoco', 'Fuoco'] }, casa).basta, true);
});

test('"costi ridotti" toglie un’Energia ma non scende sotto uno', () => {
  const casa = permessiDaRegole(['costi-ridotti', 'energia-universale']);

  assert.equal(energieSufficienti({ energie: ['Lotta'] }, { costo: ['Lotta', 'Lotta'] }, casa).basta, true);
  assert.equal(energieSufficienti({ energie: [] }, { costo: ['Lotta'] }, casa).basta, false);
});

test('il tipo di un’Energia si legge dal nome', () => {
  assert.equal(tipoEnergia(energia('Fuoco')), 'Fuoco');
  assert.equal(tipoEnergia({ nome: 'Energia Doppioincolore' }), 'Doppioincolore');
});

// --- Attacco, KO, Premi ---------------------------------------------------

test('attaccare senza Energie non fa niente', () => {
  const s = conAttivi(partitaDiProva());
  assert.equal(attacca(s, 0), s);
});

test('un attacco toglie PS, e il turno passa all’altro', () => {
  let s = conAttivi(partitaDiProva());
  s = attaccaEnergia(s, s.giocatori[0].mano.findIndex((c) => c.categoria === 'Energia'), 'attivo');
  s = attacca(s, 0);

  assert.equal(s.giocatori[1].attivo.danni, 20);
  assert.equal(s.diChi, 1, 'ora tocca all’avversario');
  assert.equal(s.turno, 2);
});

test('il KO scarta il Pokémon, fa prendere un Premio e promuove la panchina', () => {
  let s = conAttivi(partitaDiProva());
  // L'avversario ha una riserva, e l'attivo è quasi esausto.
  s.giocatori[1].panchina.push({ carta: pk('Riserva'), danni: 0, energie: [], stati: [], entrataTurno: 1 });
  s.giocatori[1].attivo.danni = 50;
  s = attaccaEnergia(s, s.giocatori[0].mano.findIndex((c) => c.categoria === 'Energia'), 'attivo');
  s = attacca(s, 0);

  assert.equal(s.giocatori[1].attivo.carta.nome, 'Riserva', 'la panchina sale in prima linea');
  assert.equal(s.giocatori[0].premi.length, 1, 'un Premio in meno da prendere');
  assert.equal(s.giocatori[0].mano.length > 0, true);
  assert.ok(s.registro.some((e) => e.tipo === 'ko'));
});

test('finiti i Premi la partita è vinta', () => {
  let s = conAttivi(partitaDiProva());
  s.giocatori[0].premi = [pk('Ultimo')];
  s.giocatori[1].panchina.push({ carta: pk('Riserva'), danni: 0, energie: [], stati: [], entrataTurno: 1 });
  s.giocatori[1].attivo.danni = 50;
  s = attaccaEnergia(s, s.giocatori[0].mano.findIndex((c) => c.categoria === 'Energia'), 'attivo');
  s = attacca(s, 0);

  assert.equal(s.fase, 'finita');
  assert.equal(s.vincitore, 0);
  assert.ok(s.registro.some((e) => e.tipo === 'vittoria' && e.perche === 'premi'));
});

test('restare senza Pokémon fa perdere', () => {
  let s = conAttivi(partitaDiProva());
  s.giocatori[1].attivo.danni = 50;
  s.giocatori[1].panchina = [];
  s = attaccaEnergia(s, s.giocatori[0].mano.findIndex((c) => c.categoria === 'Energia'), 'attivo');
  s = attacca(s, 0);

  assert.equal(s.fase, 'finita');
  assert.equal(s.vincitore, 0);
  assert.ok(s.registro.some((e) => e.perche === 'senza-pokemon'));
});

// --- Ritirata -------------------------------------------------------------

test('ritirarsi costa Energie e scambia con la panchina', () => {
  let s = conAttivi(partitaDiProva());
  s.giocatori[0].attivo.energie = ['Lotta'];
  s.giocatori[0].panchina.push({ carta: pk('Riserva'), danni: 0, energie: [], stati: [], entrataTurno: 1 });
  const prima = s.giocatori[0].attivo.carta.nome;
  s = ritirati(s, 0);

  assert.equal(s.giocatori[0].attivo.carta.nome, 'Riserva');
  assert.equal(s.giocatori[0].panchina[0].carta.nome, prima);
  assert.equal(s.giocatori[0].panchina[0].energie.length, 0, 'l’Energia è stata scartata');
});

test('senza Energie non ci si ritira', () => {
  let s = conAttivi(partitaDiProva());
  s.giocatori[0].panchina.push({ carta: pk('Riserva'), danni: 0, energie: [], stati: [], entrataTurno: 1 });
  assert.equal(ritirati(s, 0), s);
});

test('la regola della casa rende gratis la prima ritirata', () => {
  let s = conAttivi(partitaDiProva({ regole: ['ritirata-agevolata'] }));
  s.giocatori[0].panchina.push({ carta: pk('Riserva'), danni: 0, energie: [], stati: [], entrataTurno: 1 });
  s = ritirati(s, 0);

  assert.equal(s.giocatori[0].attivo.carta.nome, 'Riserva', 'senza pagare niente');
});

test('ritirarsi cancella gli stati speciali', () => {
  let s = conAttivi(partitaDiProva({ regole: ['ritirata-agevolata'] }));
  s.giocatori[0].attivo.stati = ['Avvelenato'];
  s.giocatori[0].panchina.push({ carta: pk('Riserva'), danni: 0, energie: [], stati: [], entrataTurno: 1 });
  s = ritirati(s, 0);

  assert.deepEqual(s.giocatori[0].panchina[0].stati, [], 'il veleno resta fuori dal campo');
});

// --- Stati speciali in partita -------------------------------------------

test('il veleno fa danno alla fine del turno', () => {
  let s = conAttivi(partitaDiProva());
  s.giocatori[0].attivo.stati = ['Avvelenato'];
  s = passa(s);

  assert.equal(s.giocatori[0].attivo.danni, 10);
  assert.ok(s.registro.some((e) => e.tipo === 'stato' && e.stato === 'Avvelenato'));
});

test('il paralizzato non attacca, e la paralisi passa col turno', () => {
  let s = conAttivi(partitaDiProva());
  s.giocatori[0].attivo.stati = ['Paralizzato'];
  s.giocatori[0].attivo.energie = ['Lotta'];

  assert.equal(attacca(s, 0), s, 'non può attaccare');
  const dopo = passa(s);
  assert.deepEqual(dopo.giocatori[0].attivo.stati, [], 'passando il turno guarisce');
});

test('l’addormentato non si ritira', () => {
  let s = conAttivi(partitaDiProva({ regole: ['ritirata-agevolata'] }));
  s.giocatori[0].attivo.stati = ['Addormentato'];
  s.giocatori[0].panchina.push({ carta: pk('Riserva'), danni: 0, energie: [], stati: [], entrataTurno: 1 });

  assert.equal(ritirati(s, 0), s);
});

test('un attacco che addormenta lo scrive addosso al difensore', () => {
  const dormiglione = pk('Jigglypuff', {
    attacchi: [{ nome: 'Ninnananna', costo: ['Lotta'], danno: 0, effetto: 'Il Pokémon attivo del tuo avversario viene addormentato.' }],
  });
  let s = conAttivi(partitaDiProva());
  s.giocatori[0].attivo.carta = dormiglione;
  s.giocatori[0].attivo.energie = ['Lotta'];
  s = attacca(s, 0);

  assert.ok(s.giocatori[1].attivo.stati.includes('Addormentato'));
});

// --- Evoluzioni -----------------------------------------------------------

test('non si evolve un Pokémon messo in gioco adesso', () => {
  let s = conAttivi(partitaDiProva());
  const evoluzione = pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop' });
  s.giocatori[0].mano.push(evoluzione);
  s.giocatori[0].attivo.entrataTurno = s.turno;

  assert.equal(evolvi(s, s.giocatori[0].mano.length - 1, 'attivo'), s);
});

test('l’evoluzione tiene i danni e cancella gli stati', () => {
  let s = conAttivi(partitaDiProva());
  const evoluzione = pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop', ps: 90 });
  s.giocatori[0].mano.push(evoluzione);
  s.giocatori[0].attivo.entrataTurno = 0;
  s.giocatori[0].attivo.danni = 20;
  s.giocatori[0].attivo.stati = ['Confuso'];
  s = evolvi(s, s.giocatori[0].mano.length - 1, 'attivo');

  assert.equal(s.giocatori[0].attivo.carta.nome, 'Machoke');
  assert.equal(s.giocatori[0].attivo.danni, 20, 'i danni restano');
  assert.deepEqual(s.giocatori[0].attivo.stati, [], 'gli stati no');
});

test('con "evoluzioni come Base" un Livello 1 si mette a terra', () => {
  let s = partitaDiProva({ regole: ['evoluzioni-come-base'] });
  const evoluzione = pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop' });
  s.giocatori[0].mano.push(evoluzione);
  s = schiera(s, s.giocatori[0].mano.length - 1, 'attivo');

  assert.equal(s.giocatori[0].attivo.carta.nome, 'Machoke');
});

// --- Le mosse proposte ----------------------------------------------------

test('le mosse impossibili spiegano perché, invece di sparire', () => {
  const s = conAttivi(partitaDiProva());
  const attacco = mosseDisponibili(s).find((m) => m.tipo === 'attacco');

  assert.equal(attacco.possibile, false);
  assert.match(attacco.perche, /Servono 1 Energie, ne hai 0/);
});

test('in preparazione si propone solo di schierare', () => {
  const s = partitaDiProva();
  const tipi = new Set(mosseDisponibili(s).map((m) => m.tipo));

  assert.deepEqual([...tipi], ['schiera-attivo']);
});

test('a partita finita non si propone più niente', () => {
  const s = { ...partitaDiProva(), fase: 'finita' };
  assert.deepEqual(mosseDisponibili(s), []);
});

test('passare il turno è sempre possibile', () => {
  const s = conAttivi(partitaDiProva());
  assert.equal(mosseDisponibili(s).find((m) => m.tipo === 'passa').possibile, true);
});

// --- La mano che non si può giocare --------------------------------------

test('una mano senza Pokémon Base si riconosce', () => {
  const s = partitaDiProva();
  s.giocatori[0].mano = [energia(), energia(), energia()];

  assert.equal(manoImpossibile(s, 0), true);
  s.giocatori[0].mano.push(pk('Machop'));
  assert.equal(manoImpossibile(s, 0), false);
});

test('rimescolare ridà una mano e regala una carta all’avversario', () => {
  let s = partitaDiProva();
  const primaAvversario = s.giocatori[1].mano.length;
  s = rimescolaMano(s, 0);

  assert.equal(s.giocatori[0].mano.length, s.formato.manoIniziale);
  assert.equal(s.giocatori[1].mano.length, primaAvversario + 1, 'è il prezzo del rimescolo');
  assert.ok(s.registro.some((e) => e.tipo === 'mulligan'));
});

test('la regola della casa toglie il prezzo del rimescolo', () => {
  let s = partitaDiProva({ regole: ['mulligan-morbido'] });
  const primaAvversario = s.giocatori[1].mano.length;
  s = rimescolaMano(s, 0);

  assert.equal(s.giocatori[1].mano.length, primaAvversario, 'nessuna carta in più');
});

test('rimescolare non perde carte per strada', () => {
  let s = partitaDiProva({ regole: ['mulligan-morbido'] });
  const prima = s.giocatori[0].mano.length + s.giocatori[0].mazzo.length;
  s = rimescolaMano(s, 0);

  assert.equal(s.giocatori[0].mano.length + s.giocatori[0].mazzo.length, prima);
});
