/**
 * Web Component `<linea-evolutiva>`: la famiglia di una carta, in una finestra.
 *
 * Nasce dai Preferiti. Là gli stepper `+`/`−` non servono — una carta che ti
 * piace non la conti, la guardi — e al loro posto sta la domanda che invece
 * viene sempre: *di questo Machoke ho anche il resto della linea?* La finestra
 * risponde mostrando i gradini dal Base alla cima, ognuno con la sua scansione
 * e con scritto se ce l'hai e in quante copie.
 *
 * Come `<visore-carta>` ce n'è **uno solo** per pagina ed è un `<dialog>`
 * nativo: Esc, fondo oscurato e focus confinato li fa il browser.
 *
 * È un componente **muto**: non sa cos'è un indice delle evoluzioni né come si
 * cerca una carta per nome. Riceve i gradini già risolti da
 * `app/linea-evolutiva.js` e si limita a disegnarli — la stessa divisione di
 * `griglia-collezione`, che riceve `caricaMancanti` da fuori.
 *
 * Disegna in DOM normale, non Shadow DOM: le miniature si tingono del colore
 * del tipo (`tipi.css`), che nello Shadow DOM non arriverebbe.
 *
 * @example
 * const finestra = document.querySelector('linea-evolutiva');
 * finestra.apri('Machoke');          // subito, con l'attesa
 * finestra.gradini = gradiniRisolti; // quando i dati sono pronti
 *
 * @module ui/linea-evolutiva
 */

import { urlImmagine } from '../../data/dataset.js';
import { segnaposto, seImmagineRotta } from '../segnaposto.js';
import { bloccaScorrimento, sbloccaScorrimento } from '../../app/blocca-scroll.js';
import { pastigliaLingua } from '../lingua-set.js';

/** Come si chiama un gradino, per numero di livello. */
const ETICHETTE = ['Base', 'Livello 1', 'Livello 2'];

export class LineaEvolutiva extends HTMLElement {
  /** @type {HTMLDialogElement|null} */
  #dialogo = null;

  connectedCallback() {
    if (this.#dialogo) return;
    this.innerHTML = `
      <dialog class="finestra-linea">
        <header class="testa-linea">
          <h2 class="titolo-linea"></h2>
          <button class="chiudi-linea" type="button" aria-label="Chiudi">✕</button>
        </header>
        <div class="corpo-linea"></div>
      </dialog>
    `;
    this.#dialogo = this.querySelector('dialog');

    this.querySelector('.chiudi-linea').addEventListener('click', () => this.chiudi());
    // Cliccare sullo sfondo chiude: su un dialog quel click arriva al dialog
    // stesso, non ai figli.
    this.#dialogo.addEventListener('click', (evento) => {
      if (evento.target === this.#dialogo) this.chiudi();
    });
    // `close` copre anche l'uscita con Esc, che non passa da `chiudi()`.
    this.#dialogo.addEventListener('close', () => sbloccaScorrimento());
  }

