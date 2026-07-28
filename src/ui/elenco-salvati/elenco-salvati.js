/**
 * Web Component `<elenco-salvati>`: i mazzi messi da parte, con nome e forza.
 *
 * Esiste per non avere due liste diverse della stessa cosa: prima l'elenco lo
 * disegnava a mano `vista-mazzi.js` con una stringa di HTML, e chiunque volesse
 * mostrare i mazzi salvati altrove avrebbe dovuto ricopiarla. Qui è un pezzo di
 * UI con un ingresso (`piani`) e due eventi in uscita, riusabile in qualsiasi
 * sezione.
 *
 * Le righe sono diventate **card**: prima erano flex a tutta larghezza con
 * `flex-wrap`, e su un telefono nome, dettaglio e i due comandi andavano a capo
 * uno sotto l'altro — tre righe di testo per mazzo, cioè quattro mazzi per
 * schermata. Una card ne fa stare il doppio e mostra di più (colore del tipo,
 * da dove viene il mazzo, la forza come barra invece che come numero).
 *
 * Light DOM come gli altri componenti del progetto: il foglio di stile è
 * globale, quindi le classi sono tutte prefissate `salvati-` per non
 * contaminare il resto della pagina.
 *
 * @fires elenco-salvati#piano-aperto - detail: `{id}`
 * @fires elenco-salvati#piano-eliminato - detail: `{id}`
 *
 * @module ui/elenco-salvati
 */

/** I filtri possibili, nell'ordine in cui compaiono. */
const FILTRI = [
  { chiave: 'tutti', etichetta: 'Tutti' },
  { chiave: 'wizard', etichetta: 'Dal wizard' },
  { chiave: 'mano', etichetta: 'A mano' },
];

export class ElencoSalvati extends HTMLElement {
  /** @type {object[]} */
  #piani = [];

  /** @type {string} quale dei `FILTRI` è attivo */
  #filtro = 'tutti';

  /** @param {object[]} valore i record restituiti da `elencoPiani()` */
  set piani(valore) {
    this.#piani = valore ?? [];
    this.#disegna();
  }

  /** @returns {object[]} */
  get piani() {
    return this.#piani;
  }

  connectedCallback() {
    this.#disegna();

    // Un solo ascoltatore sul contenitore invece di uno per bottone: le righe
    // si ridisegnano a ogni salvataggio, e ricollegarle ogni volta è lavoro
    // inutile (delegazione degli eventi, come in Angular con l'host listener).
    this.addEventListener('click', (evento) => {
      const filtro = evento.target.closest('[data-filtro]');
      if (filtro) {
        this.#filtro = filtro.dataset.filtro;
        this.#disegna();
        return;
      }

      const bottone = evento.target.closest('[data-azione]');
      if (!bottone) return;
      const { azione, id } = bottone.dataset;
      this.dispatchEvent(
        new CustomEvent(azione === 'apri' ? 'piano-aperto' : 'piano-eliminato', {
          bubbles: true,
          detail: { id },
        }),
      );
    });
  }

  /** I piani che passano il filtro corrente. */
  #visibili() {
    if (this.#filtro === 'tutti') return this.#piani;
    const vuoleMano = this.#filtro === 'mano';
    return this.#piani.filter((p) => Boolean(p.opzioni?.personalizzato) === vuoleMano);
  }

  #disegna() {
    if (!this.#piani.length) {
      this.innerHTML = `
        <p class="stato">Nessun mazzo salvato: creane con il wizard, oppure costruiscine
        uno a mano. Da qui in poi li ritrovi tutti in questa schermata.</p>`;
      return;
    }

    const visibili = this.#visibili();

