/**
 * Scarica da TCGdex (in italiano) **tutti** i set e li normalizza in
 * `data/set/<id>.json`, tenendo solo i campi utili all'app e al motore.
 *
 * Perché tutti e non solo quelli posseduti: la collezione è fatta di carte
 * sciolte, non di set interi, quindi qualsiasi carta può venire da qualsiasi
 * set. Limitarsi a un elenco significherebbe non poter catalogare la prossima
 * carta che salta fuori da un cassetto.
 *
 * Dove l'italiano non esiste si ripiega sull'inglese: vedi `API_RIPIEGO`. Quei
 * set finiscono nell'indice con `lingua: 'en'`, che l'app usa per dirlo in
 * chiaro invece di far credere che il nome dell'attacco sia quello stampato.
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

/**
 * Ripiego per i set che in italiano non hanno **nessuna** carta.
 *
 * TCGdex tiene una scheda per lingua, e per 80 set — tutta l'era EX, i Neo,
 * Jungle, Fossil, e-Card, le promo Nintendo — la lista italiana è vuota. Quei
 * set in italiano sono usciti davvero: manca il dato, non la stampa. Senza
 * ripiego restano fuori 5.635 carte che nei raccoglitori di casa ci sono.
 *
 * Si prende **solo l'elenco delle carte** da qui: nome del set, totali, serie e
 * data restano quelli italiani, perché quelli l'API li ha (`EX Rubino &
 * Zaffiro`). Cambiano i nomi degli attacchi e le scansioni, ed è per questo che
 * il set viene marcato `lingua: 'en'` invece di mescolarsi in silenzio.
 */
const API_RIPIEGO = 'https://api.tcgdex.net/v2/en';

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
 * Il vocabolario chiuso, dall'inglese all'italiano.
 *
 * Serve perché i campi strutturali **non sono testo da leggere, sono chiavi**:
 * il motore filtra su `categoria === 'Pokémon'` (`analisi.js`), conta le
 * energie per `tipi`, costruisce le linee evolutive su `stadio === 'Base'`.
 * Una carta che arriva con `Pokemon`, `Fire`, `Basic` non verrebbe rifiutata
 * con un errore: sparirebbe in silenzio da ogni conteggio, che è molto peggio.
 *
 * Si traduce solo ciò che è un elenco chiuso — TCGdex lo pubblica su
 * `/categories`, `/stages`, `/types`, `/rarities` in entrambe le lingue.
 * Nome della carta e nomi degli attacchi restano inglesi: sono testo libero,
 * inventarne una traduzione vorrebbe dire scrivere sulla carta cose che sulla
 * carta non ci sono.
 */
