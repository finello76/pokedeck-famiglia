/**
 * Test del bilanciamento fra mazzi: il punto 3 della specifica del motore.
 *
 * La regressione da cui nasce questo file: un mazzo con due linee fino al
 * Livello 2 contro uno di nove Pokémon Base. I mazzi venivano costruiti
 * insieme, ma nessuno verificava che alla fine si somigliassero.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { punteggioMazzo, squilibrio, bilancia } from '../src/engine/bilancia.js';

const pk = (nome, stadio = 'Base', evolveDa = null, tipo = 'Lotta', ps = 60, danno = 20) => ({
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

/**
 * L'indice delle evoluzioni: oltre il primo gradino la catena si ricostruisce
 * da qui, non da `evolveDa` della carta. Senza, Machamp risale a Machoke e si
 * ferma, e la linea risulta spezzata in due tronconi.
 */
const INDICE = { machoke: 'Machop' };

const mazzo = (nome, tipi, voci) => {
  const m = { nome, tipi, carte: voci, totale: 0, composizione: { pokemon: 0, energie: 0, allenatori: 0 } };
  for (const v of voci) {
    m.totale += v.quantita;
    const dove = { 'Pokémon': 'pokemon', Energia: 'energie', Allenatore: 'allenatori' }[v.carta.categoria];
    if (dove) m.composizione[dove] += v.quantita;
  }
  return m;
};

/** Mazzo con una linea completa Machop → Machoke → Machamp. */
const conLinea = () =>
  mazzo('Mazzo 1', ['Lotta'], [
    { carta: pk('Machop'), quantita: 2 },
    { carta: pk('Machoke', 'Livello 1', 'Machop', 'Lotta', 90, 40), quantita: 1 },
    { carta: pk('Machamp', 'Livello 2', 'Machoke', 'Lotta', 150, 60), quantita: 1 },
    { carta: en('Lotta'), quantita: 4 },
  ]);

/**
 * Mazzo con **due** linee: una da tre gradini e una da due.
 *
 * Serve così per provare il riequilibrio: con una linea sola in tutto il piano
 * spostarla non pareggia niente, ribalta soltanto chi è il più forte — e il
 * motore infatti rifiuta lo scambio, com'è giusto.
 */
const conDueLinee = () =>
  mazzo('Mazzo 1', ['Lotta'], [
    { carta: pk('Machop'), quantita: 2 },
    { carta: pk('Machoke', 'Livello 1', 'Machop', 'Lotta', 90, 40), quantita: 1 },
    { carta: pk('Machamp', 'Livello 2', 'Machoke', 'Lotta', 150, 60), quantita: 1 },
    { carta: pk('Sassolino'), quantita: 2 },
    { carta: pk('Roccione', 'Livello 1', 'Sassolino', 'Lotta', 100, 50), quantita: 1 },
    { carta: en('Lotta'), quantita: 5 },
  ]);

/** Mazzo di sole Base, stesso numero di carte. */
const soleBasi = (nome = 'Mazzo 2') =>
  mazzo(nome, ['Lotta'], [
    { carta: pk('Ciottolo'), quantita: 1 },
    { carta: pk('Pietruzza'), quantita: 1 },
    { carta: pk('Roccia'), quantita: 1 },
    { carta: pk('Ghiaia'), quantita: 1 },
    { carta: pk('Sabbia'), quantita: 1 },
    { carta: pk('Argilla'), quantita: 1 },
    { carta: en('Lotta'), quantita: 6 },
  ]);

test('un mazzo che evolve vale più di un mucchio di Base', () => {
  const forte = punteggioMazzo(conLinea());
  const debole = punteggioMazzo(soleBasi());

  assert.ok(forte.totale > debole.totale, `${forte.totale} > ${debole.totale}`);
  assert.ok(forte.evoluzione > 0, 'i gradini evolutivi si contano');
  assert.equal(debole.evoluzione, 0, 'il mazzo piatto non ne ha');
});

test('un Livello 2 senza la sua linea non conta come evoluzione', () => {
  // È una carta morta in mano, non una carta forte: il punteggio non deve
  // premiarla, o il bilanciamento inseguirebbe un valore che non c'è.
  const orfano = mazzo('Solo', ['Lotta'], [
    { carta: pk('Machamp', 'Livello 2', 'Machoke', 'Lotta', 150, 60), quantita: 1 },
    { carta: en('Lotta'), quantita: 4 },
  ]);
  assert.equal(punteggioMazzo(orfano).evoluzione, 0);
});

test('le energie del tipo sbagliato abbassano la coerenza', () => {
  const coerente = punteggioMazzo(conLinea()).coerenza;
  const m = conLinea();
  m.carte[3] = { carta: en('Acqua'), quantita: 4 };
  assert.ok(punteggioMazzo(m).coerenza < coerente);
});

test('squilibrio indica quale mazzo è il più forte e di quanto', () => {
  const e = squilibrio([soleBasi(), conLinea()]);
  assert.equal(e.migliore, 1);
  assert.equal(e.peggiore, 0);
  assert.ok(e.differenza > 0);
});

test('bilancia sposta una linea intera dal mazzo forte al debole', () => {
  const mazzi = [conDueLinee(), soleBasi()];
  const prima = squilibrio(mazzi).differenza;
  const scambi = bilancia(mazzi, { indiceEvoluzioni: INDICE, soglia: 5 });

  assert.ok(scambi.length > 0, 'uno scambio è stato fatto');
  assert.ok(squilibrio(mazzi).differenza < prima, 'i mazzi si sono avvicinati');
  assert.ok(mazzi[1].carte.some((c) => c.carta.stadio !== 'Base'), 'il mazzo debole ora evolve');

  // Quale linea si sposti lo decide la misura, non una regola a priori: qui si
  // verifica l'invariante che vale sempre — nessuna linea esce spezzata.
  for (const m of mazzi) {
    const presenti = new Set(m.carte.map((c) => c.carta.nome));
    for (const voce of m.carte) {
      if (!voce.carta.evolveDa) continue;
      assert.ok(
        presenti.has(voce.carta.evolveDa),
        `${m.nome}: ${voce.carta.nome} è rimasto senza ${voce.carta.evolveDa}`,
      );
    }
  }
});

test('una linea sola in due mazzi non si sposta: ribalterebbe soltanto lo squilibrio', () => {
  const mazzi = [conLinea(), soleBasi()];
  const prima = squilibrio(mazzi).differenza;
  assert.deepEqual(bilancia(mazzi, { indiceEvoluzioni: INDICE, soglia: 5 }), []);
  assert.equal(squilibrio(mazzi).differenza, prima, 'i mazzi sono rimasti com\'erano');
});

test('bilancia non tocca mazzi già pari', () => {
  const mazzi = [conDueLinee(), conDueLinee()];
  mazzi[1].nome = 'Mazzo 2';
  assert.deepEqual(bilancia(mazzi, { indiceEvoluzioni: INDICE }), []);
});

test('lo scambio non cambia il numero di carte dei mazzi', () => {
  const mazzi = [conDueLinee(), soleBasi()];
  const totali = mazzi.map((m) => m.totale);
  bilancia(mazzi, { indiceEvoluzioni: INDICE, soglia: 5 });

  assert.deepEqual(mazzi.map((m) => m.totale), totali, 'le taglie restano quelle');
  for (const m of mazzi) {
    assert.equal(
      m.carte.reduce((s, c) => s + c.quantita, 0),
      m.totale,
      `${m.nome}: il totale dichiarato coincide con le carte presenti`,
    );
  }
});
