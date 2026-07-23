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

/**
 * Osservatore condiviso da tutte le schede: carica l'immagine solo quando la
 * scheda sta per entrare nel viewport.
 *
 * Sostituisce `loading="lazy"`, che su un `<img>` inserito via `innerHTML`
 * dentro uno Shadow DOM non si attiva mai (verificato nello step 1). Con
 * centinaia di carte in griglia, caricarle tutte insieme sarebbe uno spreco.
 *
 * `rootMargin` fa partire il caricamento 200px prima del bordo, così scorrendo
 * l'immagine è già pronta.
 */
const osservatore = new IntersectionObserver(
  (voci) => {
    for (const voce of voci) {
      if (!voce.isIntersecting) continue;
      const img = voce.target;
      if (img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
      }
      osservatore.unobserve(img);
    }
  },
  { rootMargin: '200px' },
);

export class SchedaCarta extends HTMLElement {
  /** @type {object|null} */
  #carta = null;
  /** @type {string} */
  #nomeSet = '';
  /** @type {number|null} copie possedute; null = non mostrare il contatore */
  #quantita = null;

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

  get nomeSet() {
    return this.#nomeSet;
  }

  /** @param {number|null} valore copie possedute, o null per non mostrarle */
  set quantita(valore) {
    this.#quantita = valore ?? null;
    this.#disegna();
  }

  get quantita() {
    return this.#quantita;
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

    // Zero copie non è una quantità da mostrare: è una carta che non hai, e
    // "×0" accanto al nome sembra un errore invece di un'informazione. Capita
    // con le carte mancanti mostrate accanto alle tue.
    const quantita =
      this.#quantita === null || this.#quantita === 0
        ? ''
        : `<span class="quantita">×${this.#quantita}</span>`;

    this.shadowRoot.innerHTML = `
      <article part="scheda" data-tipo="${tipoPrincipale}">
        ${this.#htmlImmagine(c)}
        <div class="dati">
          <h3>${escapeHtml(c.nome)}${quantita}</h3>
          <p class="set">${escapeHtml(this.#nomeSet)} · n. ${escapeHtml(c.numero)}</p>
          ${this.#htmlRigaPokemon(c)}
          ${this.#htmlAttacchi(c)}
        </div>
      </article>
    `;

    // L'immagine è stata appena ricreata da innerHTML: va riosservata.
    const img = this.shadowRoot.querySelector('img[data-src]');
    if (img) osservatore.observe(img);

    // Il click annuncia la richiesta, non apre nulla: la scheda non deve
    // sapere che esiste un visore. Chi ascolta decide cosa farne.
    const apribile = this.shadowRoot.querySelector('.apri');
    apribile?.addEventListener('click', () => {
      this.dispatchEvent(
        new CustomEvent('carta-scelta', {
          bubbles: true,
          composed: true, // senza questo l'evento non uscirebbe dallo Shadow DOM
          detail: { carta: this.#carta, nomeSet: this.#nomeSet },
        }),
      );
    });
  }

  /** @param {object} c */
  #htmlImmagine(c) {
    const src = urlImmagine(c, 'griglia');
    // Le energie base generiche non hanno illustrazione: non appartengono a
    // nessun set, quindi non esiste una scansione da mostrare.
    if (!src) {
      const sigla = c.categoria === 'Energia' ? 'E' : '?';
      return `<div class="segnaposto" aria-hidden="true">${sigla}</div>`;
    }
    // L'URL sta in data-src, non in src: lo assegna l'IntersectionObserver
    // quando la scheda si avvicina al viewport. NON si usa loading="lazy"
    // perché su un <img> inserito via innerHTML dentro uno Shadow DOM non si
    // attiva mai (verificato nello step 1).
    //
    // L'immagine è dentro un <button>, non un <div> con un onclick: così si
    // raggiunge con il tastierino, si attiva con Invio e gli screen reader la
    // annunciano come un comando.
    return `
      <button class="apri" type="button" title="Ingrandisci ${escapeHtml(c.nome)}">
        <img data-src="${src}" alt="Illustrazione di ${escapeHtml(c.nome)}" />
      </button>`;
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
