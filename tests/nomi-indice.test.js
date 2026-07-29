/**
 * Test dell'indice dei nomi (`data/nomi.json`) e della ricerca che lo usa.
 *
 * Qui si difende un accoppiamento invisibile. L'indice lo **scrive**
 * `tools/genera-indice-nomi.mjs` con `normalizzaNome` di `src/engine/nomi.js`;
 * lo **legge** `cercaPerNomeGlobale` con la `normalizza` privata di
 * `src/data/dataset.js`, che è una copia deliberata — `data/` non deve
 * dipendere da `engine/`.
 *
 * Due funzioni identiche in due file diversi restano identiche finché qualcuno
 * non tocca una sola delle due. Se diverge anche di un carattere, l'indice non
 * dà errore: **smette semplicemente di trovare** le carte il cui nome cade nella
 * differenza. È il tipo di guasto che nessuno nota per mesi.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { normalizzaNome } from '../src/engine/nomi.js';

/** Nomi scelti perché cadono proprio sulle regole di normalizzazione. */
const INSIDIOSI = [
  'Shaymin-V', // trattino → spazio
  'Oscurità', // accento composto
  'Nidoran♂', // simbolo non alfabetico
  'Mr.  Mime', // spazio doppio
  'PIKACHU', // maiuscole
  'Sneasel di Hisui', // spazi semplici
  'Articuno ex', // il caso che ha originato tutto
];

const FINTI = {
  'indice.json': { set: [{ id: 'alfa', nome: 'Set Alfa', totale: 100, carte: INSIDIOSI.length }] },
  'alfa.json': {
    id: 'alfa',
    nome: 'Set Alfa',
    carte: INSIDIOSI.map((nome, i) => ({
      numero: String(i + 1).padStart(3, '0'),
      nome,
      categoria: 'Pokémon',
    })),
  },
  // Costruito con la funzione del *generatore*: è il punto del test.
  'nomi.json': Object.fromEntries(
    INSIDIOSI.map((nome, i) => [normalizzaNome(nome), `alfa:${String(i + 1).padStart(3, '0')}`]),
  ),
  'evoluzioni.json': { da: {}, nonPokemon: [] },
};

globalThis.fetch = async (url) => {
  const nome = String(url).split('/').pop();
  if (!FINTI[nome]) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => FINTI[nome] };
};

const dataset = await import('../src/data/dataset.js');

test('le due normalizzazioni concordano: ogni nome insidioso si ritrova', async () => {
  for (const nome of INSIDIOSI) {
    const { trovate } = await dataset.cercaPerNomeGlobale(nome);
    assert.equal(
      trovate.length,
      1,
      `"${nome}" non si ritrova: normalizzaNome (engine/nomi.js) e normalizza ` +
        '(data/dataset.js) sono divergute',
    );
    assert.equal(trovate[0].carta.nome, nome);
  }
});

test('una ricerca troppo vaga si ferma invece di aprire tutto il catalogo', async () => {
  // Il caso reale: "ar" corrisponde a 40 nomi, ristampati in 147 set diversi.
  // Senza tetto la ricerca scaricava 8 MB per due lettere digitate.
  const molti = {};
  for (let s = 0; s < 100; s += 1) {
    molti[`carta ${s}`] = `set${s}:001`;
  }
  const finti = {
    'indice.json': {
      set: Array.from({ length: 100 }, (_, s) => ({ id: `set${s}`, nome: `Set ${s}`, totale: 1, carte: 1 })),
    },
    'nomi.json': molti,
    'evoluzioni.json': { da: {}, nonPokemon: [] },
  };
  for (let s = 0; s < 100; s += 1) {
    finti[`set${s}.json`] = {
      id: `set${s}`,
      nome: `Set ${s}`,
      carte: [{ numero: '001', nome: `Carta ${s}`, categoria: 'Pokémon' }],
    };
  }

  const precedente = globalThis.fetch;
  const aperti = new Set();
  globalThis.fetch = async (url) => {
    const nome = String(url).split('/').pop();
    if (nome.startsWith('set')) aperti.add(nome);
    if (!finti[nome]) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => finti[nome] };
  };

  // Modulo fresco: le cache interne sono per-istanza.
  const isolato = await import(`../src/data/dataset.js?tetto=${Date.now()}`);
  const { trovate, troppi } = await isolato.cercaPerNomeGlobale('carta');
  globalThis.fetch = precedente;

  assert.equal(troppi, true, 'la troncatura deve essere dichiarata a chi chiama');
  assert.ok(aperti.size <= 12, `aperti ${aperti.size} set: il tetto sui file non ha retto`);
  assert.ok(trovate.length > 0, 'qualche risultato si deve comunque dare');
});

test("l'indice dei nomi reale è coerente con i file dei set", () => {
  const indice = JSON.parse(readFileSync('data/nomi.json', 'utf8'));

  // Ogni posizione dichiarata deve puntare a una carta che esiste davvero.
  // Un indice che promette carte inesistenti è peggio di un indice assente:
  // la ricerca mostra un candidato che poi non si può aggiungere.
  const carteVere = new Map();
  for (const file of readdirSync('data/set')) {
    if (!file.endsWith('.json') || file === 'indice.json') continue;
    const set = JSON.parse(readFileSync(`data/set/${file}`, 'utf8'));
    for (const carta of set.carte) carteVere.set(`${set.id}:${carta.numero}`, carta.nome);
  }

  let controllate = 0;
  const sbagliate = [];
  for (const [chiave, posizioni] of Object.entries(indice)) {
    for (const posizione of posizioni.split(' ')) {
      const nome = carteVere.get(posizione);
      if (nome === undefined) {
        sbagliate.push(`${posizione} non esiste (nome "${chiave}")`);
      } else if (normalizzaNome(nome) !== chiave) {
        sbagliate.push(`${posizione} si chiama "${nome}", non "${chiave}"`);
      }
      controllate += 1;
    }
  }

  assert.deepEqual(sbagliate.slice(0, 5), [], 'posizioni sbagliate nell\'indice');
  assert.equal(controllate, carteVere.size, "l'indice copre tutte le carte del repository");
});

test("l'indice è aggiornato: contiene i set arrivati per ultimi", () => {
  // Il generatore va rilanciato dopo `scarica-set.mjs`, e dimenticarlo è
  // facilissimo: l'app continua a funzionare, solo senza le carte nuove.
  const indice = JSON.parse(readFileSync('data/nomi.json', 'utf8'));
  const set = new Set();
  for (const posizioni of Object.values(indice)) {
    for (const posizione of posizioni.split(' ')) set.add(posizione.slice(0, posizione.indexOf(':')));
  }

  const suDisco = readdirSync('data/set')
    .filter((f) => f.endsWith('.json') && f !== 'indice.json')
    .map((f) => f.replace(/\.json$/, ''));

  assert.deepEqual(
    suDisco.filter((id) => !set.has(id)),
    [],
    'set presenti nel repository ma assenti dall\'indice dei nomi: rilancia tools/genera-indice-nomi.mjs',
  );
});
