/**
 * Un dialogo per chiedere un nome, con la stessa resa degli altri dialoghi.
 *
 * Non si usa `prompt()`: sui telefoni è una finestra di sistema fuori tema, e
 * nelle PWA installate alcuni browser la sopprimono del tutto — il salvataggio
 * sarebbe fallito in silenzio proprio dove l'app viene usata di più.
 *
 * @module app/chiedi-nome
 */

import { bloccaScorrimento, sbloccaScorrimento } from './blocca-scroll.js';

/**
 * Chiede un testo obbligatorio e lo restituisce, oppure `null` se si annulla.
 *
 * @param {object} opzioni
 * @param {string} opzioni.titolo intestazione del dialogo
 * @param {string} [opzioni.aiuto] riga di spiegazione sotto il titolo
 * @param {string} [opzioni.valore] proposta già scritta nel campo
 * @param {string} [opzioni.conferma] etichetta del bottone di conferma
 * @returns {Promise<string|null>}
 * @example
 * const nome = await chiediNome({ titolo: 'Che nome dai a questi mazzi?' });
 * if (nome === null) return; // annullato
 */
export function chiediNome({ titolo, aiuto = '', valore = '', conferma = 'Salva' }) {
  return new Promise((risolvi) => {
    const dialogo = document.createElement('dialog');
    dialogo.className = 'dialogo-nome';
    // Niente `<form method="dialog">`: la chiusura automatica del form è
    // comoda ma non è affidabile ovunque — ci sono motori che chiudono il
    // dialogo **senza** emettere né `submit` né `close`, e il salvataggio
    // sarebbe rimasto appeso ad aspettare un nome mai consegnato. Qui la
    // chiusura la decidiamo noi, su eventi che ci sono dappertutto.
    dialogo.innerHTML = `
      <h3>${escapeHtml(titolo)}</h3>
      ${aiuto ? `<p class="aiuto">${escapeHtml(aiuto)}</p>` : ''}
      <input type="text" maxlength="60" enterkeyhint="done"
             value="${escapeHtml(valore)}" aria-label="${escapeHtml(titolo)}" />
      <div class="azioni">
        <button type="button" data-conferma>${escapeHtml(conferma)}</button>
        <button type="button" class="secondario" data-annulla>Annulla</button>
      </div>`;

    document.body.append(dialogo);
    const campo = dialogo.querySelector('input');

    // Una sola via d'uscita: qualunque chiusura passa di qui, così la Promise
    // si risolve una volta sola e lo scorrimento della pagina torna sempre.
    let risolta = false;
    const chiudi = (esito) => {
      if (risolta) return;
      risolta = true;
      sbloccaScorrimento();
      // Chiudere prima di togliere: un dialogo modale rimosso mentre è aperto
      // può lasciare la pagina inerte, con la pila del "top layer" sporca.
      if (dialogo.open) dialogo.close();
      dialogo.remove();
      risolvi(esito);
    };

    dialogo.querySelector('[data-annulla]').addEventListener('click', () => chiudi(null));
    // Esc chiude il dialogo emettendo `cancel`: senza questo, annullare da
    // tastiera avrebbe lasciato la Promise appesa per sempre.
    dialogo.addEventListener('cancel', () => chiudi(null));

    // Il nome vuoto non chiude: la validazione la facciamo qui invece di
    // affidarla a `required`, che senza form non varrebbe nulla.
    const accetta = () => {
      const scritto = campo.value.trim();
      if (!scritto) {
        campo.focus();
        return;
      }
      chiudi(scritto);
    };

    dialogo.querySelector('[data-conferma]').addEventListener('click', accetta);
    // Invio da tastiera: su telefono è il tasto "fine" della tastiera virtuale,
    // ed è il gesto naturale dopo aver scritto un nome corto.
    campo.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        accetta();
      }
    });
    // Rete di sicurezza per le chiusure che non passano di qui (backdrop, o il
    // dialogo chiuso dal browser): meglio annullare che restare appesi.
    dialogo.addEventListener('close', () => chiudi(null));

    dialogo.showModal();
    bloccaScorrimento();
    campo.select();
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
