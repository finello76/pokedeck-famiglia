/**
 * Test di `src/data/dataset.js`.
 *
 * `dataset.js` usa `fetch`, che in Node esiste ma qui punterebbe alla rete:
 * lo si sostituisce con una versione finta che serve dati inventati. Serve
 * anche a documentare il formato che il modulo si aspetta.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/** Dati finti serviti dalla fetch sostituita. */
const FINTI = {
  'indice.json': {
    set: [
      { id: 'alfa', nome: 'Set Alfa', totale: 100, carte: 2 },
      { id: 'beta', nome: 'Set Beta', totale: 100, carte: 1 },
      { id: 'gamma', nome: 'Set Gamma', totale: 50, carte: 1 },
      { id: 'rotto', nome: 'Set Irraggiungibile', totale: 100, carte: 1 },
    ],
  },
  'alfa.json': {
    id: 'alfa',
    nome: 'Set Alfa',
    carte: [
      { numero: '007', nome: 'Sette Alfa', categoria: 'Pokémon' },
      { numero: 'TG01', nome: 'Codice Alfa', categoria: 'Pokémon' },
      // Evoluzione con evolveDa MANCANTE: il dataset è così nel 41% dei casi.
      { numero: '020', nome: 'Ivyfinta', categoria: 'Pokémon', stadio: 'Livello 1' },
    ],
  },
  // L'indice delle evoluzioni: il completamento lo legge da qui. `nonPokemon`
  // sono le pre-evoluzioni che in realtà sono carte Allenatore (i fossili).
  'evoluzioni.json': {
    da: { ivyfinta: 'Bulbafinta', omafinta: 'Vecchio Fossilfinto' },
    nonPokemon: ['Vecchio Fossilfinto'],
  },
  'beta.json': {
    id: 'beta',
    nome: 'Set Beta',
    carte: [{ numero: '007', nome: 'Sette Beta', categoria: 'Pokémon' }],
  },
  'gamma.json': {
    id: 'gamma',
    nome: 'Set Gamma',
    carte: [{ numero: '007', nome: 'Sette Gamma', categoria: 'Pokémon' }],
  },
  // L'indice dei nomi: nome normalizzato → 'idSet:numero …'. Nota `rotto`, che
  // simula il set irraggiungibile anche per questa strada.
  'nomi.json': {
    'sette alfa': 'alfa:007',
    'sette beta': 'beta:007',
    'sette gamma': 'gamma:007',
    'codice alfa': 'alfa:TG01',
    ivyfinta: 'alfa:020',
    'carta perduta': 'rotto:001',
  },
};

globalThis.fetch = async (url) => {
  const nome = String(url).split('/').pop();
  // 'rotto.json' simula un set non scaricabile: è il caso offline.
  if (!FINTI[nome]) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => FINTI[nome] };
};

// L'import va fatto DOPO aver sostituito fetch: il modulo la usa al primo uso,
// ma meglio non dipendere dall'ordine interno.
const dataset = await import('../src/data/dataset.js');

test('trova una carta per set e numero', async () => {
  const carta = await dataset.trovaCarta('alfa', '007');
  assert.equal(carta.nome, 'Sette Alfa');
});

test('ignora gli zeri iniziali in entrambi i versi', async () => {
  assert.equal((await dataset.trovaCarta('alfa', 7)).nome, 'Sette Alfa');
  assert.equal((await dataset.trovaCarta('alfa', '7')).nome, 'Sette Alfa');
  assert.equal((await dataset.trovaCarta('alfa', '007')).nome, 'Sette Alfa');
});

test('gestisce i numeri non numerici delle sottoserie', async () => {
  assert.equal((await dataset.trovaCarta('alfa', 'TG01')).nome, 'Codice Alfa');
  assert.equal((await dataset.trovaCarta('alfa', 'tg01')).nome, 'Codice Alfa');
});

test('un numero inesistente non esplode', async () => {
  assert.equal(await dataset.trovaCarta('alfa', '999'), null);
});

test('una stringa vuota non trova la carta numero zero', async () => {
  // Number('') vale 0: senza la guardia esplicita, un campo lasciato vuoto
  // avrebbe trovato una carta a caso.
  assert.equal(await dataset.trovaCarta('alfa', ''), null);
});

test('il totale stampato restituisce TUTTI i set candidati', async () => {
  const { trovate } = await dataset.cercaPerNumeroStampato('007', 100);
  const nomi = trovate.map((t) => t.carta.nome).sort();
  // gamma ha totale 50: non deve comparire.
  assert.deepEqual(nomi, ['Sette Alfa', 'Sette Beta']);
});

test('un set non leggibile non fa fallire la ricerca ma viene segnalato', async () => {
  const { trovate, nonLetti } = await dataset.cercaPerNumeroStampato('007', 100);
  assert.equal(trovate.length, 2, 'le carte leggibili si trovano lo stesso');
  assert.deepEqual(nonLetti, ['Set Irraggiungibile'], 'il set mancante viene segnalato');
});

test('un totale senza set candidati torna vuoto senza errori', async () => {
  const { trovate, nonLetti } = await dataset.cercaPerNumeroStampato('007', 12345);
  assert.deepEqual(trovate, []);
  assert.deepEqual(nonLetti, []);
});

