/**
 * Test dei proxy: le carte stampabili che colmano i buchi della collezione.
 *
 * Il criterio guida: chi attiva i proxy nel wizard deve ritrovarseli DENTRO i
 * mazzi, contrassegnati, e non deve più vedere le regole della casa
 * compensative che i proxy rendono inutili. La regressione da cui nasce questo
 * file: le opzioni esistevano ma la generazione non produceva nulla.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pianifica, carteConDeroga } from '../src/engine/pianifica.js';
import { proxyEnergia, proxyPokemon, integraProxy, QUOTA_PROXY_POKEMON } from '../src/engine/proxy.js';

const pk = (nome, tipo, stadio = 'Base', evolveDa = null, quantita = 1, numero = nome) => ({
  carta: {
    nome,
    numero,
    idSet: 'prova',
    categoria: 'Pokémon',
    stadio,
    evolveDa,
    tipi: [tipo],
    ps: 100,
    attacchi: [{ nome: 'Colpo', costo: [tipo], danno: 30 }],
  },
  quantita,
});
const en = (tipo, quantita) => ({
  carta: {
    nome: `Energia ${tipo}`,
    numero: tipo,
    idSet: '@base',
    categoria: 'Energia',
    tipoEnergia: 'Base',
  },
  quantita,
});
const al = (nome, quantita) => ({
  carta: { nome, numero: nome, idSet: 'prova', categoria: 'Allenatore' },
  quantita,
});

test('senza opzioni proxy non compare nessuna carta proxy', () => {
  const p = pianifica([pk('Pikachu', 'Lampo', 'Base', null, 4), en('Fuoco', 8)], {
    taglia: 12,
    numeroMazzi: 1,
  });
  assert.equal(p.proxy.length, 0);
  assert.ok(p.mazzi[0].carte.every((c) => !c.proxy));
});

test('le Energie proxy vengono generate e finiscono nel mazzo, contrassegnate', () => {
  // Mazzo di tipo Lampo ma solo Energie Fuoco: senza proxy scatterebbe la
  // regola dell\'energia universale.
  const voci = [pk('Pikachu', 'Lampo', 'Base', null, 4), en('Fuoco', 8)];
  const p = pianifica(voci, { taglia: 12, numeroMazzi: 1, proxyEnergia: true });

  const vociProxy = p.mazzi[0].carte.filter((c) => c.proxy);
  assert.ok(vociProxy.length > 0, 'il mazzo deve contenere voci proxy');
  assert.ok(
    vociProxy.some((c) => c.carta.nome === 'Energia Lampo'),
    'il proxy è del tipo del mazzo',
  );
  assert.ok(vociProxy.every((c) => c.motivo?.length > 0), 'ogni proxy spiega perché esiste');
  assert.ok(p.proxy.length > 0, 'il piano espone la lista dei proxy per il foglio di stampa');
});

test('le Energie proxy sostituiscono le energie fuori tipo senza sforare la taglia', () => {
  const voci = [pk('Pikachu', 'Lampo', 'Base', null, 4), en('Fuoco', 20)];
  const p = pianifica(voci, { taglia: 12, numeroMazzi: 1, proxyEnergia: true });
  assert.ok(p.mazzi[0].totale <= 12, `taglia rispettata (${p.mazzi[0].totale})`);
  assert.ok(
    !p.regole.some((r) => r.codice === 'energia-universale'),
    'con i proxy non serve la regola compensativa',
  );
  assert.ok(
    !p.regole.some((r) => r.codice === 'costi-ridotti'),
    'nemmeno la riduzione dei costi: le energie mancanti si stampano',
  );
});

test('i proxy Pokémon stampano la pre-evoluzione e sciolgono la deroga', () => {
  const voci = [pk('Zweilous', 'Oscurità', 'Livello 1', 'Deino', 4), en('Oscurità', 10)];
  const p = pianifica(voci, { taglia: 10, numeroMazzi: 1, proxyPokemon: true });

  const deino = p.mazzi[0].carte.find((c) => c.carta.nome === 'Deino');
  assert.ok(deino, 'la pre-evoluzione mancante entra nel mazzo come proxy');
  assert.ok(deino.proxy, 'ed è contrassegnata');
  assert.equal(deino.carta.stadio, 'Base', 'lo stadio si deduce dall\'evoluzione servita');
  assert.deepEqual(deino.carta.tipi, ['Oscurità'], 'il tipo si copia dall\'evoluzione');

  assert.ok(
    !p.regole.some((r) => r.codice === 'evoluzioni-come-base'),
    'con la linea completata dal proxy la regola della casa non serve più',
  );
  assert.equal(
    carteConDeroga(p.mazzi[0], p.permessi, p.carenze).size,
    0,
    'nessuna carta resta contrassegnata come deroga',
  );
});

test('una pre-evoluzione sconosciuta non produce proxy e tiene viva la regola', () => {
  // Il 41% delle evoluzioni del dataset non dichiara evolveDa: di quelle carte
  // si sa che sono orfane ma non cosa stampare.
  const voci = [pk('Krookodile', 'Oscurità', 'Livello 2', null, 2), en('Oscurità', 10)];
  const p = pianifica(voci, { taglia: 10, numeroMazzi: 1, proxyPokemon: true });

  assert.ok(
    !p.proxy.some((x) => x.genere === 'pokemon'),
    'senza nome non si può stampare nulla',
  );
  assert.ok(
    p.regole.some((r) => r.codice === 'evoluzioni-come-base'),
    'la regola resta: è l\'unico modo di giocare quella carta',
  );
  assert.ok(
    p.proxyScartati.some((s) => s.ragione === 'pre-evoluzione sconosciuta'),
    'lo scarto viene motivato',
  );
});

test('la quota massima di proxy Pokémon viene rispettata', () => {
  const mazzi = [
    {
      nome: 'Mazzo 1',
      tipi: ['Erba'],
      totale: 6,
      composizione: { pokemon: 6, energie: 0, allenatori: 0 },
      carte: [
        { carta: pk('A2', 'Erba', 'Livello 1', 'A1').carta, quantita: 2 },
        { carta: pk('B2', 'Erba', 'Livello 1', 'B1').carta, quantita: 2 },
        { carta: pk('C2', 'Erba', 'Livello 1', 'C1').carta, quantita: 2 },
      ],
    },
  ];
  const carenze = [
    {
      codice: 'orfani-nel-mazzo',
      mazzo: 'Mazzo 1',
      dati: {
        orfani: [
          { nome: 'A2', manca: 'A1', stadio: 'Livello 1' },
          { nome: 'B2', manca: 'B1', stadio: 'Livello 1' },
          { nome: 'C2', manca: 'C1', stadio: 'Livello 1' },
        ],
      },
    },
  ];
  const taglia = 15; // tetto: floor(15 * 0.15) = 2
  const { proxy, scartati } = proxyPokemon(mazzi, carenze, taglia);
  assert.equal(proxy.length, Math.floor(taglia * QUOTA_PROXY_POKEMON));
  assert.ok(scartati.some((s) => s.ragione === 'quota proxy superata'));
});

test('integraProxy toglie i doppioni meno preziosi, mai le linee evolutive', () => {
  const mazzo = {
    nome: 'Mazzo 1',
    tipi: ['Erba'],
    totale: 6,
    composizione: { pokemon: 4, energie: 0, allenatori: 2 },
    carte: [
      { carta: pk('Evo', 'Erba', 'Livello 1', 'Cucciolo').carta, quantita: 2 },
      { carta: pk('Solitario', 'Erba', 'Base').carta, quantita: 2 },
      al('Pozione', 2),
    ],
  };

  integraProxy(
    [mazzo],
    [{ genere: 'pokemon', nome: 'Cucciolo', mazzo: 'Mazzo 1', quantita: 1, motivo: 'test' }],
    6,
  );

  assert.ok(mazzo.carte.some((c) => c.proxy && c.carta.nome === 'Cucciolo'));
  assert.equal(mazzo.totale, 6, 'la taglia non cambia');
  const pozione = mazzo.carte.find((c) => c.carta.nome === 'Pozione');
  assert.equal(pozione.quantita, 1, 'a fare spazio è il doppione di Allenatore');
  assert.equal(
    mazzo.carte.find((c) => c.carta.nome === 'Evo').quantita,
    2,
    'le carte della linea evolutiva non si toccano',
  );
});

test('proxyEnergia riconosce i tipi anche quando il nome non coincide', () => {
  // "Energia Combattimento" è di tipo Lotta: contarla come mancante sarebbe
  // un falso buco, e produrrebbe proxy inutili.
  const mazzi = [
    {
      nome: 'Mazzo 1',
      tipi: ['Lotta'],
      totale: 8,
      composizione: { pokemon: 4, energie: 4, allenatori: 0 },
      carte: [
        { carta: pk('Machop', 'Lotta').carta, quantita: 4 },
        {
          carta: {
            nome: 'Energia Combattimento',
            categoria: 'Energia',
            tipoEnergia: 'Base',
          },
          quantita: 4,
        },
      ],
    },
  ];
  const proxy = proxyEnergia(mazzi, 8);
  assert.equal(proxy.length, 0, 'le 4 Energie Combattimento coprono il fabbisogno (8/4=2)');
});

test('un Livello 2 orfano fa stampare l\'intera catena, non solo un anello', () => {
  // È il difetto visto sui mazzi veri: possedendo solo Pawmot (Livello 2) si
  // stampava Pawmo (Livello 1), che restava a sua volta orfano — un proxy che
  // non serviva a niente. Con l'indice si risale fino alla Base.
  const mazzi = [
    {
      nome: 'Mazzo 1',
      tipi: ['Lampo'],
      totale: 4,
      composizione: { pokemon: 2, energie: 2, allenatori: 0 },
      carte: [{ carta: pk('Pawmot', 'Lampo', 'Livello 2', 'Pawmo').carta, quantita: 2 }],
    },
  ];
  const carenze = [
    {
      codice: 'orfani-nel-mazzo',
      mazzo: 'Mazzo 1',
      dati: { orfani: [{ nome: 'Pawmot', manca: 'Pawmo', stadio: 'Livello 2' }] },
    },
  ];
  const indice = { pawmo: 'Pawmi' }; // Pawmo evolve da Pawmi (la Base)
  const { proxy } = proxyPokemon(mazzi, carenze, 15, indice);
  const nomi = proxy.map((p) => p.nome);
  assert.deepEqual(nomi, ['Pawmo', 'Pawmi'], 'stampa sia il Livello 1 sia la Base');
});

test('la catena proxy non ristampa ciò che è già nel mazzo', () => {
  // Se la Base c'è ma manca solo il Livello 1, si stampa solo quello.
  const mazzi = [
    {
      nome: 'Mazzo 1',
      tipi: ['Lampo'],
      totale: 4,
      composizione: { pokemon: 3, energie: 1, allenatori: 0 },
      carte: [
        { carta: pk('Pawmot', 'Lampo', 'Livello 2', 'Pawmo').carta, quantita: 1 },
        { carta: pk('Pawmi', 'Lampo', 'Base').carta, quantita: 2 },
      ],
    },
  ];
  const carenze = [
    {
      codice: 'orfani-nel-mazzo',
      mazzo: 'Mazzo 1',
      dati: { orfani: [{ nome: 'Pawmot', manca: 'Pawmo', stadio: 'Livello 2' }] },
    },
  ];
  const { proxy } = proxyPokemon(mazzi, carenze, 15, { pawmo: 'Pawmi' });
  assert.deepEqual(proxy.map((p) => p.nome), ['Pawmo'], 'Pawmi è già nel mazzo');
});

test('la catena si stampa intera o niente, se la quota non basta', () => {
  // Mezza catena non rende giocabile l'orfano: occuperebbe la quota per nulla.
  const mazzi = [
    {
      nome: 'Mazzo 1',
      tipi: ['Lampo'],
      totale: 2,
      composizione: { pokemon: 2, energie: 0, allenatori: 0 },
      carte: [{ carta: pk('Pawmot', 'Lampo', 'Livello 2', 'Pawmo').carta, quantita: 2 }],
    },
  ];
  const carenze = [
    {
      codice: 'orfani-nel-mazzo',
      mazzo: 'Mazzo 1',
      dati: { orfani: [{ nome: 'Pawmot', manca: 'Pawmo', stadio: 'Livello 2' }] },
    },
  ];
  // taglia 10 → tetto floor(10*0.15)=1, ma la catena richiede 2 carte
  const { proxy, scartati } = proxyPokemon(mazzi, carenze, 10, { pawmo: 'Pawmi' });
  assert.equal(proxy.length, 0, 'niente proxy: la catena intera non ci sta');
  assert.ok(scartati.some((s) => s.ragione === 'quota proxy superata'));
});
