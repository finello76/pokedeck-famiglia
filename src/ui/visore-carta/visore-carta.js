/**
 * Web Component `<visore-carta>`: mostra una carta a schermo intero.
 *
 * Ce n'è **uno solo** per pagina, non uno per carta: la griglia può contenerne
 * centinaia, e creare centinaia di finestre nascoste sarebbe uno spreco. Le
 * card si limitano a segnalare "hanno cliccato me", e questo componente mostra
 * quella carta, con l'illustrazione grande, gli attacchi e il contatore delle
 * copie possedute (modificabile senza uscire dal visore).
 *
 * Usa l'elemento nativo `<dialog>`: con `showModal()` il browser gestisce da
 * solo la chiusura con Esc, il fondo oscurato e il confinamento del focus.
 *
 * Sotto la carta non c'è testo: attacchi, PS e tipo sono già stampati sulla
 * scansione. Resta solo il contatore delle copie possedute, che sulla carta
 * non c'è. La carta si inclina in 3D seguendo il giroscopio del telefono (o il
 * puntatore, su PC), con un riflesso che scorre: è un vezzo, ma è il momento
 * in cui la carta viene "guardata" e un po' di scena è il suo.
 *
 * Disegna in **DOM normale, non Shadow DOM**: il colore del tipo (`tipi.css`)
 * deve tingere la cornice segnaposto, e nello Shadow DOM non arriverebbe. Lo
 * stile sta in `visore-carta.css`, incluso da index.html.
 *
 * Quando chi apre il visore gli passa **l'elenco** delle carte visibili più
 * l'indice di quella cliccata, si può scorrere avanti e indietro senza tornare
 * alla lista: frecce, tastiera, swipe.
 *
 * @fires visore-carta#quantita-cambiata - detail: `{ idSet, numero, delta }`
 *
 * @example
 * document.querySelector('visore-carta').mostra(carta, 'Set Base');
 * visore.mostra(carta, nomeSet, [{ carta, nomeSet, idSet, numero, quantita }, …], indice);
 *
 * @module ui/visore-carta
 */

import { urlImmagine } from '../../data/dataset.js';

