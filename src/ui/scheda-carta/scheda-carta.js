/**
 * Web Component `<scheda-carta>`: mostra una carta con illustrazione e dati.
 *
 * Differenza rispetto ad Angular: qui non c'è un template compilato né un
 * sistema di change detection. Il componente si ridisegna quando GLIELO DICI,
 * assegnando la proprietà `carta`. È molto più manuale, ma non c'è nulla da
 * installare e il browser lo esegue nativamente.
 *
 * @example
 * const scheda = document.createElement('scheda-carta');
 * scheda.carta = { nome: 'Zweilous', tipi: ['Oscurità'], ps: 100, ... };
 * scheda.nomeSet = 'Scintille Folgoranti';
 * document.body.append(scheda);
 *
 * @module ui/scheda-carta
 */

import { urlImmagine } from '../../data/dataset.js';

/** Foglio di stile condiviso da tutte le istanze, caricato una volta sola. */
const stile = new CSSStyleSheet();
const cssCaricato = fetch(new URL('./scheda-carta.css', import.meta.url))
  .then((r) => r.text())
  .then((css) => stile.replaceSync(css))
  .catch(() => {
    /* senza CSS il componente resta leggibile, solo spoglio */
  });

export class SchedaCarta extends HTMLElement {
  /** @type {object|null} */
  #carta = null;
  /** @type {string} */
  #nomeSet = '';

  constructor() {
    super();
    // Shadow DOM: lo stile qui dentro non esce e quello di fuori non entra.
    // È l'incapsulamento che in Angular ottieni con ViewEncapsulation.
    this.attachShadow({ mode: 'open' });
  }

  /** @param {object|null} valore */
  set carta(valore) {
    this.#carta = valore;
    this.#disegna();
  }

  get carta() {
    return this.#carta;
  }

  /** @param {string} valore nome leggibile del set, mostrato sotto il titolo */
  set nomeSet(valore) {
    this.#nomeSet = valore ?? '';
    this.#disegna();
  }

  async connectedCallback() {
    await cssCaricato;
    this.shadowRoot.adoptedStyleSheets = [stile];
    this.#disegna();
  }

  /** Ricostruisce il contenuto. Chiamato a ogni cambio di dati. */
  #disegna() {
    if (!this.shadowRoot || !this.#carta) return;
    const c = this.#carta;
    const tipoPrincipale = c.tipi?.[0] ?? 'Incolore';

    this.shadowRoot.innerHTML = `
      <article part="scheda" data-tipo="${tipoPrincipale}">
        ${this.#htmlImmagine(c)}
        <div class="dati">
          <h3>${escapeHtml(c.nome)}</h3>
          <p class="set">${escapeHtml(this.#nomeSet)} · n. ${escapeHtml(c.numero)}</p>
          ${this.#htmlRigaPokemon(c)}
          ${this.#htmlAttacchi(c)}
        </div>
      </article>
    `;
  }

  /** @param {object} c */
  #htmlImmagine(c) {
    const src = urlImmagine(c, 'griglia');
    if (!src) return '<div class="segnaposto" aria-hidden="true">?</div>';
    // NIENTE loading="lazy": verificato che su un <img> inserito via innerHTML
    // dentro uno Shadow DOM il caricamento non parte mai, nemmeno con
    // l'immagine ben dentro il viewport (resta complete=false all'infinito).
    // Le miniature pesano ~14 KB, quindi caricarle subito è accettabile.
    // Quando la griglia della collezione ne mostrerà centinaia (step 2),
    // servirà un IntersectionObserver esplicito invece dell'attributo.
    return `<img src="${src}" alt="Illustrazione di ${escapeHtml(c.nome)}" />`;
  }

  /** @param {object} c */
  #htmlRigaPokemon(c) {
    if (c.categoria !== 'Pokémon') {
      return `<p class="meta">${escapeHtml(c.categoria)}</p>`;
    }
    const evoluzione = c.evolveDa ? ` · evolve da <strong>${escapeHtml(c.evolveDa)}</strong>` : '';
    const tipi = (c.tipi ?? [])
      .map((t) => `<span class="pastiglia" data-tipo="${t}">${escapeHtml(t)}</span>`)
      .join(' ');
    return `
      <p class="meta">${tipi} · ${escapeHtml(c.stadio ?? '')} · ${c.ps ?? '?'} PS${evoluzione}</p>
    `;
  }

  /** @param {object} c */
  #htmlAttacchi(c) {
    if (!c.attacchi?.length) return '';
    const righe = c.attacchi
      .map((a) => {
        const costo = a.costo
          .map((t) => `<span class="pastiglia" data-tipo="${t}">${escapeHtml(t)}</span>`)
          .join('');
        const danno = a.danno ? `<span class="danno">${a.danno}</span>` : '';
        return `<li>${costo} <span class="nome-attacco">${escapeHtml(a.nome)}</span> ${danno}</li>`;
      })
      .join('');
    return `<ul class="attacchi">${righe}</ul>`;
  }
}

/**
 * I nomi delle carte vengono da un dataset esterno: non li interpoliamo mai
 * grezzi dentro l'HTML.
 * @param {string} testo
 * @returns {string}
 */
function escapeHtml(testo) {
  return String(testo ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}

customElements.define('scheda-carta', SchedaCarta);
