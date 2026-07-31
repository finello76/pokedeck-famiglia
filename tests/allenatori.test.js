/**
 * Test delle carte Allenatore in partita.
 *
 * Qui la cosa da provare non è solo *cosa il motore capisce*, ma soprattutto
 * **cosa dichiara di non capire**: una partita che esegue metà carta e tace
 * sull'altra metà insegna la regola sbagliata, ed è il danno peggiore in
 * un'app che serve a imparare.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giocabileOra, interpreta, raccontaEffetto } from '../src/engine/allenatori.js';

const allenatore = (nome, effetto, tipo = 'Aiuto') => ({
  nome,
  categoria: 'Allenatore',
  effetto,
  tipoAllenatore: tipo,
});

test('«Pesca tre carte.» si capisce, col numero in lettere', () => {
  assert.deepEqual(interpreta(allenatore('Barry', 'Pesca tre carte.')), {
    tipo: 'pesca',
    quante: 3,
    testo: 'Pesca tre carte.',
  });
});

test('anche in cifre, e anche una sola', () => {
  assert.equal(interpreta(allenatore('X', 'Pesca 2 carte.')).quante, 2);
  assert.equal(interpreta(allenatore('X', 'Pesca una carta.')).quante, 1);
});

test('«Cura 30 danni» si capisce', () => {
  const e = interpreta(allenatore('Pozione', 'Cura 30 danni da uno dei tuoi Pokémon.', 'Strumento'));
  assert.equal(e.tipo, 'cura');
  assert.equal(e.quanti, 30);
});

test('lo scambio con la panchina è una ritirata gratis', () => {
  const e = interpreta(allenatore('Interruttore', 'Scambia il tuo Pokémon attivo con uno della tua panchina.', 'Strumento'));
  assert.equal(e.tipo, 'scambia');
});

test('una frase lunga con dentro "pesca" NON si esegue', () => {
  // È il caso che rende il riconoscimento onesto: qui pescare dipende da cosa
  // ha in mano l'avversario, e il motore non lo sa.
  const e = interpreta(
    allenatore(
      'Premonizione di Malpi',
      'Il tuo avversario mostra le carte che ha in mano e tu peschi una carta per ogni carta Allenatore presente tra quelle carte.',
    ),
  );

  assert.equal(e.tipo, 'manuale');
  assert.match(e.testo, /mostra le carte/, 'il testo resta intero, per poterlo leggere');
});

test('un Allenatore senza testo si gioca a mano, non esplode', () => {
  assert.equal(interpreta(allenatore('Ignoto', undefined)).tipo, 'manuale');
  assert.equal(interpreta(null).tipo, 'manuale');
});

test('un solo Aiuto per turno, e si dice perché', () => {
  const carta = allenatore('Barry', 'Pesca tre carte.');
  assert.equal(giocabileOra(carta, { aiutoGiocato: false }).possibile, true);

  const bloccato = giocabileOra(carta, { aiutoGiocato: true });
  assert.equal(bloccato.possibile, false);
  assert.match(bloccato.perche, /già giocato una carta Aiuto/);
});

test('gli Strumenti non hanno il limite dell’Aiuto', () => {
  const carta = allenatore('Pozione', 'Cura 30 danni.', 'Strumento');
  assert.equal(giocabileOra(carta, { aiutoGiocato: true }).possibile, true);
});

test('il racconto dice a chi gioca cosa deve fare', () => {
  const carta = allenatore('Barry', 'Pesca tre carte.');
  assert.match(raccontaEffetto(carta, interpreta(carta)), /peschi 3 carte/);

  const strana = allenatore('Malpi', 'Il tuo avversario mostra le carte…');
  assert.match(raccontaEffetto(strana, interpreta(strana)), /applicala tu, leggendo la carta/);
});
