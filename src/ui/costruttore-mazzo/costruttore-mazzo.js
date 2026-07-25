/**
 * Web Component `<costruttore-mazzo>`: scegliere a mano le carte di un mazzo.
 *
 * Mostra le carte della collezione con i tasti −/+ e tiene il conto di quante
 * ne hai messe. Non decide niente: emette `scelta-cambiata` e chi lo usa
 * ricalcola punteggio e avvisi. La stessa divisione che c'è fra `src/engine/` e
 * `src/app/`, applicata alla UI.
 *
 * Perché non si è riusato `<griglia-collezione>`: quella mostra **cosa
 * possiedi**, raggruppato per serie e set, e serve a ritrovare una carta nella
 * scatola. Qui serve l'opposto — un elenco piatto, filtrabile per nome, dove
 * conta quante copie restano disponibili. Sono due letture diverse degli stessi
 * dati, e piegarne una all'altra avrebbe reso entrambe peggiori.
 *
 * Le copie disponibili sono un limite doppio: quante ne possiedi e quante ne
 * consente il regolamento. Il calcolo sta nel motore
 * (`copieAncoraDisponibili`), non qui: è una regola di gioco, non di interfaccia.
 *
 * @fires costruttore-mazzo#scelta-cambiata - detail: `{ scelte: Map }`
 *
 * @module ui/costruttore-mazzo
 */

import { copieAncoraDisponibili } from '../../engine/mazzo-manuale.js';
import { urlImmagine } from '../../data/dataset.js';
import { segnaposto, seImmagineRotta } from '../segnaposto.js';
import { FILTRI_VUOTI, filtra, valoriDisponibili } from '../griglia-collezione/raggruppa.js';

/**
 * Carica le figure solo quando stanno per entrare nello schermo.
 *
 * Sostituisce `loading="lazy"`, che su un `<img>` inserito via `innerHTML`
 * dentro uno Shadow DOM non si attiva mai — è la stessa scoperta fatta in
 * `scheda-carta.js`, e vale identica qui. Con settantacinque righe a schermo
 * caricarle tutte insieme sarebbe uno spreco su una connessione da telefono.
 *
 * `rootMargin` fa partire il caricamento 200px prima del bordo, così scorrendo
 * la figura è già pronta.
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
 * Fogli di stile del componente, caricati una volta sola.
 *
 * Sono **due**, e il secondo è `tipi.css`: le pastiglie dei tipi elementali si
 * colorano con `--tipo-colore`, definita da regole `[data-tipo='Fuoco']`. Le
 * custom property attraversano il confine dello Shadow DOM per eredità, ma le
 * **regole che le impostano** no — devono trovare un elemento nello stesso
 * albero. Senza adottare anche questo foglio, le pastiglie uscirebbero tutte
 * grigie.
 */
const stile = new CSSStyleSheet();
const stileTipi = new CSSStyleSheet();
const caricaIn = (foglio, url) =>
  fetch(url)
    .then((r) => r.text())
    .then((css) => foglio.replaceSync(css))
    .catch(() => {
      /* senza CSS resta usabile, solo spoglio */
    });
caricaIn(stile, new URL('./costruttore-mazzo.css', import.meta.url));
caricaIn(stileTipi, new URL('../stile/tipi.css', import.meta.url));

/**
 * Quante carte mostrare **per categoria** prima di fermarsi.
 *
 * Serve solo contro le collezioni enormi: disegnare migliaia di righe rende il
 * telefono inutilizzabile. Su una collezione di famiglia non scatta mai, ed è
 * voluto — il tetto è l'ultima difesa, non lo strumento con cui si trova una
 * carta. Per quello ci sono i filtri.
 *
 * Il tetto è per categoria e non complessivo, ed è una correzione, non un
 * dettaglio. Con un tetto unico su un elenco ordinato Pokémon → Allenatori →
 * Energie, una collezione da 128 carte mostrava **solo Pokémon**: Energie e
 * Allenatori finivano oltre il taglio e sparivano del tutto. Cioè proprio le
 * carte che si aggiungono più spesso, e senza nessun indizio che esistessero.
 */
const TETTO_PER_CATEGORIA = 150;

/** Le categorie, nell'ordine in cui si costruisce un mazzo. */
const CATEGORIE = ['Pokémon', 'Allenatore', 'Energia'];

