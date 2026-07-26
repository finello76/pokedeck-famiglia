/**
 * Scrive `version.json` con il numero di build e la data del commit in corso.
 *
 * Perché esiste. Con GitHub Pages non c'è modo, guardando la pagina, di sapere
 * se il deploy è andato a buon fine o se il browser sta ancora mostrando una
 * versione vecchia dalla cache. Un numero che cresce a ogni commit, mostrato
 * nella pagina, rende la cosa evidente: se il numero è cambiato, è aggiornato.
 *
 * Come si aggiorna da solo. Lo esegue il hook `pre-commit` (vedi
 * `.githooks/pre-commit`), che poi mette `version.json` nello stage: così il
 * numero finisce nello stesso commit, senza doverci pensare.
 *
 * ## Perché non basta contare i commit
 *
 * La prima versione scriveva `git rev-list --count HEAD` **+ 1**: al pre-commit
 * il commit in creazione non è ancora contato, quindi se ne aggiungeva uno. È
 * una **previsione**, e un merge la sbaglia.
 *
 * Successo davvero il 26/07/2026. Due rami da 60 e 73 commit, base comune in
 * mezzo: unendoli il merge è diventato il commit numero **80**, non 61. Il hook
 * però aveva predetto guardando un genitore solo, e il commit successivo ha
 * calcolato `80 + 1 = 81` — lo stesso numero già scritto. Due versioni diverse
 * dell'app con lo stesso numero di build, distinguibili solo dall'orario:
 * esattamente ciò che questo file esiste per impedire, e chi guardava la pagina
 * si è convinto in buona fede di essere aggiornato.
 *
 * Da qui la regola: il numero **non si prevede, si fa crescere**. Si prende il
 * più grande fra il conteggio dei commit e il numero già scritto, più uno. Così
 * cresce di almeno uno a ogni commit qualunque cosa faccia la topologia di Git,
 * e non si ripete mai — che è l'unica proprietà che conta davvero. Un numero
 * che salta da 61 a 81 non è un problema: nessuno lo somma a niente, serve solo
 * a essere *diverso* da quello di prima.
 *
 * Strumento di **sviluppo**, non runtime: la PWA legge il JSON, non questo file.
 *
 * Uso (di norma lo chiama il hook, non serve a mano):
 *     node tools/timbra-versione.mjs
 */

import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Esegue un comando git, restituendo stringa vuota se fallisce (es. al primo
 * commit, quando HEAD non esiste ancora).
 * @param {string} comando
 * @returns {string}
 */
function git(comando) {
  try {
    return execSync(`git ${comando}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Il numero della build che sta per nascere: sempre maggiore di quello di
 * prima, qualunque cosa dica il conteggio dei commit.
 *
 * @param {number} commitEsistenti da `git rev-list --count HEAD`
 * @param {number} precedente il numero già in `version.json`
 * @returns {number}
 * @example
 * prossimoNumero(80, 81); // 82 — il merge aveva già scritto 81
 * prossimoNumero(80, 0);  // 81 — repo senza version.json
 */
export function prossimoNumero(commitEsistenti, precedente) {
  return Math.max(Number(commitEsistenti) || 0, Number(precedente) || 0) + 1;
}

/**
 * Il numero scritto in `version.json`, o 0 se il file non c'è o è illeggibile.
 * @returns {number}
 */
function numeroPrecedente() {
  try {
    return Number(JSON.parse(readFileSync('version.json', 'utf8')).numero) || 0;
  } catch {
    return 0;
  }
}

/** Scrive il timbro. Separata dal corpo del modulo per poterlo importare. */
function timbra() {
  const commitEsistenti = Number(git('rev-list --count HEAD')) || 0;
  const numero = prossimoNumero(commitEsistenti, numeroPrecedente());

  // Data e ora locali fino ai minuti: distinguono due build dello stesso giorno.
  // Non si usa new Date().toISOString() perché darebbe UTC, meno leggibile per chi
  // guarda la pagina dall'Italia.
  const ora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const data =
    `${ora.getFullYear()}-${pad(ora.getMonth() + 1)}-${pad(ora.getDate())} ` +
    `${pad(ora.getHours())}:${pad(ora.getMinutes())}`;

  writeFileSync('version.json', `${JSON.stringify({ numero, data })}\n`);
  console.log(`version.json → build ${numero} (${data})`);
}

// Si timbra solo quando lo si esegue davvero. Senza questa guardia, il test che
// importa `prossimoNumero` riscriverebbe `version.json` del repo per il solo
// fatto di leggerne il codice.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  timbra();
}
