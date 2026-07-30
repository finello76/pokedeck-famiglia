/**
 * Test dei preferiti.
 *
 * Il cuore non entra in nessun conteggio e non tocca il motore: il rischio non
 * è quindi di gonfiare le statistiche, come per i desideri, ma di **perdere in
 * silenzio** una scelta fatta a mano — carta per carta, magari su cento carte.
 * Si perde in due modi: filtrando male (la carta preferita non compare fra i
 * preferiti) o esportando male (si cambia telefono e i cuori restano indietro).
 *
 * L'altra regola provata qui è l'esclusione col desiderio: un desiderio è una
 * carta che NON hai, e il cuore sta sulle carte che hai. La coppia impossibile
 * non deve poter entrare dal file di import.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filtra, FILTRI_VUOTI } from '../src/ui/griglia-collezione/raggruppa.js';
import { validaImport } from '../src/data/scambio.js';

const voce = (nome, opzioni = {}) => ({
  idSet: opzioni.idSet ?? 'prova',
  numero: nome,
  quantita: opzioni.quantita ?? 1,
  ...(opzioni.desiderata ? { desiderata: true } : {}),
  ...(opzioni.preferita ? { preferita: true } : {}),
  serie: { id: 'sv', nome: 'Scarlatto e Violetto' },
  nomeSet: 'Prova',
  carta: {
    nome,
    numero: nome,
    categoria: opzioni.categoria ?? 'Pokémon',
    tipi: [opzioni.tipo ?? 'Lotta'],
    stadio: 'Base',
    ps: 70,
  },
});

const collezione = () => [
  voce('Machop'),
  voce('Mankey', { preferita: true }),
  voce('Pikachu', { preferita: true, tipo: 'Lampo' }),
  voce('Charizard', { desiderata: true }),
];

const nomi = (voci) => voci.map((v) => v.carta.nome).sort();

test('per difetto i preferiti non filtrano niente', () => {
  assert.equal(filtra(collezione(), FILTRI_VUOTI).length, 4);
});

test('"solo" mostra le carte col cuore', () => {
  assert.deepEqual(nomi(filtra(collezione(), { preferito: 'solo' })), ['Mankey', 'Pikachu']);
});

test('il filtro dei preferiti si somma agli altri', () => {
  // Se fosse applicato al posto degli altri, "i preferiti di tipo Lampo"
  // darebbe tutti i preferiti — ed è l'errore che si fa scrivendo il filtro
  // come una scorciatoia invece che come una condizione in più.
  assert.deepEqual(nomi(filtra(collezione(), { preferito: 'solo', tipo: 'Lampo' })), ['Pikachu']);
  assert.deepEqual(nomi(filtra(collezione(), { preferito: 'solo', tipo: 'Lotta' })), ['Mankey']);
});

test('preferiti e desideri sono due domande diverse', () => {
  // "Solo i desideri" non deve tirarsi dietro i preferiti, e viceversa: sono
  // due campi indipendenti sulla stessa riga.
  assert.deepEqual(nomi(filtra(collezione(), { desiderio: 'solo' })), ['Charizard']);
  assert.deepEqual(nomi(filtra(collezione(), { preferito: 'solo', desiderio: 'escludi' })), [
    'Mankey',
    'Pikachu',
  ]);
});

test('il filtro funziona anche senza i dati della carta', () => {
  // Carta di un set non più scaricato: il cuore sta sulla riga, non nella
  // carta, quindi si ritrova lo stesso.
  const orfana = { idSet: 'x', numero: '1', quantita: 1, preferita: true, carta: null };
  assert.equal(filtra([orfana], { preferito: 'solo' }).length, 1);
});

test("l'export conserva il cuore, l'import lo rilegge", () => {
  const file = {
    formato: 'pokedeck-famiglia',
    versione: 1,
    carte: [
      { idSet: 'sv08', numero: '118', quantita: 2 },
      { idSet: 'sv08', numero: '135', quantita: 1, preferita: true },
    ],
  };
  const voci = validaImport(file);
  assert.equal(voci[0].preferita, undefined, 'una carta qualsiasi non diventa preferita');
  assert.equal(voci[1].preferita, true);
});

test('i file esportati prima dei preferiti restano validi', () => {
  const vecchio = {
    formato: 'pokedeck-famiglia',
    versione: 1,
    carte: [{ idSet: 'sv08', numero: '118', quantita: 3, nome: 'Zweilous' }],
  };
  const voci = validaImport(vecchio);
  assert.equal(voci.length, 1);
  assert.equal(voci[0].preferita, undefined);
});
