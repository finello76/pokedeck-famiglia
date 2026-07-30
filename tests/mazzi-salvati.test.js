/**
 * Test del giro di andata e ritorno dei mazzi salvati.
 *
 * La regressione da cui nasce questo file: sul disco ogni voce del mazzo è
 * piatta (`{quantita, nome, idSet, ...}`), mentre motore e UI lavorano su
 * `{carta: {...}, quantita}`. Riaperto un mazzo salvato, `voce.carta` era
 * `undefined` e il primo ⇄ moriva con
 * `undefined is not an object (evaluating 'carta.idSet')`.
 *
 * Qui non si tocca IndexedDB: si provano le due funzioni pure che fanno la
 * conversione, che sono il punto in cui l'errore era possibile.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { istantanea, idrataPiano, rinominaMazzi } from '../src/data/mazzi-salvati.js';
import { disponibilitaResidua, alternativePer } from '../src/engine/alternative.js';

const carta = (nome, extra = {}) => ({
  idSet: 'prova',
  numero: nome,
  nome,
  categoria: 'Pokémon',
  stadio: 'Base',
  tipi: ['Fuoco'],
  ps: 100,
  attacchi: [{ costo: ['Fuoco'], danno: '30' }],
  ritirata: 1,
  immagine: `https://esempio/${nome}`,
  ...extra,
});

/** Un piano minimo come quello che esce da `pianifica()`. */
function pianoDiProva() {
  return {
    mazzi: [
      {
        nome: 'Mazzo rosso',
        tipi: ['Fuoco'],
        totale: 4,
        composizione: {},
        carte: [
          { carta: carta('Charmander'), quantita: 2 },
          { carta: carta('Charmeleon', { stadio: 'Livello 1', evolveDa: 'Charmander' }), quantita: 1 },
          { carta: carta('Energia Fuoco', { categoria: 'Energia' }), quantita: 1, proxy: true, motivo: 'Energie insufficienti' },
        ],
      },
    ],
    equilibrio: { punteggi: [{ totale: 45 }] },
    regole: [],
    carenze: [],
    permessi: {},
  };
}

test('il salvataggio conserva i campi che servono al motore', () => {
  const record = istantanea(pianoDiProva(), { taglia: 20 }, 'Torneo di Natale', '2026-07-26T10:00:00.000Z');
  const voce = record.mazzi[0].carte[1];

  assert.equal(record.nome, 'Torneo di Natale');
  assert.equal(voce.evolveDa, 'Charmander');
  assert.deepEqual(voce.attacchi, [{ costo: ['Fuoco'], danno: '30' }]);
  assert.equal(record.mazzi[0].carte[2].proxy, true);
});

test('il nome è obbligatorio: senza, non si salva', () => {
  assert.throws(() => istantanea(pianoDiProva(), {}, '   '), /nome/i);
});

test('le opzioni pesanti non finiscono su disco', () => {
  const record = istantanea(pianoDiProva(), { taglia: 20, indiceEvoluzioni: { da: {} }, nonPokemon: [] }, 'X');
  assert.equal(record.opzioni.taglia, 20);
  assert.equal('indiceEvoluzioni' in record.opzioni, false);
  assert.equal('nonPokemon' in record.opzioni, false);
});

test('un piano riletto torna nella forma attesa dal motore', () => {
  const piano = idrataPiano(istantanea(pianoDiProva(), { taglia: 20 }, 'Torneo'));
  const voci = piano.mazzi[0].carte;

  assert.equal(voci[0].carta.nome, 'Charmander');
  assert.equal(voci[0].carta.idSet, 'prova');
  assert.equal(voci[0].quantita, 2);
  assert.equal(voci[2].proxy, true);
  // I `null` di IndexedDB non devono sopravvivere: `carta.idSet ?? '?'` li
  // lascerebbe passare e la chiave di dispensa diventerebbe "null:...".
  assert.equal('evolveDa' in voci[0].carta, false);
});

test('dopo la rilettura la sostituzione non esplode più', () => {
  const piano = idrataPiano(istantanea(pianoDiProva(), { taglia: 20 }, 'Torneo'));
  const collezione = [
    { carta: carta('Charmander'), quantita: 4 },
    { carta: carta('Vulpix'), quantita: 2 },
  ];

  const dispensa = disponibilitaResidua(collezione, piano.mazzi);
  // Delle 4 Charmander, 2 sono nel mazzo: ne restano 2 libere.
  assert.equal(dispensa.disponibili(carta('Charmander')), 2);

  const proposte = alternativePer(piano.mazzi[0].carte[0], piano.mazzi[0], dispensa);
  assert.ok(proposte.some((p) => p.carta.nome === 'Vulpix'));
});