const VOCABOLARIO = {
  categoria: { Pokemon: 'Pokémon', Trainer: 'Allenatore', Energy: 'Energia' },

  // `LEVEL-UP` (i Pokémon LV.X dell'era Diamante & Perla) non ha corrispondente:
  // l'elenco italiano di TCGdex non lo contiene, perché nessuna carta italiana
  // nei dati lo usa. Lasciarlo in inglese è deliberato — `linee.js` scarta gli
  // stadi ignoti e `analisi.js` lo dice con l'avviso `stadio-ignoto`, mentre
  // inventare "Livello X" lo farebbe assomigliare a "Livello 1" e il motore
  // proverebbe a incastrarlo in una piramide evolutiva dove non sta.
  stadio: {
    Basic: 'Base',
    Stage1: 'Livello 1',
    Stage2: 'Livello 2',
    MEGA: 'MEGA',
    RESTORED: 'Ricreato',
    BREAK: 'TURBO',
    VMAX: 'VMAX',
    VSTAR: 'V ASTRO',
    'V-UNION': 'V UNIONE',
  },

  tipo: {
    Colorless: 'Incolore',
    Darkness: 'Oscurità',
    Dragon: 'Drago',
    Fairy: 'Folletto',
    Fighting: 'Lotta',
    Fire: 'Fuoco',
    Grass: 'Erba',
    Lightning: 'Lampo',
    Metal: 'Metallo',
    Psychic: 'Psico',
    Water: 'Acqua',
  },

  energia: { Basic: 'Base', Special: 'Speciale' },

  // Solo le rarità che hanno davvero un gemello nell'elenco italiano. Quelle
  // delle ere mai uscite qui (`LEGEND`, `Rare PRIME`, `Rare Holo LV.X`) non ce
  // l'hanno: restano com'è e `rarita.js` le raccoglie in "Altra rarità", che è
  // una risposta onesta invece di una traduzione inventata.
  rarita: {
    Common: 'Comune',
    Uncommon: 'Non comune',
    Rare: 'Rara',
    'Rare Holo': 'Olografica Rara',
    'Holo Rare': 'Olografica Rara',
    'Holo Rare V': 'Olografica Rara V',
    'Holo Rare VMAX': 'Olografica Rara VMAX',
    'Holo Rare VSTAR': 'Olografica Rara VSTAR',
    'Double rare': 'Rara doppia',
    'Hyper rare': 'Rara iper',
    'Illustration rare': 'Rara illustrazione',
    'Special illustration rare': 'Rara illustrazione speciale',
    'Secret Rare': 'Segreto rara',
    'Ultra Rare': 'Ultrarara',
    'ACE SPEC Rare': 'rara ASSO TATTICO',
    'Full Art Trainer': "Allenatore d'arte completa",
    'Black White Rare': 'Rara Bianco e Nero',
    'Radiant Rare': 'Rara Lucente',
    'Mega Hyper Rare': 'Mega Iper Raro',
    'Shiny Ultra Rare': 'ultrarara cromatica',
    'Amazing Rare': 'Policrome',
    Crown: 'Couronne',
    None: 'Nessuna',
    Promo: 'Promo',

    // Le rarità di Pokémon TCG Pocket (◆ e ★ stampati sulla carta). Nei set
    // italiani TCGdex le dà in francese — è un suo pasticcio, non nostro — e
    // `rarita.js` le riconosce in quella forma. Si allinea alla forma già
    // presente nei dati invece di introdurne una terza.
    'One Diamond': 'Une Diamant',
    'Two Diamond': 'deux Diamant',
    'Three Diamond': 'Trois Diamant',
    'Four Diamond': 'Quatre Diamant',
    'One Star': 'Une Étoile',
    'Two Star': 'deux Étoiles',
    'Three Star': 'Trois Étoiles',
    'One Shiny': 'Un Chromatique',
    'Two Shiny': 'Deux Chromatique',
  },
};

/**
 * Traduce un valore del vocabolario chiuso, lasciandolo com'è se non è noto.
 * @param {keyof VOCABOLARIO} campo
 * @param {string|null|undefined} valore
 * @returns {string|null|undefined}
 */
