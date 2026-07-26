/**
 * Web Component `<mazzo-generato>`: la lista di un mazzo, da leggere mentre si
 * pescano le carte dalla scatola.
 *
 * Non mostra le illustrazioni: è una **lista di lavoro**. Chi la usa ha le
 * carte fisiche davanti e cerca nomi e quantità, non figure. Le figure si
 * guardano nel carosello e nel catalogo.
 *
 * @fires mazzo-generato#carta-scelta - detail: `{carta, nomeSet}`, per il visore
 * @fires mazzo-generato#sostituzione-richiesta - detail: `{mazzo, indice}`,
 *   quando si preme ⇄ su una riga: chi ascolta propone le alternative
 *
 * @module ui/mazzo-generato
 */

/**
 * I tre gruppi, nell'ordine di lettura: prima cosa si gioca, poi con cosa lo si
 * alimenta.
 *
 * L'etichetta non è la categoria del dataset: "Allenatore" è il termine tecnico
 * delle carte, ma chi costruisce il mazzo in famiglia le chiama *carte
 * speciali*, e la scheda deve dire quello che dice chi la usa.
 */
const GRUPPI = [
  { categoria: 'Pokémon', etichetta: 'Pokémon' },
  { categoria: 'Energia', etichetta: 'Energie' },
  { categoria: 'Allenatore', etichetta: 'Carte speciali' },
];

/** Progressivo per rendere unici gli `id` delle schede fra più mazzi. */
let contatore = 0;

/**
 * La scheda aperta, condivisa da tutti i mazzi in pagina.
 *
 * Non è uno stato per istanza perché non sopravvivrebbe: ogni sostituzione fa
 * ridisegnare il piano intero, e i `<mazzo-generato>` vengono ricreati da capo
 * — chi stava sistemando le Energie si ritrovava sui Pokémon a ogni scambio.
 * Che sia condivisa fra i mazzi è anzi giusto: si lavora su una parte alla
 * volta, e la si vuole vedere in tutti.
 */
let apertoSu = GRUPPI[0].categoria;

export class MazzoGenerato extends HTMLElement {
  /** @type {object|null} */
  #mazzo = null;
  /** @type {Set<string>} nomi giocabili solo grazie a una regola della casa */
  #conDeroga = new Set();
  /**
   * Numero progressivo dell'istanza: gli `id` di scheda e pannello devono
   * essere unici in tutta la pagina, e di mazzi ce ne sono sempre almeno due.
   * @type {number}
   */
  #id = ++contatore;

  /** @param {object} valore */
  set mazzo(valore) {
    this.#mazzo = valore;
    this.#disegna();
  }

  /** @param {Set<string>|string[]} valore */
  set conDeroga(valore) {
    this.#conDeroga = new Set(valore ?? []);
    this.#disegna();
  }

  connectedCallback() {
    this.#disegna();
  }

