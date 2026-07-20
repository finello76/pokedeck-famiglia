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
 * Il numero è `git rev-list --count HEAD` **+ 1**: al momento del pre-commit il
 * commit in creazione non è ancora contato, quindi si aggiunge uno per far
 * combaciare il numero con il commit che sta per nascere.
 *
 * Strumento di **sviluppo**, non runtime: la PWA legge il JSON, non questo file.
 *
 * Uso (di norma lo chiama il hook, non serve a mano):
 *     node tools/timbra-versione.mjs
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

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

const commitEsistenti = Number(git('rev-list --count HEAD')) || 0;
const numero = commitEsistenti + 1;

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
