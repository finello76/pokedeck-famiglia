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
 * cerca una carta per nome. Riceve i gradini da `app/linea-evolutiva.js` e si
 * limita a disegnarli — la stessa divisione di `griglia-collezione`, che riceve
 * `caricaMancanti` da fuori.
 *
 * Li riceve in **due tempi**: prima la struttura, con le carte che si sanno già
 * e un posto vuoto per le altre, poi ogni carta trovata nel catalogo con
 * `completa()`. Il perché sta in `app/linea-evolutiva.js`: cercarle tutte prima
 * di aprire voleva dire nove secondi di finestra ferma.
 *
 * Toccare una carta la ingrandisce nel visore, che si apre **sopra** questa
 * finestra: due `<dialog>` modali insieme, ed è il motivo per cui il blocco
 * dello scorrimento ragiona per chiavi (`app/blocca-scroll.js`).
 *
 * Disegna in DOM normale, non Shadow DOM: le miniature si tingono del colore
 * del tipo (`tipi.css`), che nello Shadow DOM non arriverebbe.
 *
 * @fires linea-evolutiva#carta-scelta - detail: `{ carta, nomeSet, lista, indice }`
 *
 * @example
 * const finestra = document.querySelector('linea-evolutiva');
 * finestra.apri('Machoke');            // subito, con l'attesa
 * finestra.gradini = gradini;          // la struttura, coi buchi da riempire
 * finestra.completa(2, 0, machamp);    // una carta trovata nel catalogo
 *
 * @module ui/linea-evolutiva
 */

import { urlImmagine } from '../../data/dataset.js';
import { segnaposto, seImmagineRotta } from '../segnaposto.js';
import { bloccaScorrimento, sbloccaScorrimento } from '../../app/blocca-scroll.js';
import { pastigliaLingua } from '../lingua-set.js';

/**
 * Come si chiama un gradino, per **stadio di gioco**.
 *
 * Si indicizza con `gradino.stadio`, non con la posizione della riga: la linea
 * di Omanyte comincia da un Livello 1 — sotto c'è un fossile, che è una carta
 * Allenatore — e quella di Pichu ha due Base di fila. Contare le righe scriveva
 * "Base" sopra un Livello 1.
 */
const ETICHETTE = ['Base', 'Livello 1', 'Livello 2'];

/**
 * Chi tiene bloccato lo scorrimento della pagina.
 *
 * Serve una chiave perché sopra questa finestra se ne apre un'altra — il visore
 * — e chiudendo quella lo scorrimento non deve tornare libero mentre la linea è
 * ancora aperta. Vedi `app/blocca-scroll.js`.
 */
const CHIAVE_SCROLL = 'linea-evolutiva';

export class LineaEvolutiva extends HTMLElement {
  /** @type {HTMLDialogElement|null} */
  #dialogo = null;
  /**
   * Le voci a schermo, per `livello|nome`. Serve a due cose: sapere cosa
   * ingrandire quando si tocca una carta, e ricordare la voce risolta quando
   * `completa()` sostituisce quella in attesa. Nel DOM non ci starebbe: una
   * carta è HTML costruito da stringhe, e appenderci sopra l'oggetto vorrebbe
   * dire ricordarsi di riattaccarlo a ogni ridisegno.
   * @type {Map<string, object>}
   */
  #registro = new Map();
  /**
   * La carta Allenatore da cui la linea parte, quando ce n'è una: il fossile.
   * Vedi il setter `origine`.
   * @type {string|null}
   */
  #origine = null;

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
    this.#dialogo.addEventListener('close', () => sbloccaScorrimento(CHIAVE_SCROLL));

