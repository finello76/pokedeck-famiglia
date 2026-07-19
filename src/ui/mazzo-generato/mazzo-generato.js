/**
 * Web Component `<mazzo-generato>`: la lista di un mazzo, da leggere mentre si
 * pescano le carte dalla scatola.
 *
 * Non mostra le illustrazioni: è una **lista di lavoro**. Chi la usa ha le
 * carte fisiche davanti e cerca nomi e quantità, non figure. Le figure si
 * guardano nel catalogo.
 *
 * @module ui/mazzo-generato
 */

/** Ordine di lettura: prima cosa si gioca, poi con cosa lo si alimenta. */
const ORDINE = ['Pokémon', 'Allenatore', 'Energia'];

export class MazzoGenerato extends HTMLElement {
  /** @type {object|null} */
  #mazzo = null;
  /** @type {Set<string>} nomi giocabili solo grazie a una regola della casa */
  #conDeroga = new Set();

  /** @param {object} valore */
  set mazzo(valore) {
    this.#mazzo = valore;
    this.#disegna();
  }

  /** @param {Set<string>|string[]} valore */
  set conDeroga(valore) {
    this.#conDeroga = new Set(valore ?? []);
    this.#disegna();
  }

  connectedCallback() {
    this.#disegna();
  }

  #disegna() {
    if (!this.#mazzo) return;
    const m = this.#mazzo;

    const gruppi = ORDINE.map((categoria) => {
      const carte = m.carte.filter((c) => (c.carta?.categoria ?? c.categoria) === categoria);
      if (!carte.length) return '';

      const righe = carte
        .map((c) => {
          const dati = c.carta ?? c;
          const deroga = this.#conDeroga.has(dati.nome);
          return `
            <li${deroga ? ' class="deroga"' : ''}>
              <span class="quante">${c.quantita}×</span>
              <span class="nome">${escapeHtml(dati.nome)}</span>
              <span class="dettaglio">${escapeHtml(dati.stadio ?? '')}</span>
              ${deroga ? '<span class="marchio" title="Si gioca come Pokémon Base">come Base</span>' : ''}
            </li>`;
        })
        .join('');

      const totale = carte.reduce((s, c) => s + c.quantita, 0);
      return `
        <section class="gruppo">
          <h4>${categoria} <span class="conteggio">${totale}</span></h4>
          <ul>${righe}</ul>
        </section>`;
    }).join('');

    this.innerHTML = `
      <article class="mazzo" data-tipo="${m.tipi?.[0] ?? 'Incolore'}">
        <header>
          <h3>${escapeHtml(m.nome)}</h3>
          <p class="sommario">
            ${m.totale} carte · tipo ${escapeHtml((m.tipi ?? []).join(' e ') || 'misto')}
          </p>
        </header>
        ${gruppi}
      </article>
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

customElements.define('mazzo-generato', MazzoGenerato);
