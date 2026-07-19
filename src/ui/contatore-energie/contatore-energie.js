/**
 * Web Component `<contatore-energie>`: quante energie base ci sono, per tipo.
 *
 * Non è una statistica decorativa: è il dato da cui dipende metà del motore di
 * generazione (v2). Le proporzioni del mazzo, la scelta del tipo e l'eventuale
 * attivazione delle regole della casa compensative partono da qui.
 *
 * @example
 * const c = document.createElement('contatore-energie');
 * c.dati = { perTipo: { Fuoco: 8, Acqua: 3 }, totaleBase: 11, totaleSpeciali: 1, senzaTipo: 0 };
 *
 * @module ui/contatore-energie
 */

const stile = new CSSStyleSheet();
const cssCaricato = fetch(new URL('./contatore-energie.css', import.meta.url))
  .then((r) => r.text())
  .then((css) => stile.replaceSync(css))
  .catch(() => {});

export class ContatoreEnergie extends HTMLElement {
  /** @type {object|null} */
  #dati = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  /** @param {object|null} valore risultato di `conteggioEnergie()` */
  set dati(valore) {
    this.#dati = valore;
    this.#disegna();
  }

  async connectedCallback() {
    await cssCaricato;
    this.shadowRoot.adoptedStyleSheets = [stile];
    this.#disegna();
  }

  #disegna() {
    if (!this.shadowRoot || !this.#dati) return;
    const { perTipo, totaleBase, totaleSpeciali, senzaTipo } = this.#dati;

    if (totaleBase === 0 && totaleSpeciali === 0) {
      this.shadowRoot.innerHTML = `
        <p class="vuoto">
          Nessuna carta Energia in collezione. Il generatore di mazzi non potrà
          costruire mazzi giocabili finché non ce ne sono: aggiungile qui sopra
          scegliendo <strong>Energia base</strong>.
        </p>`;
      return;
    }

    const tipi = Object.entries(perTipo).sort((a, b) => b[1] - a[1]);
    const voci = tipi
      .map(
        ([tipo, quante]) => `
          <li data-tipo="${tipo}">
            <span class="nome">${tipo}</span>
            <span class="numero">${quante}</span>
          </li>`,
      )
      .join('');

    const note = [];
    if (totaleSpeciali) {
      note.push(`${totaleSpeciali} energia/e speciale/i (senza tipo elementale)`);
    }
    if (senzaTipo) {
      note.push(`<strong>${senzaTipo} energia/e base di tipo non riconosciuto</strong>`);
    }

    this.shadowRoot.innerHTML = `
      <p class="totale">${totaleBase} energie base, ${tipi.length} tipi</p>
      <ul>${voci}</ul>
      ${note.length ? `<p class="nota">${note.join(' · ')}</p>` : ''}
    `;
  }
}

customElements.define('contatore-energie', ContatoreEnergie);
