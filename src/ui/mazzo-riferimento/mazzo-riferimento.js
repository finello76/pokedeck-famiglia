/**
 * Web Component `<mazzo-riferimento>`: scelta del mazzo di paragone.
 *
 * Riceve i mazzi salvati, i prefatti e la scelta corrente; mostra qual è il
 * mazzo di riferimento e permette di cambiarlo. Non parla col database: emette
 * due eventi e aspetta che qualcuno gli ripassi i dati aggiornati — come ogni
 * altro componente del progetto, sa disegnare e basta.
 *
 * Le due sorgenti stanno nello **stesso** `<select>`, in due gruppi distinti,
 * invece che in due controlli separati: il riferimento è uno solo, e due
 * controlli lascerebbero credere che se ne possano tenere due, o farebbero
 * chiedere quale dei due vince.
 *
 * La scelta è un `<select>` e non una lista di pulsanti perché i mazzi salvati
 * crescono senza limite (ogni piano ne contiene 2-4) e su telefono una lista di
 * venti righe da scorrere per cambiare un'impostazione è peggio del menù
 * nativo, che il sistema mostra a tutto schermo.
 *
 * Light DOM: le classi sono prefissate `riferimento-` per non colpire il resto
 * della pagina.
 *
 * @fires mazzo-riferimento#riferimento-scelto - detail:
 *   `{sorgente: 'salvato', idPiano, indice}` oppure `{sorgente: 'prefatto', idPrefatto}`
 * @fires mazzo-riferimento#riferimento-tolto
 *
 * @module ui/mazzo-riferimento
 */

export class MazzoRiferimento extends HTMLElement {
  /** @type {object[]} i piani salvati, da `elencoPiani()` */
  #piani = [];

  /** @type {object[]} i mazzi prefatti, da `elencoPrefatti()` */
  #prefatti = [];

  /** @type {object|null} la descrizione del mazzo scelto, da `leggiRiferimento()` */
  #scelto = null;

  /** @param {object[]} valore */
  set piani(valore) {
    this.#piani = valore ?? [];
    this.#disegna();
  }

  /** @param {object[]} valore */
  set prefatti(valore) {
    this.#prefatti = valore ?? [];
    this.#disegna();
  }

  /** @param {object|null} valore */
  set scelto(valore) {
    this.#scelto = valore ?? null;
    this.#disegna();
  }

  /** @returns {object|null} */
  get scelto() {
    return this.#scelto;
  }

  connectedCallback() {
    this.#disegna();

    // Delegazione: il contenuto si ridisegna a ogni cambio, e ricollegare i
    // gestori ogni volta è lavoro inutile e una fonte di ascoltatori doppi.
    this.addEventListener('change', (evento) => {
      const select = evento.target.closest('[data-scelta]');
      if (!select || !select.value) return;
      // `sorgente|…`: il primo campo dice come leggere i successivi, così le due
      // sorgenti convivono in un `<select>` solo senza ambiguità sugli id.
      const [sorgente, ...resto] = select.value.split('|');
      const detail =
        sorgente === 'prefatto'
          ? { sorgente, idPrefatto: resto[0] }
          : { sorgente: 'salvato', idPiano: resto[0], indice: Number(resto[1]) };
      this.dispatchEvent(
        new CustomEvent('riferimento-scelto', { bubbles: true, detail }),
      );
    });

    this.addEventListener('click', (evento) => {
      if (!evento.target.closest('[data-togli]')) return;
      this.dispatchEvent(new CustomEvent('riferimento-tolto', { bubbles: true }));
    });
  }

  /**
   * Il valore `<option>` che corrisponde a una descrizione scelta.
   *
   * @param {object|null} scelto
   * @returns {string} stringa vuota se non c'è scelta
   */
  #valoreDi(scelto) {
    if (!scelto) return '';
    return scelto.sorgente === 'prefatto'
      ? `prefatto|${scelto.idPrefatto}`
      : `salvato|${scelto.idPiano}|${scelto.indice}`;
  }

  #disegna() {
    if (!this.#piani.length && !this.#prefatti.length) {
      this.innerHTML = `
        <p class="stato">
          Non c'è ancora nessun mazzo salvato: generane in "Crea mazzi" e premi
          "Salva questi mazzi", poi torna qui a sceglierne uno.
        </p>`;
      return;
    }

    const valoreScelto = this.#valoreDi(this.#scelto);

    // Un gruppo per piano salvato: il nome del mazzo da solo ("Erba") non basta
    // a distinguerlo, perché ogni generazione ne produce uno con lo stesso nome.
    const gruppiSalvati = this.#piani
      .map(
        (piano) => `
        <optgroup label="${escapeHtml(piano.nome ?? 'Senza nome')}">
          ${(piano.mazzi ?? [])
            .map((mazzo, indice) => {
              const valore = `salvato|${piano.id}|${indice}`;
              // La forza salvata col mazzo, sulla scala 0–100 di `forza.js`:
              // **non** `equilibrio.punteggi`, che è la scala relativa di
              // `bilancia.js` e mostrerebbe qui numeri oltre il 100 che non
              // corrispondono a nulla di ciò che si legge altrove.
              const forza = mazzo.forza?.totale ?? mazzo.forza;
              return `<option value="${escapeHtml(valore)}"${valore === valoreScelto ? ' selected' : ''}>
                ${escapeHtml(mazzo.nome ?? `Mazzo ${indice + 1}`)}${forza != null ? ` — forza ${forza}` : ''}
              </option>`;
            })
            .join('')}
        </optgroup>`,
      )
      .join('');

    // I prefatti in un gruppo solo: sono pochi e non appartengono a un piano.
    const gruppoPrefatti = this.#prefatti.length
      ? `<optgroup label="Mazzi già pronti">
          ${this.#prefatti
            .map((mazzo) => {
              const valore = `prefatto|${mazzo.id}`;
              return `<option value="${escapeHtml(valore)}"${valore === valoreScelto ? ' selected' : ''}>
                ${escapeHtml(mazzo.nome)}${mazzo.forza != null ? ` — forza ${mazzo.forza}` : ''}
              </option>`;
            })
            .join('')}
        </optgroup>`
      : '';

    const gruppi = gruppiSalvati + gruppoPrefatti;

    this.innerHTML = `
      ${
        this.#scelto
          ? `<p class="riferimento-attuale">
               <span class="riferimento-etichetta">Mazzo di riferimento</span>
               <strong>${escapeHtml(this.#scelto.nome)}</strong>
               <span class="riferimento-dettaglio">
                 da «${escapeHtml(this.#scelto.nomePiano)}»${
                   this.#scelto.forza != null ? ` · forza ${this.#scelto.forza}` : ''
                 }${this.#scelto.taglia ? ` · ${this.#scelto.taglia} carte` : ''}
               </span>
             </p>`
          : '<p class="stato">Nessun mazzo di riferimento scelto.</p>'
      }
      <label class="riferimento-scelta">
        <span>Scegli il mazzo</span>
        <select data-scelta>
          <option value=""${valoreScelto ? '' : ' selected'} disabled>— scegli —</option>
          ${gruppi}
        </select>
      </label>
      ${this.#scelto ? '<button type="button" class="secondario" data-togli>Togli il riferimento</button>' : ''}
    `;
  }
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

customElements.define('mazzo-riferimento', MazzoRiferimento);
