/**
 * Test di filtro e raggruppamento della collezione per serie.
 *
 * Sono le due decisioni che il componente prende prima di disegnare qualunque
 * cosa: quali carte mostrare, e come impilarle. Provate qui, senza DOM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtra, raggruppa, valoriDisponibili, FILTRI_VUOTI } from '../src/ui/griglia-collezione/raggruppa.js';

const sv = { id: 'sv', nome: 'Scarlatto e Violetto' };
const sm = { id: 'sm', nome: 'Sole e Luna' };

const voce = (idSet, numero, nome, extra = {}) => ({
  idSet,
  numero,
  quantita: extra.quantita ?? 1,
  nomeSet: extra.nomeSet ?? idSet,
  serie: extra.serie ?? sv,
  totaleSet: extra.totaleSet ?? 100,
  carta: extra.carta === null ? null : {
    nome,
    categoria: extra.categoria ?? 'Pokémon',
    tipi: extra.tipi ?? ['Erba'],
    stadio: extra.stadio ?? 'Base',
  },
});

const collezione = () => [
  voce('sv08', '001', 'Exeggcute', { nomeSet: 'Scintille Folgoranti', totaleSet: 191 }),
  voce('sv08', '060', 'Magnezone', { nomeSet: 'Scintille Folgoranti', totaleSet: 191, stadio: 'Livello 2', tipi: ['Lampo'], quantita: 2 }),
  voce('sv01', '054', 'Quaquaval', { nomeSet: 'Scarlatto e Violetto', totaleSet: 198, tipi: ['Acqua'] }),
  voce('swsh9', '001', 'Exeggcute', { serie: sm, nomeSet: 'Astri Lucenti', totaleSet: 186 }),
];

test('le serie restano nell\'ordine di arrivo, non in ordine alfabetico', () => {
  // `elencoCompleto()` ordina già per data di uscita: riordinare qui
  // metterebbe "Sole e Luna" prima di "Scarlatto e Violetto" per motivi
  // alfabetici, non storici.
  const gruppi = raggruppa(collezione());
  assert.deepEqual(gruppi.map((g) => g.nome), ['Scarlatto e Violetto', 'Sole e Luna']);
});

test('dentro una serie le carte si dividono per set, coi conteggi', () => {
  const [primaSerie] = raggruppa(collezione());

  assert.deepEqual(primaSerie.set.map((s) => s.nomeSet), ['Scintille Folgoranti', 'Scarlatto e Violetto']);
  const scintille = primaSerie.set[0];
  assert.equal(scintille.distinte, 2, 'due carte diverse');
  assert.equal(scintille.copie, 3, 'di cui una in doppio');
  assert.equal(scintille.totale, 191, 'il riferimento per il completamento');
  assert.equal(primaSerie.distinte, 3, 'la serie somma i suoi set');
});

test('il filtro per serie tiene solo quella scelta', () => {
  const voci = filtra(collezione(), { ...FILTRI_VUOTI, serie: 'sm' });
  assert.equal(voci.length, 1);
  assert.equal(voci[0].nomeSet, 'Astri Lucenti');
});

test('il filtro per set è più stretto di quello per serie', () => {
  const voci = filtra(collezione(), { ...FILTRI_VUOTI, set: 'sv08' });
  assert.deepEqual(voci.map((v) => v.carta.nome), ['Exeggcute', 'Magnezone']);
});

test('i filtri si combinano', () => {
  const voci = filtra(collezione(), { ...FILTRI_VUOTI, serie: 'sv', stadio: 'Livello 2' });
  assert.deepEqual(voci.map((v) => v.carta.nome), ['Magnezone']);
});

test('una carta senza dati sopravvive solo se non filtri i suoi dati', () => {
  // Set non più scaricato: di quella carta non si sa nulla, quindi qualunque
  // filtro sui dati la escluderebbe per forza. Ma senza filtri deve vedersi,
  // o sparirebbe dalla collezione senza spiegazione.
  const voci = [voce('vecchio', '007', null, { carta: null })];
  assert.equal(filtra(voci, FILTRI_VUOTI).length, 1);
  assert.equal(filtra(voci, { ...FILTRI_VUOTI, tipo: 'Erba' }).length, 0);
  // Serie e set però sono scritti sulla riga, non dentro la carta: filtrarli
  // deve continuare a funzionare.
  assert.equal(filtra(voci, { ...FILTRI_VUOTI, set: 'vecchio' }).length, 1);
});

test('i menu dei filtri si riempiono dalla collezione intera', () => {
  const valori = valoriDisponibili(collezione());
  assert.deepEqual(valori.serie.map((s) => s.nome), ['Scarlatto e Violetto', 'Sole e Luna']);
  assert.deepEqual(valori.set.map((s) => s.nome), [
    'Scintille Folgoranti',
    'Scarlatto e Violetto',
    'Astri Lucenti',
  ]);
  assert.deepEqual(valori.stadi, ['Base', 'Livello 2']);
  assert.deepEqual(valori.tipi, ['Acqua', 'Erba', 'Lampo']);
});

test('le voci senza serie finiscono in un gruppo esplicito', () => {
  // Le energie base non appartengono a nessun set reale: senza un gruppo
  // dedicato sparirebbero dalla vista.
  const gruppi = raggruppa([
    {
      idSet: '@base',
      numero: 'Erba',
      quantita: 4,
      nomeSet: 'Energie base',
      totaleSet: null,
      carta: { nome: 'Energia Erba', categoria: 'Energia' },
    },
  ]);
  assert.equal(gruppi[0].nome, 'Altre serie');
  assert.equal(gruppi[0].set[0].totale, null, 'senza riferimento non c\'è completamento');
});
