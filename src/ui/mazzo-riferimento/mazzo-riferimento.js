/**
 * Web Component `<mazzo-riferimento>`: scelta del mazzo di paragone.
 *
 * Riceve i piani salvati e la scelta corrente, mostra qual è il mazzo di
 * riferimento e permette di cambiarlo. Non parla col database: emette due
 * eventi e aspetta che qualcuno gli ripassi i dati aggiornati — come ogni altro
 * componente del progetto, sa disegnare e basta.
 *
 * La scelta è un `<select>` e non una lista di pulsanti perché i mazzi salvati
 * crescono senza limite (ogni piano ne contiene 2-4) e su telefono una lista di
 * venti righe da scorrere per cambiare un'impostazione è peggio del menù
 * nativo, che il sistema mostra a tutto schermo.
 *
 * Light DOM: le classi sono prefissate `riferimento-` per non colpire il resto
 * della pagina.
 *
 * @fires mazzo-riferimento#riferimento-scelto - detail: `{idPiano, indice}`
 * @fires mazzo-riferimento#riferimento-tolto
 *
 * @module ui/mazzo-riferimento
 */

export class MazzoRiferimento extends HTMLElement {
  /** @type {object[]} i piani salvati, da `elencoPiani()` */
  #piani = [];

  /** @type {object|null} la descrizione del mazzo scelto, da `leggiRiferimento()` */
  #scelto = null;

  /** @param {object[]} valore */
  set piani(valore) {
    this.#piani = valore ?? [];
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
      const [idPiano, indice] = select.value.split('|');
      this.dispatchEvent(
        new CustomEvent('riferimento-scelto', {
          bubbles: true,
          detail: { idPiano, indice: Number(indice) },
        }),
      );
    });

    this.addEventListener('click', (evento) => {
      if (!evento.target.closest('[data-togli]')) return;
      this.dispatchEvent(new CustomEvent('riferimento-tolto', { bubbles: true }));
    });
  }

  #disegna() {
    if (!this.#piani.length) {
      this.innerHTML = `
        <p class="stato">
          Non c'è ancora nessun mazzo salvato: generane in "Crea mazzi" e premi
          "Salva questi mazzi", poi torna qui a sceglierne uno.
        </p>`;
      return;
    }

    const valoreScelto = this.#scelto ? `${this.#scelto.idPiano}|${this.#scelto.indice}` : '';

    // Un gruppo per piano salvato: il nome del mazzo da solo ("Erba") non basta
    // a distinguerlo, perché ogni generazione ne produce uno con lo stesso nome.
    const gruppi = this.#piani
      .map(
        (piano) => `
        <optgroup label="${escapeHtml(piano.nome ?? 'Senza nome')}">
          ${(piano.mazzi ?? [])
            .map((mazzo, indice) => {
              const valore = `${piano.id}|${indice}`;
              const forza = piano.equilibrio?.punteggi?.[indice]?.totale;
              return `<option value="${escapeHtml(valore)}"${valore === valoreScelto ? ' selected' : ''}>
                ${escapeHtml(mazzo.nome ?? `Mazzo ${indice + 1}`)}${forza != null ? ` — forza ${forza}` : ''}
              </option>`;
            })
            .join('')}
        </optgroup>`,
      )
      .join('');

    this.innerHTML = `
      ${
        this.#scelto
          ? `<p class="riferimento-attuale">
               <span class="riferimento-etichetta">Mazzo di riferimento</span>
               <strong>${escapeHtml(this.#scelto.nomeMazzo)}</strong>
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
