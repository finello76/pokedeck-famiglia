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
 * @module app/blocca-scroll
 */

const CLASSE = 'scorrimento-bloccato';
const VARIABILE = '--scroll-bloccato';

/**
 * Blocca lo scorrimento tenendo la pagina ferma dov'è.
 * @returns {void}
 */
export function bloccaScorrimento() {
  const html = document.documentElement;
  // Già bloccato (es. pannello aperto sopra un altro): non si sovrascrive la
  // posizione salvata, o alla riapertura si tornerebbe al punto sbagliato.
  if (html.classList.contains(CLASSE)) return;
  html.style.setProperty(VARIABILE, `${window.scrollY}px`);
  html.classList.add(CLASSE);
}

/**
 * Sblocca lo scorrimento e riporta la pagina dove era.
 * @returns {void}
 */
export function sbloccaScorrimento() {
  const html = document.documentElement;
  if (!html.classList.contains(CLASSE)) return;
  const y = parseInt(html.style.getPropertyValue(VARIABILE), 10) || 0;
  html.classList.remove(CLASSE);
  html.style.removeProperty(VARIABILE);
  window.scrollTo(0, y);
}