/** @param {string} testo @returns {string} sicuro dentro l'HTML */
const esc = (testo) =>
  String(testo ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class CostruttoreMazzo extends HTMLElement {
  /** @type {object[]} voci di collezione, da `elencoCompleto()` */
  #voci = [];
  /** @type {Map<string, number>} chiave carta → copie scelte */
  #scelte = new Map();
  /**
   * I filtri, nella stessa forma usata dalla griglia del catalogo.
   *
   * Non si riscrive nessuna logica di filtraggio: `filtra()` e
   * `valoriDisponibili()` arrivano da `griglia-collezione/raggruppa.js`. Due
   * implementazioni dello stesso filtro divergono alla prima aggiunta, e
   * soprattutto si comporterebbero **diversamente sulle stesse carte** — che
   * per chi usa l'app è un difetto, non un dettaglio interno.
   *
   * @type {typeof FILTRI_VUOTI}
   */
  #filtri = { ...FILTRI_VUOTI };
  /** @type {boolean} se il pannello dei filtri avanzati è aperto */
  #avanzatiAperti = false;

  /** @param {object[]} valore */
  set voci(valore) {
    this.#voci = valore ?? [];
    this.#disegna();
  }

  /** @returns {Map<string, number>} copia, per non farsela modificare da fuori */
  get scelte() {
    return new Map(this.#scelte);
  }

  /** @param {Map<string, number>} valore */
  set scelte(valore) {
    this.#scelte = new Map(valore ?? []);
    this.#disegna();
  }

  /** Le voci scelte, nella forma che il motore si aspetta. */
  get carte() {
    const per = new Map(this.#voci.map((v) => [chiave(v), v]));
    return [...this.#scelte.entries()]
      .filter(([, q]) => q > 0)
      .map(([k, quantita]) => ({ carta: per.get(k)?.carta, quantita }))
      .filter((v) => v.carta);
  }

  /** Svuota il mazzo. */
  svuota() {
    this.#scelte.clear();
    this.#disegna();
    this.#annuncia();
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.adoptedStyleSheets = [stileTipi, stile];
    }
    this.#disegna();
  }

  #annuncia() {
    this.dispatchEvent(
      new CustomEvent('scelta-cambiata', { bubbles: true, detail: { scelte: this.scelte } }),
    );
  }

  /**
   * Le voci da mostrare: filtrate per nome e ordinate coi Pokémon prima.
   *
   * Le carte già scelte restano SEMPRE visibili, anche quando non
   * corrispondono al filtro: altrimenti scrivere nel campo di ricerca farebbe
   * sparire ciò che hai appena messo nel mazzo, e non si potrebbe più toglierlo.
   */
  #daMostrare() {
    const passano = new Set(filtra(this.#voci, this.#filtri).map(chiave));

    const scelte = this.#voci.filter((v) => this.#scelte.get(chiave(v)) > 0);
    const resto = this.#voci.filter(
      (v) => !this.#scelte.get(chiave(v)) && passano.has(chiave(v)),
    );

    const perNome = (a, b) =>
      String(a.carta?.nome).localeCompare(String(b.carta?.nome), 'it');

    const gruppi = CATEGORIE.map((categoria) => {
      const tutte = resto.filter((v) => v.carta?.categoria === categoria).sort(perNome);
      return {
        categoria,
        voci: tutte.slice(0, TETTO_PER_CATEGORIA),
        totali: tutte.length,
        troncate: Math.max(0, tutte.length - TETTO_PER_CATEGORIA),
      };
    }).filter((g) => g.voci.length);

    return { scelte, gruppi };
  }

  /**
   * La barra dei filtri: ricerca, pastiglie dei tipi, e il resto a scomparsa.
   *
   * Stessa impostazione della griglia del catalogo, e non per pigrizia: chi ha
   * imparato a filtrare lì deve ritrovare gli stessi comandi qui, o sono due
   * app diverse dentro la stessa app. Le opzioni si leggono dalla collezione
   * (`valoriDisponibili`), quindi non compaiono mai filtri che non selezionano
   * niente.
   *
   * @returns {string} HTML
   */
  #filtriHtml() {
    const v = valoriDisponibili(this.#voci);
    const menu = (chiave, etichetta, opzioni) => `
      <label class="campo">
        <span>${esc(etichetta)}</span>
        <select data-filtro="${chiave}">
          <option value="">Tutti</option>
          ${opzioni
            .map(
              ({ valore, testo }) =>
                `<option value="${esc(valore)}"${
                  this.#filtri[chiave] === valore ? ' selected' : ''
                }>${esc(testo)}</option>`,
            )
            .join('')}
        </select>
      </label>`;

    const attivi = Object.entries(this.#filtri).filter(([, valore]) => valore).length;

    return `
      <div class="filtri">
        <input type="search" data-filtro="testo" value="${esc(this.#filtri.testo)}"
               placeholder="Cerca per nome" aria-label="Cerca fra le tue carte" />

        <div class="chip-tipi">
          <button type="button" class="chip-tipo${this.#filtri.tipo ? '' : ' attivo'}"
                  data-tipo-filtro="">Tutti</button>
          ${v.tipi
            .map(
              (t) =>
                `<button type="button" class="chip-tipo${
                  this.#filtri.tipo === t ? ' attivo' : ''
                }" data-tipo="${esc(t)}" data-tipo-filtro="${esc(t)}">${esc(t)}</button>`,
            )
            .join('')}
        </div>

        <div class="riga-comandi">
          <button type="button" class="collegamento" data-azione="avanzati"
                  aria-expanded="${this.#avanzatiAperti}">
            ${this.#avanzatiAperti ? 'Meno filtri' : 'Altri filtri'}
          </button>
          ${
            attivi
              ? `<button type="button" class="collegamento" data-azione="azzera">Azzera i filtri</button>`
              : ''
          }
        </div>

        ${
          this.#avanzatiAperti
            ? `<div class="avanzati">
                 ${menu(
                   'categoria',
                   'Tipo di carta',
                   v.categorie.map((c) => ({ valore: c, testo: c })),
                 )}
                 ${menu(
                   'stadio',
                   'Stadio',
                   v.stadi.map((s) => ({ valore: s, testo: s })),
                 )}
                 ${menu(
                   'set',
                   'Set',
                   v.set.map((s) => ({
                     valore: s.id,
                     testo: s.anno ? `${s.nome} (${s.anno})` : s.nome,
                   })),
                 )}
               </div>`
            : ''
        }
      </div>`;
  }

  #disegna() {
    if (!this.shadowRoot) return;
    const { scelte, gruppi } = this.#daMostrare();

    this.shadowRoot.innerHTML = `
      ${this.#filtriHtml()}
      ${scelte.length ? `<p class="titolo-gruppo">Nel mazzo</p>${this.#righe(scelte)}` : ''}
      ${gruppi
        .map(
          (g) => `
        <p class="titolo-gruppo">${esc(g.categoria)} <span class="quante">${g.totali}</span></p>
        ${this.#righe(g.voci)}
        ${
          g.troncate
            ? `<p class="aiuto">Altre ${g.troncate} non mostrate: restringi con i filtri qui sopra.</p>`
            : ''
        }`,
        )
        .join('')}
      ${
        !scelte.length && !gruppi.length
          ? '<p class="aiuto">Nessuna carta corrisponde ai filtri.</p>'
          : ''
      }
    `;

    const campo = this.shadowRoot.querySelector('[data-filtro="testo"]');
    campo.addEventListener('input', () => {
      this.#filtri.testo = campo.value;
      this.#disegna();
      // Il campo si ridisegna, quindi va rimesso a fuoco con il cursore in
      // fondo: senza, si scrive una lettera e la tastiera si chiude.
      const nuovo = this.shadowRoot.querySelector('[data-filtro="testo"]');
      nuovo.focus();
      nuovo.setSelectionRange(nuovo.value.length, nuovo.value.length);
    });

    this.shadowRoot.querySelectorAll('select[data-filtro]').forEach((menu) =>
      menu.addEventListener('change', () => {
        this.#filtri[menu.dataset.filtro] = menu.value;
        this.#disegna();
      }),
    );

    this.shadowRoot.querySelectorAll('[data-tipo-filtro]').forEach((chip) =>
      chip.addEventListener('click', () => {
        // Ritoccare la pastiglia attiva la spegne: è il modo più rapido di
        // tornare a vedere tutto, senza cercare un pulsante "azzera".
        const valore = chip.dataset.tipoFiltro;
        this.#filtri.tipo = this.#filtri.tipo === valore ? '' : valore;
        this.#disegna();
      }),
    );

    this.shadowRoot.querySelector('[data-azione="avanzati"]')?.addEventListener('click', () => {
      this.#avanzatiAperti = !this.#avanzatiAperti;
      this.#disegna();
    });

    this.shadowRoot.querySelector('[data-azione="azzera"]')?.addEventListener('click', () => {
      this.#filtri = { ...FILTRI_VUOTI };
      this.#disegna();
    });

    // Le figure entrano in osservazione dopo il disegno, e quelle rotte
    // ricadono sul segnaposto invece di lasciare un riquadro vuoto.
    this.shadowRoot.querySelectorAll('img.figura').forEach((img) => {
      const voce = this.#voci.find((v) => chiave(v) === img.closest('[data-apri]')?.dataset.apri);
      if (voce) seImmagineRotta(img, voce.carta, 'figura segnaposto');
      osservatore.observe(img);
    });

    // Toccando la figura si apre il visore a schermo intero. Non serve
    // scriverlo: `carta-scelta` ha già un ascoltatore sul document, e
    // `composed: true` è ciò che permette all'evento di uscire dallo Shadow
    // DOM — senza, resterebbe intrappolato qui dentro e non lo sentirebbe
    // nessuno.
    this.shadowRoot.querySelectorAll('[data-apri]').forEach((bottone) =>
      bottone.addEventListener('click', () => {
        const voce = this.#voci.find((v) => chiave(v) === bottone.dataset.apri);
        if (!voce) return;
        this.dispatchEvent(
          new CustomEvent('carta-scelta', {
            bubbles: true,
            composed: true,
            detail: { carta: voce.carta, nomeSet: voce.nomeSet },
          }),
        );
      }),
    );

    this.shadowRoot.querySelectorAll('[data-azione]').forEach((bottone) =>
      bottone.addEventListener('click', () => {
        const k = bottone.dataset.carta;
        const voce = this.#voci.find((v) => chiave(v) === k);
        if (!voce) return;
        const ora = this.#scelte.get(k) ?? 0;
        const nuova =
          bottone.dataset.azione === 'piu'
            ? ora + (copieAncoraDisponibili(voce.carta, voce.quantita, ora) > 0 ? 1 : 0)
            : Math.max(0, ora - 1);
        if (nuova === ora) return;
        if (nuova === 0) this.#scelte.delete(k);
        else this.#scelte.set(k, nuova);
        this.#disegna();
        this.#annuncia();
      }),
    );
  }

  /**
   * @param {object[]} voci
   * @returns {string} HTML
   */
  #righe(voci) {
    return `<ul class="elenco">${voci
      .map((v) => {
        const k = chiave(v);
        const scelte = this.#scelte.get(k) ?? 0;
        const ancora = copieAncoraDisponibili(v.carta, v.quantita, scelte);
        const tipo = v.carta?.tipi?.[0];
        const src = urlImmagine(v.carta);
        // `data-src` invece di `src`: la figura la carica l'osservatore quando
        // la riga sta per entrare a schermo. Il segnaposto copre le carte senza
        // scansione nel dataset (le Energie base generiche, per esempio).
        const figura = src
          ? `<img class="figura" data-src="${esc(src)}" alt="" width="40" height="56" />`
          : segnaposto(v.carta, 'figura segnaposto');
        return `
          <li${scelte ? ' class="dentro"' : ''}>
            <button type="button" class="apri" data-apri="${esc(chiave(v))}"
                    aria-label="Guarda ${esc(v.carta?.nome)} in grande">${figura}</button>
            <span class="dati">
              <span class="nome">${esc(v.carta?.nome ?? '?')}</span>
              <span class="dettaglio">
                ${esc(v.carta?.categoria ?? '')}${tipo ? ` · ${esc(tipo)}` : ''}
                ${v.carta?.stadio ? ` · ${esc(v.carta.stadio)}` : ''}
                · ne hai ${v.quantita}
              </span>
            </span>
            <span class="comandi">
              <button type="button" data-azione="meno" data-carta="${esc(k)}"
                      aria-label="Togli una copia di ${esc(v.carta?.nome)}"
                      ${scelte ? '' : 'disabled'}>−</button>
              <span class="conta" aria-live="polite">${scelte}</span>
              <button type="button" data-azione="piu" data-carta="${esc(k)}"
                      aria-label="Aggiungi una copia di ${esc(v.carta?.nome)}"
                      ${ancora > 0 ? '' : 'disabled'}>+</button>
            </span>
          </li>`;
      })
      .join('')}</ul>`;
  }
}

/**
 * Chiave di una voce di collezione.
 *
 * Set più numero, non il nome: nello stesso set possono esserci due Luxio
 * diversi, e sommarli renderebbe impossibile distinguerli nel mazzo.
 *
 * @param {object} voce
 * @returns {string}
 */
function chiave(voce) {
  return `${voce.idSet}/${voce.numero}`;
}

customElements.define('costruttore-mazzo', CostruttoreMazzo);
