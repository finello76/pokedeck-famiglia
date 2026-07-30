/**
 * Web Component `<griglia-collezione>`: la collezione divisa per serie, coi filtri.
 *
 * Riceve le voci già pronte e non tocca il database: filtra, raggruppa e
 * disegna. Quando l'utente cambia una quantità o apre una carta emette un
 * evento e sta a chi lo ascolta decidere cosa farne. È la stessa separazione di
 * un componente Angular "dumb" con `@Input` ed `@Output`.
 *
 * Le carte sono divise per **serie** e poi per set, come i raccoglitori veri.
 * Ogni set porta quante ne hai su quante ne esistono, e a richiesta mostra anche
 * quelle che ti mancano.
 *
 * Disegna in **DOM normale, non Shadow DOM**: così le custom property dei tipi
 * (`tipi.css`, foglio della pagina) colorano le card, cosa che nello Shadow DOM
 * non accadrebbe (un foglio di pagina non attraversa il confine). Le card sono
 * costruite qui, non delegate a `<scheda-carta>`, proprio per poterle tingere.
 *
 * @fires griglia-collezione#quantita-cambiata - detail: `{ idSet, numero, delta }`
 * @fires griglia-collezione#preferita-cambiata - detail: `{ idSet, numero, preferita }`
 * @fires griglia-collezione#carta-scelta - detail: `{ carta, nomeSet, lista, indice }`
 * @fires griglia-collezione#linea-richiesta - detail: `{ voce }` (solo Preferiti)
 * @fires griglia-collezione#desiderio-richiesto - detail: `{ idSet, numero }`
 *
 * @example
 * const g = document.createElement('griglia-collezione');
 * g.caricaMancanti = (idSet) => carteMancanti(idSet, voci);
 * g.voci = await elencoCompleto();
 *
 * @module ui/griglia-collezione
 */

import { urlImmagine } from '../../data/dataset.js';
import { formattaEuro, valoreDi } from '../../data/prezzi.js';
import { formatoDi } from '../../data/legalita.js';
import { segnaposto, seImmagineRotta } from '../segnaposto.js';
import { pastigliaLingua } from '../lingua-set.js';
import { FILTRI_VUOTI, filtra, progressoSet, raggruppa, valoriDisponibili } from './raggruppa.js';

/**
 * Osservatore condiviso: carica l'immagine di una card solo quando sta per
 * entrare nel viewport. Con centinaia di carte, scaricarle tutte insieme
 * sarebbe uno spreco; `rootMargin` fa partire 200px prima così, scorrendo,
 * l'illustrazione è già pronta.
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

/**
 * Ridà il controllo al browser, per spezzare un lavoro lungo in tanti corti:
 * fra un blocco e l'altro la pagina dipinge e raccoglie i tocchi.
 *
 * `scheduler.yield()` è fatto esattamente per questo; dove non c'è (Safari,
 * Firefox) un `setTimeout` di zero millisecondi fa lo stesso mestiere, perché
 * rimanda al prossimo giro del ciclo degli eventi.
 *
 * **Non** si usa `requestAnimationFrame`, che sarebbe la scelta istintiva: in
 * una scheda in secondo piano non scatta mai, e un inserimento cominciato prima
 * di cambiare app resterebbe congelato a metà. Inoltre `rAF` gira *prima* del
 * disegno, quindi le card costruite là dentro peserebbero comunque su quel
 * frame — che è proprio ciò che si vuole evitare.
 */
const cediIlPasso = () =>
  globalThis.scheduler?.yield?.() ?? new Promise((risolvi) => setTimeout(risolvi, 0));

/** Quante card mancanti si inseriscono per volta. Vedi `#aggiungiMancanti()`. */
const BLOCCO_MANCANTI = 60;

export class GrigliaCollezione extends HTMLElement {
  /** @type {Array<object>} */
  #voci = [];
  /** @type {typeof FILTRI_VUOTI} */
  #filtri = { ...FILTRI_VUOTI };
  /**
   * Filtri **imposti da fuori**, che l'utente non può togliere: la vista
   * Preferiti è la stessa griglia con `{preferito: 'solo'}` fisso. Stanno a
   * parte da `#filtri` e non dentro, perché "azzera filtri" azzera i secondi e
   * non deve poter svuotare la vista di ciò che la definisce.
   * @type {Partial<typeof FILTRI_VUOTI>}
   */
  #fissi = {};
  /** @type {string} intestazione della griglia */
  #titolo = 'La collezione';
  /** @type {boolean} se mostrare anche le carte che mancano a ogni set */
  #mostraMancanti = false;
  /** @type {boolean} se il pannello dei filtri avanzati è aperto */
  #filtriAperti = false;
  /** @type {Map<string, {euro: number|null, aggiornatoIl: string, senzaMercato: boolean}>} */
  #prezzi = new Map();
  /** @type {string} messaggio sotto il pulsante della quotazione */
  #statoQuotazione = '';
  /**
   * Osservatore delle sezioni-set: chiede le carte mancanti di un set solo
   * quando quel set sta entrando a schermo. Senza, accendere l'interruttore
   * senza aver scelto un set faceva partire un caricamento **per ogni set** in
   * collezione — decine di file JSON e decine di migliaia di card costruite
   * tutte insieme, cioè la pagina bloccata. Scorrendo, i set a schermo sono uno
   * o due: lo stesso costo che ha da sempre un set filtrato.
   * @type {IntersectionObserver|null}
   */
  #osservatoreSezioni = null;
  /**
   * I caricamenti delle mancanti si mettono in fila invece di partire insieme.
   * Se possiedi una carta sola di trenta set diversi le sezioni sono basse e a
   * schermo ce ne stanno tante: senza la fila, l'osservatore le sveglierebbe
   * tutte nello stesso istante e saremmo di nuovo al punto di partenza.
   * @type {Promise<void>}
   */
  #coda = Promise.resolve();
  /** @type {number|undefined} attesa fra l'ultimo tasto battuto e la ricerca */
  #attesaRicerca;
  /**
   * Numero del giro di ricerca. Serve a buttare i risultati **sorpassati**:
   * fra la partenza di una ricerca e il suo arrivo l'utente ha battuto altre
   * lettere, e una risposta lenta arrivata dopo una veloce mostrerebbe carte
   * che non corrispondono più a quello che c'è scritto nella casella.
   * @type {number}
   */
  #giroRicerca = 0;

