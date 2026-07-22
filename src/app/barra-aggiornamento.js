/**
 * La barra "è disponibile una versione nuova", e la via di fuga manuale.
 *
 * Regola di questo modulo: **i pulsanti devono fare qualcosa, sempre.** Un
 * meccanismo di aggiornamento che si inceppa è peggio di non averlo, perché
 * quando è inceppato è esattamente il momento in cui l'utente non ha altri
 * modi per uscirne — su un telefono la PWA installata non ha il pulsante di
 * ricarica, non ha gli strumenti per sviluppatori, e non ha un modo di
 * svuotare la propria cache.
 *
 * Per questo gli ascoltatori dei click si registrano **una volta sola
 * all'avvio**, non dentro la richiamata che annuncia la versione nuova: se
 * quella richiamata non arriva, o arriva e va in errore, i pulsanti restano
 * comunque vivi e ricadono sulla pulizia forzata.
 *
 * @module app/barra-aggiornamento
 */

import { registraServiceWorker, forzaAggiornamento } from './registra-sw.js';

/**
 * Collega la barra di aggiornamento e avvia la sorveglianza.
 *
 * @param {object} elementi
 * @param {HTMLElement|null} elementi.barra il contenitore della barra
 * @param {HTMLElement|null} [elementi.versione] il numero di build nel piè di
 *   pagina: toccandolo si può forzare l'aggiornamento anche quando l'app non
 *   ne ha annunciato uno. È la via di fuga per chi resta bloccato
 * @returns {void}
 * @example
 * avviaBarraAggiornamento({
 *   barra: document.querySelector('#barra-aggiornamento'),
 *   versione: document.querySelector('#versione'),
 * });
 */
export function avviaBarraAggiornamento({ barra, versione = null }) {
  if (!barra) {
    // Senza barra si registra comunque il service worker: l'offline non
    // dipende dall'avviso.
    registraServiceWorker();
    return;
  }

  const testo = barra.querySelector('[data-testo]');
  const bottoneAggiorna = barra.querySelector('#bottone-aggiorna');
  const bottoneRimanda = barra.querySelector('#bottone-rimanda');

  /** @type {(() => void)|null} come applicare la versione in attesa, se c'è */
  let applica = null;

  const mostra = (messaggio) => {
    if (testo) testo.textContent = messaggio;
    barra.hidden = false;
  };

  bottoneAggiorna?.addEventListener('click', () => {
    mostra('Aggiornamento in corso…');
    // Se c'è un service worker in attesa si passa da lui, che è la via
    // pulita. Altrimenti — e se lui non risponde — si smonta tutto e si
    // ricarica dalla rete: il pulsante non deve mai restare senza effetto.
    if (applica) applica();
    else forzaAggiornamento();
  });

  bottoneRimanda?.addEventListener('click', () => {
    barra.hidden = true;
  });

  // Il numero di build diventa la via di fuga permanente: se qualcuno resta
  // bloccato su una versione vecchia — perché l'avviso non è mai comparso, o
  // perché l'aggiornamento si è incastrato — questo è l'unico appiglio che ha.
  versione?.addEventListener('click', () => {
    applica = null; // niente scorciatoie: si ricarica davvero dalla rete
    mostra('Ricarico l\'app dalla rete: la collezione non si tocca.');
  });

  registraServiceWorker((aggiorna) => {
    applica = aggiorna;
    mostra('È disponibile una versione nuova dell\'app.');
  });
}
