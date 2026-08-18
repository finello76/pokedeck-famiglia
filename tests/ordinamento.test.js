/**
 * Test dell'ordinamento del catalogo.
 *
 * L'ordine di un elenco non è un dettaglio estetico: è la promessa che una
 * carta si ritrovi dove ci si aspetta. I due modi di romperla, entrambi
 * silenziosi, sono provati qui:
 *
 * 1. **le carte senza il dato** — un Allenatore non ha numero del Pokédex, una
 *    carta mai quotata non ha prezzo — che finendo in cima farebbero sembrare
 *    l'ordinamento rotto proprio nella prima schermata;
 * 2. **le parità**: sei stampe di Pikachu hanno lo stesso numero, e senza un
 *    secondo criterio il loro ordine cambierebbe a ogni ridisegno.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDINAMENTI,
  ordina,
  raggruppaPerSet,
} from '../src/ui/griglia-collezione/raggruppa.js';

const voce = (nome, extra = {}) => ({
  idSet: extra.idSet ?? 'sv08',
  numero: extra.numero ?? '1',
  quantita: 1,
  carta: extra.carta === null ? null : { nome, categoria: extra.categoria ?? 'Pokémon', rarita: extra.rarita },
});

/** I nomi delle carte, nell'ordine in cui sono uscite. */
const nomi = (voci) => voci.map((v) => v.carta?.nome ?? '(senza carta)');

const DEX = new Map([
  ['Pikachu', 25],
  ['Charizard', 6],
  ['Exeggutor', 103],
]);
const dex = (v) => DEX.get(v.carta?.nome) ?? null;

test('per Pokédex si sale dal numero più basso', () => {
  const voci = [voce('Exeggutor'), voce('Pikachu'), voce('Charizard')];
  assert.deepEqual(nomi(ordina(voci, 'dex', { dex })), ['Charizard', 'Pikachu', 'Exeggutor']);
});

test('chi il numero non ce l\'ha finisce in fondo, non in cima', () => {
  // L'Allenatore è il caso vero: non è un Pokémon e un numero non ce l'ha.
  const voci = [voce('Amuleto', { categoria: 'Allenatore' }), voce('Pikachu')];
  assert.deepEqual(nomi(ordina(voci, 'dex', { dex })), ['Pikachu', 'Amuleto']);
});

test('a parità di numero decide il nome, così l\'ordine non balla', () => {
  const primo = voce('Pikachu', { numero: '58' });
  const secondo = voce('Pikachu', { numero: '4' });
  const terzo = voce('Charizard', { numero: '4' });
  const uscita = ordina([primo, secondo, terzo], 'dex', { dex });
  assert.deepEqual(nomi(uscita), ['Charizard', 'Pikachu', 'Pikachu']);
  // Rimescolando l'ingresso l'uscita non cambia: è la definizione di stabile.
  assert.deepEqual(nomi(ordina([terzo, primo, secondo], 'dex', { dex })), nomi(uscita));
});

test('per valore si scende dal più caro, e i non quotati stanno in fondo', () => {
  const prezzi = new Map([
    ['Charizard', 120],
    ['Pikachu', 3.5],
  ]);
  const voci = [voce('Exeggutor'), voce('Pikachu'), voce('Charizard')];
  const uscita = ordina(voci, 'valore', { valore: (v) => prezzi.get(v.carta?.nome) ?? null });
  assert.deepEqual(nomi(uscita), ['Charizard', 'Pikachu', 'Exeggutor']);
});

test('per rarità si parte dalla più rara: è quella che si sta cercando', () => {
  const voci = [
    voce('Rara', { rarita: 'Rara' }),
    voce('Comune', { rarita: 'Comune' }),
    voce('Segreta', { rarita: 'Rara segreta' }),
  ];
  assert.deepEqual(nomi(ordina(voci, 'rarita')), ['Segreta', 'Rara', 'Comune']);
});

test('una carta senza rarità resta in fondo anche a ordine invertito', () => {
  // Il verso cambia, il posto di chi non ha il dato no: in cima sembrerebbe la
  // più rara di tutte.
  const voci = [voce('Ignota'), voce('Comune', { rarita: 'Comune' })];
  assert.deepEqual(nomi(ordina(voci, 'rarita')), ['Comune', 'Ignota']);
});

test('per nome è alfabetico in italiano', () => {
  const voci = [voce('Zubat'), voce('Èlectrode'), voce('Abra')];
  assert.deepEqual(nomi(ordina(voci, 'nome')), ['Abra', 'Èlectrode', 'Zubat']);
});

test('l\'ordine "set" non tocca niente: quell\'ordine arriva già fatto', () => {
  const voci = [voce('Zubat'), voce('Abra')];
  const uscita = ordina(voci, 'set');
  assert.deepEqual(nomi(uscita), ['Zubat', 'Abra']);
  // Copia, non lo stesso array: le voci sono condivise fra le viste, e
  // riordinare sul posto riordinerebbe anche quello di chi non ha chiesto
  // niente.
  assert.notEqual(uscita, voci);
});

test('una carta senza dati non fa esplodere nessun criterio', () => {
  const voci = [voce('Pikachu'), voce('ignorata', { carta: null })];
  for (const { codice } of ORDINAMENTI) {
    assert.equal(ordina(voci, codice, { dex }).length, 2, `criterio ${codice}`);
  }
});

test('solo "set" tiene le carte divise per set', () => {
  assert.equal(raggruppaPerSet('set'), true);
  assert.equal(raggruppaPerSet(undefined), true);
  for (const { codice } of ORDINAMENTI.filter((o) => o.codice !== 'set')) {
    assert.equal(raggruppaPerSet(codice), false, codice);
  }
});
