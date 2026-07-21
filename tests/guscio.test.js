/**
 * Test dell'elenco `GUSCIO` di `sw.js`.
 *
 * La regressione da cui nasce questo file: un modulo cancellato era rimasto
 * nell'elenco dei file da precaricare. `cache.addAll()` è tutto-o-niente,
 * quindi l'installazione del service worker nuovo falliva **in silenzio** e il
 * vecchio restava al comando — per tre versioni, su tutti i dispositivi già
 * installati. Nessun errore visibile: semplicemente, gli aggiornamenti non
 * arrivavano più.
 *
 * Sono controlli sui file, non sul comportamento: girano in un millesimo di
 * secondo e coprono l'unico errore che rende l'app impossibile da aggiornare.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const sw = readFileSync('sw.js', 'utf8');

/** I path elencati in `GUSCIO`, letti dal sorgente del service worker. */
const guscio = sw
  .slice(sw.indexOf('const GUSCIO = ['), sw.indexOf('];', sw.indexOf('const GUSCIO = [')))
  .split('\n')
  .map((riga) => riga.match(/'(\.\/[^']+)'/)?.[1])
  .filter(Boolean);

/**
 * Tutti i moduli e i fogli di stile sotto `src/`.
 * @returns {string[]} path in forma `./src/...`
 */
function moduliDelProgetto() {
  const trovati = [];
  const scandisci = (cartella) => {
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const percorso = join(cartella, voce.name);
      if (voce.isDirectory()) scandisci(percorso);
      else if (/\.(js|css)$/.test(voce.name)) trovati.push(`./${percorso}`);
    }
  };
  scandisci('src');
  return trovati;
}

test('l\'elenco del guscio non è vuoto: la lettura del sorgente funziona', () => {
  // Se un giorno cambia la forma di sw.js, questo test deve fallire subito
  // invece di lasciare passare in silenzio gli altri due, che diventerebbero
  // controlli su un elenco vuoto — cioè su niente.
  assert.ok(guscio.length > 20, `letti solo ${guscio.length} path da sw.js`);
});

test('ogni file precaricato dal service worker esiste davvero', () => {
  const mancanti = guscio.filter((path) => !existsSync(path.replace('./', '')));
  assert.deepEqual(
    mancanti,
    [],
    'file elencati in GUSCIO ma non presenti: il service worker nuovo non si installerebbe',
  );
});

test('ogni modulo del progetto è precaricato', () => {
  // Un modulo fuori dall'elenco funziona online e sparisce offline: il difetto
  // si vede solo in aereo o in cantina, cioè quando non lo puoi più correggere.
  const fuori = moduliDelProgetto().filter((path) => !guscio.includes(path));
  assert.deepEqual(fuori, [], 'moduli non precaricati: offline non sarebbero disponibili');
});
