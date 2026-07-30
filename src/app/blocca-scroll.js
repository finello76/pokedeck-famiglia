/**
 * Blocco dello scorrimento della pagina mentre un pannello a schermo intero è
 * aperto (il visore della carta, il foglio "Aggiungi una carta").
 *
 * `overflow: hidden` sull'elemento radice NON basta su iOS/WebKit (anche Brave
 * su iPhone): lì la pagina continua a scorrere sotto il pannello e, alla
 * chiusura, lo scroll salta in cima — era il bug "torna in alto a ogni
 * aggiunta". Il rimedio portabile è fissare il body con
 * `position: fixed; top: -scrollY`: la pagina resta esattamente dov'è, e alla
 * riapertura si ripristina la posizione salvata. L'offset viaggia in una custom
 * property, così il CSS (base.css) sa di quanto spostare il body.
 *
 * I pannelli che lo usano sono a `position: fixed`, quindi restano al loro posto
 * anche mentre il body è fissato.
 *
 * ## Pannelli sopra pannelli
 *
 * Dalla finestra della linea evolutiva si apre il visore della carta: due
 * pannelli aperti insieme, e chiudendo quello sopra lo scorrimento **non** deve
 * tornare libero. Per questo ogni chiamante si presenta con una **chiave** e si
 * sblocca solo quando l'ultimo se n'è andato.
 *
 * Un contatore sarebbe stato più corto e sbagliato: `chiudi()` del visore
 * sblocca, e l'evento `close` che ne segue sblocca un'altra volta: due chiamate
 * per una chiusura sola. Con un insieme di chiavi la seconda non fa niente, con
 * un contatore avrebbe portato il conto sotto zero e liberato lo scorrimento
 * mentre un pannello era ancora aperto.
 *
 * @module app/blocca-scroll
 */

const CLASSE = 'scorrimento-bloccato';
const VARIABILE = '--scroll-bloccato';

/** Chi sta tenendo bloccato lo scorrimento, per chiave. @type {Set<string>} */
const chiHaChiesto = new Set();

/**
 * Blocca lo scorrimento tenendo la pagina ferma dov'è.
 * @param {string} [chiave='pannello'] chi lo sta chiedendo
 * @returns {void}
 */
export function bloccaScorrimento(chiave = 'pannello') {
  const html = document.documentElement;
  chiHaChiesto.add(chiave);
  // Già bloccato (es. pannello aperto sopra un altro): non si sovrascrive la
  // posizione salvata, o alla riapertura si tornerebbe al punto sbagliato.
  if (html.classList.contains(CLASSE)) return;
  html.style.setProperty(VARIABILE, `${window.scrollY}px`);
  html.classList.add(CLASSE);
}

/**
 * Sblocca lo scorrimento e riporta la pagina dove era.
 *
 * Non fa niente finché un altro pannello lo tiene ancora bloccato.
 *
 * @param {string} [chiave='pannello'] chi lo aveva chiesto
 * @returns {void}
 */
export function sbloccaScorrimento(chiave = 'pannello') {
  const html = document.documentElement;
  chiHaChiesto.delete(chiave);
  if (chiHaChiesto.size) return;
  if (!html.classList.contains(CLASSE)) return;
  const y = parseInt(html.style.getPropertyValue(VARIABILE), 10) || 0;
  html.classList.remove(CLASSE);
  html.style.removeProperty(VARIABILE);
  window.scrollTo(0, y);
}
