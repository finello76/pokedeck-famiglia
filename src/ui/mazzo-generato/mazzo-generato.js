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
          const proxy = Boolean(c.proxy);
          const classi = [deroga && 'deroga', proxy && 'proxy'].filter(Boolean).join(' ');
          return `
            <li${classi ? ` class="${classi}"` : ''}>
              <span class="quante">${c.quantita}×</span>
              <span class="nome">${escapeHtml(dati.nome)}</span>
              <span class="dettaglio">${escapeHtml(dati.stadio ?? '')}</span>
              ${proxy ? `<span class="marchio marchio-proxy" title="${escapeHtml(c.motivo ?? 'Carta stampata: non è nella collezione')}">da stampare</span>` : ''}
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
        ${this.#htmlCarosello(m)}
        ${gruppi}
      </article>
    `;

    this.#collegaCarosello();
  }

  /**
   * Striscia di illustrazioni scorrevole in orizzontale.
   *
   * La lista testuale serve a pescare le carte dalla scatola; il carosello
   * serve a **vedere** che mazzo è venuto fuori, che è una domanda diversa.
   * Non si stampa: su carta le immagini piccole non aiutano e consumano
   * inchiostro.
   *
   * @param {object} m
   * @returns {string}
   */
  #htmlCarosello(m) {
    // I proxy compaiono anche senza illustrazione: nel carosello si deve
    // vedere il mazzo INTERO, comprese le carte che andranno stampate.
    const daMostrare = m.carte.filter((c) => (c.carta ?? c).immagine || c.proxy);
    if (!daMostrare.length) return '';

    const figure = daMostrare
      .map((c) => {
        const dati = c.carta ?? c;
        const deroga = this.#conDeroga.has(dati.nome);
        const proxy = Boolean(c.proxy);

        if (!dati.immagine) {
          // Proxy senza scansione (le Energie generiche): un riquadro col
          // colore del tipo al posto della foto. Non è un pulsante: non c'è
          // niente da ingrandire.
          return `
            <span class="miniatura segnaposto-mini proxy" role="listitem"
                  data-tipo="${escapeHtml(dati.tipi?.[0] ?? 'Incolore')}"
                  title="${escapeHtml(c.motivo ?? dati.nome)}">
              <span class="nome-mini">${escapeHtml(dati.nome)}</span>
              ${c.quantita > 1 ? `<span class="quante-mini">×${c.quantita}</span>` : ''}
            </span>`;
        }

        const classi = ['miniatura', deroga && 'deroga', proxy && 'proxy']
          .filter(Boolean)
          .join(' ');
        return `
          <button type="button" class="${classi}"
                  data-nome="${escapeHtml(dati.nome)}"
                  title="${escapeHtml(dati.nome)}${proxy ? ' (da stampare)' : ''}">
            <img src="${dati.immagine}/low.webp" alt="${escapeHtml(dati.nome)}" loading="lazy" />
            ${c.quantita > 1 ? `<span class="quante-mini">×${c.quantita}</span>` : ''}
          </button>`;
      })
      .join('');

    return `<div class="carosello no-stampa" role="list">${figure}</div>`;
  }

  /** Il click su una miniatura chiede di ingrandire, come nel catalogo. */
  #collegaCarosello() {
    for (const bottone of this.querySelectorAll('.miniatura')) {
      bottone.addEventListener('click', () => {
        const voce = this.#mazzo.carte.find(
          (c) => (c.carta ?? c).nome === bottone.dataset.nome,
        );
        if (!voce) return;
        this.dispatchEvent(
          new CustomEvent('carta-scelta', {
            bubbles: true,
            composed: true,
            detail: { carta: voce.carta ?? voce, nomeSet: '' },
          }),
        );
      });
    }
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
