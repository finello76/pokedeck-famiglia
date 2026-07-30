/**
 * Recupera le scansioni mancanti **solo per i set marcati `lingua: 'en'`**.
 *
 * ## Il fatto
 *
 * 1.374 carte su 21.264 (il 6,5%) non hanno `immagine` nei file dei set, e 36
 * set ne sono privi del tutto: Set Base, SL Promo, le Gallerie Allenatori, le
 * McDonald's. A schermo diventano segnaposti tinti — corretti, ma sono carte
 * che in mano ce le hai.
 *
 * Per una parte di quei set la scansione **esiste**, solo in inglese:
 * `assets.tcgdex.net/en/base/base1/4/low.webp` risponde 200 mentre la stessa
 * carta in italiano non c'è. `scarica-set.mjs` ripiega sull'inglese per i nomi
 * ma prende le immagini dalla scheda italiana, che per quei set è vuota.
 *
 * ## Perché solo i set `lingua: 'en'`
 *
 * Perché mettere una scansione inglese su un set **italiano** sarebbe inglese
 * non dichiarato, che in questo progetto è la cosa da non fare (vedi
 * `docs/apprendimento/14-una-lingua-che-manca.md`): guardando *Set Base*
 * l'utente vedrebbe una carta in inglese senza che nessuno glielo dica, e
 * crederebbe che sulla sua carta ci sia scritto così.
 *
 * Sui set già marcati `lingua: 'en'` invece l'avviso c'è già — la pastiglia
 * "EN" di `src/ui/lingua-set.js` compare in griglia, nel visore e nella linea
 * evolutiva. Là la scansione inglese è coerente col resto: nomi inglesi,
 * attacchi inglesi, foto inglese. Non si sta nascondendo niente.
 *
 * Chi volesse anche gli altri set deve prima decidere **come dichiararlo per
 * carta**, che è una scelta di interfaccia, non di dati.
 *
 * Strumento di **sviluppo**: una richiesta per set, il risultato si committa.
 *
 * Uso:
 *     node tools/recupera-immagini.mjs           # scrive
 *     node tools/recupera-immagini.mjs --prova   # dice solo cosa farebbe
 *
 * @module tools/recupera-immagini
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CARTELLA_SET = 'data/set';
const API = 'https://api.tcgdex.net/v2/en/sets';
const prova = process.argv.includes('--prova');

/**
 * GET JSON con qualche tentativo: l'API ogni tanto chiude la connessione.
 * @param {string} url
 * @param {number} [tentativi=3]
 * @returns {Promise<any>}
 */
async function prendiJson(url, tentativi = 3) {
  for (let i = 1; i <= tentativi; i += 1) {
    try {
      const risposta = await fetch(url);
      if (!risposta.ok) throw new Error(`HTTP ${risposta.status}`);
      return await risposta.json();
    } catch (errore) {
      if (i === tentativi) throw new Error(`${url}: ${errore.message}`);
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
  return null;
}

const indice = JSON.parse(readFileSync(join(CARTELLA_SET, 'indice.json'), 'utf8'));
const inglesi = indice.set.filter((s) => s.lingua === 'en');

console.log(`${inglesi.length} set marcati lingua: 'en'.`);

let setToccati = 0;
let carteRecuperate = 0;
let carteSenzaRimedio = 0;

for (const riga of inglesi) {
  const percorso = join(CARTELLA_SET, `${riga.id}.json`);
  const set = JSON.parse(readFileSync(percorso, 'utf8'));
  const mancanti = set.carte.filter((c) => !c.immagine);
  if (!mancanti.length) continue;

  let scheda;
  try {
    scheda = await prendiJson(`${API}/${riga.id}`);
  } catch (errore) {
    console.log(`  ${riga.id}: non letto (${errore.message})`);
    continue;
  }

  // `localId` è il numero di collezione stampato sulla carta, ed è la stessa
  // cosa che noi chiamiamo `numero`. Si confronta come stringa: le promo hanno
  // numeri come `SWSH033`, che numero non sono.
  const perNumero = new Map(
    (scheda.cards ?? []).filter((c) => c.image).map((c) => [String(c.localId), c.image]),
  );

  let presi = 0;
  for (const carta of set.carte) {
    if (carta.immagine) continue;
    const url = perNumero.get(String(carta.numero));
    if (!url) {
      carteSenzaRimedio += 1;
      continue;
    }
    carta.immagine = url;
    presi += 1;
  }

  if (!presi) {
    console.log(`  ${riga.id.padEnd(12)} ${riga.nome}: nessuna scansione nemmeno in inglese`);
    continue;
  }

  if (!prova) writeFileSync(percorso, `${JSON.stringify(set)}\n`);
  setToccati += 1;
  carteRecuperate += presi;
  console.log(`  ${riga.id.padEnd(12)} ${riga.nome}: +${presi} scansioni`);
}

console.log(
  `\n${prova ? '[prova] ' : ''}${carteRecuperate} scansioni recuperate in ${setToccati} set.`,
);
if (carteSenzaRimedio) {
  console.log(`${carteSenzaRimedio} carte restano senza: non esistono nemmeno in inglese.`);
}
console.log('\nRicordarsi di alzare VERSIONE_DATI in sw.js: i file dei set stanno');
console.log('in una cache che si svuota solo quando quel numero cambia.');
