/**
 * Web Component `<elenco-salvati>`: i mazzi messi da parte, con nome e forza.
 *
 * Esiste per non avere due liste diverse della stessa cosa: prima l'elenco lo
 * disegnava a mano `vista-mazzi.js` con una stringa di HTML, e chiunque volesse
 * mostrare i mazzi salvati altrove avrebbe dovuto ricopiarla. Qui è un pezzo di
 * UI con un ingresso (`piani`) e due eventi in uscita, riusabile in qualsiasi
 * sezione.
 *
 * Light DOM come gli altri componenti del progetto: il foglio di stile è
 * globale, quindi le classi sono tutte prefissate `salvati-` per non
 * contaminare il resto della pagina.
 *
 * @fires elenco-salvati#piano-aperto - detail: `{id}`
 * @fires elenco-salvati#piano-eliminato - detail: `{id}`
 *
 * @module ui/elenco-salvati
 */

export class ElencoSalvati extends HTMLElement {
  /** @type {object[]} */
  #piani = [];

  /** @param {object[]} valore i record restituiti da `elencoPiani()` */
  set piani(valore) {
    this.#piani = valore ?? [];
    this.#disegna();
  }

  /** @returns {object[]} */
  get piani() {
    return this.#piani;
  }

  connectedCallback() {
    this.#disegna();

    // Un solo ascoltatore sul contenitore invece di uno per bottone: le righe
    // si ridisegnano a ogni salvataggio, e ricollegarle ogni volta è lavoro
    // inutile (delegazione degli eventi, come in Angular con l'host listener).
    this.addEventListener('click', (evento) => {
      const bottone = evento.target.closest('[data-azione]');
      if (!bottone) return;
      const { azione, id } = bottone.dataset;
      this.dispatchEvent(
        new CustomEvent(azione === 'apri' ? 'piano-aperto' : 'piano-eliminato', {
          bubbles: true,
          detail: { id },
        }),
      );
    });
  }

  #disegna() {
    if (!this.#piani.length) {
      this.innerHTML = `
        <h3>Mazzi salvati</h3>
        <p class="stato">Nessun mazzo salvato: genera dei mazzi e premi "Salva questi mazzi".</p>`;
      return;
    }

    this.innerHTML = `
      <h3>Mazzi salvati</h3>
      <ul class="elenco-salvati">
        ${this.#piani.map((p) => this.#riga(p)).join('')}
      </ul>`;
  }

  /**
   * Una riga dell'elenco.
   *
   * La forza si mostra qui e non solo dentro il mazzo aperto: è il dato con cui
   * si sceglie quale mazzo riprendere, e cercarlo aprendoli uno per uno
   * significherebbe non guardarlo mai.
   *
   * @param {object} piano
   * @returns {string} HTML
   */
  #riga(piano) {
    const quando = new Date(piano.creatoIl);
    const taglia = piano.opzioni?.taglia ?? '?';
    const forze = forzeDi(piano);
    const quanti = piano.mazzi?.length ?? 0;

    return `
      <li>
        <span class="salvati-descrizione">
          <span class="salvati-nome">${escapeHtml(piano.nome ?? 'Senza nome')}</span>
          <span class="salvati-dettaglio">
            ${quanti === 1 ? 'un mazzo' : `${quanti} mazzi`} da ${taglia} carte ·
            ${Number.isNaN(quando.valueOf()) ? '' : quando.toLocaleDateString('it-IT')}
            ${forze.length ? `· forza ${forze.join(' · ')}` : ''}
          </span>
        </span>
        <span class="comandi-salvato">
          <button type="button" class="collegamento" data-azione="apri"
                  data-id="${escapeHtml(piano.id)}">Apri</button>
          <button type="button" class="collegamento" data-azione="elimina"
                  data-id="${escapeHtml(piano.id)}">Elimina</button>
        </span>
      </li>`;
  }
}

/**
 * I punteggi di forza da mostrare accanto a un salvataggio.
 *
 * Due sorgenti, e serve provarle entrambe: `equilibrio` esiste solo nei piani
 * usciti dal wizard, che misura i mazzi **uno rispetto all'altro**, mentre un
 * mazzo costruito a mano è uno solo e un equilibrio non ce l'ha. La sua forza
 * `istantanea()` la scrive comunque su ogni mazzo, ed è da lì che si recupera:
 * senza questo ripiego i mazzi personalizzati comparivano nell'elenco **senza
 * punteggio**, cioè senza il dato con cui si sceglie quale riprendere.
 *
 * @param {object} piano
 * @returns {number[]}
 */
function forzeDi(piano) {
  const dallEquilibrio = piano.equilibrio?.punteggi?.map((p) => p.totale);
  if (dallEquilibrio?.length) return dallEquilibrio;

  return (piano.mazzi ?? [])
    .map((m) => (m.forza?.attendibile ? m.forza.totale : null))
    .filter((n) => n != null);
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

customElements.define('elenco-salvati', ElencoSalvati);
