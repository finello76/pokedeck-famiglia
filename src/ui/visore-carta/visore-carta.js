/**
 * Web Component `<visore-carta>`: mostra una carta a schermo intero.
 *
 * Ce n'è **uno solo** per pagina, non uno per carta: la griglia può contenerne
 * centinaia, e creare centinaia di finestre nascoste sarebbe uno spreco. Le
 * schede si limitano a segnalare "hanno cliccato me", e questo componente
 * mostra quella carta.
 *
 * Usa l'elemento nativo `<dialog>`: con `showModal()` il browser gestisce da
 * solo la chiusura con Esc, il fondo oscurato e il confinamento del focus, che
 * a mano sarebbero tre cose facili da sbagliare.
 *
 * @example
 * document.querySelector('visore-carta').mostra(carta, 'Set Base');
 *
 * @module ui/visore-carta
 */

import { urlImmagine } from '../../data/dataset.js';

const stile = new CSSStyleSheet();
const cssCaricato = fetch(new URL('./visore-carta.css', import.meta.url))
  .then((r) => r.text())
  .then((css) => stile.replaceSync(css))
  .catch(() => {});

export class VisoreCarta extends HTMLElement {
  /** @type {HTMLDialogElement|null} */
  #dialogo = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    await cssCaricato;
    this.shadowRoot.adoptedStyleSheets = [stile];
    this.shadowRoot.innerHTML = `
      <dialog part="finestra">
        <button class="chiudi" type="button" aria-label="Chiudi">×</button>
        <figure>
          <img alt="" />
          <figcaption></figcaption>
        </figure>
      </dialog>
    `;
    this.#dialogo = this.shadowRoot.querySelector('dialog');

    this.shadowRoot.querySelector('.chiudi').addEventListener('click', () => this.chiudi());

    // Cliccare fuori dalla carta chiude: su un dialog il click "sullo sfondo"
    // arriva al dialog stesso, non ai figli.
    this.#dialogo.addEventListener('click', (evento) => {
      if (evento.target === this.#dialogo) this.chiudi();
    });
  }

  /**
   * Mostra una carta.
   *
   * @param {object} carta
   * @param {string} [nomeSet]
   * @returns {void}
   */
  mostra(carta, nomeSet = '') {
    if (!this.#dialogo || !carta) return;

    const img = this.shadowRoot.querySelector('img');
    const didascalia = this.shadowRoot.querySelector('figcaption');

    // Qui si usa la versione ad alta risoluzione: è l'unico punto dell'app in
    // cui l'immagine viene guardata davvero, e i dettagli sulla carta fisica
    // (attacchi, illustratore) devono essere leggibili.
    const src = urlImmagine(carta, 'stampa');
    if (src) {
      img.src = src;
      img.alt = `Carta ${carta.nome}`;
      img.hidden = false;
    } else {
      img.hidden = true;
    }

    didascalia.textContent = [carta.nome, nomeSet, carta.numero ? `n. ${carta.numero}` : '']
      .filter(Boolean)
      .join(' · ');

    this.#dialogo.showModal();
  }

  /** @returns {void} */
  chiudi() {
    this.#dialogo?.close();
  }
}

customElements.define('visore-carta', VisoreCarta);
