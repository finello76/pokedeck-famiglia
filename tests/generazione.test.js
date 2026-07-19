/**
 * Test della generazione dei mazzi.
 *
 * Le collezioni di prova sono piccole apposta: servono a verificare il
 * comportamento in penuria, che è la condizione normale di questo progetto.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generaMazzi, scegliTipi } from '../src/engine/generazione.js';
import { composizione, fettaPerMazzo, minimoBasi, piramide } from '../src/engine/proporzioni.js';
import { Dispensa } from '../src/engine/dispensa.js';
import { analizza } from '../src/engine/analisi.js';

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
const al = (nome, quantita = 1) => ({
  carta: { nome, numero: nome, idSet: 'prova', categoria: 'Allenatore' },
  quantita,
});

// --- dispensa ---

test('la dispensa non consegna piu\' copie di quante ne esistano', () => {
  const d = new Dispensa([pk('Pikachu', 'Lampo', 'Base', null, 3)]);
  const carta = { nome: 'Pikachu', numero: 'Pikachu', idSet: 'prova' };
  assert.equal(d.preleva(carta, 2), 2);
  assert.equal(d.preleva(carta, 5), 1, 'restano solo le copie effettive');
  assert.equal(d.preleva(carta, 1), 0);
});

test('le copie restituite tornano disponibili, ma non oltre le iniziali', () => {
  const d = new Dispensa([pk('Pikachu', 'Lampo', 'Base', null, 2)]);
  const carta = { nome: 'Pikachu', numero: 'Pikachu', idSet: 'prova' };
  d.preleva(carta, 2);
  d.restituisci(carta, 5);
  assert.equal(d.disponibili(carta), 2, 'non si creano carte dal nulla');
});

test('due carte con lo stesso nome ma numero diverso sono scorte distinte', () => {
  // Caso reale: due Luxio diversi nello stesso set.
  const d = new Dispensa([
    pk('Luxio', 'Lampo', 'Livello 1', 'Shinx', 1, '041'),
    pk('Luxio', 'Lampo', 'Livello 1', 'Shinx', 1, '042'),
  ]);
  assert.equal(d.totaleDisponibile, 2);
  assert.equal(d.disponibili({ nome: 'Luxio', numero: '041', idSet: 'prova' }), 1);
});

// --- proporzioni ---

test('le quote si adattano a quello che c\'e\' davvero', () => {
  // Allenatori insufficienti: gli slot liberi vanno alle energie.
  const c = composizione(15, { pokemon: 8, energie: 9, allenatori: 2 });
  assert.equal(c.allenatori, 2);
  assert.equal(c.pokemon + c.energie + c.allenatori, 15);
  assert.equal(c.mancanti, 0);
});

test('segnala quando il mazzo non si puo\' riempire', () => {
  const c = composizione(15, { pokemon: 3, energie: 2, allenatori: 1 });
  assert.equal(c.mancanti, 9);
});

test('la fetta divide le scorte fra i mazzi', () => {
  assert.deepEqual(fettaPerMazzo({ pokemon: 16, energie: 13, allenatori: 5 }, 2), {
    pokemon: 8,
    energie: 6,
    allenatori: 2,
  });
});

test('la piramide si scala con la taglia', () => {
  assert.deepEqual(piramide(60), [3, 2, 1]);
  assert.deepEqual(piramide(15), [2, 1, 1]);
});

test('il minimo di Base cresce con il mazzo', () => {
  assert.equal(minimoBasi(15), 4);
  assert.equal(minimoBasi(60), 15);
});

// --- scelta dei tipi ---

test('non sceglie un tipo che non ha energie', () => {
  const analisi = analizza([
    pk('Lucario', 'Lotta', 'Base', null, 5),
    pk('Pikachu', 'Lampo', 'Base', null, 2),
    en('Lampo', 4),
  ]);
  const [tipi] = scegliTipi(analisi, 1);
  assert.deepEqual(tipi, ['Lampo'], 'Lotta ha piu\' carte ma zero energie: non attaccherebbe');
});

// --- generazione ---

test('genera mazzi della taglia richiesta', () => {
  const voci = [
    pk('Pikachu', 'Lampo', 'Base', null, 4),
    pk('Voltorb', 'Lampo', 'Base', null, 4),
    pk('Magnemite', 'Lampo', 'Base', null, 4),
    en('Lampo', 12),
    al('Pozione', 6),
  ];
  const { mazzi } = generaMazzi(voci, { taglia: 15, numeroMazzi: 2 });
  assert.equal(mazzi.length, 2);
  for (const m of mazzi) assert.equal(m.totale, 15, `${m.nome} deve avere 15 carte`);
});

test('i due mazzi non usano la stessa copia fisica', () => {
  const voci = [pk('Pikachu', 'Lampo', 'Base', null, 3), en('Lampo', 10), al('Pozione', 4)];
  const { mazzi } = generaMazzi(voci, { taglia: 8, numeroMazzi: 2 });

  const usate = {};
  for (const m of mazzi) {
    for (const c of m.carte) {
      const k = `${c.carta.idSet}:${c.carta.numero}`;
      usate[k] = (usate[k] ?? 0) + c.quantita;
    }
  }
  assert.ok(usate['prova:Pikachu'] <= 3, 'non puo\' usare piu\' Pikachu di quanti ne esistano');
});

test('rispetta il limite di 4 copie, ma non per le Energie base', () => {
  const voci = [pk('Pikachu', 'Lampo', 'Base', null, 9), en('Lampo', 20)];
  const { mazzi } = generaMazzi(voci, { taglia: 20, numeroMazzi: 1 });
  const pikachu = mazzi[0].carte.find((c) => c.carta.nome === 'Pikachu');
  const energia = mazzi[0].carte.find((c) => c.carta.categoria === 'Energia');
  assert.ok(pikachu.quantita <= 4, 'al massimo 4 copie di una carta normale');
  assert.ok(energia.quantita > 4, 'le Energie base non hanno limite');
});

test('preferisce carte giocabili a evoluzioni orfane', () => {
  // L'orfano e' del tipo giusto, la carta giocabile no: deve vincere comunque
  // quella giocabile, perche' un orfano resta in mano tutta la partita.
  const voci = [
    pk('Luxio', 'Lampo', 'Livello 1', 'Shinx', 4),
    pk('Pancham', 'Lotta', 'Base', null, 4),
    en('Lampo', 8),
  ];
  const { mazzi } = generaMazzi(voci, { taglia: 10, numeroMazzi: 1 });
  const nomi = mazzi[0].carte.map((c) => c.carta.nome);
  assert.ok(nomi.includes('Pancham'), 'il Base giocabile deve entrare');
});

test('segnala gli orfani finiti nel mazzo, con nome e cosa manca', () => {
  const voci = [pk('Luxio', 'Lampo', 'Livello 1', 'Shinx', 4), en('Lampo', 8)];
  const { carenze } = generaMazzi(voci, { taglia: 10, numeroMazzi: 1 });
  const orfani = carenze.find((c) => c.codice === 'orfani-nel-mazzo');
  assert.ok(orfani, 'la regola della casa deve sapere quali carte riabilitare');
  assert.equal(orfani.dati.orfani[0].nome, 'Luxio');
  assert.equal(orfani.dati.orfani[0].manca, 'Shinx');
});

test('segnala le energie fuori tipo', () => {
  const voci = [pk('Pikachu', 'Lampo', 'Base', null, 4), en('Lampo', 2), en('Fuoco', 8)];
  const { carenze } = generaMazzi(voci, { taglia: 12, numeroMazzi: 1 });
  assert.ok(carenze.some((c) => c.codice === 'energie-fuori-tipo'));
});

test('segnala il mazzo che non si riesce a completare', () => {
  const { mazzi, carenze } = generaMazzi([pk('Pikachu', 'Lampo', 'Base', null, 2)], {
    taglia: 15,
    numeroMazzi: 1,
  });
  assert.ok(mazzi[0].totale < 15);
  assert.ok(carenze.some((c) => c.codice === 'mazzo-incompleto'));
});

test('una collezione vuota non fa esplodere il generatore', () => {
  const { mazzi } = generaMazzi([], { taglia: 15, numeroMazzi: 2 });
  assert.equal(mazzi.length, 2);
  assert.equal(mazzi[0].totale, 0);
});
