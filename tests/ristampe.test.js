/**
 * Test di `data/ristampe.json`.
 *
 * Il file è generato da `tools/completa-ristampe.mjs` e nessuno lo rilegge: un
 * errore dentro non fa eccezioni, produce carte con attacchi plausibili e
 * sbagliati. E quegli attacchi sono ciò su cui `engine/forza.js` misura tutto,
 * quindi un errore qui sposta in silenzio ogni punteggio dell'app.
 *
 * Si controlla il file **committato**, non lo strumento che lo scrive: quello
 * che finisce nel repo è ciò che la PWA leggerà.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const { ristampe } = JSON.parse(readFileSync('data/ristampe.json', 'utf8'));
const voci = Object.entries(ristampe);

const cache = new Map();
const carteDi = (id) => {
  if (!cache.has(id)) {
    cache.set(id, JSON.parse(readFileSync(`data/set/${id}.json`, 'utf8')).carte ?? []);
  }
  return cache.get(id);
};

test('il file esiste e non è vuoto', () => {
  assert.ok(voci.length > 100, `solo ${voci.length} carte completate: rilancia lo strumento`);
});

test('ogni chiave punta a una carta che esiste davvero', () => {
  for (const [chiave] of voci) {
    const [idSet, numero] = chiave.split('/');
    const carta = carteDi(idSet).find((c) => c.numero === numero);
    assert.ok(carta, `${chiave}: non esiste nel dataset`);
  }
});

test('si completano solo carte che ne hanno bisogno', () => {
  // Se una carta completa finisse qui dentro, i suoi dati veri verrebbero
  // affiancati da quelli di un'altra stampa senza che nessuno lo chieda.
  for (const [chiave] of voci) {
    const [idSet, numero] = chiave.split('/');
    const carta = carteDi(idSet).find((c) => c.numero === numero);
    const completa =
      carta.ps && (carta.attacchi ?? []).some((a) => (a.costo ?? []).length);
    assert.ok(!completa, `${chiave}: era già completa, non andava toccata`);
  }
});

test('ogni voce porta PS e almeno un attacco col costo', () => {
  for (const [chiave, dati] of voci) {
    assert.ok(dati.ps > 0, `${chiave}: senza PS`);
    assert.ok(
      (dati.attacchi ?? []).some((a) => (a.costo ?? []).length),
      `${chiave}: nessun attacco col costo, cioè non serve a niente`,
    );
  }
});

test('ogni voce dichiara da dove vengono i dati', () => {
  // Senza `datiDa`, fra un anno nessuno saprebbe dire se questo Golbat è
  // quello giusto — né come verificarlo.
  for (const [chiave, dati] of voci) {
    assert.match(dati.datiDa ?? '', /^.+\/.+$/, `${chiave}: manca datiDa`);
    const [idSet, numero] = dati.datiDa.split('/');
    assert.ok(
      carteDi(idSet).some((c) => c.numero === numero),
      `${chiave}: datiDa punta a ${dati.datiDa}, che non esiste`,
    );
  }
});

test('i PS non vengono mai sovrascritti quando la carta li dichiara', () => {
  // È la regressione del Lycanroc: 110 PS sulla carta del Kit, 120 sul promo
  // omonimo. Prendendo i PS dell'omonima, il Kit risultava più robusto di
  // quanto è stampato sulle carte che hai in mano.
  for (const [chiave, dati] of voci) {
    const [idSet, numero] = chiave.split('/');
    const carta = carteDi(idSet).find((c) => c.numero === numero);
    if (carta.ps) assert.equal(dati.ps, carta.ps, `${chiave}: PS sovrascritti`);
  }
});

test('le approssimazioni sono dichiarate e restano poche', () => {
  const approssimate = voci.filter(([, d]) => d.approssimati);
  // Quando i PS non coincidono gli attacchi vengono da un'altra stampa: è
  // un'ipotesi, e va marcata. Se questo numero si impenna, la ricerca sta
  // sbagliando stampa e va guardata.
  assert.ok(
    approssimate.length < voci.length * 0.2,
    `${approssimate.length} approssimazioni su ${voci.length}: troppe`,
  );
});

test('tutti i set citati sono presenti nel repository', () => {
  const presenti = new Set(
    readdirSync('data/set')
      .filter((f) => f.endsWith('.json') && f !== 'indice.json')
      .map((f) => f.replace(/\.json$/, '')),
  );
  for (const [chiave, dati] of voci) {
    assert.ok(presenti.has(chiave.split('/')[0]), `${chiave}: set assente`);
    assert.ok(presenti.has(dati.datiDa.split('/')[0]), `${dati.datiDa}: set assente`);
  }
});
