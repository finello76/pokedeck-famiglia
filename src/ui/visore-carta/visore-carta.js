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
 * @fires visore-carta#desiderio-richiesto - detail: `{ idSet, numero }`
 * @fires visore-carta#linea-richiesta - detail: `{ voce }` (solo Pokémon)
 *
 * @example
 * document.querySelector('visore-carta').mostra(carta, 'Set Base');
 * visore.mostra(carta, nomeSet, [{ carta, nomeSet, idSet, numero, quantita }, …], indice);
 *
 * @module ui/visore-carta
 */

import { urlImmagine } from '../../data/dataset.js';
import { applica, ripartizione, segniVarianti } from '../../data/varianti.js';
import { bloccaScorrimento, sbloccaScorrimento } from '../../app/blocca-scroll.js';
import { creaInclinazione, limita, MASSIMO } from './inclinazione.js';
import { eInglese, SPIEGAZIONE } from '../lingua-set.js';

/**
 * Chi tiene bloccato lo scorrimento. Il visore può aprirsi **sopra** la finestra
 * della linea evolutiva: senza chiavi distinte, chiudendo il visore la pagina
 * tornerebbe a scorrere sotto una finestra ancora aperta.
 */
const CHIAVE_SCROLL = 'visore-carta';

export class VisoreCarta extends HTMLElement {
  /** @type {HTMLDialogElement|null} */
  #dialogo = null;
  /** @type {Array<object>} carte scorribili (voci con carta, nomeSet, idSet…) */
  #lista = [];
  /** @type {number} posizione corrente dentro #lista */
  #indice = 0;
  /** @type {number|null} X d'inizio dello swipe, null se nessun tocco in corso */
  #tocco = null;
  /** @type {ReturnType<typeof creaInclinazione>} il calcolo del tilt, con la
   *  presa iniziale e lo smorzamento. Vive in `inclinazione.js` perché è
   *  l'unica parte del visore verificabile senza un telefono in mano. */
  #inclinazione = creaInclinazione();
  /** @type {(e: DeviceOrientationEvent) => void} gestore registrato/rimosso all'apertura/chiusura */
  #suOrientamento = (evento) => {
    if (evento.beta == null || evento.gamma == null) return;
    // beta = avanti/indietro, gamma = sinistra/destra.
    const { rx, ry } = this.#inclinazione.passo(evento.beta, evento.gamma);
    this.#inclina(rx, ry);
  };

  connectedCallback() {
    this.innerHTML = `
      <dialog class="finestra">
        <div class="barra-alto">
          <button class="chiudi" type="button" aria-label="Chiudi">✕</button>
          <span class="posizione"></span>
          <span class="avviso-lingua" hidden></span>
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
          <div class="blocco voglio-blocco" hidden>
            <button class="voglio-visore" type="button">★ La voglio</button>
          </div>
          <div class="blocco copie-blocco" hidden>
            <span class="etichetta">Copie possedute</span>
            <div class="copie-stepper">
              <button class="meno" type="button" aria-label="Togli una copia">−</button>
              <span class="copie-num">0</span>
              <button class="piu" type="button" aria-label="Aggiungi una copia">+</button>
            </div>
          </div>
          <!-- La ripartizione fra normale, holo e reverse: qui c'è lo spazio per
               scriverla per esteso, che sulla card non c'è. -->
          <p class="finiture-visore" hidden></p>
          <div class="blocco linea-blocco" hidden>
            <button class="linea-visore" type="button">Linea evolutiva</button>
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
    // "La voglio": la carta entra nella lista desideri e il visore si chiude.
    // Non resta aperto perché quella carta ha appena cambiato natura — da buco
    // in un set a desiderio — e la griglia dietro si sta già ridisegnando.
    this.querySelector('.voglio-visore').addEventListener('click', () => {
      const voce = this.#lista[this.#indice];
      if (!voce || voce.idSet == null || voce.numero == null) return;
      this.dispatchEvent(
        new CustomEvent('desiderio-richiesto', {
          bubbles: true,
          detail: { idSet: voce.idSet, numero: voce.numero },
        }),
      );
      this.chiudi();
    });

    // "Linea evolutiva": la famiglia di questo Pokémon, con dentro segnato cosa
    // hai. Prima si poteva chiedere **solo dai Preferiti**, dove il pulsante sta
    // al posto degli stepper: per vedere la linea di un Machoke bisognava prima
    // dichiarare che Machoke ti piace. Qui si arriva da qualunque vista — dal
    // catalogo, da un buco in un set, dalla ricerca — perché il visore è il posto
    // in cui una carta la si sta già guardando.
    //
    // Il visore si chiude, come per "La voglio", e non per fare ordine: la linea
    // è un altro `<dialog>` modale, e dalla linea si arriva qui (si apre il
    // visore su un gradino). Restando aperti si impilerebbero, e la linea nuova
    // si disegnerebbe **sotto** il visore che l'ha chiesta. Chiudendo, la pila
    // resta alta una. Vedi `docs/apprendimento/18-un-indice-al-contrario.md`.
    this.querySelector('.linea-visore').addEventListener('click', () => {
      const voce = this.#lista[this.#indice];
      if (!voce?.carta) return;
      this.dispatchEvent(new CustomEvent('linea-richiesta', { bubbles: true, detail: { voce } }));
      this.chiudi();
    });

    // L'immagine ad alta risoluzione pesa ~830 KB: finché non è arrivata si
    // mostra un girotondo, altrimenti sfogliando sembra che il tocco non abbia
    // fatto nulla. `load` ed `error` lo tolgono in ogni caso.
    const img = this.querySelector('img');
    img.addEventListener('load', () => this.#caricamento(false));
    // Scansione che non arriva: si nasconde l'immagine e si scrive il nome
    // nella cornice, come per le carte che una scansione non ce l'hanno. Il
    // testo alternativo di un'immagine rotta, in mezzo alla cornice a schermo
    // intero, è la cosa più brutta che il visore possa mostrare.
    img.addEventListener('error', () => {
      this.#caricamento(false);
      img.hidden = true;
      const carta = this.#lista[this.#indice]?.carta;
      this.querySelector('.nome-cornice').textContent = carta
        ? `${carta.nome}${carta.numero ? `\nn. ${carta.numero}` : ''}`
        : '';
    });

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
      // Col mouse non c'è nessuna singolarità da schivare: la posizione del
      // puntatore è già una coordinata lineare. Resta com'era — funziona bene.
      const ry = limita(((evento.clientX - r.left) / r.width - 0.5) * 16, MASSIMO);
      const rx = limita((0.5 - (evento.clientY - r.top) / r.height) * 16, MASSIMO);
      this.#inclina(rx, ry);
    });
    tela.addEventListener('pointerleave', () => this.#inclina(0, 0));

    // A fine animazione d'ingresso si toglie `entra`: così l'animazione smette
    // di applicarsi e il tilt (transform inline) riprende il comando.
    tela.addEventListener('animationend', (evento) => {
      if (evento.animationName === 'carta-entra') tela.classList.remove('entra');
    });

    // `showModal()` blocca l'interazione ma NON lo scroll della pagina: la
    // classe su <html> lo ferma. `close` copre la chiusura con Esc — e lì
    // vanno staccati anche i sensori, che Esc non passa da `chiudi()`.
    this.#dialogo.addEventListener('close', () => {
      sbloccaScorrimento(CHIAVE_SCROLL);
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

  /** Attiva il giroscopio. */
  #avviaMovimento() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.#inclinazione.azzera();
    if (typeof DeviceOrientationEvent === 'undefined') return;

    const ascolta = () => window.addEventListener('deviceorientation', this.#suOrientamento);

    // Su iOS/WebKit (anche Brave su iPhone) il giroscopio è dietro un permesso
    // che va chiesto DA un gesto dell'utente: qui va bene, perché `mostra()`
    // parte dal tocco sulla carta. Altrove basta mettersi in ascolto.
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then((esito) => {
          if (esito === 'granted') ascolta();
        })
        .catch(() => {
          /* permesso negato o fuori da un gesto: resta l'animazione d'ingresso */
        });
    } else {
      ascolta();
    }
  }

  /** Stacca il giroscopio e riporta la carta piatta. */
  #fermaMovimento() {
    window.removeEventListener('deviceorientation', this.#suOrientamento);
    this.#inclinazione.azzera();
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
    bloccaScorrimento(CHIAVE_SCROLL);
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

    // La stessa regola che applicherà il database, presa dallo stesso posto:
    // `+` aggiunge una normale, `−` toglie da dove c'è — e se di normali non ce
    // ne sono più, tocca a una reverse. Rifarla a mano qui vorrebbe dire due
    // versioni della stessa regola, e la prima a divergere sarebbe questa.
    const dopo = applica(voce, 'normale', delta);
    voce.quantita = dopo.quantita;
    if (dopo.varianti) voce.varianti = dopo.varianti;
    else delete voce.varianti;

    const num = this.querySelector('.copie-num');
    if (num) num.textContent = voce.quantita;
    this.querySelector('.copie-blocco .meno').disabled = voce.quantita === 0;
    this.#rendiFiniture(voce);

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
      // Qui il testo alternativo serve davvero: nel visore la scansione È il
      // contenuto, e senza `alt` la carta non avrebbe nome per chi non la vede.
      // Che non finisca a schermo su un'immagine rotta lo garantisce il
      // gestore di `error`, che nasconde l'immagine e scrive nella cornice.
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

    // Set senza dati italiani: qui la scansione È il contenuto, e chi la
    // guarda deve sapere che i nomi degli attacchi che legge non sono quelli
    // stampati sulla sua copia.
    const avviso = this.querySelector('.avviso-lingua');
    const inglese = eInglese(voce);
    avviso.hidden = !inglese;
    avviso.textContent = inglese ? 'EN' : '';
    avviso.title = inglese ? SPIEGAZIONE : '';

    this.#rendiCopie(voce);
    this.#rendiLinea(voce);

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
    const voglio = this.querySelector('.voglio-blocco');
    // Le copie si possono modificare solo se sappiamo dove salvarle. Con una
    // carta arrivata senza contesto (idSet/numero) il blocco sparisce.
    if (voce.idSet == null || voce.numero == null) {
      blocco.hidden = true;
      voglio.hidden = true;
      return;
    }
    // Carta che non hai: il "+" direbbe "ne ho una in più" di una carta mai
    // posseduta. Al suo posto la stella, come sulle card della griglia.
    //
    // «Non averla» si misura sulle **copie**, non sul flag `mancante`. Quel
    // flag ce l'hanno solo le card nate nell'elenco delle mancanti di un set:
    // la stessa carta guardata dalla finestra della linea evolutiva — cioè
    // esattamente dove ci si accorge che manca un gradino — arrivava senza, e
    // là la stella non compariva.
    const daVolere = !voce.desiderata && (Boolean(voce.mancante) || !(voce.quantita > 0));
    voglio.hidden = !daVolere;
    blocco.hidden = daVolere;
    if (daVolere) return;
    const n = voce.quantita ?? 0;
    this.querySelector('.copie-num').textContent = n;
    this.querySelector('.copie-blocco .meno').disabled = n === 0;
    this.#rendiFiniture(voce);
  }

  /**
   * Scrive com'è fatta la pila: «2 normali · 1 reverse».
   *
   * Compare **solo se c'è qualcosa di speciale**: su una carta tutta normale
   * direbbe "1 normale", che è la stessa informazione del contatore appena
   * sopra. Le finiture si registrano aggiungendo la carta (dove si sceglie), e
   * qui si leggono: è la stessa divisione di ruoli del contatore delle copie,
   * che nel visore si modifica ma non si spiega.
   *
   * @param {object} voce
   */
  #rendiFiniture(voce) {
    const riga = this.querySelector('.finiture-visore');
    if (!riga) return;
    const segni = segniVarianti(voce);
    if (!segni.length) {
      riga.hidden = true;
      return;
    }
    const { normale } = ripartizione(voce);
    const pezzi = [
      ...(normale ? [`${normale} normal${normale === 1 ? 'e' : 'i'}`] : []),
      ...segni.map((s) => `${s.quante} ${s.etichetta.toLowerCase()}`),
    ];
    riga.textContent = pezzi.join(' · ');
    riga.hidden = false;
  }

  /**
   * Mostra o nasconde il pulsante della linea evolutiva.
   *
   * Solo sui Pokémon: su un Allenatore o su un'Energia aprirebbe una finestra
   * con dentro una carta sola. Non serve invece che la carta sia **tua** — la
   * domanda "che faccia hanno i parenti di questo?" viene soprattutto davanti a
   * una carta che non hai ancora.
   *
   * @param {object} voce
   */
  #rendiLinea(voce) {
    const blocco = this.querySelector('.linea-blocco');
    if (blocco) blocco.hidden = voce.carta?.categoria !== 'Pokémon';
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
    sbloccaScorrimento(CHIAVE_SCROLL);
    this.#fermaMovimento();
  }
}

customElements.define('visore-carta', VisoreCarta);
