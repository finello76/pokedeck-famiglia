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
 * Quando chi apre il visore gli passa **l'elenco** delle carte visibili (griglia
 * o mazzo) più l'indice di quella cliccata, si può scorrere avanti e indietro
 * senza tornare alla lista: frecce sinistra/destra col mouse o tastiera, swipe
 * col dito sul telefono. È l'unica ragione per cui `mostra()` accetta la lista.
 *
 * @example
 * document.querySelector('visore-carta').mostra(carta, 'Set Base');
 * // con navigazione:
 * visore.mostra(carta, nomeSet, [{ carta, nomeSet }, …], indice);
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
  /** @type {Array<{carta: object, nomeSet: string}>} carte scorribili */
  #lista = [];
  /** @type {number} posizione corrente dentro #lista */
  #indice = 0;
  /** @type {number|null} X d'inizio dello swipe, null se nessun tocco in corso */
  #tocco = null;

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
        <button class="freccia prec" type="button" aria-label="Carta precedente">‹</button>
        <button class="freccia succ" type="button" aria-label="Carta successiva">›</button>
        <figure>
          <div class="tela">
            <div class="caricamento" hidden><span class="giro"></span></div>
            <img alt="" />
          </div>
          <figcaption></figcaption>
        </figure>
      </dialog>
    `;
    this.#dialogo = this.shadowRoot.querySelector('dialog');

    this.shadowRoot.querySelector('.chiudi').addEventListener('click', () => this.chiudi());
    this.shadowRoot.querySelector('.prec').addEventListener('click', () => this.#scorri(-1));
    this.shadowRoot.querySelector('.succ').addEventListener('click', () => this.#scorri(1));

    // L'immagine ad alta risoluzione pesa ~830 KB: finché non è arrivata si
    // mostra un girotondo, altrimenti sfogliando sembra che il tocco non abbia
    // fatto nulla e si preme due volte. `load` ed `error` lo tolgono in ogni
    // caso — anche se la carta non ha immagine è giusto smettere di girare.
    const img = this.shadowRoot.querySelector('img');
    img.addEventListener('load', () => this.#caricamento(false));
    img.addEventListener('error', () => this.#caricamento(false));

    // Cliccare fuori dalla carta chiude: su un dialog il click "sullo sfondo"
    // arriva al dialog stesso, non ai figli.
    this.#dialogo.addEventListener('click', (evento) => {
      if (evento.target === this.#dialogo) this.chiudi();
    });

    // Le frecce della tastiera scorrono; Esc lo gestisce già il <dialog>.
    this.#dialogo.addEventListener('keydown', (evento) => {
      if (evento.key === 'ArrowLeft') this.#scorri(-1);
      else if (evento.key === 'ArrowRight') this.#scorri(1);
    });

    // Swipe: si registra dove il dito tocca e dove lo alza. Oltre una soglia
    // in orizzontale è uno scorrimento; sotto è un tocco e non si fa nulla, per
    // non scambiare per swipe un dito che trema.
    const figura = this.shadowRoot.querySelector('figure');
    figura.addEventListener(
      'touchstart',
      (evento) => {
        this.#tocco = evento.changedTouches[0]?.clientX ?? null;
      },
      { passive: true },
    );
    figura.addEventListener(
      'touchend',
      (evento) => {
        if (this.#tocco === null) return;
        const delta = (evento.changedTouches[0]?.clientX ?? this.#tocco) - this.#tocco;
        this.#tocco = null;
        if (Math.abs(delta) < 40) return;
        // Trascinare verso sinistra porta alla carta dopo, come sfogliare.
        this.#scorri(delta < 0 ? 1 : -1);
      },
      { passive: true },
    );

    // `showModal()` blocca l'interazione con la pagina ma NON il suo scroll:
    // la rotella e lo swipe continuano a far scorrere il catalogo sotto la
    // carta. L'evento `close` copre la chiusura con Esc, che non passa da
    // `chiudi()`; lo sblocco sta anche in `chiudi()` perché qualche ambiente
    // non emette `close` in modo affidabile.
    this.#dialogo.addEventListener('close', () => {
      document.documentElement.classList.remove('scorrimento-bloccato');
    });
  }

  /**
   * Mostra una carta, eventualmente inserita in un elenco scorribile.
   *
   * @param {object} carta
   * @param {string} [nomeSet]
   * @param {Array<{carta: object, nomeSet: string}>} [lista] carte fra cui
   *   scorrere; se assente si mostra solo `carta` senza frecce
   * @param {number} [indice] posizione di `carta` dentro `lista`
   * @returns {void}
   */
  mostra(carta, nomeSet = '', lista = null, indice = 0) {
    if (!this.#dialogo || !carta) return;

    // Senza una lista valida si scorre in un elenco di una sola carta: le
    // frecce spariscono da sole e il resto del codice non ha casi speciali.
    this.#lista = Array.isArray(lista) && lista.length ? lista : [{ carta, nomeSet }];
    this.#indice = Math.min(Math.max(indice, 0), this.#lista.length - 1);

    this.#rendi();

    this.#dialogo.showModal();
    // La classe sta su <html> e non su <body>: su iOS Safari l'overflow del
    // body da solo non ferma lo scroll della pagina.
    document.documentElement.classList.add('scorrimento-bloccato');
  }

  /**
   * Sposta di `passo` carte (±1) restando dentro i limiti dell'elenco.
   * @param {number} passo
   */
  #scorri(passo) {
    const nuovo = Math.min(Math.max(this.#indice + passo, 0), this.#lista.length - 1);
    if (nuovo === this.#indice) return;
    this.#indice = nuovo;
    this.#rendi();
  }

  /** Disegna la carta corrente e aggiorna lo stato delle frecce. */
  #rendi() {
    const voce = this.#lista[this.#indice];
    if (!voce) return;
    const carta = voce.carta;

    const img = this.shadowRoot.querySelector('img');
    const didascalia = this.shadowRoot.querySelector('figcaption');

    // Qui si usa la versione ad alta risoluzione: è l'unico punto dell'app in
    // cui l'immagine viene guardata davvero, e i dettagli sulla carta fisica
    // (attacchi, illustratore) devono essere leggibili.
    const src = urlImmagine(carta, 'stampa');
    if (src) {
      // Solo se la sorgente cambia davvero: riassegnare la stessa non fa
      // ripartire `load`, e il girotondo resterebbe acceso all'infinito.
      if (img.getAttribute('src') !== src) {
        this.#caricamento(true);
        img.src = src;
      }
      img.alt = `Carta ${carta.nome}`;
      img.hidden = false;
      // Immagine già in cache: `complete` è vero subito e `load` potrebbe non
      // riscattare. Si spegne il girotondo a mano.
      if (img.complete && img.naturalWidth > 0) this.#caricamento(false);
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      this.#caricamento(false);
    }

    didascalia.textContent = [carta.nome, voce.nomeSet, carta.numero ? `n. ${carta.numero}` : '']
      .filter(Boolean)
      .join(' · ');

    // Con una carta sola le frecce non servono; agli estremi si disabilita
    // quella che non porterebbe da nessuna parte.
    const sola = this.#lista.length <= 1;
    const prec = this.shadowRoot.querySelector('.prec');
    const succ = this.shadowRoot.querySelector('.succ');
    prec.hidden = succ.hidden = sola;
    prec.disabled = this.#indice <= 0;
    succ.disabled = this.#indice >= this.#lista.length - 1;
  }

  /**
   * Accende o spegne il girotondo di caricamento.
   * @param {boolean} attivo
   */
  #caricamento(attivo) {
    const spia = this.shadowRoot?.querySelector('.caricamento');
    if (spia) spia.hidden = !attivo;
  }

  /** @returns {void} */
  chiudi() {
    this.#dialogo?.close();
    document.documentElement.classList.remove('scorrimento-bloccato');
  }
}

customElements.define('visore-carta', VisoreCarta);
