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
import { normalizzaNome } from '../../engine/nomi.js';

/** Foglio di stile condiviso, caricato una volta sola. */
const stile = new CSSStyleSheet();
fetch(new URL('./costruttore-mazzo.css', import.meta.url))
  .then((r) => r.text())
  .then((css) => stile.replaceSync(css))
  .catch(() => {
    /* senza CSS resta usabile, solo spoglio */
  });

/**
 * Quante carte mostrare **per categoria** prima di chiedere di filtrare.
 *
 * Una collezione può avere migliaia di righe, e disegnarle tutte rende il
 * telefono inutilizzabile mentre si scrive nel campo di ricerca. Il tetto non
 * nasconde niente: si alza scrivendo due lettere.
 *
 * Il tetto è per categoria e non complessivo, ed è una correzione, non un
 * dettaglio. Con un tetto unico su un elenco ordinato Pokémon → Allenatori →
 * Energie, una collezione da 128 carte mostrava **solo Pokémon**: Energie e
 * Allenatori finivano oltre il taglio e sparivano del tutto. Cioè proprio le
 * carte che si aggiungono più spesso, e senza nessun indizio che esistessero.
 */
const TETTO_PER_CATEGORIA = 25;

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
  /** @type {string} */
  #filtro = '';

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
      this.shadowRoot.adoptedStyleSheets = [stile];
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
    const cerca = normalizzaNome(this.#filtro);
    const corrisponde = (v) =>
      !cerca ||
      normalizzaNome(v.carta?.nome).includes(cerca) ||
      normalizzaNome(v.nomeSet).includes(cerca) ||
      String(v.numero) === this.#filtro.trim();

    const scelte = this.#voci.filter((v) => this.#scelte.get(chiave(v)) > 0);
    const resto = this.#voci.filter((v) => !this.#scelte.get(chiave(v)) && corrisponde(v));

    const perNome = (a, b) =>
      String(a.carta?.nome).localeCompare(String(b.carta?.nome), 'it');

    const gruppi = CATEGORIE.map((categoria) => {
      const tutte = resto.filter((v) => v.carta?.categoria === categoria).sort(perNome);
      return {
        categoria,
        voci: tutte.slice(0, TETTO_PER_CATEGORIA),
        troncate: Math.max(0, tutte.length - TETTO_PER_CATEGORIA),
      };
    }).filter((g) => g.voci.length);

    return { scelte, gruppi };
  }

  #disegna() {
    if (!this.shadowRoot) return;
    const { scelte, gruppi } = this.#daMostrare();

    this.shadowRoot.innerHTML = `
      <label class="ricerca">
        <span class="etichetta-ricerca">Cerca fra le tue carte</span>
        <input type="search" placeholder="nome, set o numero" value="${esc(this.#filtro)}" />
      </label>
      ${scelte.length ? `<p class="titolo-gruppo">Nel mazzo</p>${this.#righe(scelte)}` : ''}
      ${gruppi
        .map(
          (g) => `
        <p class="titolo-gruppo">${esc(g.categoria)}</p>
        ${this.#righe(g.voci)}
        ${
          g.troncate
            ? `<p class="aiuto">…e altre ${g.troncate}. Scrivi qualcosa per restringere l'elenco.</p>`
            : ''
        }`,
        )
        .join('')}
      ${
        !scelte.length && !gruppi.length
          ? '<p class="aiuto">Nessuna carta corrisponde alla ricerca.</p>'
          : ''
      }
    `;

    const campo = this.shadowRoot.querySelector('input');
    campo.addEventListener('input', () => {
      this.#filtro = campo.value;
      this.#disegna();
      // Il campo si ridisegna, quindi va rimesso a fuoco con il cursore in
      // fondo: senza, si scrive una lettera e la tastiera si chiude.
      const nuovo = this.shadowRoot.querySelector('input');
      nuovo.focus();
      nuovo.setSelectionRange(nuovo.value.length, nuovo.value.length);
    });

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
        return `
          <li${scelte ? ' class="dentro"' : ''}>
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