  /**
   * Apre la finestra sull'attesa: i gradini arrivano dopo, perché ricostruirli
   * può voler dire scaricare il file di qualche set. Aprire solo a dati pronti
   * farebbe sembrare che il tocco non abbia fatto nulla.
   *
   * @param {string} nome nome della carta di partenza
   * @returns {void}
   */
  apri(nome) {
    if (!this.#dialogo) return;
    this.querySelector('.titolo-linea').textContent = `Linea di ${nome}`;
    this.querySelector('.corpo-linea').innerHTML =
      '<p class="attesa-linea">ricostruisco la linea evolutiva…</p>';

    try {
      this.#dialogo.showModal();
    } catch {
      // Se un browser rifiuta il top-layer si ripiega su `show()`: il
      // `position: fixed` del CSS copre comunque lo schermo.
      this.#dialogo.show();
    }
    bloccaScorrimento();
  }

  /**
   * I gradini da disegnare, dal Base in su.
   *
   * @param {Array<{livello: number, oltre: number, voci: Array<object>}>} valore
   *   ogni voce: `{nome, carta, quantita, nomeSet, linguaSet, corrente}`
   */
  set gradini(valore) {
    const corpo = this.querySelector('.corpo-linea');
    if (!corpo) return;
    const gradini = valore ?? [];

    if (!gradini.length) {
      corpo.innerHTML = '<p class="attesa-linea">Di questa carta non si conosce la linea.</p>';
      return;
    }

    corpo.innerHTML = gradini.map((g) => this.#rigaGradino(g)).join('');
    for (const img of corpo.querySelectorAll('img[data-carta]')) {
      const carta = JSON.parse(img.dataset.carta);
      seImmagineRotta(img, carta, 'segnaposto-mini');
    }
  }

  /**
   * Una riga: l'etichetta del livello e le carte che ci stanno.
   * @param {{livello: number, oltre: number, voci: Array<object>}} gradino
   * @returns {string} HTML
   */
  #rigaGradino(gradino) {
    const etichetta = ETICHETTE[gradino.livello] ?? `Livello ${gradino.livello}`;
    const oltre =
      gradino.oltre > 0
        ? `<p class="oltre-linea">e altre ${gradino.oltre} evoluzioni non mostrate</p>`
        : '';
    return `
      <section class="gradino-linea">
        <h3 class="etichetta-gradino">${etichetta}</h3>
        <div class="carte-gradino">${gradino.voci.map((v) => this.#carta(v)).join('')}</div>
        ${oltre}
      </section>
    `;
  }

  /**
   * Una carta della linea.
   *
   * Tre stati e non due: la carta di partenza (quella su cui hai toccato il
   * pulsante), le altre che possiedi, e quelle che ti mancano. Senza il primo,
   * in una linea di tre Machop non si capirebbe più da dove si è partiti.
   *
   * @param {object} voce
   * @returns {string} HTML
   */
  #carta(voce) {
    const c = voce.carta;
    const tipo = c?.tipi?.[0] ?? 'Incolore';
    const posseduta = (voce.quantita ?? 0) > 0;
    const classi = [
      'carta-linea',
      posseduta ? 'posseduta' : 'assente',
      voce.corrente ? 'corrente' : '',
    ]
      .filter(Boolean)
      .join(' ');

    // La carta non trovata nel catalogo non è un errore da nascondere: il nome
    // c'è comunque, ed è quello che si va a cercare nella scatola.
    const immagine = c
      ? this.#htmlImmagine(c)
      : segnaposto({ nome: voce.nome }, 'segnaposto-mini');
    const stato = posseduta
      ? `<span class="stato-linea ce-lhai">ce l'hai ×${voce.quantita}</span>`
      : '<span class="stato-linea manca">non ce l\'hai</span>';

    return `
      <article class="${classi}" data-tipo="${escapeHtml(tipo)}">
        <div class="mini-linea">${immagine}</div>
        <div class="nome-linea">${escapeHtml(c?.nome ?? voce.nome)}</div>
        ${voce.nomeSet ? `<div class="set-linea">${escapeHtml(voce.nomeSet)}${pastigliaLingua(voce)}</div>` : ''}
        ${stato}
      </article>
    `;
  }

  /**
   * L'immagine della carta, o il segnaposto tinto se la scansione non c'è.
   *
   * Qui **non** si usa il lazy-load della griglia: le carte a schermo sono al
   * massimo una decina e stanno tutte in una finestra che si è appena aperta
   * apposta per guardarle.
   *
   * @param {object} c
   * @returns {string} HTML
   */
  #htmlImmagine(c) {
    const src = urlImmagine(c, 'griglia');
    if (!src) return segnaposto(c, 'segnaposto-mini');
    // I dati della carta viaggiano sull'attributo perché il segnaposto di
    // ripiego, se l'immagine non arriva, va tinto del suo tipo.
    const dati = escapeHtml(JSON.stringify({ nome: c.nome, tipi: c.tipi ?? [] }));
    return `<img src="${escapeHtml(src)}" alt="" loading="lazy" data-carta="${dati}" />`;
  }

  /** @returns {void} */
  chiudi() {
    this.#dialogo?.close();
    sbloccaScorrimento();
  }
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

customElements.define('linea-evolutiva', LineaEvolutiva);
