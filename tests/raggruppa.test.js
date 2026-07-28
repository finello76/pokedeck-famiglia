/**
 * Test di filtro e raggruppamento della collezione per serie.
 *
 * Sono le due decisioni che il componente prende prima di disegnare qualunque
 * cosa: quali carte mostrare, e come impilarle. Provate qui, senza DOM.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtra, progressoSet, raggruppa, valoriDisponibili, FILTRI_VUOTI } from '../src/ui/griglia-collezione/raggruppa.js';

const sv = { id: 'sv', nome: 'Scarlatto e Violetto' };
const sm = { id: 'sm', nome: 'Sole e Luna' };

const voce = (idSet, numero, nome, extra = {}) => ({
  idSet,
  numero,
  quantita: extra.quantita ?? 1,
  nomeSet: extra.nomeSet ?? idSet,
  serie: extra.serie ?? sv,
  totaleSet: extra.totaleSet ?? 100,
  uscitaSet: extra.uscitaSet ?? null,
  carta: extra.carta === null ? null : {
    nome,
    categoria: extra.categoria ?? 'Pokémon',
    tipi: extra.tipi ?? ['Erba'],
    stadio: extra.stadio ?? 'Base',
  },
});

const collezione = () => [
  voce('sv08', '001', 'Exeggcute', { nomeSet: 'Scintille Folgoranti', totaleSet: 191, uscitaSet: '2024-11-08' }),
  voce('sv08', '060', 'Magnezone', { nomeSet: 'Scintille Folgoranti', totaleSet: 191, uscitaSet: '2024-11-08', stadio: 'Livello 2', tipi: ['Lampo'], quantita: 2 }),
  voce('sv01', '054', 'Quaquaval', { nomeSet: 'Scarlatto e Violetto', totaleSet: 198, uscitaSet: '2023-03-31', tipi: ['Acqua'] }),
  voce('swsh9', '001', 'Exeggcute', { serie: sm, nomeSet: 'Astri Lucenti', totaleSet: 186, uscitaSet: '2022-02-25' }),
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

test('un set coi dati parziali si conta sulle carte che esistono davvero', () => {
  // Kit Allenatore Sole e Luna: numerato fino a 30, ma le carte diverse sono
  // 19 (energie e Pozione ripetute). Chi ha il kit intero deve leggere 19/19,
  // non 19/30 con undici "mancanti" che non esistono da nessuna parte.
  assert.deepEqual(progressoSet({ distinte: 19, totale: 30, ufficiali: 19 }), {
    riferimento: 19,
    pct: 100,
    parziale: true,
  });
  // A metà kit il conteggio resta sulle 19 note.
  assert.deepEqual(progressoSet({ distinte: 10, totale: 30, ufficiali: 19 }), {
    riferimento: 19,
    pct: 53,
    parziale: true,
  });
});

test('un set coi dati completi si conta sul totale ufficiale', () => {
  // Qui il totale è quello stampato sulla carta: le segrete oltre la
  // numerazione non devono gonfiare il denominatore.
  assert.deepEqual(progressoSet({ distinte: 2, totale: 191, ufficiali: 191 }), {
    riferimento: 191,
    pct: 1,
    parziale: false,
  });
  // Dato mancante (indice vecchio): si torna al totale, senza etichetta.
  assert.equal(progressoSet({ distinte: 2, totale: 100, ufficiali: null }).riferimento, 100);
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
  // I set, a differenza delle serie, si riordinano: dal più vecchio, con
  // l'anno che il menu mostra fra parentesi.
  assert.deepEqual(valori.set.map((s) => `${s.nome} (${s.anno})`), [
    'Astri Lucenti (2022)',
    'Scarlatto e Violetto (2023)',
    'Scintille Folgoranti (2024)',
  ]);
  assert.deepEqual(valori.stadi, ['Base', 'Livello 2']);
  assert.deepEqual(valori.tipi, ['Acqua', 'Erba', 'Lampo']);
});

test('i set senza data di uscita restano in fondo al menu', () => {
  // Le Energie base non escono in nessun set, e i dati vecchi possono non
  // avere ancora la data: messi in cima sembrerebbero antichissimi.
  const valori = valoriDisponibili([
    ...collezione(),
    voce('@base', 'Erba', 'Energia Erba', { nomeSet: 'Energie base', categoria: 'Energia' }),
  ]);
  assert.deepEqual(valori.set.map((s) => s.nome), [
    'Astri Lucenti',
    'Scarlatto e Violetto',
    'Scintille Folgoranti',
    'Energie base',
  ]);
  assert.equal(valori.set.at(-1).anno, null, 'senza data non c\'è anno da mostrare');
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

test('il filtro per formato usa i campi timbrati dal dataset', () => {
  const conFormato = [
    voce('sv09', '001', 'Caterpie', { carta: undefined }),
    voce('xy6', '077', 'Shaymin EX'),
    voce('sv08', '252', 'Energia Jet', { categoria: 'Energia' }),
  ];
  // I campi li mette `data/dataset.js` al caricamento del set: qui si simulano.
  conFormato[0].carta.marchio = 'I';
  conFormato[0].carta.espansa = true;
  conFormato[1].carta.marchio = null; // bandita: il set è legale, lei no
  conFormato[1].carta.espansa = false;
  conFormato[2].carta.marchio = 'G'; // marchio ruotato fuori
  conFormato[2].carta.espansa = true;

  const nomi = (formato) =>
    filtra(conFormato, { ...FILTRI_VUOTI, formato }).map((v) => v.carta.nome);

  assert.deepEqual(nomi('standard'), ['Caterpie']);
  assert.deepEqual(nomi('expanded'), ['Energia Jet']);
  assert.deepEqual(nomi('fuori'), ['Shaymin EX']);
  assert.equal(nomi('').length, 3, 'senza filtro restano tutte');
});

test('una carta mai timbrata non passa il filtro per formato', () => {
  // "Non lo so" non è "sì": chi chiede le Standard vuole un elenco su cui
  // fidarsi. La carta resta però visibile senza quel filtro.
  const ignota = [voce('sv09', '001', 'Caterpie')];
  assert.equal(filtra(ignota, { ...FILTRI_VUOTI, formato: 'standard' }).length, 0);
  assert.equal(filtra(ignota, { ...FILTRI_VUOTI, formato: 'fuori' }).length, 0);
  assert.equal(filtra(ignota, FILTRI_VUOTI).length, 1);
});

test('il menu Tornei elenca solo i formati presenti in collezione', () => {
  const carte = collezione();
  carte[0].carta.marchio = 'I';
  carte[0].carta.espansa = true;
  carte[1].carta.marchio = null;
  carte[1].carta.espansa = false;
  // Le altre due restano senza timbro: non devono inventare una voce di menu.
  assert.deepEqual(
    valoriDisponibili(carte).formati.map((f) => f.codice),
    ['standard', 'fuori'],
  );
});
