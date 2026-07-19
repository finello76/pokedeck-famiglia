/**
 * Scarica da TCGdex (in italiano) i set elencati in `tools/set-posseduti.json`
 * e li normalizza in `data/set/<id>.json`, tenendo solo i campi che servono
 * all'app e al motore di generazione mazzi.
 *
 * Questo script è uno strumento di SVILUPPO: gira una volta sola con Node e il
 * suo risultato viene committato. La PWA a runtime non lo esegue e non chiama
 * TCGdex: legge i JSON statici prodotti qui. Il vincolo "zero backend, zero
 * build" resta rispettato.
 *
 * Uso:
 *   node tools/scarica-set.mjs            # scarica i set mancanti
 *   node tools/scarica-set.mjs --forza    # riscarica tutto
 *
 * @module tools/scarica-set
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARTELLA_DATI = join(RADICE, 'data', 'set');
const API = 'https://api.tcgdex.net/v2/it';

/** Quante carte scaricare in parallelo. Tenuto basso per non martellare l'API. */
const PARALLELE = 8;

/**
 * Esegue una GET JSON con qualche tentativo in caso di errore di rete.
 * @param {string} url
 * @param {number} [tentativi=3]
 * @returns {Promise<any>}
 */
async function prendiJson(url, tentativi = 3) {
  for (let i = 1; i <= tentativi; i++) {
    try {
      const risposta = await fetch(url);
      if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
      return await risposta.json();
    } catch (errore) {
      if (i === tentativi) throw new Error(`${url}: ${errore.message}`);
      await new Promise((ok) => setTimeout(ok, 400 * i));
    }
  }
}

/**
 * Esegue `lavoro` su ogni elemento con un tetto di esecuzioni contemporanee.
 * Equivale a un pool di thread limitato, ma su una sola thread con le Promise.
 * @template T, R
 * @param {T[]} elementi
 * @param {number} limite
 * @param {(elemento: T) => Promise<R>} lavoro
 * @returns {Promise<R[]>}
 */
async function inParallelo(elementi, limite, lavoro) {
  const risultati = new Array(elementi.length);
  let prossimo = 0;
  const operai = Array.from({ length: Math.min(limite, elementi.length) }, async () => {
    while (prossimo < elementi.length) {
      const mio = prossimo++;
      risultati[mio] = await lavoro(elementi[mio]);
    }
  });
  await Promise.all(operai);
  return risultati;
}

/**
 * Riduce una carta TCGdex ai soli campi usati dall'app.
 *
 * Nota: `image` arriva SENZA estensione (es. `.../sv/sv08/118`). Il suffisso
 * (`/low.webp`, `/high.png`) lo sceglie chi la mostra, in base all'uso.
 *
 * @param {any} carta risposta grezza di TCGdex
 * @returns {object} carta normalizzata
 */
function normalizza(carta) {
  const snella = {
    numero: carta.localId,
    nome: carta.name,
    categoria: carta.category,
    rarita: carta.rarity ?? null,
    immagine: carta.image ?? null,
  };

  if (carta.category === 'Pokémon') {
    snella.stadio = carta.stage ?? null;
    snella.evolveDa = carta.evolveFrom ?? null;
    snella.tipi = carta.types ?? [];
    snella.ps = carta.hp ?? null;
    snella.ritirata = carta.retreat ?? null;
    snella.attacchi = (carta.attacks ?? []).map((a) => ({
      nome: a.name,
      costo: a.cost ?? [],
      danno: a.damage ?? null,
    }));
  }

  if (carta.category === 'Energia') {
    // `energyType` distingue le energie Base dalle Speciali: è la differenza che
    // conta per il motore, perché solo le Base sfuggono al limite di 4 copie.
    snella.tipoEnergia = carta.energyType ?? null;
  }

  return snella;
}

/**
 * Scarica e normalizza un intero set.
 * @param {{id: string, nome: string}} set
 * @returns {Promise<object>} il set normalizzato, pronto da scrivere su file
 */
async function scaricaSet(set) {
  const dettaglio = await prendiJson(`${API}/sets/${set.id}`);
  const elenco = dettaglio.cards ?? [];
  process.stdout.write(`  ${set.id} (${dettaglio.name}): ${elenco.length} carte `);

  const carte = await inParallelo(elenco, PARALLELE, async (breve) => {
    const completa = await prendiJson(`${API}/cards/${breve.id}`);
    process.stdout.write('.');
    return normalizza(completa);
  });

  console.log(' fatto');
  return {
    id: set.id,
    nome: dettaglio.name,
    totaleUfficiale: dettaglio.cardCount?.official ?? null,
    totaleConSegrete: dettaglio.cardCount?.total ?? null,
    scaricatoIl: new Date().toISOString().slice(0, 10),
    carte,
  };
}

/**
 * @param {string} percorso
 * @returns {Promise<boolean>}
 */
async function esiste(percorso) {
  try {
    await access(percorso);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const forza = process.argv.includes('--forza');
  const config = JSON.parse(await readFile(join(RADICE, 'tools', 'set-posseduti.json'), 'utf8'));
  await mkdir(CARTELLA_DATI, { recursive: true });

  console.log(`Scarico ${config.set.length} set da TCGdex (italiano)`);
  const indice = [];

  for (const set of config.set) {
    const destinazione = join(CARTELLA_DATI, `${set.id}.json`);
    if (!forza && (await esiste(destinazione))) {
      const gia = JSON.parse(await readFile(destinazione, 'utf8'));
      console.log(`  ${set.id}: già presente (${gia.carte.length} carte), salto`);
      indice.push({ id: gia.id, nome: gia.nome, totale: gia.totaleUfficiale, carte: gia.carte.length });
      continue;
    }
    const scaricato = await scaricaSet(set);
    await writeFile(destinazione, JSON.stringify(scaricato), 'utf8');
    indice.push({
      id: scaricato.id,
      nome: scaricato.nome,
      totale: scaricato.totaleUfficiale,
      carte: scaricato.carte.length,
    });
  }

  // L'indice è il solo file che la PWA carica all'avvio: dice quali set
  // esistono senza dover scaricare tutte le carte di tutti i set.
  await writeFile(join(CARTELLA_DATI, 'indice.json'), JSON.stringify({ set: indice }, null, 2), 'utf8');
  console.log(`\nIndice scritto: ${indice.length} set, ${indice.reduce((s, x) => s + x.carte, 0)} carte totali`);
}

main().catch((errore) => {
  console.error('\nErrore:', errore.message);
  process.exit(1);
});
