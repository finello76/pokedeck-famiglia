/**
 * Test dell'analisi della collezione.
 *
 * Il modulo è puro, quindi non serve né browser né database: si costruisce una
 * collezione finta e si guarda cosa ne dice. Le collezioni di prova sono
 * modellate sui casi reali visti nel dataset.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizza, costruisciLinee, trovaOrfani } from '../src/engine/analisi.js';
import { normalizzaNome, stessoNome } from '../src/engine/nomi.js';
import { classifica, utilizzabile, eBase, CATEGORIA } from '../src/engine/stadi.js';

/** Costruttore rapido di una voce di collezione. */
const pk = (nome, stadio, evolveDa = null, quantita = 1, tipi = ['Lotta']) => ({
  carta: { nome, categoria: 'Pokémon', stadio, evolveDa, tipi, ps: 100 },
  quantita,
});
const energia = (tipo, quantita = 1) => ({
  carta: { nome: `Energia ${tipo}`, categoria: 'Energia', tipoEnergia: 'Base' },
  quantita,
});

// --- nomi ---

test('la normalizzazione appiattisce trattini, accenti e maiuscole', () => {
  assert.equal(normalizzaNome('Shaymin-V'), 'shaymin v');
  assert.equal(normalizzaNome('Oscurità'), 'oscurita');
  assert.equal(normalizzaNome('  Mr.   Mime  '), 'mr. mime');
  assert.equal(normalizzaNome(null), '');
});

test('due nomi vuoti NON sono lo stesso nome', () => {
  // Senza questa regola, tutte le carte senza pre-evoluzione risulterebbero
  // collegate fra loro in un'unica linea assurda.
  assert.equal(stessoNome('', ''), false);
  assert.equal(stessoNome(null, undefined), false);
  assert.equal(stessoNome('Shaymin-V', 'shaymin v'), true);
});

// --- stadi ---

test('distingue stadi canonici, esotici e ignoti', () => {
  assert.equal(classifica(pk('A', 'Base').carta).livello, 0);
  assert.equal(classifica(pk('A', 'Livello 1').carta).livello, 1);
  assert.equal(classifica(pk('A', 'Livello 2').carta).livello, 2);
  assert.equal(classifica(pk('A', 'VMAX').carta).categoria, CATEGORIA.ESOTICO);
  assert.equal(classifica(pk('A', null).carta).categoria, CATEGORIA.IGNOTO);
  assert.equal(classifica({ categoria: 'Allenatore', nome: 'X' }).categoria, CATEGORIA.IGNOTO);
});

test('gli esotici sono esclusi salvo richiesta esplicita', () => {
  const vmax = pk('A', 'VMAX').carta;
  assert.equal(utilizzabile(vmax), false);
  assert.equal(utilizzabile(vmax, { ammettiEsotici: true }), true);
  assert.equal(utilizzabile(pk('A', 'Base').carta), true);
});

test('solo il Base si gioca direttamente dalla mano', () => {
  assert.equal(eBase(pk('A', 'Base').carta), true);
  assert.equal(eBase(pk('A', 'Livello 1').carta), false);
});

// --- linee evolutive ---

test('ricostruisce una linea completa a tre stadi', () => {
  const linee = costruisciLinee([
    pk('Deino', 'Base', null, 3),
    pk('Zweilous', 'Livello 1', 'Deino', 2),
    pk('Hydreigon', 'Livello 2', 'Zweilous', 1),
  ]);

  assert.equal(linee.length, 1, 'le tre carte formano una linea sola');
  const l = linee[0];
  assert.equal(l.radice, 'Deino');
  assert.equal(l.radicePosseduta, true);
  assert.equal(l.giocabile, true);
  assert.deepEqual(l.mancanti, []);
  assert.equal(l.copie, 6);
  assert.equal(l.livelli[0].length, 1);
  assert.equal(l.livelli[2][0].carta.nome, 'Hydreigon');
});

test('una linea senza la sua base non è giocabile e dice cosa manca', () => {
  // È il caso reale della collezione: Zweilous senza Deino.
  const linee = costruisciLinee([pk('Zweilous', 'Livello 1', 'Deino', 4)]);
  assert.equal(linee.length, 1);
  assert.equal(linee[0].radice, 'Deino');
  assert.equal(linee[0].radicePosseduta, false);
  assert.equal(linee[0].giocabile, false);
  assert.deepEqual(linee[0].mancanti, ['Deino']);
});

test('sa quanti anelli mancano, anche quando i nomi noti sono meno', () => {
  // Caso reale: Garganacl è Livello 2 e dichiara di evolvere da Naclstack, ma
  // sotto Naclstack c'è ancora Nacli. Il nome del terzo non è leggibile da
  // nessuna parte, il fatto che manchi sì.
  const [linea] = costruisciLinee([pk('Garganacl', 'Livello 2', 'Naclstack', 1)]);
  assert.deepEqual(linea.mancanti, ['Naclstack'], 'un solo nome conoscibile');
  assert.equal(linea.anelliMancanti, 2, 'ma servono due carte per arrivare al Base');
  assert.equal(linea.giocabile, false);
});

