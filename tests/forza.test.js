/**
 * Test della forza assoluta di un mazzo.
 *
 * La proprietà che conta più di tutte è l'**invarianza di taglia**: è l'intera
 * ragione per cui questo modulo esiste accanto a `bilancia.js`. Se un mazzo da
 * 60 prendesse più di uno da 30 costruito con le stesse proporzioni, non si
 * potrebbe confrontare un mazzo generato col Kit Allenatore che sta in salotto,
 * e tanto varrebbe usare `punteggioMazzo()`.
 *
 * La seconda è la difesa dai dati bucati: i set Kit Allenatore hanno gli
 * attacchi senza `costo`, e trattarlo come 1 gonfierebbe la forza proprio dei
 * mazzi che servono da metro.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  forza,
  forzaMedia,
  confronta,
  probabilitaAlmenoUna,
  TETTI,
  COPERTURA_MINIMA,
} from '../src/engine/forza.js';

const pk = (nome, opzioni = {}) => ({
  nome,
  numero: nome,
  idSet: 'prova',
  categoria: 'Pokémon',
  stadio: opzioni.stadio ?? 'Base',
  evolveDa: opzioni.evolveDa ?? null,
  tipi: [opzioni.tipo ?? 'Lotta'],
  ps: opzioni.ps ?? 60,
  attacchi:
    opzioni.attacchi ??
    [{ nome: 'Colpo', costo: Array(opzioni.costo ?? 2).fill(opzioni.tipo ?? 'Lotta'), danno: opzioni.danno ?? 40 }],
});

const en = (tipo = 'Lotta') => ({
  nome: `Energia ${tipo}`,
  numero: tipo,
  idSet: '@base',
  categoria: 'Energia',
  tipoEnergia: 'Base',
});

const mazzo = (voci) => ({
  nome: 'Prova',
  carte: voci,
  totale: voci.reduce((s, v) => s + v.quantita, 0),
});

/** Un mazzo da 30 con proporzioni sensate: 12 Pokémon, 8 Energie, 10 Allenatori. */
const trenta = () =>
  mazzo([
    { carta: pk('Machop'), quantita: 4 },
    { carta: pk('Rockruff'), quantita: 4 },
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop', ps: 90, danno: 60 }), quantita: 4 },
    { carta: en(), quantita: 8 },
    { carta: { nome: 'Mega Ball', numero: '1', categoria: 'Allenatore' }, quantita: 10 },
  ]);

/** Lo stesso mazzo raddoppiato: 60 carte, identiche proporzioni. */
const sessanta = () => {
  const doppio = trenta();
  doppio.carte = doppio.carte.map((v) => ({ ...v, quantita: v.quantita * 2 }));
  doppio.totale = 60;
  return doppio;
};

test('la forza non dipende dalla taglia: 30 e 60 con le stesse proporzioni si equivalgono', () => {
  const a = forza(trenta()).totale;
  const b = forza(sessanta()).totale;
  assert.ok(
    Math.abs(a - b) <= 2,
    `un 30 e il suo doppio devono valere uguale, invece ${a} contro ${b}`,
  );
});

test('è proprio ciò che punteggioMazzo non sa fare (controprova)', async () => {
  const { punteggioMazzo } = await import('../src/engine/bilancia.js');
  const a = punteggioMazzo(trenta()).totale;
  const b = punteggioMazzo(sessanta()).totale;
  assert.ok(b > a * 1.5, 'il punteggio relativo deve crescere con la taglia');
});

test('la forza sta sempre fra 0 e 100', () => {
  const mostri = mazzo([
    { carta: pk('Mostro', { ps: 400, danno: 300, costo: 1 }), quantita: 20 },
    { carta: en(), quantita: 10 },
  ]);
  const f = forza(mostri);
  assert.ok(f.totale >= 0 && f.totale <= 100, `fuori scala: ${f.totale}`);
  assert.equal(f.offesa, 1, 'il tetto dell\'offesa deve saturare');
  assert.equal(f.resistenza, 1, 'il tetto della resistenza deve saturare');
});

test('un mazzo vuoto o senza Pokémon vale zero e non è attendibile', () => {
  assert.equal(forza({ carte: [] }).totale, 0);
  assert.equal(forza({ carte: [] }).attendibile, false);
  assert.equal(forza(undefined).totale, 0);
  assert.equal(forza(mazzo([{ carta: en(), quantita: 10 }])).totale, 0);
});