  #disegna() {
    if (!this.#mazzo) return;
    const m = this.#mazzo;

    // Solo i gruppi che hanno carte: una scheda "Energie" vuota si aprirebbe
    // su niente, e sarebbe un tocco sprecato per scoprirlo.
    const presenti = GRUPPI.map((g) => ({
      ...g,
      carte: m.carte.filter((c) => (c.carta?.categoria ?? c.categoria) === g.categoria),
    })).filter((g) => g.carte.length);

    // Se questo mazzo non ha la parte aperta (capita: un mazzo senza Energie
    // vere), si ripiega sulla prima che ha — senza toccare la preferenza, che
    // vale per gli altri mazzi.
    const attiva = presenti.some((g) => g.categoria === apertoSu)
      ? apertoSu
      : (presenti[0]?.categoria ?? GRUPPI[0].categoria);

    const gruppi = presenti
      .map(({ categoria, etichetta, carte }) => {
        const righe = carte
          .map((c) => {
            const dati = c.carta ?? c;
            const deroga = this.#conDeroga.has(dati.nome);
            const proxy = Boolean(c.proxy);
            const classi = [deroga && 'deroga', proxy && 'proxy'].filter(Boolean).join(' ');
            // I proxy non si sostituiscono: non sono carte della collezione.
            const cambia = proxy
              ? ''
              : `<button type="button" class="cambia" data-indice="${m.carte.indexOf(c)}"
                         title="Sostituisci con un'altra carta della collezione"
                         aria-label="Sostituisci ${escapeHtml(dati.nome)}">⇄</button>`;
            return `
              <li${classi ? ` class="${classi}"` : ''}>
                <span class="quante">${c.quantita}×</span>
                <span class="nome">${escapeHtml(dati.nome)}</span>
                <span class="dettaglio">${escapeHtml(dati.stadio ?? '')}</span>
                ${proxy ? `<span class="marchio marchio-proxy" title="${escapeHtml(c.motivo ?? 'Carta stampata: non è nella collezione')}">da stampare</span>` : ''}
                ${deroga ? '<span class="marchio" title="Si gioca come Pokémon Base">come Base</span>' : ''}
                ${cambia}
              </li>`;
          })
          .join('');

        const totale = carte.reduce((s, c) => s + c.quantita, 0);
        const scelto = categoria === attiva;
        // Il titolo del gruppo resta nel markup ma è visibile solo in stampa:
        // sul foglio le schede non esistono e i gruppi vanno uno sotto l'altro,
        // ognuno col suo nome.
        return `
          <section class="gruppo" id="gruppo-${identificatore(categoria)}-${this.#id}"
                   role="tabpanel" aria-labelledby="scheda-${identificatore(categoria)}-${this.#id}"
                   ${scelto ? '' : 'hidden'}>
            <h4 class="solo-stampa">${escapeHtml(etichetta)} <span class="conteggio">${totale}</span></h4>
            <ul>${righe}</ul>
          </section>`;
      })
      .join('');

    this.innerHTML = `
      <article class="mazzo" data-tipo="${m.tipi?.[0] ?? 'Incolore'}">
        <header>
          <h3>${escapeHtml(m.nome)}</h3>
          <p class="sommario">
            ${m.totale} carte · tipo ${escapeHtml((m.tipi ?? []).join(' e ') || 'misto')}
          </p>
        </header>
        ${this.#htmlCarosello(m)}
        ${this.#htmlSchede(presenti, attiva)}
        ${gruppi}
      </article>
    `;

    this.#collegaCarosello();
    this.#collegaFrecce();
    this.#collegaSchede();

    for (const bottone of this.querySelectorAll('.cambia')) {
      bottone.addEventListener('click', () => {
        this.dispatchEvent(
          new CustomEvent('sostituzione-richiesta', {
            bubbles: true,
            detail: { mazzo: this.#mazzo, indice: Number(bottone.dataset.indice) },
          }),
        );
      });
    }
  }

  /** Ridisegna la lista con i dati correnti (dopo una sostituzione). */
  aggiorna() {
    this.#disegna();
  }

  /**
   * La barra delle schede.
   *
   * I mazzi da 30 e 60 carte facevano una lista lunga il triplo dello schermo:
   * per aggiungere un'Energia si scorreva oltre tutti i Pokémon. Tre schede
   * costano un tocco e tolgono lo scorrimento. Il conteggio sta sull'etichetta
   * perché è il numero che si controlla mentre si compone il mazzo, e chiederlo
   * costerebbe di nuovo un tocco.
   *
   * @param {Array<{categoria: string, etichetta: string, carte: object[]}>} presenti
   * @param {string} attiva categoria da mostrare aperta
   * @returns {string} HTML
   */
  #htmlSchede(presenti, attiva) {
    if (presenti.length < 2) return '';

    const schede = presenti
      .map(({ categoria, etichetta, carte }) => {
        const totale = carte.reduce((s, c) => s + c.quantita, 0);
        const scelto = categoria === attiva;
        return `
          <button type="button" role="tab" class="scheda${scelto ? ' attiva' : ''}"
                  id="scheda-${identificatore(categoria)}-${this.#id}"
                  aria-controls="gruppo-${identificatore(categoria)}-${this.#id}"
                  aria-selected="${scelto}" tabindex="${scelto ? 0 : -1}"
                  data-categoria="${escapeHtml(categoria)}">
            ${escapeHtml(etichetta)} <span class="conteggio">${totale}</span>
          </button>`;
      })
      .join('');

    return `<div class="schede no-stampa" role="tablist" aria-label="Parti del mazzo">${schede}</div>`;
  }

  /** Cambio di scheda: si mostra un pannello e si nascondono gli altri. */
  #collegaSchede() {
    const barra = this.querySelector('.schede');
    if (!barra) return;

