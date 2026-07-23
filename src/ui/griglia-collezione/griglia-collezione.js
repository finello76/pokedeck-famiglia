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
 * @fires griglia-collezione#carta-scelta - detail: `{ carta, nomeSet, lista, indice }`
 *
 * @example
 * const g = document.createElement('griglia-collezione');
 * g.caricaMancanti = (idSet) => carteMancanti(idSet, voci);
 * g.voci = await elencoCompleto();
 *
 * @module ui/griglia-collezione
 */

import { urlImmagine } from '../../data/dataset.js';
import { FILTRI_VUOTI, filtra, raggruppa, valoriDisponibili } from './raggruppa.js';

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

export class GrigliaCollezione extends HTMLElement {
  /** @type {Array<object>} */
  #voci = [];
  /** @type {typeof FILTRI_VUOTI} */
  #filtri = { ...FILTRI_VUOTI };
  /** @type {boolean} se mostrare anche le carte che mancano a ogni set */
  #mostraMancanti = false;
  /** @type {boolean} se il pannello dei filtri avanzati è aperto */
  #filtriAperti = false;

  /**
   * Come procurarsi le carte mancanti di un set. La inietta chi usa il
   * componente: la griglia non conosce il dataset, e non deve.
   * @type {(idSet: string) => Promise<object[]>}
   */
  caricaMancanti = async () => [];

  /** @param {Array<object>} valore risultato di `elencoCompleto()` */
  set voci(valore) {
    this.#voci = valore ?? [];
    this.#disegna();
  }