  /**
   * Come procurarsi le carte mancanti di un set. La inietta chi usa il
   * componente: la griglia non conosce il dataset, e non deve.
   * @type {(idSet: string) => Promise<object[]>}
   */
  caricaMancanti = async () => [];

  /**
   * Come cercare per nome fra **tutte** le carte del catalogo quelle che non
   * hai. La inietta chi usa il componente, come `caricaMancanti`.
   * @type {(testo: string) => Promise<{trovate: Array<{set: object, carta: object}>, nonLetti: string[], troppi: boolean}>}
   */
  cercaMancantiPerNome = async () => ({ trovate: [], nonLetti: [], troppi: false });

  /** @param {Array<object>} valore risultato di `elencoCompleto()` */
  set voci(valore) {
    this.#voci = valore ?? [];
    this.#disegna();
  }

  get voci() {
    return this.#voci;
  }

  /**
   * Filtri fissi della vista (es. `{ preferito: 'solo' }`).
   * @param {Partial<typeof FILTRI_VUOTI>} valore
   */
  set filtriFissi(valore) {
    this.#fissi = { ...valore };
    this.#disegna();
  }

  /** @param {string} valore l'intestazione, se non è "La collezione" */
  set titolo(valore) {
    this.#titolo = valore || 'La collezione';
    const testa = this.querySelector('.testa-collezione .titolo');
    if (testa) testa.textContent = this.#titolo;
  }

  /** I filtri scelti dall'utente più quelli imposti dalla vista. */
  #effettivi() {
    return { ...this.#filtri, ...this.#fissi };
  }

  /**
   * Le quotazioni note, per chiave `"<idSet>:<numero>"`. Le passa chi ha accesso
   * al database: la griglia mostra numeri, non li va a cercare.
   * @param {Map<string, object>} valore
   */
  set prezzi(valore) {
    this.#prezzi = valore ?? new Map();
    this.#disegnaRisultati();
  }

  get prezzi() {
    return this.#prezzi;
  }

  /** @param {string} valore messaggio di avanzamento della quotazione */
  set statoQuotazione(valore) {
    this.#statoQuotazione = valore ?? '';
    const riga = this.querySelector('.stato-quotazione');
    if (riga) {
      riga.textContent = this.#statoQuotazione;
      riga.hidden = !this.#statoQuotazione;
    }
  }

