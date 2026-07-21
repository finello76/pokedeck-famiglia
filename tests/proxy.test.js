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
import { proxyEnergia } from '../src/engine/proxy.js';

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


test('una pre-evoluzione sconosciuta non si stampa: resta la regola della casa', () => {
  // Il 41% delle evoluzioni del dataset non dichiara evolveDa: di quelle carte
  // si sa che sono orfane ma non cosa stampare. Nessun budget le ripara.
  const voci = [pk('Krookodile', 'Oscurità', 'Livello 2', null, 2), en('Oscurità', 10)];
  const p = pianifica(voci, { taglia: 10, numeroMazzi: 1, proxyPokemon: true, budgetProxy: 8 });

  assert.ok(
    !p.proxy.some((x) => x.genere === 'pokemon'),
    'senza nome non si può stampare nulla',
  );
  assert.ok(
    p.regole.some((r) => r.codice === 'evoluzioni-come-base'),
    'la regola resta: è l\'unico modo di giocare quella carta',
  );
});

test('il budget di stampa decide quante linee complete entrano', () => {
  // Due linee possibili, ciascuna da due carte da stampare (Base + Livello 1).
  const voci = [
    pk('Machamp', 'Lotta', 'Livello 2', 'Machoke', 1),
    pk('Golem', 'Lotta', 'Livello 2', 'Graveler', 1),
    en('Lotta', 20),
  ];
  const indiceEvoluzioni = { machoke: 'Machop', graveler: 'Geodude' };
  const comuni = { taglia: 30, numeroMazzi: 1, proxyPokemon: true, indiceEvoluzioni };

  const stretto = pianifica(voci, { ...comuni, budgetProxy: 2 });
  const largo = pianifica(voci, { ...comuni, budgetProxy: 8 });

  const cime = (p) =>
    p.mazzi[0].carte.filter((c) => c.carta.stadio === 'Livello 2' && !c.proxy).length;
  assert.equal(cime(stretto), 1, 'con 2 carte di budget si completa una linea sola');
  assert.equal(cime(largo), 2, 'col budget largo entrano entrambe');
});

test('a budget zero non si stampa nessun Pokémon', () => {
  const voci = [pk('Zweilous', 'Oscurità', 'Livello 1', 'Deino', 4), en('Oscurità', 10)];
  const p = pianifica(voci, { taglia: 10, numeroMazzi: 1, proxyPokemon: true, budgetProxy: 0 });
  assert.ok(
    p.mazzi[0].carte.every((c) => !c.proxy || c.carta.categoria === 'Energia'),
    'nessun Pokémon stampato',
  );
});

test('non si stampa la seconda copia di una carta che hai già', () => {
  // Il budget speso per raddoppiare una carta posseduta non rende giocabile
  // niente di nuovo: meglio tenerlo per un'altra linea.
  const voci = [pk('Zweilous', 'Oscurità', 'Livello 1', 'Deino', 1), en('Oscurità', 20)];
  const p = pianifica(voci, { taglia: 30, numeroMazzi: 1, proxyPokemon: true, budgetProxy: 10 });
  const zweilous = p.mazzi[0].carte.filter((c) => c.carta.nome === 'Zweilous');
  assert.ok(zweilous.every((c) => !c.proxy), 'Zweilous non viene ristampato');
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
          carta: { nome: 'Energia Combattimento', categoria: 'Energia', tipoEnergia: 'Base' },
          quantita: 4,
        },
      ],
    },
  ];
  assert.equal(proxyEnergia(mazzi, 8).length, 0, 'le 4 Energie coprono il fabbisogno (8/4=2)');
});

test('un Livello 2 fa stampare l\'intera catena, non solo un anello', () => {
  // Possedendo solo Pawmot (Livello 2) non basta stampare Pawmo: resterebbe a
  // sua volta ingiocabile. Con l'indice si risale fino alla Base.
  const voci = [pk('Pawmot', 'Lampo', 'Livello 2', 'Pawmo', 1), en('Lampo', 10)];
  const p = pianifica(voci, {
    taglia: 15,
    numeroMazzi: 1,
    proxyPokemon: true,
    budgetProxy: 6,
    indiceEvoluzioni: { pawmo: 'Pawmi' },
  });
  const stampati = p.mazzi[0].carte.filter((c) => c.proxy).map((c) => c.carta.nome);
  assert.ok(stampati.includes('Pawmo'), 'il Livello 1');
  assert.ok(stampati.includes('Pawmi'), 'e anche la Base');
});
