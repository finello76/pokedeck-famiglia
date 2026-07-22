/**
 * Scarica da TCGdex (in italiano) **tutti** i set e li normalizza in
 * `data/set/<id>.json`, tenendo solo i campi utili all'app e al motore.
 *
 * Perché tutti e non solo quelli posseduti: la collezione è fatta di carte
 * sciolte, non di set interi, quindi qualsiasi carta può venire da qualsiasi
 * set. Limitarsi a un elenco significherebbe non poter catalogare la prossima
 * carta che salta fuori da un cassetto.
 *
 * Il peso non è un problema perché la PWA **non li carica tutti**: il service
 * worker precarica solo `indice.json` (~30 KB) e mette in cache il file di un
 * set la prima volta che serve davvero.
 *
 * Questo script è uno strumento di SVILUPPO: gira con Node e il suo risultato
 * viene committato. La PWA a runtime non lo esegue e non chiama TCGdex: legge
 * i JSON statici prodotti qui.
 *
 * È **riprendibile**: i set già scaricati vengono saltati, quindi se si
 * interrompe basta rilanciarlo. Sono oltre 21.000 richieste, ci vogliono
 * diversi minuti.
 *
 * Uso:
 *   node tools/scarica-set.mjs            # scarica i set mancanti
 *   node tools/scarica-set.mjs --forza    # riscarica tutto da capo
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

  let fatte = 0;
  const carte = await inParallelo(elenco, PARALLELE, async (breve) => {
    const completa = await prendiJson(`${API}/cards/${breve.id}`);
    fatte++;
    // Una riga sola riscritta, invece di 21.000 puntini.
    if (fatte % 25 === 0) process.stdout.write(`\r  ${set.id}: ${fatte}/${elenco.length}   `);
    return normalizza(completa);
  });

  console.log(`\r  ${set.id} (${dettaglio.name}): ${carte.length} carte           `);
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
  await mkdir(CARTELLA_DATI, { recursive: true });

  // L'elenco dei set arriva dall'API, non da un file scritto a mano: così i
  // set nuovi compaiono da soli a ogni rilancio.
  const tutti = await prendiJson(`${API}/sets`);
  const daScaricare = tutti
    .filter((s) => (s.cardCount?.total ?? 0) > 0)
    .map((s) => ({ id: s.id, nome: s.name }));

  console.log(`Scarico ${daScaricare.length} set da TCGdex (italiano)`);
  const indice = [];
  const saltati = [];

  /**
   * Quante carte della **numerazione ufficiale** contiene davvero il file.
   *
   * Non coincide col numero di carte: i set hanno segrete oltre il totale
   * (`252` carte per `191` ufficiali), e i set promo usano numerazioni non
   * numeriche (`SM01`, `SWSH033`) che non stanno in nessun conteggio. Serve a
   * dire la verità sul completamento: se dei 30 numeri di un set ne
   * conosciamo 18, mostrare "12/30" fa credere che ne manchino 18 quando
   * dodici non le abbiamo proprio nei dati.
   *
   * @param {object[]} carte
   * @param {number|null} totale
   * @returns {number}
   */
  const contaUfficiali = (carte, totale) =>
    !totale
      ? 0
      : carte.filter((c) => {
          const n = Number(c.numero);
          return Number.isFinite(n) && n >= 1 && n <= totale;
        }).length;

  for (const set of daScaricare) {
    const destinazione = join(CARTELLA_DATI, `${set.id}.json`);
    if (!forza && (await esiste(destinazione))) {
      const gia = JSON.parse(await readFile(destinazione, 'utf8'));
      console.log(`  ${set.id}: già presente (${gia.carte.length} carte), salto`);
      indice.push({
        id: gia.id,
        nome: gia.nome,
        totale: gia.totaleUfficiale,
        carte: gia.carte.length,
        ufficiali: contaUfficiali(gia.carte, gia.totaleUfficiale),
      });
      continue;
    }
    const scaricato = await scaricaSet(set);

    // TCGdex elenca anche set mai usciti in italiano (Jungle, Fossil, era EX,
    // Diamante & Perla, Neo, HeartGold…): compaiono con nome e totale ma senza
    // nemmeno una carta. Vanno esclusi, altrimenti l'app scaricherebbe file
    // vuoti a ogni ricerca che capita sul loro totale stampato.
    if (scaricato.carte.length === 0) {
      console.log(`  ${set.id} (${scaricato.nome}): nessuna carta in italiano, escluso`);
      saltati.push(`${set.id} (${scaricato.nome})`);
      continue;
    }

    await writeFile(destinazione, JSON.stringify(scaricato), 'utf8');
    indice.push({
      id: scaricato.id,
      nome: scaricato.nome,
      totale: scaricato.totaleUfficiale,
      carte: scaricato.carte.length,
      ufficiali: contaUfficiali(scaricato.carte, scaricato.totaleUfficiale),
    });
  }

  // L'indice è il solo file che la PWA carica all'avvio: dice quali set
  // esistono senza dover scaricare tutte le carte di tutti i set.
  await writeFile(join(CARTELLA_DATI, 'indice.json'), JSON.stringify({ set: indice }, null, 2), 'utf8');
  console.log(`\nIndice scritto: ${indice.length} set, ${indice.reduce((s, x) => s + x.carte, 0)} carte totali`);
  if (saltati.length) {
    console.log(`Esclusi ${saltati.length} set senza carte in italiano:`);
    console.log('  ' + saltati.join('\n  '));
  }
}

main().catch((errore) => {
  console.error('\nErrore:', errore.message);
  process.exit(1);
});
