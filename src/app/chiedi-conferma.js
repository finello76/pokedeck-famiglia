/**
 * Un dialogo di conferma per le azioni che non si annullano.
 *
 * Gemello di `chiedi-nome.js` e per la stessa ragione: `confirm()` è una
 * finestra di sistema fuori tema sui telefoni, e nelle PWA installate alcuni
 * browser la sopprimono — l'azione sarebbe passata senza chiedere niente,
 * cioè l'opposto di quello che serve.
 *
 * Nasce con l'elenco a card dei mazzi salvati: lì tutta la card è toccabile per
 * aprirla, e il cestino le sta accanto. Prima le righe erano larghe e i due
 * comandi lontani, e "Elimina" cancellava all'istante senza chiedere.
 *
 * @module app/chiedi-conferma
 */

import { bloccaScorrimento, sbloccaScorrimento } from './blocca-scroll.js';

/**
 * Chiede conferma e dice se è stata data.
 *
 * @param {object} opzioni
 * @param {string} opzioni.titolo la domanda
 * @param {string} [opzioni.aiuto] cosa succede se si conferma
 * @param {string} [opzioni.conferma] etichetta del bottone che procede
 * @returns {Promise<boolean>} `true` solo se si è confermato davvero
 * @example
 * if (await chiediConferma({ titolo: 'Eliminare «Mazzi di Natale»?' })) elimina();
 */
export function chiediConferma({ titolo, aiuto = '', conferma = 'Elimina' }) {
  return new Promise((risolvi) => {
    const dialogo = document.createElement('dialog');
    dialogo.className = 'dialogo-nome dialogo-conferma';
    // Come in `chiedi-nome.js`: niente `<form method="dialog">`, la chiusura
    // la decidiamo noi su eventi presenti in tutti i motori.
    dialogo.innerHTML = `
      <h3>${escapeHtml(titolo)}</h3>
      ${aiuto ? `<p class="aiuto">${escapeHtml(aiuto)}</p>` : ''}
      <div class="azioni">
        <button type="button" class="pericolo" data-conferma>${escapeHtml(conferma)}</button>
        <button type="button" class="secondario" data-annulla>Annulla</button>
      </div>`;

    document.body.append(dialogo);

    // Una sola via d'uscita, così la Promise si risolve una volta sola e lo
    // scorrimento della pagina torna sempre.
    let risolta = false;
    const chiudi = (esito) => {
      if (risolta) return;
      risolta = true;
      sbloccaScorrimento();
      if (dialogo.open) dialogo.close();
      dialogo.remove();
      risolvi(esito);
    };

    dialogo.querySelector('[data-conferma]').addEventListener('click', () => chiudi(true));
    dialogo.querySelector('[data-annulla]').addEventListener('click', () => chiudi(false));
    dialogo.addEventListener('cancel', () => chiudi(false));
    // Qualunque altra chiusura (backdrop, browser) vale come "no": davanti a
    // un'azione irreversibile il dubbio si risolve non facendola.
    dialogo.addEventListener('close', () => chiudi(false));

    dialogo.showModal();
    bloccaScorrimento();
    // Il fuoco va su "Annulla": premere Invio per sbaglio non deve cancellare.
    dialogo.querySelector('[data-annulla]').focus();
  });
}

/**
 * @param {string} testo
 * @returns {string}
 */
function escapeHtml(testo) {
  return String(testo ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}