    this.innerHTML = `
      ${this.#htmlFiltri()}
      ${
        visibili.length
          ? `<ul class="elenco-salvati">${visibili.map((p) => this.#card(p)).join('')}</ul>`
          : '<p class="stato">Nessun mazzo di questo tipo.</p>'
      }`;
  }

  /**
   * I chip di filtro fra mazzi del wizard e mazzi fatti a mano.
   *
   * Compaiono solo se ci sono entrambe le specie: con salvataggi tutti dello
   * stesso tipo sarebbero tre pastiglie che non tolgono mai niente.
   *
   * @returns {string} HTML
   */
  #htmlFiltri() {
    const aMano = this.#piani.filter((p) => p.opzioni?.personalizzato).length;
    if (!aMano || aMano === this.#piani.length) return '';

    return `
      <div class="salvati-filtri" role="group" aria-label="Filtra i mazzi salvati">
        ${FILTRI.map(
          (f) => `
          <button type="button" class="salvati-chip${f.chiave === this.#filtro ? ' attivo' : ''}"
                  data-filtro="${f.chiave}" aria-pressed="${f.chiave === this.#filtro}">
            ${f.etichetta}
          </button>`,
        ).join('')}
      </div>`;
  }

  /**
   * Una card dell'elenco.
   *
   * La forza si mostra qui e non solo dentro il mazzo aperto: è il dato con cui
   * si sceglie quale mazzo riprendere, e cercarlo aprendoli uno per uno
   * significherebbe non guardarlo mai. È una barra e non più una fila di numeri
   * perché in una card si legge con un colpo d'occhio, che è quanto le si dedica.
   *
   * @param {object} piano
   * @returns {string} HTML
   */
  #card(piano) {
    const quando = new Date(piano.creatoIl);
    const forze = forzeDi(piano);
    const quanti = piano.mazzi?.length ?? 0;
    const nome = escapeHtml(piano.nome ?? 'Senza nome');
    const tipo = tipoDi(piano);
    const aMano = Boolean(piano.opzioni?.personalizzato);

    return `
      <li class="salvati-card"${tipo ? ` data-tipo="${escapeHtml(tipo)}"` : ''}>
        <button type="button" class="salvati-apri" data-azione="apri"
                data-id="${escapeHtml(piano.id)}">
          <span class="salvati-nome">${nome}</span>
          <span class="salvati-dettaglio">
            <span class="salvati-segno">${aMano ? 'a mano' : 'wizard'}</span>
            ${quanti === 1 ? 'un mazzo' : `${quanti} mazzi`} · ${carteDi(piano)} carte
          </span>
          <span class="salvati-dettaglio">
            ${forze.length ? `forza ${forze.join(' · ')}` : 'forza non misurabile'}
            ${Number.isNaN(quando.valueOf()) ? '' : `· ${quando.toLocaleDateString('it-IT')}`}
          </span>
        </button>
        <button type="button" class="salvati-elimina" data-azione="elimina"
                data-id="${escapeHtml(piano.id)}" aria-label="Elimina ${nome}">✕</button>
      </li>`;
  }
}

/**
 * Quante carte contiene davvero un salvataggio.
 *
 * Si contano le carte, **non** si legge `opzioni.taglia`: la taglia è quella a
 * cui il mazzo puntava, e un mazzo costruito a mano e salvato a metà mostrava
 * "30 carte" avendone tre. Il numero che serve a riconoscere un salvataggio
 * nell'elenco è quello che c'è dentro, non quello che si era promesso.
 *
 * @param {object} piano
 * @returns {number}
 */
function carteDi(piano) {
  return (piano.mazzi ?? []).reduce(
    (somma, mazzo) =>
      somma + (mazzo.carte ?? []).reduce((s, voce) => s + (voce.quantita ?? 0), 0),
    0,
  );
}

/**
 * I punteggi di forza da mostrare accanto a un salvataggio.
 *
 * Due sorgenti, e serve provarle entrambe: `equilibrio` esiste solo nei piani
 * usciti dal wizard, che misura i mazzi **uno rispetto all'altro**, mentre un
 * mazzo costruito a mano è uno solo e un equilibrio non ce l'ha. La sua forza
 * `istantanea()` la scrive comunque su ogni mazzo, ed è da lì che si recupera:
 * senza questo ripiego i mazzi personalizzati comparivano nell'elenco **senza
 * punteggio**, cioè senza il dato con cui si sceglie quale riprendere.
 *
 * @param {object} piano
 * @returns {number[]}
 */
function forzeDi(piano) {
  const dallEquilibrio = piano.equilibrio?.punteggi?.map((p) => p.totale);
  if (dallEquilibrio?.length) return dallEquilibrio;

  return (piano.mazzi ?? [])
    .map((m) => (m.forza?.attendibile ? m.forza.totale : null))
    .filter((n) => n != null);
}

/**
 * Il tipo che dà il colore alla card.
 *
 * Si prende dal primo mazzo, e solo se **tutti** concordano: un salvataggio con
 * un mazzo d'Erba e uno di Fuoco non è "di Erba", e tingerlo di verde direbbe
 * una cosa falsa. In quel caso resta il grigio neutro di `tipi.css`.
 *
 * @param {object} piano
 * @returns {string|null}
 */
function tipoDi(piano) {
  const primi = (piano.mazzi ?? []).map((m) => m.tipi?.[0] ?? null);
  if (!primi.length || primi.some((t) => !t)) return null;
  return primi.every((t) => t === primi[0]) ? primi[0] : null;
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

customElements.define('elenco-salvati', ElencoSalvati);
