/**
 * Test del catalogo dei mazzi prefatti.
 *
 * Il file `data/mazzi-prefatti.json` è **generato** da
 * `tools/genera-mazzi-prefatti.mjs`, e questo lo rende pericoloso: un errore
 * dentro non si vede: non rompe niente, non fa eccezioni, produce un numero
 * plausibile e falso. E quel numero è il metro con cui si giudicano tutti i
 * mazzi generati, quindi sbagliarlo sbaglia tutto il resto in silenzio.
 *
 * Qui si controlla il file **committato**, non lo strumento che lo scrive:
 * quello che finisce nel repo è ciò che l'app leggerà.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forza } from '../src/engine/forza.js';
import { eEnergiaBase, tipoEnergia } from '../src/data/energie.js';

const catalogo = JSON.parse(readFileSync('data/mazzi-prefatti.json', 'utf8'));

test('il catalogo esiste e non è vuoto', () => {
  assert.ok(Array.isArray(catalogo.mazzi));
  assert.ok(catalogo.mazzi.length > 0, 'senza mazzi la sezione di confronto sparisce');
});

test('ogni mazzo ha esattamente le carte che dichiara', () => {
  for (const mazzo of catalogo.mazzi) {
    const effettive = mazzo.carte.reduce((s, v) => s + v.quantita, 0);
    assert.equal(
      effettive,
      mazzo.taglia,
      `${mazzo.id}: dichiara ${mazzo.taglia} carte, ne contiene ${effettive}`,
    );
  }
});

test('ogni mazzo è misurabile: senza dati di gioco non è un metro', () => {
  for (const mazzo of catalogo.mazzi) {
    const f = forza(mazzo, { taglia: mazzo.taglia });
    assert.equal(
      f.attendibile,
      true,
      `${mazzo.id}: copertura ${Math.round(f.copertura * 100)}%, sotto la soglia. ` +
        'Rilancia tools/genera-mazzi-prefatti.mjs',
    );
    assert.ok(f.totale > 0 && f.totale <= 100, `${mazzo.id}: forza fuori scala (${f.totale})`);
  }
});

test('le Energie base del catalogo sono riconosciute dal motore', () => {
  // Se `eEnergiaBase()` non le riconoscesse — basta un `tipoEnergia` diverso da
  // 'Base' — il motore misurerebbe zero Energie in un mazzo che ne ha tredici,
  // e la forza del riferimento crollerebbe senza che nulla segnali un errore.
  for (const mazzo of catalogo.mazzi) {
    const energie = mazzo.carte.filter((v) => v.carta.categoria === 'Energia');
    for (const voce of energie) {
      assert.ok(
        eEnergiaBase(voce.carta),
        `${mazzo.id}: ${voce.carta.nome} non è riconosciuta come Energia base`,
      );
      assert.ok(
        tipoEnergia(voce.carta),
        `${mazzo.id}: ${voce.carta.nome} non ha un tipo elementale riconoscibile`,
      );
    }
  }
});

test('i Pokémon hanno PS e almeno un attacco col costo', () => {
  for (const mazzo of catalogo.mazzi) {
    for (const voce of mazzo.carte) {
      if (voce.carta.categoria !== 'Pokémon') continue;
      assert.ok(voce.carta.ps > 0, `${mazzo.id}: ${voce.carta.nome} senza PS`);
      assert.ok(
        (voce.carta.attacchi ?? []).some((a) => (a.costo ?? []).length),
        `${mazzo.id}: ${voce.carta.nome} senza attacchi col costo`,
      );
    }
  }
});

test('i mazzi uniti valgono la somma dei loro pezzi', () => {
  for (const mazzo of catalogo.mazzi) {
    if (!mazzo.unione) continue;
    const pezzi = mazzo.unione.map((id) => catalogo.mazzi.find((m) => m.id === id));
    assert.ok(pezzi.every(Boolean), `${mazzo.id}: unisce mazzi che non sono nel catalogo`);
    assert.equal(
      mazzo.taglia,
      pezzi.reduce((s, p) => s + p.taglia, 0),
      `${mazzo.id}: la taglia non è la somma dei pezzi`,
    );
  }
});

test('un mazzo prefatto è più debole di un mazzo da torneo, e si vede', () => {
  // Àncora di sanità sulla scala: i Kit Allenatore sono mazzi didattici da
  // 2017, pensati per imparare. Se uscissero sopra 50 vorrebbe dire che la
  // taratura di `forza()` è saltata, non che il Kit è diventato forte.
  for (const mazzo of catalogo.mazzi) {
    const f = forza(mazzo, { taglia: mazzo.taglia });
    assert.ok(
      f.totale >= 15 && f.totale <= 50,
      `${mazzo.id}: forza ${f.totale}, fuori dall'intervallo atteso per un mazzo didattico`,
    );
  }
});