  get voci() {
    return this.#voci;
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

      if (evento.target.closest('[data-azione="azzera-filtri"]')) {
        this.#filtri = { ...FILTRI_VUOTI };
        this.#mostraMancanti = false;
        this.#disegna();
        return;
      }

      // Aprire una card: si costruisce l'elenco ordinato di tutte le carte a
      // schermo, così il visore ci scorre dentro con frecce e swipe.
      const apri = evento.target.closest('.apri-carta');
      if (apri) {
        this.#apri(apri.closest('.carta-griglia'));
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
    const { categorie, tipi, stadi, serie, set } = valoriDisponibili(this.#voci);

    const opzioni = (valori, selezionato) =>
      valori
        .map(
          ({ id, nome }) =>
            `<option value="${id}"${id === selezionato ? ' selected' : ''}>${escapeHtml(nome)}</option>`,
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
        this.#mostraMancanti,
    );

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
        <span class="titolo">La collezione</span>
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
        </div>
        <label class="interruttore-mancanti">
          <input type="checkbox" data-mancanti ${this.#mostraMancanti ? 'checked' : ''} />
          <span>
            <strong>Mostra anche le carte che mi mancano</strong>
            <small>Le carte dei set che possiedi solo in parte compaiono in grigio: così vedi cosa manca per completarli.</small>
          </span>
        </label>
      </div>

      <p class="riepilogo"></p>
      <div class="serie-collezione"></div>
    `;
    this.#disegnaRisultati();
  }

  /** Ridisegna solo l'elenco e i contatori: i controlli restano come sono. */
  #disegnaRisultati() {
    const contenitore = this.querySelector('.serie-collezione');
    const riepilogo = this.querySelector('.riepilogo');
    const conteggio = this.querySelector('.conteggio-vis');
    if (!contenitore) return;

    const voci = filtra(this.#voci, this.#filtri);
    const gruppi = raggruppa(voci);
    const copie = voci.reduce((s, v) => s + v.quantita, 0);
    const filtriAttivi = Object.values(this.#filtri).some(Boolean);

    if (conteggio) conteggio.textContent = `${voci.length} ${voci.length === 1 ? 'carta' : 'carte'}`;

    riepilogo.innerHTML =
      this.#voci.length === 0
        ? 'La collezione è vuota: tocca il pulsante <strong>＋</strong> in basso per aggiungere la prima carta.'
        : `${copie} copie in ${gruppi.length} serie` +
          (filtriAttivi
            ? ' · <button type="button" data-azione="azzera-filtri" class="collegamento">azzera filtri</button>'
            : '');

    contenitore.replaceChildren(...gruppi.map((gruppo) => this.#disegnaSerie(gruppo)));
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

    if (this.#mostraMancanti && confrontabile(set)) this.#aggiungiMancanti(griglia, set);
    return sezione;
  }

  /**
   * Aggiunge in coda le carte del set che non possiedi. Caricamento asincrono:
   * le tue carte si vedono subito, le mancanti compaiono dopo.
   * @param {HTMLElement} griglia
   * @param {import('./raggruppa.js').GruppoSet} set
   */
  #aggiungiMancanti(griglia, set) {
    this.caricaMancanti(set.idSet)
      .then((mancanti) => {
        if (!griglia.isConnected) return;
        griglia.append(
          ...mancanti.map((carta) =>
            this.#card(
              { idSet: set.idSet, numero: carta.numero, quantita: 0, carta, nomeSet: set.nomeSet },
              true,
            ),
          ),
        );
      })
      .catch(() => {
        /* Set non leggibile offline: meglio niente che riempire di errori. */
      });
  }

  /**
   * Una card della griglia (DOM normale, tinta dal suo tipo).
   * @param {object} voce
   * @param {boolean} [mancante] se è una carta che non possiedi
   * @returns {HTMLElement}
   */
  #card(voce, mancante = false) {
    const card = document.createElement('article');
    card.className = mancante ? 'carta-griglia mancante' : 'carta-griglia';
    // idSet/numero/quantita servono al visore per mostrare e modificare le copie
    // possedute mentre la carta è aperta a schermo intero.
    card._voce = {
      carta: voce.carta,
      nomeSet: voce.nomeSet,
      idSet: voce.idSet,
      numero: voce.numero,
      quantita: voce.quantita,
    };

    // Carta di un set non più scaricato: non sappiamo nulla, mostriamo solo la
    // sigla e il tasto per aggiungerne una copia.
    if (!voce.carta) {
      card.dataset.tipo = 'Incolore';
      card.innerHTML = `
        <div class="miniatura"><span class="segnaposto-mini" aria-hidden="true">?</span></div>
        <div class="corpo">
          <div class="nome-carta">${escapeHtml(voce.idSet)} n. ${escapeHtml(voce.numero)}</div>
          <div class="meta-carta">Set non più disponibile: riscarica i dati.</div>
        </div>
        ${this.#stepper(voce, mancante)}
      `;
      return card;
    }

    const c = voce.carta;
    const tipo = c.tipi?.[0] ?? 'Incolore';
    card.dataset.tipo = tipo;

    const numero = String(c.numero ?? voce.numero ?? '').split('/')[0];
    const badge =
      mancante || !voce.quantita
        ? ''
        : `<span class="badge-qty">×${voce.quantita}</span>`;
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

    card.innerHTML = `
      <button class="apri-carta" type="button" title="Ingrandisci ${escapeHtml(c.nome)}">
        <div class="miniatura">
          ${this.#htmlImmagine(c)}
          ${badge}
          <span class="scan">n. ${escapeHtml(numero)}</span>
        </div>
        <div class="corpo">
          <div class="nome-carta">${escapeHtml(c.nome)}</div>
          <div class="meta-carta">${meta}</div>
          <div class="chips">${chipTipo}${chipEvo}</div>
        </div>
      </button>
      ${this.#stepper(voce, mancante)}
    `;

    const img = card.querySelector('img[data-src]');
    if (img) osservatore.observe(img);
    return card;
  }

  /** L'immagine (in lazy-load) o il segnaposto tinto per le carte senza scan. */
  #htmlImmagine(c) {
    const src = urlImmagine(c, 'griglia');
    if (!src) {
      const sigla = c.categoria === 'Energia' ? 'E' : '?';
      return `<span class="segnaposto-mini" aria-hidden="true">${sigla}</span>`;
    }
    return `<img data-src="${src}" alt="Illustrazione di ${escapeHtml(c.nome)}" />`;
  }

  /**
   * Il piede con gli stepper. Su una carta che non hai il "−" non ha senso.
   * @param {object} voce
   * @param {boolean} mancante
   */
  #stepper(voce, mancante) {
    const meno = mancante
      ? ''
      : `<button type="button" class="meno" data-azione="-1" data-set="${escapeHtml(voce.idSet)}"
                 data-numero="${escapeHtml(voce.numero)}" aria-label="Togli una copia">−</button>`;
    return `
      <div class="stepper">
        ${meno}
        <button type="button" class="piu" data-azione="1" data-set="${escapeHtml(voce.idSet)}"
                data-numero="${escapeHtml(voce.numero)}"
                aria-label="${mancante ? 'Aggiungi alla collezione' : 'Aggiungi una copia'}">+</button>
      </div>
    `;
  }
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

  const pct = Math.min(100, Math.round((set.distinte / set.totale) * 100));
  const parziale = set.ufficiali !== null && set.ufficiali < set.totale;
  return `
    <span class="nome-set">${escapeHtml(set.nomeSet)}</span>
    <span class="barra"><span class="riempi" style="width:${pct}%"></span></span>
    <span class="prog">${set.distinte}/${set.totale}</span>
    ${
      parziale
        ? `<span class="dati-parziali" title="Di questo set conosciamo solo ${set.ufficiali} carte su ${set.totale}: le altre non sono nei dati italiani di TCGdex.">parziali</span>`
        : ''
    }`;
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