test('idratare due volte non cambia niente', () => {
  const uno = idrataPiano(istantanea(pianoDiProva(), {}, 'Torneo'));
  const due = idrataPiano(uno);
  assert.deepEqual(due.mazzi[0].carte, uno.mazzi[0].carte);
});

/**
 * Seconda regressione della stessa famiglia, trovata riaprendo un mazzo
 * costruito a mano: `aggiungiAlMazzo()` e `togliDalMazzo()` **aggiornano**
 * `mazzo.composizione` invece di ricalcolarla, quindi un mazzo salvato senza
 * quel campo faceva morire il primo scambio con
 * `Cannot read properties of undefined (reading 'pokemon')`.
 */
test('un mazzo riletto ha sempre composizione e totale, anche se non li aveva', () => {
  const record = {
    id: 'x',
    nome: 'Vecchio',
    creatoIl: '2026-01-01T00:00:00.000Z',
    mazzi: [
      {
        nome: 'Senza composizione',
        carte: [
          { quantita: 3, idSet: 'prova', numero: 'Charmander', nome: 'Charmander', categoria: 'Pokémon' },
          { quantita: 2, idSet: '@base', numero: 'Fuoco', nome: 'Energia Fuoco', categoria: 'Energia' },
          { quantita: 1, idSet: 'prova', numero: 'Boss', nome: 'Ordine del Boss', categoria: 'Allenatore' },
        ],
      },
    ],
  };

  const mazzo = idrataPiano(record).mazzi[0];
  assert.deepEqual(mazzo.composizione, { pokemon: 3, energie: 2, allenatori: 1 });
  assert.equal(mazzo.totale, 6);
});

test('la composizione già salvata non viene ricalcolata', () => {
  const record = idrataPiano({
    mazzi: [{ nome: 'Suo', composizione: { pokemon: 9, energie: 9, allenatori: 9 }, totale: 27, carte: [] }],
  });
  assert.deepEqual(record.mazzi[0].composizione, { pokemon: 9, energie: 9, allenatori: 9 });
  assert.equal(record.mazzi[0].totale, 27);
});

// --- Modificare un salvataggio, non duplicarlo ---------------------------
//
// Il difetto: riaprire un mazzo, cambiargli tre carte e premere Salva
// produceva **due** mazzi nell'elenco — l'originale intatto e una copia, per
// giunta con un nome da inventare di nuovo. La causa sta tutta nel quarto
// parametro di `istantanea()`: l'id di un salvataggio *è* la sua data di
// creazione, quindi riusare quella data significa riscrivere la stessa riga.
// `aggiornaPiano()` non fa altro, e qui si prova la regola senza IndexedDB.

test('riusare creatoIl vuol dire riscrivere la stessa riga, non aggiungerne una', () => {
  const primo = istantanea(pianoDiProva(), { taglia: 20 }, 'Mazzo di Marco');
  const modificato = pianoDiProva();
  modificato.mazzi[0].carte.pop();

  const secondo = istantanea(modificato, { taglia: 20 }, 'Mazzo di Marco', primo.creatoIl);

  assert.equal(secondo.id, primo.id, 'stesso id: nell’elenco resta un mazzo solo');
  assert.equal(secondo.creatoIl, primo.creatoIl, 'la data resta quella della nascita');
  assert.notDeepEqual(secondo.mazzi[0].carte, primo.mazzi[0].carte, 'il contenuto sì, è cambiato');
});

test('senza creatoIl nasce un salvataggio nuovo: è "salva come copia"', () => {
  const primo = istantanea(pianoDiProva(), { taglia: 20 }, 'Originale');
  const copia = istantanea(pianoDiProva(), { taglia: 20 }, 'Originale');

  // Gli id sono due date: possono coincidere solo se il tempo non è passato,
  // e allora si guarda che almeno la funzione non li abbia legati fra loro.
  assert.equal(copia.id, copia.creatoIl);
  assert.equal(primo.id, primo.creatoIl);
});

test('rinominare non tocca il contenuto', () => {
  const primo = istantanea(pianoDiProva(), { taglia: 20 }, 'Nome sbagliato');
  const dopo = istantanea(pianoDiProva(), { taglia: 20 }, 'Nome giusto', primo.creatoIl);

  assert.equal(dopo.nome, 'Nome giusto');
  assert.equal(dopo.id, primo.id);
  assert.deepEqual(dopo.mazzi[0].carte, primo.mazzi[0].carte);
});

test('il nome vuoto viene rifiutato anche quando si sta modificando', () => {
  const primo = istantanea(pianoDiProva(), { taglia: 20 }, 'Buono');
  assert.throws(() => istantanea(pianoDiProva(), { taglia: 20 }, '   ', primo.creatoIl));
});