    // Toccare una carta la ingrandisce, come nella griglia. Non è il visore a
    // essere aperto da qui: si annuncia `carta-scelta` e risponde app.js, che è
    // l'unico posto in cui si sa dove sta il visore. La linea intera viaggia
    // come elenco scorribile, così dal Machop si passa al Machamp con una
    // frecciata senza tornare indietro.
    this.addEventListener('click', (evento) => {
      const bottone = evento.target.closest('.apri-linea');
      if (!bottone) return;
      const card = bottone.closest('.carta-linea');
      const voce = this.#registro.get(chiaveVoce(card));
      if (!voce?.carta) return;

      const lista = this.#elenco();
      this.dispatchEvent(
        new CustomEvent('carta-scelta', {
          bubbles: true,
          detail: {
            carta: voce.carta,
            nomeSet: voce.nomeSet ?? '',
            lista,
            indice: Math.max(
              lista.findIndex((v) => v.carta === voce.carta),
              0,
            ),
          },
        }),
      );
    });
  }

  /**
   * Le carte a schermo in ordine di lettura, per lo scorrimento del visore.
   *
   * Si ricava dal DOM e non dal registro: l'ordine giusto è quello che si vede,
   * e il registro è una mappa — l'ordine d'inserimento ci sarebbe pure, ma
   * dipenderebbe da quando le ricerche nel catalogo sono tornate.
   *
   * @returns {Array<object>}
   */
  #elenco() {
    return [...this.querySelectorAll('.carta-linea')]
      .map((el) => this.#registro.get(chiaveVoce(el)))
      .filter((v) => v?.carta);
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
    // La linea precedente era di un'altra carta: il suo fossile non c'entra più.
    this.#origine = null;
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
    bloccaScorrimento(CHIAVE_SCROLL);
  }

  /**
   * I gradini da disegnare, dal Base in su.
   *
   * Si assegnano **subito**, con dentro anche le carte che nessuno ha ancora
   * cercato nel catalogo: quelle arrivano una per volta con `completa()`. Vedi
   * `app/linea-evolutiva.js` per il perché — in breve, aspettare che siano
   * pronte tutte voleva dire dieci secondi di finestra vuota e la pagina che
   * non rispondeva ai tocchi.
   *
   * @param {Array<{livello: number, stadio: number, oltre: number, voci: Array<object>}>} valore
   *   ogni voce: `{nome, carta, quantita, nomeSet, linguaSet, corrente, inCorso}`.
   *   `livello` è la riga, `stadio` è come si chiama nel gioco: non coincidono
   */
  set gradini(valore) {
    const corpo = this.querySelector('.corpo-linea');
    if (!corpo) return;
    const gradini = valore ?? [];

    // Il registro si riempie prima di disegnare, non dentro il disegno: una
    // funzione che costruisce una stringa HTML e intanto scrive in una mappa è
    // il genere di cosa che si dimentica di aver fatto.
    this.#registro.clear();
    for (const gradino of gradini) {
      gradino.voci.forEach((voce, posizione) => {
        this.#registro.set(`${gradino.livello}|${posizione}`, {
          ...voce,
          livello: gradino.livello,
          posizione,
        });
      });
    }

    if (!gradini.length) {
      corpo.innerHTML = '<p class="attesa-linea">Di questa carta non si conosce la linea.</p>';
      return;
    }

    // Il posto della nota c'è sempre, anche vuoto: `origine` può arrivare prima
    // o dopo i gradini, e in tutti e due i casi deve trovare dove scriversi.
    corpo.innerHTML = `<p class="origine-linea" hidden></p>${gradini
      .map((g) => this.#rigaGradino(g))
      .join('')}`;
    this.#disegnaOrigine();
    this.#sorvegliaImmagini(corpo);
  }

  /**
   * La carta Allenatore su cui la linea poggia, quando la linea non ha un Base.
   *
   * Omanyte è un Livello 1 e si mette in gioco da *Vecchio Helixfossile*. Senza
   * dirlo, la finestra mostra una linea che comincia a metà e sembra rotta: la
   * domanda che nasce guardandola è "e il Base dov'è?", e la risposta è che il
   * Base non è un Pokémon.
   *
   * @param {string|null} valore nome della carta Allenatore
   */
  set origine(valore) {
    this.#origine = valore || null;
    this.#disegnaOrigine();
  }

  /** @returns {void} */
  #disegnaOrigine() {
    const nota = this.querySelector('.origine-linea');
    if (!nota) return;
    nota.hidden = !this.#origine;
    nota.innerHTML = this.#origine
      ? `Questa linea non ha un Pokémon Base: si mette in gioco da
         <strong>${escapeHtml(this.#origine)}</strong>, che è una carta Allenatore.`
      : '';
  }

  /**
   * Rimpiazza una carta ancora in attesa con quella trovata nel catalogo.
   *
   * L'identità è **livello + posizione nella riga**, non il nome: due carte
   * possono chiamarsi uguale e non esserlo. Lycanroc Forma Giorno e Lycanroc
   * Forma Notte sono due carte diverse che nei dati si chiamano tutte e due
   * "Lycanroc", e con la chiave sul nome la seconda avrebbe sostituito la
   * prima.
   *
   * @param {number} livello
   * @param {number} posizione indice della carta dentro la sua riga
   * @param {object} voce la carta risolta
   * @returns {void}
   */
  completa(livello, posizione, voce) {
    const corpo = this.querySelector('.corpo-linea');
    const vecchia = [...(corpo?.querySelectorAll('.carta-linea') ?? [])].find(
      (el) => Number(el.dataset.livello) === livello && Number(el.dataset.posizione) === posizione,
    );
    if (!vecchia) return;

    const completa = { ...voce, livello, posizione };
    // Nel registro va la voce risolta, o il visore aprirebbe ancora la carta
    // vuota di prima.
    this.#registro.set(`${livello}|${posizione}`, completa);

    const contenitore = document.createElement('div');
    contenitore.innerHTML = this.#carta(completa);
    const nuova = contenitore.firstElementChild;
    vecchia.replaceWith(nuova);
    this.#sorvegliaImmagini(nuova);
  }

  /**
   * Mette il segnaposto alle immagini che non arrivano.
   * @param {ParentNode} radice
   * @returns {void}
   */
  #sorvegliaImmagini(radice) {
    for (const img of radice.querySelectorAll('img[data-carta]')) {
      seImmagineRotta(img, JSON.parse(img.dataset.carta), 'segnaposto-mini');
    }
  }

  /**
   * Una riga: l'etichetta del livello e le carte che ci stanno.
   * @param {{livello: number, oltre: number, voci: Array<object>}} gradino
   * @returns {string} HTML
   */
  #rigaGradino(gradino) {
    const stadio = gradino.stadio ?? gradino.livello;
    const etichetta = ETICHETTE[stadio] ?? `Livello ${stadio}`;
    const oltre =
      gradino.oltre > 0
        ? `<p class="oltre-linea">e altre ${gradino.oltre} evoluzioni non mostrate</p>`
        : '';
    return `
      <section class="gradino-linea">
        <h3 class="etichetta-gradino">${etichetta}</h3>
        <div class="carte-gradino">
          ${gradino.voci
            .map((_, posizione) => this.#carta(this.#registro.get(`${gradino.livello}|${posizione}`)))
            .join('')}
        </div>
        ${oltre}
      </section>
    `;
  }

  /**
   * Una carta della linea.
   *
   * Quattro stati e non due: la carta di partenza (quella su cui hai toccato il
   * pulsante), le altre che possiedi, quelle che ti mancano, e quelle che si
   * stanno ancora cercando nel catalogo. Senza il primo, in una linea di tre
   * Machop non si capirebbe più da dove si è partiti.
   *
   * Il contenuto sta dentro un `<button>`: una carta si tocca per ingrandirla,
   * come nella griglia. La carta ancora in attesa **non** è un pulsante — non
   * c'è niente da ingrandire — ed è per questo che il markup si biforca invece
   * di disabilitare il pulsante: un bersaglio disabilitato sotto il dito è una
   * promessa non mantenuta.
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
      voce.inCorso ? 'in-attesa' : posseduta ? 'posseduta' : 'assente',
      voce.corrente ? 'corrente' : '',
    ]
      .filter(Boolean)
      .join(' ');

    // La carta non trovata nel catalogo non è un errore da nascondere: il nome
    // c'è comunque, ed è quello che si va a cercare nella scatola.
    const immagine = c
      ? this.#htmlImmagine(c)
      : segnaposto({ nome: voce.nome }, 'segnaposto-mini');
    const stato = voce.inCorso
      ? '<span class="stato-linea cerco">cerco…</span>'
      : posseduta
        ? `<span class="stato-linea ce-lhai">ce l'hai ×${voce.quantita}</span>`
        : '<span class="stato-linea manca">non ce l\'hai</span>';

    const dentro = `
      <div class="mini-linea">${immagine}</div>
      <div class="nome-linea">${escapeHtml(c?.nome ?? voce.nome)}</div>
      ${voce.nomeSet ? `<div class="set-linea">${escapeHtml(voce.nomeSet)}${pastigliaLingua(voce)}</div>` : ''}`;

    return `
      <article class="${classi}" data-tipo="${escapeHtml(tipo)}"
               data-livello="${voce.livello ?? 0}" data-posizione="${voce.posizione ?? 0}">
        ${
          c
            ? `<button type="button" class="apri-linea"
                       title="Ingrandisci ${escapeHtml(c.nome)}">${dentro}</button>`
            : dentro
        }
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
    sbloccaScorrimento(CHIAVE_SCROLL);
  }
}

/**
 * La chiave del registro per una card a schermo.
 * @param {HTMLElement} el
 * @returns {string}
 */
function chiaveVoce(el) {
  return `${Number(el.dataset.livello)}|${Number(el.dataset.posizione)}`;
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