test('un attacco con costo vuoto viene ignorato, non diviso per 1', () => {
  // È il caso dei set Kit Allenatore: `costo: []`. Se lo si trattasse come
  // costo 1, questa carta darebbe 60 di danno per energia contro i 30 veri.
  const bucato = mazzo([
    { carta: pk('Senza costo', { attacchi: [{ nome: 'Colpo', costo: [], danno: 60 }] }), quantita: 4 },
    { carta: pk('Completo', { costo: 2, danno: 60 }), quantita: 4 },
    { carta: en(), quantita: 4 },
  ]);
  const f = forza(bucato);
  // Solo la carta completa è misurata: 60/2 = 30 su un tetto di 55.
  assert.ok(Math.abs(f.offesa - 30 / TETTI.dannoPerEnergia) < 0.001, `offesa ${f.offesa}`);
  assert.equal(f.copertura, 0.5, 'metà delle copie non è misurabile');
});

test('sotto la copertura minima il risultato si dichiara non attendibile', () => {
  const senzaAttacchi = mazzo([
    { carta: pk('Muto1', { attacchi: [] }), quantita: 6 },
    { carta: pk('Parlante', { costo: 2, danno: 40 }), quantita: 2 },
    { carta: en(), quantita: 4 },
  ]);
  const f = forza(senzaAttacchi);
  assert.equal(f.copertura, 0.25);
  assert.ok(f.copertura < COPERTURA_MINIMA);
  assert.equal(f.attendibile, false);
  assert.ok(f.totale > 0, 'non attendibile non vuol dire zero: gli altri indicatori valgono');
});

test('le carte proxy senza PS non abbassano la resistenza', () => {
  // Il generatore crea le pre-evoluzioni da stampare con `cartaDaStampare()`:
  // hanno nome, stadio e tipo, ma né PS né attacchi. Su una collezione di
  // famiglia sono la maggioranza dei Pokémon di un mazzo, e contarle zero
  // faceva sembrare fragile ogni mazzo che evolve davvero.
  const stampata = { nome: 'Machop', numero: null, categoria: 'Pokémon', stadio: 'Base', tipi: ['Lotta'] };
  const senzaProxy = mazzo([
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop', ps: 90 }), quantita: 4 },
    { carta: en(), quantita: 4 },
  ]);
  const conProxy = mazzo([
    { carta: stampata, quantita: 4, proxy: true },
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop', ps: 90 }), quantita: 4 },
    { carta: en(), quantita: 4 },
  ]);
  assert.equal(forza(conProxy).resistenza, forza(senzaProxy).resistenza);
  assert.ok(forza(conProxy).resistenza > 0.35, 'con soli PS da 90 la resistenza non può essere bassa');
});

test('una linea evolutiva completa vale più della stessa carta orfana', () => {
  const conBase = mazzo([
    { carta: pk('Machop'), quantita: 4 },
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop' }), quantita: 4 },
    { carta: en(), quantita: 4 },
  ]);
  const orfano = mazzo([
    { carta: pk('Rockruff'), quantita: 4 },
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop' }), quantita: 4 },
    { carta: en(), quantita: 4 },
  ]);
  assert.ok(forza(conBase).struttura > forza(orfano).struttura);
  assert.equal(forza(orfano).struttura, 0, 'un\'evoluzione senza la sua Base non è struttura');
});

test('le Energie del tipo sbagliato non alimentano niente', () => {
  const giuste = mazzo([
    { carta: pk('Machop', { tipo: 'Lotta' }), quantita: 8 },
    { carta: en('Lotta'), quantita: 4 },
    { carta: { nome: 'Mega Ball', numero: '1', categoria: 'Allenatore' }, quantita: 8 },
  ]);
  const sbagliate = mazzo([
    { carta: pk('Machop', { tipo: 'Lotta' }), quantita: 8 },
    { carta: en('Acqua'), quantita: 4 },
    { carta: { nome: 'Mega Ball', numero: '1', categoria: 'Allenatore' }, quantita: 8 },
  ]);
  assert.ok(forza(giuste).motore > 0.5);
  assert.equal(forza(sbagliate).motore, 0, 'nessun Pokémon servito → motore fermo');
});

test('il motore penalizza sia troppe Energie sia troppo poche', () => {
  const poche = mazzo([
    { carta: pk('Machop'), quantita: 18 },
    { carta: en(), quantita: 1 },
    { carta: { nome: 'Mega Ball', numero: '1', categoria: 'Allenatore' }, quantita: 11 },
  ]);
  const giuste = mazzo([
    { carta: pk('Machop'), quantita: 12 },
    { carta: en(), quantita: 7 },
    { carta: { nome: 'Mega Ball', numero: '1', categoria: 'Allenatore' }, quantita: 11 },
  ]);
  const troppe = mazzo([
    { carta: pk('Machop'), quantita: 8 },
    { carta: en(), quantita: 22 },
  ]);
  assert.ok(forza(giuste).motore > forza(poche).motore);
  assert.ok(forza(giuste).motore > forza(troppe).motore);
});