test('un mazzo modificato conserva le carte con la loro identità', () => {
  // È la garanzia che rende riapribile un salvataggio: senza idSet e numero le
  // carte tornano anonime, ed è il difetto che ha svuotato i mazzi vecchi.
  const record = istantanea(pianoDiProva(), { taglia: 20 }, 'Con identità');
  const [voce] = record.mazzi[0].carte;

  assert.equal(voce.idSet, 'prova');
  assert.ok(voce.numero, 'il numero di collezione non si perde per strada');
  assert.equal(voce.nome, 'Charmander');
});

test('le carte da stampare restano riconoscibili dopo la modifica', () => {
  const primo = istantanea(pianoDiProva(), { taglia: 20 }, 'Con proxy');
  const dopo = istantanea(pianoDiProva(), { taglia: 20 }, 'Con proxy', primo.creatoIl);
  const proxy = dopo.mazzi[0].carte.filter((c) => c.proxy);

  assert.equal(proxy.length, 1);
  assert.equal(proxy[0].motivo, 'Energie insufficienti', 'il perché di un proxy sopravvive');
});

test('modificare un piano riletto non lo fa crescere di giro in giro', () => {
  // Riapri → salvi → riapri → salvi. Se `istantanea()` e `idrataPiano()` non
  // fossero l'una l'inversa dell'altra, ogni giro aggiungerebbe o perderebbe
  // qualcosa, e dopo tre modifiche il mazzo non sarebbe più quello.
  const primo = istantanea(pianoDiProva(), { taglia: 20 }, 'Ciclico');
  const secondo = istantanea(idrataPiano(primo), { taglia: 20 }, 'Ciclico', primo.creatoIl);
  const terzo = istantanea(idrataPiano(secondo), { taglia: 20 }, 'Ciclico', primo.creatoIl);

  assert.deepEqual(terzo, secondo, 'dal secondo giro in poi il record è identico');
  assert.equal(terzo.id, primo.id);
});

// --- Il nome scritto in due posti ---------------------------------------
//
// Un mazzo porta il nome nel record (l'etichetta del salvataggio, in cima alla
// schermata) e dentro `mazzi[i].nome` (il titolo sopra l'elenco delle carte,
// più in basso). Rinominando solo il primo, sotto restava quello vecchio.

test('un salvataggio con un mazzo solo: il nome dentro insegue quello fuori', () => {
  const record = { nome: 'Mazzo test', mazzi: [{ nome: 'Mazzo test', carte: [] }] };
  assert.deepEqual(rinominaMazzi(record, 'Andrea 1'), [{ nome: 'Andrea 1', carte: [] }]);
});

test('un mazzo solo si allinea anche se i nomi erano GIÀ diversi', () => {
  // È il caso vero: il record era stato rinominato da una versione che toccava
  // solo l'etichetta, quindi i due nomi non coincidono più — e con la regola
  // "rinomina solo se coincidono" non sarebbero mai tornati a coincidere.
  const record = { nome: 'Andrea 1', mazzi: [{ nome: 'Mazzo test', carte: [] }] };
  assert.deepEqual(rinominaMazzi(record, 'Andrea 2'), [{ nome: 'Andrea 2', carte: [] }]);
});

test('con più mazzi si tocca solo quello che portava il nome della raccolta', () => {
  const record = {
    nome: 'Torneo di Natale',
    mazzi: [{ nome: 'Torneo di Natale' }, { nome: 'Mazzo 2' }, { nome: 'Mazzo 3' }],
  };

  assert.deepEqual(rinominaMazzi(record, 'Torneo 2027'), [
    { nome: 'Torneo 2027' },
    { nome: 'Mazzo 2' },
    { nome: 'Mazzo 3' },
  ]);
});

test('rinominare una raccolta non ribattezza "Mazzo 1", "Mazzo 2"…', () => {
  const record = { nome: 'Serata di giovedì', mazzi: [{ nome: 'Mazzo 1' }, { nome: 'Mazzo 2' }] };
  assert.deepEqual(rinominaMazzi(record, 'Serata di venerdì'), record.mazzi);
});

test('un record senza mazzi non fa esplodere la rinomina', () => {
  assert.deepEqual(rinominaMazzi({ nome: 'Vuoto' }, 'Pieno'), []);
  assert.deepEqual(rinominaMazzi(null, 'Pieno'), []);
});

test('rinominare non tocca le carte del mazzo', () => {
  const carte = [{ nome: 'Pikachu', idSet: 'sv01', numero: '4', quantita: 2 }];
  const record = { nome: 'Prima', mazzi: [{ nome: 'Prima', carte, totale: 2 }] };
  const [mazzo] = rinominaMazzi(record, 'Dopo');

  assert.equal(mazzo.carte, carte, 'le carte sono lo stesso array: niente copie inutili');
  assert.equal(mazzo.totale, 2);
});