    for (const scheda of barra.querySelectorAll('.scheda')) {
      scheda.addEventListener('click', () => {
        apertoSu = scheda.dataset.categoria;
        // Si aggiorna quel che cambia invece di ridisegnare tutto: un
        // `#disegna()` qui rifarebbe anche il carosello, che ricaricherebbe le
        // immagini e perderebbe la posizione dello scorrimento.
        for (const altra of barra.querySelectorAll('.scheda')) {
          const attiva = altra === scheda;
          altra.classList.toggle('attiva', attiva);
          altra.setAttribute('aria-selected', String(attiva));
          altra.tabIndex = attiva ? 0 : -1;
        }
        for (const pannello of this.querySelectorAll('.gruppo')) {
          pannello.hidden = pannello.getAttribute('aria-labelledby') !== scheda.id;
        }
      });
    }
  }

  /**
   * Striscia di illustrazioni scorrevole in orizzontale.
   *
   * La lista testuale serve a pescare le carte dalla scatola; il carosello
   * serve a **vedere** che mazzo è venuto fuori, che è una domanda diversa.
   * Non si stampa: su carta le immagini piccole non aiutano e consumano
   * inchiostro.
   *
   * @param {object} m
   * @returns {string}
   */
  #htmlCarosello(m) {
    // I proxy compaiono anche senza illustrazione: nel carosello si deve
    // vedere il mazzo INTERO, comprese le carte che andranno stampate.
    const daMostrare = m.carte.filter((c) => (c.carta ?? c).immagine || c.proxy);
    if (!daMostrare.length) return '';

    const figure = daMostrare
      .map((c) => {
        const dati = c.carta ?? c;
        const deroga = this.#conDeroga.has(dati.nome);
        const proxy = Boolean(c.proxy);

        if (!dati.immagine) {
          // Proxy senza scansione (le Energie generiche): un riquadro col
          // colore del tipo al posto della foto. Non è un pulsante: non c'è
          // niente da ingrandire.
          return `
            <span class="miniatura segnaposto-mini proxy" role="listitem"
                  data-tipo="${escapeHtml(dati.tipi?.[0] ?? 'Incolore')}"
                  title="${escapeHtml(c.motivo ?? dati.nome)}">
              <span class="nome-mini">${escapeHtml(dati.nome)}</span>
              ${c.quantita > 1 ? `<span class="quante-mini">×${c.quantita}</span>` : ''}
            </span>`;
        }

        const classi = ['miniatura', deroga && 'deroga', proxy && 'proxy']
          .filter(Boolean)
          .join(' ');
        return `
          <button type="button" class="${classi}"
                  data-nome="${escapeHtml(dati.nome)}"
                  title="${escapeHtml(dati.nome)}${proxy ? ' (da stampare)' : ''}">
            <img src="${dati.immagine}/low.webp" alt="${escapeHtml(dati.nome)}" loading="lazy" />
            ${c.quantita > 1 ? `<span class="quante-mini">×${c.quantita}</span>` : ''}
          </button>`;
      })
      .join('');

    // Le frecce affiancano la striscia: su PC non c'è lo swipe col dito, e
    // anche su telefono aiutano a capire che la striscia continua.
    return `
      <div class="zona-carosello no-stampa">
        <button type="button" class="freccia" data-direzione="-1" aria-label="Carte precedenti">‹</button>
        <div class="carosello" role="list">${figure}</div>
        <button type="button" class="freccia" data-direzione="1" aria-label="Carte successive">›</button>
      </div>`;
  }

  /** Collega frecce e stato ai bordi del carosello. */
  #collegaFrecce() {
    const zona = this.querySelector('.zona-carosello');
    if (!zona) return;
    const striscia = zona.querySelector('.carosello');

    const aggiorna = () => {
      // Un margine di 1px assorbe gli arrotondamenti dei subpixel.
      const massimo = striscia.scrollWidth - striscia.clientWidth - 1;
      const serve = massimo > 1;
      for (const freccia of zona.querySelectorAll('.freccia')) {
        freccia.hidden = !serve;
        const direzione = Number(freccia.dataset.direzione);
        freccia.disabled =
          direzione < 0 ? striscia.scrollLeft <= 0 : striscia.scrollLeft >= massimo;
      }
    };

    for (const freccia of zona.querySelectorAll('.freccia')) {
      freccia.addEventListener('click', () => {
        // La fluidità la decide il CSS (scroll-behavior), non il JS: così vale
        // anche `prefers-reduced-motion` di chi non vuole animazioni.
        striscia.scrollBy({ left: Number(freccia.dataset.direzione) * striscia.clientWidth * 0.8 });
        // Di norma ci pensa l'evento scroll; il ritardo copre gli ambienti che
        // non lo emettono per gli scorrimenti programmati, a fine animazione.
        setTimeout(aggiorna, 400);
      });
    }
    striscia.addEventListener('scroll', aggiorna, { passive: true });

    // Al primo giro le immagini non hanno ancora una larghezza: si riaggiorna
    // quando arrivano e quando cambia lo spazio disponibile.
    for (const img of striscia.querySelectorAll('img')) {
      img.addEventListener('load', aggiorna, { once: true });
    }
    new ResizeObserver(aggiorna).observe(striscia);
    aggiorna();
  }

  /** Il click su una miniatura chiede di ingrandire, come nel catalogo. */
  #collegaCarosello() {
    for (const bottone of this.querySelectorAll('.miniatura')) {
      bottone.addEventListener('click', () => {
        const voce = this.#mazzo.carte.find(
          (c) => (c.carta ?? c).nome === bottone.dataset.nome,
        );
        if (!voce) return;
        // Si passa l'intero mazzo come elenco scorribile: così dal visore si
        // sfoglia carta per carta senza chiuderlo e ricliccare.
        const lista = this.#mazzo.carte.map((c) => ({ carta: c.carta ?? c, nomeSet: '' }));
        const indice = this.#mazzo.carte.indexOf(voce);
        this.dispatchEvent(
          new CustomEvent('carta-scelta', {
            bubbles: true,
            composed: true,
            detail: { carta: voce.carta ?? voce, nomeSet: '', lista, indice: Math.max(indice, 0) },
          }),
        );
      });
    }
  }
}

/**
 * Una categoria ridotta a pezzo di `id` HTML: senza accenti né maiuscole.
 * @param {string} categoria
 * @returns {string}
 * @example
 * identificatore('Pokémon'); // → 'pokemon'
 */
function identificatore(categoria) {
  return categoria
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
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

customElements.define('mazzo-generato', MazzoGenerato);