test('la ricerca per nome trova la carta in un set mai caricato', async () => {
  const { trovate } = await dataset.cercaPerNomeGlobale('sette beta');
  assert.deepEqual(
    trovate.map((t) => `${t.set.nome} · ${t.carta.nome}`),
    ['Set Beta · Sette Beta'],
  );
});

test('il nome parziale trova tutte le stampe, il numero le restringe', async () => {
  const larga = await dataset.cercaPerNomeGlobale('sette');
  assert.equal(larga.trovate.length, 3, 'tre "Sette" in tre set diversi');

  // È il motivo per cui il campo numero esiste: da solo il nome non basta.
  const stretta = await dataset.cercaPerNomeGlobale('sette', '007');
  assert.equal(stretta.trovate.length, 3, 'qui hanno tutte lo stesso numero');

  const nessuna = await dataset.cercaPerNomeGlobale('sette', '999');
  assert.deepEqual(nessuna.trovate, [], 'numero che non esiste: nessun candidato');
});

test('il numero stampato con gli zeri iniziali corrisponde lo stesso', async () => {
  // Sulla carta c'è `032`, nei dati `32` — o viceversa. È il caso normale
  // delle promo, non un'eccezione.
  const { trovate } = await dataset.cercaPerNomeGlobale('sette alfa', '7');
  assert.equal(trovate.length, 1);
  assert.equal((await dataset.cercaPerNomeGlobale('sette alfa', '007')).trovate.length, 1);
});

test('i numeri non numerici si confrontano come testo', async () => {
  const { trovate } = await dataset.cercaPerNomeGlobale('codice alfa', 'tg01');
  assert.equal(trovate.length, 1, 'maiuscole indifferenti anche sul numero');
});

test('la corrispondenza esatta ha la precedenza sulla parziale', async () => {
  // "sette alfa" è contenuto solo in sé stesso, ma il principio conta quando
  // un nome è prefisso di un altro ("Articuno" dentro "Articuno ex").
  const { trovate } = await dataset.cercaPerNomeGlobale('sette alfa');
  assert.equal(trovate.length, 1);
});

test('la ricerca per nome ignora accenti e maiuscole', async () => {
  const { trovate } = await dataset.cercaPerNomeGlobale('SÈTTE ALFA');
  assert.equal(trovate.length, 1, 'normalizzato come nell\'indice');
});

test('un set non leggibile non fa fallire la ricerca per nome ma viene segnalato', async () => {
  const { trovate, nonLetti } = await dataset.cercaPerNomeGlobale('carta perduta');
  assert.deepEqual(trovate, []);
  assert.deepEqual(nonLetti, ['Set Irraggiungibile']);
});

test('un nome che non esiste torna vuoto senza errori', async () => {
  const { trovate, nonLetti, troppi } = await dataset.cercaPerNomeGlobale('zzz inesistente');
  assert.deepEqual(trovate, []);
  assert.deepEqual(nonLetti, []);
  assert.equal(troppi, false);
});

test('un nome vuoto non cerca niente', async () => {
  const { trovate } = await dataset.cercaPerNomeGlobale('   ');
  assert.deepEqual(trovate, [], 'un campo lasciato vuoto non deve dare risultati');
});

test("l'URL dell'immagine cambia con l'uso", () => {
  const carta = { immagine: 'https://esempio/it/x/1' };
  assert.equal(dataset.urlImmagine(carta), 'https://esempio/it/x/1/low.webp');
  assert.equal(dataset.urlImmagine(carta, 'stampa'), 'https://esempio/it/x/1/high.png');
  assert.equal(dataset.urlImmagine({ immagine: null }), null);
});

test("trovaCarta completa l'evolveDa mancante dall'indice", async () => {
  // È la correzione del difetto: senza, l'evoluzione risultava orfana anche
  // possedendo la sua Base, e il motore la escludeva o stampava un proxy inutile.
  const carta = await dataset.trovaCarta('alfa', '020');
  assert.equal(carta.evolveDa, 'Bulbafinta', 'evolveDa recuperato dall\'indice');
});

test('preEvoluzioneDi risponde per nome, con e senza corrispondenza', async () => {
  assert.equal(await dataset.preEvoluzioneDi('Ivyfinta'), 'Bulbafinta');
  assert.equal(await dataset.preEvoluzioneDi('Sconosciuto'), null);
});

test('i fossili si distinguono dalle vere pre-evoluzioni', async () => {
  // Omanyte "evolve" da Vecchio Helixfossile, che è una carta Allenatore: il
  // motore non deve stamparla come se fosse un Pokémon Base.
  const fossili = await dataset.preEvoluzioniNonPokemon();
  assert.ok(fossili.has('vecchio fossilfinto'), 'il nome è normalizzato');
  assert.ok(!fossili.has('bulbafinta'), 'una Base vera non ci finisce dentro');
  assert.equal(await dataset.preEvoluzioneDi('Omafinta'), 'Vecchio Fossilfinto',
    'il collegamento resta: serve a sapere che quella carta ti occorre');
});

test('completaEvoluzione non tocca chi ha già evolveDa o non è Pokémon', async () => {
  const conEvoluzione = { nome: 'X', categoria: 'Pokémon', evolveDa: 'Y' };
  assert.strictEqual(await dataset.completaEvoluzione(conEvoluzione), conEvoluzione);

  const energia = { nome: 'Energia', categoria: 'Energia' };
  assert.strictEqual(await dataset.completaEvoluzione(energia), energia);

  assert.equal(await dataset.completaEvoluzione(null), null);
});