  connectedCallback() {
    this.#disegna();

    // La casella di ricerca ridisegna solo i risultati, per non perdere il
    // focus mentre si scrive; i menu a tendina rifanno tutto.
    this.addEventListener('input', (evento) => {
      const campo = evento.target.dataset?.filtro;
      if (!campo) return;
      this.#filtri[campo] = evento.target.value;
      // Solo il cambio di serie ridisegna tutto: le opzioni del menu "set"
      // dipendono dalla serie scelta. Gli altri filtri (testo, set, categoria,
      // stadio) ridisegnano i risultati e basta, così la casella non perde il
      // focus e il pannello "Altri filtri" non si richiude a ogni scelta.
      if (campo === 'serie') {
        this.#filtri.set = '';
        this.#disegna();
      } else {
        this.#disegnaRisultati();
      }
    });

    this.addEventListener('click', (evento) => {
      // Chip di un tipo elementale: agisce come il filtro "tipo", e ritoccarlo
      // lo azzera.
      const chip = evento.target.closest('[data-tipo-filtro]');
      if (chip) {
        const valore = chip.dataset.tipoFiltro;
        this.#filtri.tipo = this.#filtri.tipo === valore ? '' : valore;
        this.#disegna();
        return;
      }

      // Apri/chiudi il pannello dei filtri avanzati, senza ridisegnare tutto.
      const apriFiltri = evento.target.closest('[data-apri-filtri]');
      if (apriFiltri) {
        this.#filtriAperti = !this.#filtriAperti;
        const pannello = this.querySelector('.pannello-filtri');
        if (pannello) pannello.hidden = !this.#filtriAperti;
        apriFiltri.setAttribute('aria-expanded', String(this.#filtriAperti));
        return;
      }

      // "Mostra anche le carte che mi mancano": ridisegna solo i risultati, così
      // il pannello dei filtri resta aperto.
      const mancanti = evento.target.closest('[data-mancanti]');
      if (mancanti) {
        this.#mostraMancanti = mancanti.checked;
        this.#disegnaRisultati();
        return;
      }

      // Si quotano le carte A SCHERMO, non tutta la collezione: una richiesta
      // di rete per carta, e il senso della funzione è "quanto vale questa
      // manciata di rare", non "censisci ventimila carte".
      if (evento.target.closest('[data-quotazione]')) {
        this.dispatchEvent(
          new CustomEvent('quotazione-richiesta', {
            bubbles: true,
            detail: { voci: filtra(this.#voci, this.#effettivi()) },
          }),
        );
        return;
      }

      if (evento.target.closest('[data-azione="azzera-filtri"]')) {
        this.#filtri = { ...FILTRI_VUOTI };
        this.#mostraMancanti = false;
        this.#disegna();
        return;
      }

      // Il cuore: si accende subito, senza aspettare il giro nel database e il
      // ridisegno. È un tocco che deve rispondere come un interruttore, e la
      // verità arriva comunque dopo — se la scrittura fallisse, il prossimo
      // aggiornamento della griglia rimetterebbe le cose a posto.
      const cuore = evento.target.closest('[data-preferita]');
      if (cuore) {
        const acceso = cuore.getAttribute('aria-pressed') !== 'true';
        cuore.classList.toggle('acceso', acceso);
        cuore.setAttribute('aria-pressed', String(acceso));
        this.dispatchEvent(
          new CustomEvent('preferita-cambiata', {
            bubbles: true,
            detail: {
              idSet: cuore.dataset.set,
              numero: cuore.dataset.numero,
              preferita: acceso,
            },
          }),
        );
        return;
      }

      // "Linea evolutiva": la card sa già tutto della sua carta, ma
      // ricostruire la famiglia vuol dire leggere l'indice delle evoluzioni e
      // cercare nel catalogo — due cose che la griglia non fa. Si chiede e
      // basta; risponde `app/linea-evolutiva.js`.
      const linea = evento.target.closest('[data-linea]');
      if (linea) {
        const voce = linea.closest('.carta-griglia')?._voce;
        if (voce?.carta) {
          this.dispatchEvent(
            new CustomEvent('linea-richiesta', { bubbles: true, detail: { voce } }),
          );
        }
        return;
      }

      // Aprire una card: si costruisce l'elenco ordinato di tutte le carte a
      // schermo, così il visore ci scorre dentro con frecce e swipe.
      const apri = evento.target.closest('.apri-carta');
      if (apri) {
        this.#apri(apri.closest('.carta-griglia'));
        return;
      }

      // La stella delle carte che non hai: non tocca le copie, mette la carta
      // nella lista desideri. È un evento suo e non `quantita-cambiata` con un
      // flag, perché sono due domande diverse — "quante ne ho" e "la voglio" —
      // e chi ascolta finisce in due funzioni diverse del livello dati.
      const voglio = evento.target.closest('[data-desiderio]');
      if (voglio) {
        this.dispatchEvent(
          new CustomEvent('desiderio-richiesto', {
            bubbles: true,
            detail: { idSet: voglio.dataset.set, numero: voglio.dataset.numero },
          }),
        );
        return;
      }

      const passo = evento.target.closest('[data-azione="1"], [data-azione="-1"]');
      if (passo) {
        this.dispatchEvent(
          new CustomEvent('quantita-cambiata', {
            bubbles: true,
            detail: {
              idSet: passo.dataset.set,
              numero: passo.dataset.numero,
              delta: Number(passo.dataset.azione),
            },
          }),
        );
      }
    });
  }

  disconnectedCallback() {
    // Le sezioni osservate non esistono più: tenerle sotto osservazione
    // significherebbe solo trattenerle in memoria.
    this.#osservatoreSezioni?.disconnect();
  }

  /**
   * Annuncia la carta aperta, con l'elenco scorribile e la sua posizione.
   * @param {HTMLElement|null} cardEl
   */
  #apri(cardEl) {
    if (!cardEl?._voce?.carta) return;
    const carte = [...this.querySelectorAll('.carta-griglia')].filter((c) => c._voce?.carta);
    const lista = carte.map((c) => c._voce);
    const indice = Math.max(carte.indexOf(cardEl), 0);
    this.dispatchEvent(
      new CustomEvent('carta-scelta', {
        bubbles: true,
        detail: { carta: cardEl._voce.carta, nomeSet: cardEl._voce.nomeSet, lista, indice },
      }),
    );
  }

  /** Disegna la barra di controlli (ricerca, chip, filtri) e il contenitore. */
  #disegna() {
    const { categorie, tipi, stadi, serie, set, rarita, formati } = valoriDisponibili(this.#voci);

    // I set portano l'anno fra parentesi: due set possono avere nomi simili, e
    // l'anno è il modo in cui ci si ricorda le carte che si hanno in mano.
    const opzioni = (valori, selezionato) =>
      valori
        .map(
          ({ id, nome, anno }) =>
            `<option value="${id}"${id === selezionato ? ' selected' : ''}>${escapeHtml(nome)}${anno ? ` (${anno})` : ''}</option>`,
        )
        .join('');
    const opzioniSemplici = (valori, selezionato) =>
      valori
        .map(
          (v) => `<option value="${v}"${v === selezionato ? ' selected' : ''}>${escapeHtml(v)}</option>`,
        )
        .join('');

    const setVisibili = this.#filtri.serie
      ? set.filter((s) =>
          this.#voci.some((v) => v.idSet === s.id && v.serie?.id === this.#filtri.serie),
        )
      : set;

    // Il pulsante-filtro si accende quando c'è un filtro avanzato attivo, così
    // si capisce che sta filtrando anche col pannello chiuso.
    const filtriAvanzatiAttivi = Boolean(
      this.#filtri.serie ||
        this.#filtri.set ||
        this.#filtri.categoria ||
        this.#filtri.stadio ||
        this.#filtri.rarita ||
        this.#filtri.formato ||
        this.#filtri.preferito ||
        this.#mostraMancanti,
    );

    // Dentro la vista Preferiti le due domande "solo i preferiti?" e "mostro
    // anche ciò che non ho?" hanno già una risposta fissa: lasciarle a schermo
    // sarebbe offrire comandi che non comandano niente.
    const dentroPreferiti = Boolean(this.#fissi.preferito);

    // Chip dei tipi presenti in collezione. "Tutti" non ha data-tipo, così resta
    // neutro (il colore grigio glielo dà il CSS).
    const chipTipi = [
      `<button type="button" class="chip-tipo${this.#filtri.tipo ? '' : ' attivo'}" data-tipo-filtro="">Tutti</button>`,
      ...tipi.map(
        (t) =>
          `<button type="button" class="chip-tipo${this.#filtri.tipo === t ? ' attivo' : ''}" data-tipo="${escapeHtml(t)}" data-tipo-filtro="${escapeHtml(t)}">${escapeHtml(t)}</button>`,
      ),
    ].join('');

    this.innerHTML = `
      <div class="testa-collezione">
        <span class="titolo">${escapeHtml(this.#titolo)}</span>
        <span class="conteggio-vis"></span>
      </div>

      <div class="barra-collezione">
        <div class="campo-cerca">
          <span class="lente" aria-hidden="true">⌕</span>
          <input type="search" data-filtro="testo" value="${escapeHtml(this.#filtri.testo)}"
                 placeholder="cerca per nome…" aria-label="Cerca per nome" />
        </div>
        <button type="button" class="bottone-filtri${filtriAvanzatiAttivi ? ' attivo' : ''}"
                data-apri-filtri aria-expanded="${this.#filtriAperti}" aria-label="Altri filtri">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          ${filtriAvanzatiAttivi ? '<span class="pallino-filtri" aria-hidden="true"></span>' : ''}
        </button>
      </div>

      <div class="chip-tipi">${chipTipi}</div>

      <div class="pannello-filtri"${this.#filtriAperti ? '' : ' hidden'}>
        <div class="filtri-extra">
          <div>
            <label for="filtro-serie">Serie</label>
            <select id="filtro-serie" data-filtro="serie">
              <option value="">tutte</option>${opzioni(serie, this.#filtri.serie)}
            </select>
          </div>
          <div>
            <label for="filtro-set">Set</label>
            <select id="filtro-set" data-filtro="set">
              <option value="">tutti</option>${opzioni(setVisibili, this.#filtri.set)}
            </select>
          </div>
          <div>
            <label for="filtro-categoria">Tipo di carta</label>
            <select id="filtro-categoria" data-filtro="categoria">
              <option value="">tutte</option>${opzioniSemplici(categorie, this.#filtri.categoria)}
            </select>
          </div>
          <div>
            <label for="filtro-stadio">Stadio</label>
            <select id="filtro-stadio" data-filtro="stadio">
              <option value="">tutti</option>${opzioniSemplici(stadi, this.#filtri.stadio)}
            </select>
          </div>
          <div${dentroPreferiti ? ' hidden' : ''}>
            <label for="filtro-desiderio">Lista desideri</label>
            <select id="filtro-desiderio" data-filtro="desiderio">
              <option value=""${this.#filtri.desiderio === '' ? ' selected' : ''}>tutto</option>
              <option value="solo"${this.#filtri.desiderio === 'solo' ? ' selected' : ''}>solo i desideri</option>
              <option value="escludi"${this.#filtri.desiderio === 'escludi' ? ' selected' : ''}>solo ciò che ho</option>
            </select>
          </div>
          ${
            dentroPreferiti
              ? ''
              : `<div>
            <label for="filtro-preferito">Preferiti</label>
            <select id="filtro-preferito" data-filtro="preferito">
              <option value=""${this.#filtri.preferito === '' ? ' selected' : ''}>tutto</option>
              <option value="solo"${this.#filtri.preferito === 'solo' ? ' selected' : ''}>solo i preferiti</option>
            </select>
          </div>`
          }
          <div>
            <label for="filtro-rarita">Rarità</label>
            <select id="filtro-rarita" data-filtro="rarita">
              <option value="">tutte</option>${rarita
                .map(
                  (r) =>
                    `<option value="${r.codice}"${r.codice === this.#filtri.rarita ? ' selected' : ''}>${escapeHtml(r.etichetta)}</option>`,
                )
                .join('')}
            </select>
          </div>
          <div>
            <label for="filtro-formato">Tornei</label>
            <select id="filtro-formato" data-filtro="formato">
              <option value="">tutte</option>${formati
                .map(
                  (f) =>
                    `<option value="${f.codice}"${f.codice === this.#filtri.formato ? ' selected' : ''} title="${escapeHtml(f.spiegazione)}">${escapeHtml(f.etichetta)}</option>`,
                )
                .join('')}
            </select>
          </div>
        </div>
        <label class="interruttore-mancanti"${dentroPreferiti ? ' hidden' : ''}>
          <input type="checkbox" data-mancanti ${this.#mostraMancanti ? 'checked' : ''} />
          <span>
            <strong>Mostra anche le carte che mi mancano</strong>
            <small>Le carte che non hai compaiono in grigio: dei set che possiedi in parte arrivano un set per volta, mentre scorri. Se cerchi un nome, si cerca in <strong>tutti</strong> i set, anche in quelli di cui non hai niente.</small>
          </span>
        </label>

        <!-- La quotazione è un'azione, non un filtro: scarica dalla rete, quindi
             si fa quando la si chiede e su quello che si sta guardando. -->
        <div class="zona-quotazione">
          <button type="button" class="secondario" data-quotazione>Calcola quotazione</button>
          <p class="stato-quotazione" hidden></p>
        </div>
      </div>

      <p class="riepilogo"></p>
      <div class="serie-collezione"></div>
      <!-- Le carte trovate col nome in set di cui non possiedi niente stanno
           qui, fuori dalle serie: dentro falserebbero i conteggi "12/62". -->
      <div class="trovate-mancanti"></div>
    `;
    this.#disegnaRisultati();
  }

  /** Ridisegna solo l'elenco e i contatori: i controlli restano come sono. */
  #disegnaRisultati() {
    const contenitore = this.querySelector('.serie-collezione');
    const riepilogo = this.querySelector('.riepilogo');
    const conteggio = this.querySelector('.conteggio-vis');
    if (!contenitore) return;

    // Le sezioni di prima stanno per essere buttate: quelle che aspettavano il
    // proprio turno non devono più chiedere niente.
    this.#osservatoreSezioni?.disconnect();

    const voci = filtra(this.#voci, this.#effettivi());
    const gruppi = raggruppa(voci);
    const copie = voci.reduce((s, v) => s + v.quantita, 0);
    const filtriAttivi = Object.values(this.#filtri).some(Boolean);

    if (conteggio) conteggio.textContent = `${voci.length} ${voci.length === 1 ? 'carta' : 'carte'}`;

    riepilogo.innerHTML =
      this.#voci.length === 0
        ? 'La collezione è vuota: tocca il pulsante <strong>＋</strong> in basso per aggiungere la prima carta.'
        : `${copie} copie in ${gruppi.length} serie` +
          valoreAschermo(voci, this.#prezzi) +
          (filtriAttivi
            ? ' · <button type="button" data-azione="azzera-filtri" class="collegamento">azzera filtri</button>'
            : '');

    contenitore.replaceChildren(...gruppi.map((gruppo) => this.#disegnaSerie(gruppo)));
    this.#aggiornaTrovate();
  }

  /**
   * Se le carte che ti mancano vanno cercate in tutto il catalogo invece che
   * set per set.
   *
   * Le due strade non convivono: cercando "pikachu", la ricerca globale trova
   * anche i Pikachu dei set che possiedi in parte, e la strada per set li
   * troverebbe una seconda volta.
   *
   * Il testo si conta in caratteri perché con una lettera sola i tetti di
   * `cercaPerNomeGlobale()` troncherebbero comunque su corrispondenze casuali.
   * E con un filtro sui desideri attivo le mancanti non c'entrano: "solo i
   * desideri" e "solo ciò che ho" sono due domande su carte *tue*.
   * @returns {boolean}
   */
  #mancantiPerSet() {
    return this.#mostraMancanti && !this.#soloTue() && !this.#filtri.testo.trim();
  }

  /** @see #mancantiPerSet */
  #ricercaGlobale() {
    return this.#mostraMancanti && !this.#soloTue() && this.#filtri.testo.trim().length >= 2;
  }

  /**
   * Se la vista sta rispondendo a una domanda su carte **tue**: la lista dei
   * desideri e i preferiti lo sono entrambe, e in nessuna delle due ha senso
   * riempire le sezioni di carte che non hai.
   * @returns {boolean}
   */
  #soloTue() {
    const { desiderio, preferito } = this.#effettivi();
    return Boolean(desiderio || preferito);
  }

  /**
   * Fa ripartire la ricerca per nome fra tutte le carte, o pulisce l'area se
   * non serve.
   */
  #aggiornaTrovate() {
    const area = this.querySelector('.trovate-mancanti');
    if (!area) return;

    // Qualunque cosa accada, i risultati di prima non valgono più.
    clearTimeout(this.#attesaRicerca);
    const giro = ++this.#giroRicerca;

    if (!this.#ricercaGlobale()) {
      area.replaceChildren();
      return;
    }

    const testo = this.#filtri.testo.trim();
    area.replaceChildren(nota('attesa-mancanti', `cerco «${testo}» fra tutte le carte…`));
    // Si aspetta che l'utente smetta di scrivere: ogni ricerca può scaricare
    // fino a dodici file di set, e otto lettere battute non devono costare otto
    // ricerche.
    this.#attesaRicerca = setTimeout(() => this.#disegnaTrovate(testo, giro), 300);
  }

  /**
   * Disegna le carte che non hai trovate per nome in tutto il catalogo,
   * raggruppate per set.
   * @param {string} testo
   * @param {number} giro il giro di ricerca a cui appartiene questa richiesta
   */
  async #disegnaTrovate(testo, giro) {
    let esito = null;
    try {
      esito = await this.cercaMancantiPerNome(testo);
    } catch {
      /* Indice dei nomi o set non raggiungibili: si mostra solo ciò che si ha. */
    }

    const area = this.querySelector('.trovate-mancanti');
    // Ricerca sorpassata (altre lettere battute) o filtri cambiati sotto i
    // piedi: questi risultati non rispondono più alla domanda di adesso.
    if (!area || giro !== this.#giroRicerca) return;
    if (!esito) {
      area.replaceChildren();
      return;
    }

    // Gli **altri** filtri valgono anche qui; il testo no, l'ha già applicato
    // la ricerca — e con una normalizzazione più larga (accenti, punteggiatura)
    // che rifiltrare a mano butterebbe via risultati giusti.
    const voci = filtra(
      esito.trovate.map(({ set, carta }) => ({
        idSet: set.id,
        numero: String(carta.numero),
        quantita: 0,
        carta,
        nomeSet: set.nome,
        serie: set.serie ?? null,
        linguaSet: set.lingua ?? null,
      })),
      { ...this.#effettivi(), testo: '' },
    );

    /** @type {Map<string, {nomeSet: string, voci: object[]}>} */
    const perSet = new Map();
    for (const voce of voci) {
      if (!perSet.has(voce.idSet)) perSet.set(voce.idSet, { nomeSet: voce.nomeSet, voci: [] });
      perSet.get(voce.idSet).voci.push(voce);
    }

    const pezzi = [];
    if (perSet.size) {
      pezzi.push(nota('etichetta-serie', `Che non hai — «${testo}»`));
      for (const gruppo of perSet.values()) {
        pezzi.push(this.#sezioneTrovate(gruppo));
      }
    }
    // I limiti si dicono sempre: una ricerca troncata che tace si legge come
    // "non esiste altro", ed è la bugia peggiore che possa raccontare un elenco.
    if (esito.troppi) {
      pezzi.push(
        nota(
          'nota-ricerca',
          `Ci sono troppe carte con questo nome: ${perSet.size ? 'queste sono le prime' : 'nessuna mostrata'}. Scrivi qualche lettera in più.`,
        ),
      );
    }
    if (esito.nonLetti?.length) {
      pezzi.push(
        nota('nota-ricerca', `Set non disponibili adesso: ${esito.nonLetti.join(', ')}.`),
      );
    }
    if (!pezzi.length && this.#voci.length) {
      pezzi.push(nota('nota-ricerca', `Nessun'altra carta con questo nome fuori dalla collezione.`));
    }
    area.replaceChildren(...pezzi);
  }

  /**
   * Un set di carte trovate col nome: intestazione e griglia, senza barra di
   * completamento — qui non si sta completando niente, si sta cercando.
   * @param {{nomeSet: string, voci: object[]}} gruppo
   * @returns {HTMLElement}
   */
  #sezioneTrovate(gruppo) {
    const sezione = document.createElement('section');
    sezione.className = 'set-collezione';
    sezione.innerHTML = `
      <div class="testa-set">
        <span class="nome-set"></span>
        <span class="prog"></span>
      </div>
      <div class="griglia-carte"></div>
    `;
    // textContent e non innerHTML: il nome del set arriva dai dati, e qui non
    // c'è nessun escape da ricordarsi.
    sezione.querySelector('.nome-set').textContent = gruppo.nomeSet;
    sezione.querySelector('.prog').textContent =
      gruppo.voci.length === 1 ? '1 da trovare' : `${gruppo.voci.length} da trovare`;
    sezione
      .querySelector('.griglia-carte')
      .replaceChildren(...gruppo.voci.map((voce) => this.#card(voce, true)));
    return sezione;
  }

  /**
   * Una serie, con tutti i suoi set.
   * @param {import('./raggruppa.js').GruppoSerie} gruppo
   * @returns {HTMLElement}
   */
  #disegnaSerie(gruppo) {
    const sezione = document.createElement('section');
    sezione.className = 'serie';
    sezione.innerHTML = `<div class="etichetta-serie">${escapeHtml(gruppo.nome)}</div>`;
    sezione.append(...gruppo.set.map((set) => this.#disegnaSet(set)));
    return sezione;
  }

  /**
   * Un set: intestazione col completamento, poi la griglia di card.
   * @param {import('./raggruppa.js').GruppoSet} set
   * @returns {HTMLElement}
   */
  #disegnaSet(set) {
    const sezione = document.createElement('section');
    sezione.className = 'set-collezione';
    sezione.innerHTML = `
      <div class="testa-set">${testaSet(set)}</div>
      <div class="griglia-carte"></div>
    `;

    const griglia = sezione.querySelector('.griglia-carte');
    griglia.replaceChildren(...set.voci.map((voce) => this.#card(voce)));

    if (this.#mancantiPerSet() && confrontabile(set)) {
      // Il set viaggia sull'elemento, come `_voce` sulle card: quando
      // l'osservatore chiamerà, l'unica cosa che ha in mano è la sezione.
      sezione._set = set;
      this.#osserva(sezione);
    }
    return sezione;
  }

  /**
   * Mette una sezione-set in coda: chiederà le sue carte mancanti quando starà
   * per entrare a schermo, e una volta sola.
   * @param {HTMLElement} sezione
   */
  #osserva(sezione) {
    this.#osservatoreSezioni ??= new IntersectionObserver(
      (voci) => {
        for (const voce of voci) {
          if (!voce.isIntersecting) continue;
          // Prima di tutto smettere di osservare: il caricamento è asincrono e
          // una seconda intersezione raddoppierebbe le card.
          this.#osservatoreSezioni.unobserve(voce.target);
          const griglia = voce.target.querySelector('.griglia-carte');
          if (!griglia || !voce.target._set) continue;
          const set = voce.target._set;
          // Il segnaposto si mette **subito**, non quando arriva il turno:
          // altrimenti una sezione in fila sembrerebbe semplicemente completa.
          const attesa = document.createElement('p');
          attesa.className = 'attesa-mancanti';
          attesa.textContent = 'cerco le carte che mancano…';
          griglia.append(attesa);
          this.#coda = this.#coda.then(() => this.#aggiungiMancanti(griglia, set, attesa));
        }
      },
      // Meno dei 200px delle immagini: qui non si precarica un'immagine, si
      // scarica un file di set intero. Basta arrivare poco prima.
      { rootMargin: '100px' },
    );
    this.#osservatoreSezioni.observe(sezione);
  }

  /**
   * Aggiunge in coda le carte del set che non possiedi. Caricamento asincrono:
   * le tue carte si vedono subito, le mancanti compaiono dopo.
   * @param {HTMLElement} griglia
   * @param {import('./raggruppa.js').GruppoSet} set
   * @param {HTMLElement} attesa il segnaposto da togliere quando si è finito
   */
  async #aggiungiMancanti(griglia, set, attesa) {
    // Filtro cambiato mentre questa sezione era in fila: non c'è più niente da
    // riempire, e il file del set non va nemmeno chiesto.
    if (!griglia.isConnected) return;

    let mancanti;
    try {
      mancanti = await this.caricaMancanti(set.idSet);
    } catch {
      // Set non leggibile offline: meglio niente che riempire di errori.
      attesa.remove();
      return;
    }
    if (!griglia.isConnected) return;
    attesa.remove();

    // Le mancanti passano dagli **stessi filtri** delle tue carte. Prima non lo
    // facevano, ed era un guasto silenzioso: filtrando per tipo Fuoco, o per
    // rarità, in fondo alla sezione arrivavano comunque tutte le carte del set.
    // Il testo qui è sempre vuoto — con una ricerca in corso le mancanti le
    // trova `#disegnaTrovate()`, che cerca in tutto il catalogo e non solo qui.
    mancanti = filtra(
      mancanti.map((carta) => this.#voceMancante(carta, set)),
      this.#effettivi(),
    );

    // Inserimento a blocchi: costruire 250 card in un colpo tiene occupato il
    // thread abbastanza da far scattare lo scorrimento proprio mentre l'utente
    // sta scorrendo.
    for (let i = 0; i < mancanti.length; i += BLOCCO_MANCANTI) {
      if (i > 0) await cediIlPasso();
      // Fra un blocco e l'altro l'utente può aver cambiato filtro.
      if (!griglia.isConnected) return;
      griglia.append(...mancanti.slice(i, i + BLOCCO_MANCANTI).map((voce) => this.#card(voce, true)));
    }
  }

  /**
   * Una carta del dataset vestita da voce di collezione, per poter passare dai
   * filtri (che ragionano su voci) e da `#card()`. `quantita: 0` è il punto:
   * questa carta non ce l'hai.
   *
   * `serie` e `linguaSet` si prendono da una tua carta dello stesso set: sono
   * dati del set, non della carta, e `GruppoSet` non li porta.
   *
   * @param {object} carta
   * @param {import('./raggruppa.js').GruppoSet} set
   * @returns {object}
   */
  #voceMancante(carta, set) {
    const compagna = set.voci?.[0];
    return {
      idSet: set.idSet,
      numero: String(carta.numero),
      quantita: 0,
      carta,
      nomeSet: set.nomeSet,
      serie: compagna?.serie ?? null,
      linguaSet: compagna?.linguaSet ?? null,
    };
  }

  /**
   * Una card della griglia (DOM normale, tinta dal suo tipo).
   * @param {object} voce
   * @param {boolean} [mancante] se è una carta che non possiedi
   * @returns {HTMLElement}
   */
  #card(voce, mancante = false) {
    const card = document.createElement('article');
    // Tre stati, non due: posseduta, desiderata, e "manca al set" (che è una
    // carta di cui l'app sa l'esistenza ma che tu non hai mai né avuto né
    // chiesto). Il desiderio è una scelta tua, quindi si vede di più.
    card.className = 'carta-griglia';
    if (mancante) card.classList.add('mancante');
    if (voce.desiderata) card.classList.add('desiderata');
    if (voce.preferita) card.classList.add('preferita');
    // idSet/numero/quantita servono al visore per mostrare e modificare le copie
    // possedute mentre la carta è aperta a schermo intero.
    card._voce = {
      carta: voce.carta,
      nomeSet: voce.nomeSet,
      idSet: voce.idSet,
      numero: voce.numero,
      quantita: voce.quantita,
      // Viaggia fino al visore: là la scansione è tutto ciò che si legge, ed è
      // il punto in cui sapere che è inglese conta di più.
      linguaSet: voce.linguaSet,
      // Anche questo viaggia: nel visore una carta che non hai non deve
      // mostrare il contatore delle copie, che la aggiungerebbe come posseduta.
      mancante,
      desiderata: voce.desiderata,
    };

    // Carta di un set non più scaricato: non sappiamo nulla, mostriamo solo la
    // sigla e il tasto per aggiungerne una copia.
    if (!voce.carta) {
      card.dataset.tipo = 'Incolore';
      card.innerHTML = `
        <div class="miniatura">${segnaposto(null, 'segnaposto-mini')}</div>
        <div class="corpo">
          <div class="nome-carta">${escapeHtml(voce.idSet)} n. ${escapeHtml(voce.numero)}</div>
          <div class="meta-carta">Set non più disponibile: riscarica i dati.</div>
        </div>
        ${this.#piede(voce, mancante)}
      `;
      return card;
    }

    const c = voce.carta;
    const tipo = c.tipi?.[0] ?? 'Incolore';
    card.dataset.tipo = tipo;

    const numero = String(c.numero ?? voce.numero ?? '').split('/')[0];
    // Sul desiderio il numero non dice "ne ho", dice "ne vorrei": la stellina
    // lo distingue senza bisogno di leggere una legenda.
    const badge = voce.desiderata
      ? `<span class="badge-qty badge-desiderio" title="Nella lista desideri">★${voce.quantita}</span>`
      : mancante || !voce.quantita
        ? ''
        : `<span class="badge-qty">×${voce.quantita}</span>`;
    const prezzo = this.#badgePrezzo(voce);
    const meta =
      c.categoria === 'Pokémon'
        ? `n. ${escapeHtml(numero)} · ${escapeHtml(c.stadio ?? 'Base')}`
        : `n. ${escapeHtml(numero)} · ${escapeHtml(c.categoria ?? '')}`;
    const chipEvo = c.evolveDa
      ? `<span class="chip chip-evo">da ${escapeHtml(c.evolveDa)}</span>`
      : '';
    const chipTipo =
      c.categoria === 'Pokémon' && c.tipi?.length
        ? `<span class="chip chip-tipo-carta" data-tipo="${escapeHtml(tipo)}">${escapeHtml(tipo)}</span>`
        : `<span class="chip chip-evo">${escapeHtml(c.categoria ?? '')}</span>`;
    // Il formato da torneo si mostra solo quando è una buona notizia. "Fuori
    // formato" è la condizione della maggior parte delle carte di casa: dirlo
    // su ognuna sarebbe rumore, e chi cerca proprio quelle ha il filtro Tornei.
    const formato = formatoDi(c);
    const chipFormato =
      formato && formato.codice !== 'fuori'
        ? `<span class="chip chip-formato" data-formato="${formato.codice}" title="${escapeHtml(formato.spiegazione)}">${escapeHtml(formato.etichetta)}</span>`
        : '';

    card.innerHTML = `
      <button class="apri-carta" type="button" title="Ingrandisci ${escapeHtml(c.nome)}">
        <div class="miniatura">
          ${this.#htmlImmagine(c)}
          ${badge}
          ${prezzo}
          <span class="scan">n. ${escapeHtml(numero)}</span>
        </div>
        <div class="corpo">
          <div class="nome-carta">${escapeHtml(c.nome)}</div>
          <div class="meta-carta">${meta}</div>
          <div class="chips">${chipTipo}${pastigliaLingua(voce)}${chipFormato}${chipEvo}</div>
        </div>
      </button>
      ${this.#cuore(voce, mancante)}
      ${this.#piede(voce, mancante)}
    `;

    const img = card.querySelector('img[data-src]');
    if (img) {
      osservatore.observe(img);
      seImmagineRotta(img, c, 'segnaposto-mini');
    }
    return card;
  }

  /**
   * La targhetta col prezzo, se per quella carta ne conosciamo uno.
   *
   * Le carte digitali (Pokémon Pocket) non hanno mercato: si dice "digitale"
   * invece di lasciare il vuoto, che si confonderebbe con "non l'ho ancora
   * chiesto". La data serve perché un prezzo senza data non è un prezzo.
   *
   * @param {object} voce
   * @returns {string} HTML
   */
  #badgePrezzo(voce) {
    const prezzo = this.#prezzi.get(`${voce.idSet}:${voce.numero}`);
    if (!prezzo) return '';
    if (prezzo.euro === null) {
      return `<span class="badge-prezzo senza" title="${prezzo.senzaMercato ? 'Carta digitale: non ha un mercato' : 'Nessun prezzo disponibile'}">${prezzo.senzaMercato ? 'digitale' : '—'}</span>`;
    }
    const quando = new Date(prezzo.aggiornatoIl).toLocaleDateString('it-IT');
    return `<span class="badge-prezzo" title="Cardmarket, tendenza del ${quando}">${formattaEuro(prezzo.euro)}</span>`;
  }

  /** L'immagine (in lazy-load) o il segnaposto tinto per le carte senza scan. */
  #htmlImmagine(c) {
    const src = urlImmagine(c, 'griglia');
    if (!src) return segnaposto(c, 'segnaposto-mini');
    // `alt=""`: il nome della carta è già scritto sotto la miniatura, e un
    // testo alternativo comparirebbe a schermo se l'immagine non arrivasse.
    return `<img data-src="${src}" alt="" />`;
  }

  /**
   * Il cuore dei preferiti, in alto a sinistra della miniatura.
   *
   * **Cuore e non stella**: la stella in questa app è già occupata dal badge
   * `★2` dei desideri, e due stelle sulla stessa miniatura — una che dice "ne
   * vorrei due" e una che dice "mi piace" — sarebbero indistinguibili proprio
   * dove servono, cioè con l'occhio che scorre. Il cuore sta a sinistra, il
   * badge a destra, e i colori sono diversi (rosso contro viola dei proxy).
   *
   * Compare **solo sulle carte che hai**: su un desiderio o su una carta
   * mancante non c'è niente da preferire, e il livello dati rifiuterebbe
   * comunque di segnarle (`impostaPreferita()`).
   *
   * È fratello di `.apri-carta` e non figlio: un `<button>` dentro un altro
   * `<button>` è HTML non valido, e i browser lo riscrivono spostandolo fuori
   * dalla card — con l'aria di un bug del CSS.
   *
   * @param {object} voce
   * @param {boolean} mancante
   * @returns {string} HTML, vuoto dove il cuore non ha senso
   */
  #cuore(voce, mancante) {
    if (mancante || voce.desiderata || !voce.quantita) return '';
    const acceso = Boolean(voce.preferita);
    return `
      <button type="button" class="cuore${acceso ? ' acceso' : ''}" data-preferita
              data-set="${escapeHtml(voce.idSet)}" data-numero="${escapeHtml(voce.numero)}"
              aria-pressed="${acceso}"
              title="${acceso ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}"
              aria-label="${acceso ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.4 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13Z"
                fill="${acceso ? 'currentColor' : 'none'}" stroke="currentColor"
                stroke-width="1.8" stroke-linejoin="round" />
        </svg>
      </button>`;
  }

  /**
   * Il piede della card, che cambia a seconda della vista.
   *
   * Nel catalogo si contano le copie, e il piede sono gli stepper. Nei
   * **Preferiti** no: là le carte ci sono finite perché ti piacciono, non
   * perché le stai catalogando, e `+`/`−` sono due bersagli da 38px sotto ogni
   * miniatura che nessuno tocca mai — anzi, che si toccano per sbaglio
   * scorrendo. Al loro posto la domanda che in quella vista viene davvero:
   * *di questo Pokémon ho anche il resto della linea?*
   *
   * Le copie restano modificabili aprendo la carta nel visore, quindi non si
   * perde niente.
   *
   * @param {object} voce
   * @param {boolean} mancante
   * @returns {string} HTML
   */
  #piede(voce, mancante) {
    if (!this.#fissi.preferito) return this.#stepper(voce, mancante);
    // Solo i Pokémon hanno una linea evolutiva: su un Allenatore o su
    // un'Energia il pulsante aprirebbe una finestra con dentro una carta sola.
    if (voce.carta?.categoria !== 'Pokémon') return '';
    return `
      <div class="piede-preferito">
        <button type="button" class="bottone-linea" data-linea
                title="Mostra la linea evolutiva di ${escapeHtml(voce.carta.nome)}">
          Linea evolutiva
        </button>
      </div>
    `;
  }

  /**
   * Gli stepper. Su una carta che non hai il "−" non ha senso.
   * @param {object} voce
   * @param {boolean} mancante
   */
  #stepper(voce, mancante) {
    // Su una carta che NON hai il "+" era una bugia: diceva "ne ho una in più"
    // di una carta che non è mai stata nella scatola. Quello che si vuole
    // davvero, guardando un buco in un set, è segnarsela — quindi una stella,
    // che in quest'app significa "la voglio" (vedi il badge ★2 dei desideri).
    if (mancante) {
      return `
        <div class="stepper">
          <button type="button" class="voglio" data-desiderio data-set="${escapeHtml(voce.idSet)}"
                  data-numero="${escapeHtml(voce.numero)}"
                  title="Aggiungi alla lista desideri"
                  aria-label="Aggiungi alla lista desideri">★</button>
        </div>
      `;
    }
    return `
      <div class="stepper">
        <button type="button" class="meno" data-azione="-1" data-set="${escapeHtml(voce.idSet)}"
                data-numero="${escapeHtml(voce.numero)}" aria-label="Togli una copia">−</button>
        <button type="button" class="piu" data-azione="1" data-set="${escapeHtml(voce.idSet)}"
                data-numero="${escapeHtml(voce.numero)}"
                aria-label="Aggiungi una copia">+</button>
      </div>
    `;
  }
}

/**
 * Il valore delle carte a schermo, quando qualche prezzo è noto.
 *
 * Si conta **per copie possedute**, non per carte distinte: tre copie della
 * stessa rara valgono tre volte. E si dichiara sempre quante carte non hanno
 * prezzo, altrimenti un totale parziale si legge come un totale.
 *
 * @param {object[]} voci le voci filtrate, cioè quelle visibili
 * @param {Map<string, object>} prezzi
 * @returns {string} HTML, vuoto se non si conosce nessun prezzo
 */
function valoreAschermo(voci, prezzi) {
  if (!prezzi.size) return '';
  const { totale, quotate, senzaPrezzo } = valoreDi(voci, prezzi);
  if (!quotate) return '';
  return (
    ` · <strong class="valore-totale">${formattaEuro(totale)}</strong>` +
    ` (${quotate} quotate${senzaPrezzo ? `, ${senzaPrezzo} senza prezzo` : ''})`
  );
}

/**
 * Se di questo set sappiamo abbastanza da parlare di completamento.
 * @param {import('./raggruppa.js').GruppoSet} set
 * @returns {boolean}
 */
function confrontabile(set) {
  return Boolean(set.totale) && set.ufficiali !== 0;
}

/**
 * L'intestazione di un set: nome, barra di completamento e "possedute/totali".
 * Tre casi diversi come prima — i set promo non hanno una numerazione da
 * completare, e quelli con dati parziali non devono mostrare come "mancanti"
 * carte che non esistono nei file.
 * @param {import('./raggruppa.js').GruppoSet} set
 * @returns {string} HTML
 */
function testaSet(set) {
  if (!confrontabile(set)) {
    return `
      <span class="nome-set">${escapeHtml(set.nomeSet)}</span>
      <span class="prog">${set.distinte} carte</span>`;
  }

  const { riferimento, pct, parziale } = progressoSet(set);
  return `
    <span class="nome-set">${escapeHtml(set.nomeSet)}</span>
    <span class="barra"><span class="riempi" style="width:${pct}%"></span></span>
    <span class="prog">${set.distinte}/${riferimento}</span>
    ${
      parziale
        ? `<span class="dati-parziali" title="Il set è numerato fino a ${set.totale}, ma le carte diverse note nei dati italiani di TCGdex sono ${set.ufficiali}: il conteggio è su quelle.">parziali</span>`
        : ''
    }`;
}

/**
 * Un elemento con del testo dentro, e nient'altro.
 *
 * Serve dove il testo contiene roba scritta dall'utente (il nome cercato) o
 * dai dati (i nomi dei set): con `textContent` non c'è nessun escape da
 * ricordarsi, perché non si sta costruendo HTML.
 *
 * @param {string} classe
 * @param {string} testo
 * @returns {HTMLElement}
 */
function nota(classe, testo) {
  const p = document.createElement('p');
  p.className = classe;
  p.textContent = testo;
  return p;
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

customElements.define('griglia-collezione', GrigliaCollezione);
