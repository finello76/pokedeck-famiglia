/**
 * Test del completamento e della correzione automatica.
 *
 * La proprietà che conta più di tutte: queste funzioni **propongono**, non
 * eseguono. Restituiscono mosse e non toccano il mazzo ricevuto — è ciò che
 * permette di mostrare a chi costruisce cosa sta per succedere, e senza quella
 * garanzia il pulsante "Completa" sarebbe magia.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completa, correggi, applica, differenza } from '../src/engine/completa-mazzo.js';
import { diagnostica, GRAVITA } from '../src/engine/mazzo-manuale.js';

const pk = (nome, opzioni = {}) => ({
  nome,
  numero: nome,
  idSet: 'prova',
  categoria: 'Pokémon',
  stadio: opzioni.stadio ?? 'Base',
  evolveDa: opzioni.evolveDa ?? null,
  tipi: [opzioni.tipo ?? 'Lotta'],
  ps: opzioni.ps ?? 70,
  attacchi: [{ nome: 'Colpo', costo: [opzioni.costo ?? 'Lotta'], danno: opzioni.danno ?? 30 }],
});
const en = (tipo) => ({
  nome: `Energia ${tipo}`,
  numero: tipo,
  idSet: '@base',
  categoria: 'Energia',
  tipoEnergia: 'Base',
});
const al = (nome) => ({ nome, numero: nome, idSet: 'prova', categoria: 'Allenatore' });

const mazzo = (voci) => ({ nome: 'Prova', carte: voci });

/** Collezione abbondante e varia, per non misurare la penuria per sbaglio. */
const collezione = () => [
  { carta: pk('Machop'), quantita: 4 },
  { carta: pk('Mankey'), quantita: 4 },
  { carta: pk('Makuhita'), quantita: 4 },
  { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop', ps: 90 }), quantita: 4 },
  { carta: pk('Skarmory', { tipo: 'Metallo', costo: 'Metallo' }), quantita: 4 },
  { carta: en('Lotta'), quantita: 20 },
  { carta: en('Acqua'), quantita: 20 },
  { carta: al('Pozione'), quantita: 4 },
  { carta: al('Mega Ball'), quantita: 4 },
  { carta: al('Hau'), quantita: 4 },
];

const totale = (m) => m.carte.reduce((s, v) => s + v.quantita, 0);

test('completa non tocca il mazzo ricevuto', () => {
  const originale = mazzo([{ carta: pk('Machop'), quantita: 2 }]);
  const copia = JSON.parse(JSON.stringify(originale));
  completa(originale, collezione(), { taglia: 20 });
  assert.deepEqual(originale, copia, 'ha mutato il mazzo invece di proporre mosse');
});

test('completa porta il mazzo alla taglia richiesta', () => {
  const partenza = mazzo([{ carta: pk('Machop'), quantita: 2 }]);
  const { mosse, mancanti } = completa(partenza, collezione(), { taglia: 20 });
  const finito = applica(partenza, mosse);
  assert.equal(totale(finito), 20);
  assert.equal(mancanti, 0);
});

test('un mazzo già completo non riceve nessuna mossa', () => {
  const pieno = mazzo([
    { carta: pk('Machop'), quantita: 4 },
    { carta: en('Lotta'), quantita: 6 },
    { carta: al('Pozione'), quantita: 4 },
    { carta: al('Hau'), quantita: 4 },
    { carta: al('Mega Ball'), quantita: 2 },
  ]);
  assert.deepEqual(completa(pieno, collezione(), { taglia: 20 }).mosse, []);
});

test('rispetta il limite di 4 copie e le copie possedute', () => {
  const { mosse } = completa(mazzo([]), collezione(), { taglia: 30 });
  const finito = applica(mazzo([]), mosse);
  for (const voce of finito.carte) {
    if (voce.carta.categoria === 'Energia') continue;
    assert.ok(voce.quantita <= 4, `${voce.carta.nome} in ${voce.quantita} copie`);
    const possedute = collezione().find((c) => c.carta.nome === voce.carta.nome).quantita;
    assert.ok(voce.quantita <= possedute, `${voce.carta.nome}: piu' copie di quante ne hai`);
  }
});

test('mette le Energie del tipo che le carte chiedono davvero', () => {
  // Il mazzo ha solo Pokémon Lotta: le Energie Acqua sono altrettanto
  // disponibili, ma non servono a nessuno.
  const partenza = mazzo([{ carta: pk('Machop'), quantita: 4 }]);
  const finito = applica(partenza, completa(partenza, collezione(), { taglia: 20 }).mosse);
  const lotta = finito.carte.find((v) => v.carta.nome === 'Energia Lotta')?.quantita ?? 0;
  const acqua = finito.carte.find((v) => v.carta.nome === 'Energia Acqua')?.quantita ?? 0;
  assert.ok(lotta > 0, 'nessuna Energia Lotta in un mazzo Lotta');
  assert.ok(lotta > acqua, `Lotta ${lotta} contro Acqua ${acqua}`);
});

test('mettendo un Livello 2 il completamento scende lungo tutta la linea', () => {
  // La domanda che ha fatto nascere questa regola: "se metto una Fase 2, il
  // sistema completa da solo?". Prima sì, ma solo per caso — funzionava perché
  // i Base venivano aggiunti comunque, e bastava una Base più forte in
  // collezione perché il Livello 2 restasse orfano.
  const machamp = pk('Machamp', { stadio: 'Livello 2', evolveDa: 'Machoke', ps: 150, danno: 90 });
  const conForti = [
    { carta: pk('Machop', { ps: 50, danno: 10 }), quantita: 4 },
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop', ps: 90 }), quantita: 4 },
    { carta: en('Lotta'), quantita: 20 },
    { carta: al('Pozione'), quantita: 4 },
    // Base molto più forti: senza una regola apposta vincono loro e il
    // Machamp resta una carta morta.
    ...[0, 1, 2, 3].map((i) => ({ carta: pk(`Forte${i}`, { ps: 180, danno: 120 }), quantita: 4 })),
  ];
  const partenza = mazzo([{ carta: machamp, quantita: 2 }]);
  const finito = applica(partenza, completa(partenza, conForti, { taglia: 20 }).mosse);

  const quante = (nome) =>
    finito.carte.find((v) => v.carta.nome === nome)?.quantita ?? 0;
  assert.ok(quante('Machoke') > 0, 'manca il gradino intermedio');
  assert.ok(quante('Machop') > 0, 'manca la Base della linea');
});

test('la linea è una piramide, non una torre rovesciata', () => {
  // Due Machamp su un solo Machoke sono un Machamp che non entra mai in gioco:
  // stesso difetto della carta orfana, solo più difficile da vedere.
  const machamp = pk('Machamp', { stadio: 'Livello 2', evolveDa: 'Machoke', ps: 150, danno: 90 });
  const linea = [
    { carta: pk('Machop'), quantita: 4 },
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop', ps: 90 }), quantita: 4 },
    { carta: en('Lotta'), quantita: 20 },
    { carta: al('Pozione'), quantita: 4 },
  ];
  const partenza = mazzo([{ carta: machamp, quantita: 2 }]);
  const finito = applica(partenza, completa(partenza, linea, { taglia: 20 }).mosse);
  const quante = (nome) => finito.carte.find((v) => v.carta.nome === nome)?.quantita ?? 0;

  assert.ok(
    quante('Machoke') >= quante('Machamp'),
    `Machoke ${quante('Machoke')} sotto Machamp ${quante('Machamp')}`,
  );
  assert.ok(
    quante('Machop') >= quante('Machoke'),
    `Machop ${quante('Machop')} sotto Machoke ${quante('Machoke')}`,
  );
});

test('un mazzo completato non ha problemi bloccanti', () => {
  // È la prova che conta: il pulsante deve produrre un mazzo giocabile, non
  // solo un mazzo della taglia giusta.
  const finito = applica(mazzo([]), completa(mazzo([]), collezione(), { taglia: 30 }).mosse);
  const bloccanti = diagnostica(finito, { taglia: 30 }).filter(
    (a) => a.gravita === GRAVITA.BLOCCANTE,
  );
  assert.deepEqual(bloccanti, []);
});

test('ogni mossa dice perché', () => {
  const { mosse } = completa(mazzo([]), collezione(), { taglia: 20 });
  for (const m of mosse) {
    assert.ok(m.motivo?.length > 10, `mossa senza motivo: ${m.carta.nome}`);
  }
});

test('con una collezione insufficiente dichiara quanto manca', () => {
  const povera = [{ carta: pk('Machop'), quantita: 2 }, { carta: en('Lotta'), quantita: 3 }];
  const { mosse, mancanti } = completa(mazzo([]), povera, { taglia: 30 });
  assert.ok(mancanti > 0, 'deve dire che non ci si arriva');
  const finito = applica(mazzo([]), mosse);
  assert.ok(totale(finito) < 30);
});

test('correggi taglia le copie oltre il limite', () => {
  const esagerato = mazzo([
    { carta: pk('Machop'), quantita: 7 },
    { carta: en('Lotta'), quantita: 8 },
  ]);
  const { mosse } = correggi(esagerato, collezione(), { taglia: 20 });
  const tolte = mosse.find((m) => m.verso === 'togli' && m.carta.nome === 'Machop');
  assert.ok(tolte, 'le 7 copie di Machop dovevano scendere a 4');
  assert.equal(tolte.quante, 3);
  // Le Energie base non hanno limite: non vanno toccate.
  assert.ok(!mosse.some((m) => m.verso === 'togli' && m.carta.nome === 'Energia Lotta'));
});

test('correggi toglie le carte di troppo partendo da quelle inutili', () => {
  // 24 carte per un mazzo da 20: escono le Energie Acqua, che nessun Pokémon
  // del mazzo può usare, non i Pokémon.
  const gonfio = mazzo([
    { carta: pk('Machop'), quantita: 4 },
    { carta: en('Lotta'), quantita: 8 },
    { carta: en('Acqua'), quantita: 8 },
    { carta: al('Pozione'), quantita: 4 },
  ]);
  const { mosse } = correggi(gonfio, collezione(), { taglia: 20 });
  const tolte = mosse.filter((m) => m.verso === 'togli');
  assert.ok(tolte.length > 0);
  assert.ok(
    tolte.every((m) => m.carta.nome === 'Energia Acqua'),
    `ha tolto ${tolte.map((m) => m.carta.nome).join(', ')} invece delle Energie inutili`,
  );
});

test('correggi rende giocabile un mazzo che non lo era', () => {
  // Solo evoluzioni e nessuna Energia: due difetti bloccanti insieme.
  const rotto = mazzo([
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop', ps: 90 }), quantita: 4 },
  ]);
  const sistemato = applica(rotto, correggi(rotto, collezione(), { taglia: 20 }).mosse);
  const bloccanti = diagnostica(sistemato, { taglia: 20 }).filter(
    (a) => a.gravita === GRAVITA.BLOCCANTE,
  );
  assert.deepEqual(bloccanti, [], 'restano problemi bloccanti dopo la correzione');
  assert.equal(totale(sistemato), 20);
});

test('applica è l\'unica che modifica, e restituisce un mazzo nuovo', () => {
  const partenza = mazzo([{ carta: pk('Machop'), quantita: 2 }]);
  const dopo = applica(partenza, [
    { verso: 'aggiungi', carta: pk('Mankey'), quante: 3, motivo: 'x' },
    { verso: 'togli', carta: pk('Machop'), quante: 2, motivo: 'x' },
  ]);
  assert.equal(totale(partenza), 2, 'il mazzo di partenza non si tocca');
  assert.equal(totale(dopo), 3);
  assert.ok(!dopo.carte.some((v) => v.carta.nome === 'Machop'), 'le voci a zero spariscono');
});

test('un mazzo vuoto e una collezione vuota non fanno esplodere niente', () => {
  assert.doesNotThrow(() => completa(mazzo([]), [], { taglia: 30 }));
  assert.doesNotThrow(() => correggi(undefined, [], { taglia: 30 }));
  assert.equal(completa(mazzo([]), [], { taglia: 30 }).mancanti, 30);
});

/**
 * `differenza()` è l'inversa di `applica()`, e serve a mostrare **una** lista di
 * mosse quando il mazzo proposto nasce da due passaggi (completamento e poi
 * scambi per la forza). La proprietà che deve valere sempre: applicare la
 * differenza al mazzo di partenza deve dare esattamente il mazzo di arrivo.
 */
test('differenza produce le mosse che portano da un mazzo all\'altro', () => {
  const prima = mazzo([
    { carta: pk('Machop'), quantita: 3 },
    { carta: pk('Mankey'), quantita: 2 },
  ]);
  const dopo = mazzo([
    { carta: pk('Machop'), quantita: 1 },
    { carta: pk('Mankey'), quantita: 2 },
    { carta: pk('Onix'), quantita: 4 },
  ]);

  const mosse = differenza(prima, dopo);
  assert.equal(mosse.length, 2, 'la carta rimasta uguale non produce mosse');

  const ricostruito = applica(prima, mosse);
  assert.equal(totale(ricostruito), totale(dopo));
  for (const voce of dopo.carte) {
    const suo = ricostruito.carte.find((v) => v.carta.nome === voce.carta.nome);
    assert.equal(suo?.quantita, voce.quantita, `quantità sbagliata per ${voce.carta.nome}`);
  }
});

test('differenza riusa i motivi già scritti e ripiega sull\'altro', () => {
  const prima = mazzo([{ carta: pk('Machop'), quantita: 1 }]);
  const dopo = mazzo([
    { carta: pk('Machop'), quantita: 1 },
    { carta: pk('Mankey'), quantita: 1 },
    { carta: pk('Onix'), quantita: 1 },
  ]);

  const mosse = differenza(prima, dopo, {
    motivi: [{ verso: 'aggiungi', carta: pk('Mankey'), quante: 1, motivo: 'Serve un Base.' }],
    altrimenti: 'Scambiata per la forza.',
  });

  const per = (nome) => mosse.find((m) => m.carta.nome === nome);
  assert.equal(per('Mankey').motivo, 'Serve un Base.', 'il motivo di completa() va conservato');
  assert.equal(per('Onix').motivo, 'Scambiata per la forza.');
});

test('fra due mazzi uguali non c\'è nessuna mossa', () => {
  const uno = mazzo([{ carta: pk('Machop'), quantita: 2 }]);
  assert.deepEqual(differenza(uno, uno), []);
  assert.deepEqual(differenza(undefined, undefined), []);
});