function traduci(campo, valore) {
  if (valore == null) return valore;
  return VOCABOLARIO[campo][valore] ?? valore;
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
  // Si traduce sempre, non solo per i set inglesi: sui dati italiani la tabella
  // non trova nulla da cambiare e li lascia passare intatti. Un ramo in meno da
  // sbagliare, e nessun bisogno di far viaggiare la lingua fin qui.
  const categoria = traduci('categoria', carta.category);

  const snella = {
    numero: carta.localId,
    nome: carta.name,
    categoria,
    rarita: traduci('rarita', carta.rarity) ?? null,
    immagine: carta.image ?? null,
  };

  if (categoria === 'Pokémon') {
    snella.stadio = traduci('stadio', carta.stage) ?? null;
    snella.evolveDa = carta.evolveFrom ?? null;
    snella.tipi = (carta.types ?? []).map((t) => traduci('tipo', t));
    snella.ps = carta.hp ?? null;
    snella.ritirata = carta.retreat ?? null;
    snella.attacchi = (carta.attacks ?? []).map((a) => ({
      nome: a.name,
      // Il costo è fatto di **tipi**, non di numeri: `['Fire','Colorless']`.
      // È il campo su cui `fabbisogno.js` decide quali energie servono, quindi
      // va tradotto come i tipi del Pokémon o il conto non torna.
      costo: (a.cost ?? []).map((c) => traduci('tipo', c)),
      danno: a.damage ?? null,
    }));
  }

  if (categoria === 'Energia') {
    // `energyType` distingue le energie Base dalle Speciali: è la differenza che
    // conta per il motore, perché solo le Base sfuggono al limite di 4 copie.
    snella.tipoEnergia = traduci('energia', carta.energyType) ?? null;
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

  // Il ripiego scatta solo sullo zero assoluto. Un set con *qualche* carta
  // italiana si tiene com'è: rattoppare i buchi con l'inglese darebbe un set
  // mezzo e mezzo, dove non si sa più che lingua stai guardando.
  let elenco = dettaglio.cards ?? [];
  let lingua = 'it';
  let fonte = API;
  if (elenco.length === 0) {
    const ripiego = await prendiJson(`${API_RIPIEGO}/sets/${set.id}`);
    elenco = ripiego.cards ?? [];
    lingua = 'en';
    fonte = API_RIPIEGO;
  }

  let fatte = 0;
  /** @type {string[]} carte che l'API non serve: si saltano, ma si dicono. */
  const perse = [];

  const scaricate = await inParallelo(elenco, PARALLELE, async (breve) => {
    let completa = null;
    try {
      completa = await prendiJson(`${fonte}/cards/${breve.id}`);
    } catch {
      // Una carta irraggiungibile non deve far cadere 80 set di download. Il
      // caso noto è l'Unown "?" di `exu`: il suo id contiene un punto
      // interrogativo e l'API non riesce a servirlo nemmeno codificato. È un
      // buco a monte, non un errore nostro — si registra e si va avanti.
      perse.push(breve.localId ?? breve.id);
    }
    fatte++;
    // Una riga sola riscritta, invece di 21.000 puntini.
    if (fatte % 25 === 0) process.stdout.write(`\r  ${set.id}: ${fatte}/${elenco.length}   `);
    return completa && normalizza(completa);
  });
  const carte = scaricate.filter(Boolean);

  const marchio = lingua === 'en' ? ' [dati in inglese]' : '';
  const buchi = perse.length ? `, ${perse.length} non servite dall'API (${perse.join(', ')})` : '';
  console.log(`\r  ${set.id} (${dettaglio.name}): ${carte.length} carte${marchio}${buchi}           `);
  return {
    id: set.id,
    nome: dettaglio.name,
    totaleUfficiale: dettaglio.cardCount?.official ?? null,
    totaleConSegrete: dettaglio.cardCount?.total ?? null,
    // Scritto solo quando vale `en`: assente significa italiano. Così i 110 set
    // già scaricati non cambiano di una virgola e il diff mostra solo i nuovi.
    ...(lingua === 'en' ? { lingua } : {}),
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
        ...(gia.lingua ? { lingua: gia.lingua } : {}),
      });
      continue;
    }
    const scaricato = await scaricaSet(set);

    // Restano fuori solo i set che non hanno carte **in nessuna delle due
    // lingue**: esistono nell'elenco con nome e totale ma non hanno contenuto.
    // Vanno esclusi, altrimenti l'app scaricherebbe file vuoti a ogni ricerca
    // che capita sul loro totale stampato.
    if (scaricato.carte.length === 0) {
      console.log(`  ${set.id} (${scaricato.nome}): nessuna carta, né in italiano né in inglese`);
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
      ...(scaricato.lingua ? { lingua: scaricato.lingua } : {}),
    });
  }

  // L'indice è il solo file che la PWA carica all'avvio: dice quali set
  // esistono senza dover scaricare tutte le carte di tutti i set.
  await writeFile(join(CARTELLA_DATI, 'indice.json'), JSON.stringify({ set: indice }, null, 2), 'utf8');
  console.log(`\nIndice scritto: ${indice.length} set, ${indice.reduce((s, x) => s + x.carte, 0)} carte totali`);

  const inglesi = indice.filter((s) => s.lingua === 'en');
  if (inglesi.length) {
    const carte = inglesi.reduce((s, x) => s + x.carte, 0);
    console.log(`Di questi, ${inglesi.length} set (${carte} carte) hanno i dati in inglese.`);
  }
  if (saltati.length) {
    console.log(`Esclusi ${saltati.length} set senza carte in nessuna lingua:`);
    console.log('  ' + saltati.join('\n  '));
  }
  console.log('\nOra: aggiorna-serie.mjs, aggiorna-anni.mjs, genera-indice-evoluzioni.mjs.');
}

main().catch((errore) => {
  console.error('\nErrore:', errore.message);
  process.exit(1);
});