test('una linea completa non ha anelli mancanti', () => {
  const [linea] = costruisciLinee([
    pk('Deino', 'Base'),
    pk('Zweilous', 'Livello 1', 'Deino'),
  ]);
  assert.equal(linea.anelliMancanti, 0);
});

test('carte di linee diverse non finiscono nella stessa linea', () => {
  const linee = costruisciLinee([
    pk('Zweilous', 'Livello 1', 'Deino'),
    pk('Metang', 'Livello 1', 'Beldum'),
    pk('Marowak', 'Livello 1', 'Cubone'),
  ]);
  assert.equal(linee.length, 3);
});

test('aggancia le pre-evoluzioni anche con trattini diversi', () => {
  const linee = costruisciLinee([
    pk('Shaymin V', 'Base', null, 1),
    pk('Shaymin V ASTRO', 'Livello 1', 'Shaymin-V', 1),
  ]);
  assert.equal(linee.length, 1, 'il trattino non deve spezzare la linea');
  assert.equal(linee[0].mancanti.length, 0);
});

test('gli esotici restano fuori dalle linee, salvo richiesta', () => {
  const voci = [pk('Charizard V', 'Base'), pk('Charizard VMAX', 'VMAX', 'Charizard V')];
  assert.equal(costruisciLinee(voci)[0].copie, 1, 'il VMAX è escluso');
  assert.equal(costruisciLinee(voci, { ammettiEsotici: true })[0].copie, 2);
});

test('un ciclo nei dati non manda in loop infinito', () => {
  // Dati esterni: nulla garantisce che non ci sia una catena circolare.
  const linee = costruisciLinee([
    pk('Uno', 'Livello 1', 'Due'),
    pk('Due', 'Livello 1', 'Uno'),
  ]);
  assert.ok(linee.length >= 1, 'termina invece di bloccarsi');
});

// --- orfani ---

test('trova gli orfani e dice cosa manca', () => {
  const orfani = trovaOrfani([
    pk('Deino', 'Base'),
    pk('Zweilous', 'Livello 1', 'Deino'),
    pk('Metang', 'Livello 1', 'Beldum'),
    pk('Marowak', 'Livello 1', 'Cubone'),
  ]);
  assert.equal(orfani.length, 2, 'Zweilous ha il suo Deino, gli altri due no');
  assert.deepEqual(orfani.map((o) => o.manca).sort(), ['Beldum', 'Cubone']);
});

test('un Base non è mai orfano', () => {
  assert.deepEqual(trovaOrfani([pk('Deino', 'Base')]), []);
});

// --- analisi completa ---

test('il quadro completo tiene insieme carte, energie e problemi', () => {
  const esito = analizza([
    pk('Deino', 'Base', null, 3, ['Oscurità']),
    pk('Zweilous', 'Livello 1', 'Deino', 2, ['Oscurità']),
    pk('Marowak', 'Livello 1', 'Cubone', 1, ['Lotta']),
    energia('Oscurità', 8),
    { carta: { nome: 'Campanello di Servizio', categoria: 'Allenatore' }, quantita: 2 },
  ]);

  assert.equal(esito.conteggi.pokemon, 6);
  assert.equal(esito.conteggi.allenatori, 2);
  assert.equal(esito.basiGiocabili, 3);
  assert.equal(esito.orfani.length, 1);
  assert.equal(esito.energie.perTipo['Oscurità'], 8);
  assert.equal(esito.tipiPromettenti[0].tipo, 'Oscurità', 'il tipo più numeroso viene primo');
  assert.equal(esito.tipiPromettenti[0].energie, 8, 'e sa quante energie ha a disposizione');
});

test('avvisa quando manca il minimo per giocare', () => {
  const esito = analizza([pk('Zweilous', 'Livello 1', 'Deino', 4)]);
  const codici = esito.avvisi.map((a) => a.codice);
  assert.ok(codici.includes('nessun-base'), 'senza Base non si può iniziare');
  assert.ok(codici.includes('nessuna-energia'), 'senza energie non si può attaccare');
  assert.ok(codici.includes('orfani'));
});

test('una collezione sana non produce avvisi', () => {
  const esito = analizza([pk('Deino', 'Base', null, 4, ['Oscurità']), energia('Oscurità', 10)]);
  assert.deepEqual(esito.avvisi, []);
});

test('una collezione vuota non esplode', () => {
  const esito = analizza([]);
  assert.equal(esito.linee.length, 0);
  assert.equal(esito.basiGiocabili, 0);
  assert.ok(esito.avvisi.length > 0);
});

test('le voci senza dati di carta vengono ignorate', () => {
  // Succede quando un set non è più scaricato: la riga resta, la carta no.
  const esito = analizza([{ carta: null, quantita: 3 }, pk('Deino', 'Base')]);
  assert.equal(esito.conteggi.pokemon, 1);
});