test('più Pokémon Base, più è probabile aprire la partita', () => {
  const pochi = mazzo([
    { carta: pk('Machop'), quantita: 1 },
    { carta: pk('Machoke', { stadio: 'Livello 1', evolveDa: 'Machop' }), quantita: 11 },
    { carta: en(), quantita: 8 },
    { carta: { nome: 'Mega Ball', numero: '1', categoria: 'Allenatore' }, quantita: 10 },
  ]);
  assert.ok(forza(trenta()).costanza > forza(pochi).costanza);
  assert.ok(forza(trenta()).costanza > 0.9, 'con 8 Base su 30 si apre nove volte su dieci');
});

test('probabilitaAlmenoUna: casi limite e un valore noto', () => {
  assert.equal(probabilitaAlmenoUna(60, 0, 7), 0);
  assert.equal(probabilitaAlmenoUna(60, 60, 7), 1);
  assert.equal(probabilitaAlmenoUna(0, 3, 7), 0);
  // Una copia sola: la probabilità è esattamente mano/totale, e si verifica a mente.
  assert.ok(Math.abs(probabilitaAlmenoUna(30, 1, 7) - 7 / 30) < 1e-12);
  // 60 carte, 8 favorevoli, mano da 7: ≈ 65%, il valore classico del gioco.
  const p = probabilitaAlmenoUna(60, 8, 7);
  assert.ok(p > 0.65 && p < 0.66, `atteso ~0,65, ottenuto ${p}`);
});

test('il danno scritto "10+" o "40×" non diventa zero', () => {
  const modificato = mazzo([
    { carta: pk('Piu', { attacchi: [{ nome: 'Colpo', costo: ['Lotta'], danno: '40+' }] }), quantita: 4 },
    { carta: en(), quantita: 4 },
  ]);
  const secco = mazzo([
    { carta: pk('Secco', { attacchi: [{ nome: 'Colpo', costo: ['Lotta'], danno: 40 }] }), quantita: 4 },
    { carta: en(), quantita: 4 },
  ]);
  assert.equal(forza(modificato).offesa, forza(secco).offesa);
  assert.ok(forza(modificato).offesa > 0);
});

test('forzaMedia riassume un piano, e basta un mazzo cieco a renderlo inattendibile', () => {
  const cieco = mazzo([
    { carta: pk('Muto', { attacchi: [] }), quantita: 12 },
    { carta: en(), quantita: 8 },
  ]);
  const buono = forzaMedia([trenta(), trenta()]);
  assert.equal(buono.media, forza(trenta()).totale);
  assert.equal(buono.attendibile, true);
  assert.equal(forzaMedia([trenta(), cieco]).attendibile, false);
  assert.equal(forzaMedia([]).media, 0);
});

test('il generatore e il misuratore vogliono la stessa quota di Energie', async () => {
  // La regressione che questo test blocca: `proporzioni.js` costruiva i mazzi
  // con un terzo di Energie mentre `forza()` ne voleva il 22%, e ogni mazzo
  // generato perdeva un quarto del proprio `motore` per costruzione — cinque
  // punti di forza, sempre, senza che nessuno sbagliasse niente.
  //
  // Non si confrontano le costanti (sarebbe una tautologia: sono la stessa
  // variabile importata) ma il **risultato**: un mazzo composto secondo
  // `composizione()` dev'essere giudicato bene da `forza()`.
  const { composizione } = await import('../src/engine/proporzioni.js');

  for (const taglia of [15, 20, 30, 60]) {
    for (const costo of [1, 2, 3]) {
      const quota = composizione(
        taglia,
        { pokemon: 999, energie: 999, allenatori: 999 },
        { costoMedio: costo },
      );
      const m = mazzo([
        { carta: pk('Attaccante', { costo, danno: 40 }), quantita: quota.pokemon },
        { carta: en('Lotta'), quantita: quota.energie },
        { carta: { nome: 'Mega Ball', numero: '1', categoria: 'Allenatore' }, quantita: quota.allenatori },
      ]);
      const { motore } = forza(m, { taglia });
      assert.ok(
        motore > 0.85,
        `taglia ${taglia}, costo ${costo}: motore ${motore.toFixed(2)} — ` +
          'le proporzioni di costruzione non soddisfano il misuratore',
      );
    }
  }
});

test('confronta traduce lo scarto in una frase da leggere prima di giocare', () => {
  assert.equal(confronta(45, 45).verso, 'pari');
  assert.equal(confronta(49, 45).verso, 'pari', 'sotto i 5 punti non si sente giocando');
  assert.equal(confronta(80, 45).verso, 'sopra');
  assert.equal(confronta(80, 45).testo, 'nettamente più forte');
  assert.equal(confronta(35, 45).testo, 'un po\' più debole');
});