export class VisoreCarta extends HTMLElement {
  /** @type {HTMLDialogElement|null} */
  #dialogo = null;
  /** @type {Array<object>} carte scorribili (voci con carta, nomeSet, idSet…) */
  #lista = [];
  /** @type {number} posizione corrente dentro #lista */
  #indice = 0;
  /** @type {number|null} X d'inizio dello swipe, null se nessun tocco in corso */
  #tocco = null;
  /** @type {{beta: number, gamma: number}|null} inclinazione del telefono al
   *  momento dell'apertura: il tilt si misura da lì, non dallo zero assoluto,
   *  o la carta partirebbe già storta in mano. */
  #base = null;
  /** @type {(e: DeviceOrientationEvent) => void} gestore registrato/rimosso all'apertura/chiusura */
  #suOrientamento = (evento) => {
    if (evento.beta == null || evento.gamma == null) return;
    if (!this.#base) this.#base = { beta: evento.beta, gamma: evento.gamma };
    // beta = avanti/indietro, gamma = sinistra/destra. Delta rispetto alla
    // presa iniziale, smorzato e limitato: l'effetto dev'essere un luccichio,
    // non una giostra.
    const rx = limita((this.#base.beta - evento.beta) * 0.35, 8);
    const ry = limita((evento.gamma - this.#base.gamma) * 0.35, 8);
    this.#inclina(rx, ry);
  };

  connectedCallback() {
    this.innerHTML = `
      <dialog class="finestra">
        <div class="barra-alto">
          <button class="chiudi" type="button" aria-label="Chiudi">✕</button>
          <span class="posizione"></span>
          <span class="spazio" aria-hidden="true"></span>
        </div>

        <div class="corpo-visore">
          <div class="tela">
            <button class="freccia prec" type="button" aria-label="Carta precedente">‹</button>
            <div class="cornice">
              <div class="caricamento" hidden><span class="giro"></span></div>
              <img alt="" />
              <span class="nome-cornice"></span>
              <span class="lucido" aria-hidden="true"></span>
            </div>
            <button class="freccia succ" type="button" aria-label="Carta successiva">›</button>
          </div>

          <!-- Niente testi sotto la carta: attacchi, PS e tipo sono già stampati
               sulla scansione. Resta solo il contatore copie, che sulla carta
               non c'è. -->
          <div class="blocco copie-blocco" hidden>
            <span class="etichetta">Copie possedute</span>
            <div class="copie-stepper">
              <button class="meno" type="button" aria-label="Togli una copia">−</button>
              <span class="copie-num">0</span>
              <button class="piu" type="button" aria-label="Aggiungi una copia">+</button>
            </div>
          </div>
        </div>
      </dialog>
    `;
    this.#dialogo = this.querySelector('dialog');

    this.querySelector('.chiudi').addEventListener('click', () => this.chiudi());
    this.querySelector('.prec').addEventListener('click', () => this.#scorri(-1));
    this.querySelector('.succ').addEventListener('click', () => this.#scorri(1));
    this.querySelector('.copie-blocco .meno').addEventListener('click', () => this.#copie(-1));
    this.querySelector('.copie-blocco .piu').addEventListener('click', () => this.#copie(1));

    // L'immagine ad alta risoluzione pesa ~830 KB: finché non è arrivata si
    // mostra un girotondo, altrimenti sfogliando sembra che il tocco non abbia
    // fatto nulla. `load` ed `error` lo tolgono in ogni caso.
    const img = this.querySelector('img');
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

    // Swipe: si registra dove il dito tocca e dove lo alza. Oltre una soglia in
    // orizzontale è uno scorrimento; sotto è un tocco e non si fa nulla.
    const tela = this.querySelector('.tela');
    tela.addEventListener(
      'touchstart',
      (evento) => {
        this.#tocco = evento.changedTouches[0]?.clientX ?? null;
      },
      { passive: true },
    );
    tela.addEventListener(
      'touchend',
      (evento) => {
        if (this.#tocco === null) return;
        const delta = (evento.changedTouches[0]?.clientX ?? this.#tocco) - this.#tocco;
        this.#tocco = null;
        if (Math.abs(delta) < 40) return;
        this.#scorri(delta < 0 ? 1 : -1);
      },
      { passive: true },
    );

    // Col mouse (PC) la carta si inclina seguendo il puntatore sulla tela:
    // stesso effetto del giroscopio, altro sensore.
    const cornice = this.querySelector('.cornice');
    tela.addEventListener('pointermove', (evento) => {
      if (evento.pointerType === 'touch') return;
      const r = cornice.getBoundingClientRect();
      const ry = limita(((evento.clientX - r.left) / r.width - 0.5) * 16, 8);
      const rx = limita((0.5 - (evento.clientY - r.top) / r.height) * 16, 8);
      this.#inclina(rx, ry);
    });
    tela.addEventListener('pointerleave', () => this.#inclina(0, 0));

    // `showModal()` blocca l'interazione ma NON lo scroll della pagina: la
    // classe su <html> lo ferma. `close` copre la chiusura con Esc — e lì
    // vanno staccati anche i sensori, che Esc non passa da `chiudi()`.
    this.#dialogo.addEventListener('close', () => {
      document.documentElement.classList.remove('scorrimento-bloccato');
      this.#fermaMovimento();
    });
  }

  /**
   * Applica l'inclinazione 3D alla carta e sposta il riflesso di conseguenza.
   * @param {number} rx gradi attorno all'asse X
   * @param {number} ry gradi attorno all'asse Y
   */
  #inclina(rx, ry) {
    const cornice = this.querySelector('.cornice');
    const lucido = this.querySelector('.lucido');
    if (!cornice) return;
    cornice.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
    // Il riflesso scorre in direzione opposta al tilt: è quello che vende
    // l'illusione della superficie lucida.
    if (lucido) {
      lucido.style.setProperty('--riflesso-x', `${50 - ry * 5}%`);
      lucido.style.setProperty('--riflesso-y', `${50 - rx * 5}%`);
    }
  }

  /** Attiva il giroscopio, se il dispositivo lo offre senza chiedere permessi. */
  #avviaMovimento() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.#base = null;
    // Su iOS serve un permesso esplicito (requestPermission da un gesto): lì si
    // rinuncia in silenzio e resta l'effetto col puntatore. Su Android e simili
    // basta mettersi in ascolto.
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission !== 'function') {
      window.addEventListener('deviceorientation', this.#suOrientamento);
    }
  }

  /** Stacca il giroscopio e riporta la carta piatta. */
  #fermaMovimento() {
    window.removeEventListener('deviceorientation', this.#suOrientamento);
    this.#base = null;
    this.#inclina(0, 0);
  }

  /**
   * Mostra una carta, eventualmente dentro un elenco scorribile.
   *
   * @param {object} carta
   * @param {string} [nomeSet]
   * @param {Array<object>} [lista] voci fra cui scorrere; se assente si mostra
   *   solo `carta` senza frecce
   * @param {number} [indice] posizione di `carta` dentro `lista`
   * @returns {void}
   */
  mostra(carta, nomeSet = '', lista = null, indice = 0) {
    if (!this.#dialogo || !carta) return;

    this.#lista =
      Array.isArray(lista) && lista.length ? lista : [{ carta, nomeSet }];
    this.#indice = Math.min(Math.max(indice, 0), this.#lista.length - 1);

    this.#rendi();
    // showModal() mette il dialog nel top-layer (fondo oscurato, Esc, focus
    // confinato). Se un browser lo rifiuta, si ripiega su show(): grazie al
    // `position: fixed` nel CSS copre comunque tutto lo schermo.
    try {
      this.#dialogo.showModal();
    } catch {
      this.#dialogo.show();
    }
    document.documentElement.classList.add('scorrimento-bloccato');
    this.#avviaMovimento();

    // Animazione d'ingresso: si toglie e rimette la classe per farla ripartire
    // anche quando il visore era appena stato aperto.
    const tela = this.querySelector('.tela');
    tela.classList.remove('entra');
    void tela.offsetWidth;
    tela.classList.add('entra');
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

  /**
   * Aggiunge o toglie una copia della carta corrente. Aggiorna subito il numero
   * a schermo (ottimistico) e annuncia la modifica a chi la salva.
   * @param {number} delta +1 o -1
   */
  #copie(delta) {
    const voce = this.#lista[this.#indice];
    if (!voce || voce.idSet == null || voce.numero == null) return;
    const attuale = voce.quantita ?? 0;
    if (delta < 0 && attuale === 0) return;

    voce.quantita = Math.max(0, attuale + delta);
    const num = this.querySelector('.copie-num');
    if (num) num.textContent = voce.quantita;
    this.querySelector('.copie-blocco .meno').disabled = voce.quantita === 0;

    this.dispatchEvent(
      new CustomEvent('quantita-cambiata', {
        bubbles: true,
        detail: { idSet: voce.idSet, numero: voce.numero, delta },
      }),
    );
  }

  /** Disegna la carta corrente: immagine, dati, attacchi, copie, frecce. */
  #rendi() {
    const voce = this.#lista[this.#indice];
    if (!voce) return;
    // Se i dati della carta mancano (set non scaricato) si usa un segnaposto
    // invece di leggere `carta.tipi` su `null`: quell'errore interrompeva il
    // render a metà e lasciava la cornice vuota senza dettaglio.
    const carta = voce.carta ?? {
      nome: 'Carta non disponibile',
      categoria: '',
      tipi: [],
      numero: voce.numero,
      attacchi: [],
    };
    const tipo = carta.tipi?.[0] ?? 'Incolore';

    // Immagine ad alta risoluzione: è l'unico punto in cui la carta si guarda
    // davvero, e i dettagli devono essere leggibili.
    const img = this.querySelector('img');
    const nomeCornice = this.querySelector('.nome-cornice');
    const src = urlImmagine(carta, 'stampa');
    if (src) {
      if (img.getAttribute('src') !== src) {
        this.#caricamento(true);
        img.src = src;
      }
      img.alt = `Carta ${carta.nome}`;
      img.hidden = false;
      nomeCornice.textContent = '';
      if (img.complete && img.naturalWidth > 0) this.#caricamento(false);
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      this.#caricamento(false);
      // Nessuna scansione per questa carta: invece di una cornice vuota si
      // scrive dentro il nome, così si capisce cosa si sta guardando.
      nomeCornice.textContent = `${carta.nome ?? ''}${carta.numero ? `\nn. ${carta.numero}` : ''}`;
    }
    this.querySelector('.cornice').dataset.tipo = tipo;

    // Posizione nell'elenco.
    this.querySelector('.posizione').textContent =
      this.#lista.length > 1 ? `${this.#indice + 1} / ${this.#lista.length}` : '';

    this.#rendiCopie(voce);

    // Frecce: con una carta sola spariscono; agli estremi si disabilitano.
    const sola = this.#lista.length <= 1;
    const prec = this.querySelector('.prec');
    const succ = this.querySelector('.succ');
    prec.hidden = succ.hidden = sola;
    prec.disabled = this.#indice <= 0;
    succ.disabled = this.#indice >= this.#lista.length - 1;

    // Riporta lo scroll del dettaglio in cima quando si cambia carta.
    this.querySelector('.corpo-visore').scrollTop = 0;
  }

  /** @param {object} voce */
  #rendiCopie(voce) {
    const blocco = this.querySelector('.copie-blocco');
    // Le copie si possono modificare solo se sappiamo dove salvarle. Con una
    // carta arrivata senza contesto (idSet/numero) il blocco sparisce.
    if (voce.idSet == null || voce.numero == null) {
      blocco.hidden = true;
      return;
    }
    blocco.hidden = false;
    const n = voce.quantita ?? 0;
    this.querySelector('.copie-num').textContent = n;
    this.querySelector('.copie-blocco .meno').disabled = n === 0;
  }

  /**
   * Accende o spegne il girotondo di caricamento.
   * @param {boolean} attivo
   */
  #caricamento(attivo) {
    const spia = this.querySelector('.caricamento');
    if (spia) spia.hidden = !attivo;
  }

  /** @returns {void} */
  chiudi() {
    this.#dialogo?.close();
    document.documentElement.classList.remove('scorrimento-bloccato');
    this.#fermaMovimento();
  }
}

/**
 * Limita un valore all'intervallo [-massimo, massimo].
 * @param {number} valore
 * @param {number} massimo
 * @returns {number}
 */
function limita(valore, massimo) {
  return Math.min(Math.max(valore, -massimo), massimo);
}

customElements.define('visore-carta', VisoreCarta);
