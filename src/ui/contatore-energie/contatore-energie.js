/**
 * Web Component `<contatore-energie>`: quante energie base ci sono, per tipo,
 * con i comandi per aggiungerne e toglierne.
 *
 * Non è una statistica decorativa: è il dato da cui dipende metà del motore di
 * generazione (v2). Le proporzioni del mazzo, la scelta del tipo e l'eventuale
 * attivazione delle regole della casa compensative partono da qui — perciò da
 * qui le si conta e le si modifica, senza un modulo a parte.
 *
 * Disegna in **DOM normale, non Shadow DOM**: così i colori dei tipi (`tipi.css`)
 * tingono le pastiglie, cosa che nello Shadow DOM non accadrebbe. Lo stile sta
 * in `contatore-energie.css`, incluso da index.html.
 *
 * @fires contatore-energie#energia-cambiata - detail: `{ tipo, delta }`
 *
 * @example
 * const c = document.createElement('contatore-energie');
 * c.dati = { perTipo: { Fuoco: 8 }, totaleBase: 8, totaleSpeciali: 0, senzaTipo: 0 };
 *
 * @module ui/contatore-energie
 */

/**
 * I tipi con un'energia base nel gioco. Si mostrano tutti, anche a zero, così
 * si può aggiungerne uno che ancora non hai senza un menu a tendina a parte.
 */
const TIPI_BASE = [
  'Erba',
  'Fuoco',
  'Acqua',
  'Lampo',
  'Psico',
  'Lotta',
  'Oscurità',
  'Metallo',
  'Fata',
  'Drago',
];

export class ContatoreEnergie extends HTMLElement {
  /** @type {object|null} */
  #dati = null;

  /** @param {object|null} valore risultato di `conteggioEnergie()` */
  set dati(valore) {
    this.#dati = valore;
    this.#disegna();
  }

  connectedCallback() {
    this.#disegna();
    this.addEventListener('click', (evento) => {
      const bottone = evento.target.closest('[data-energia]');
      if (!bottone) return;
      this.dispatchEvent(
        new CustomEvent('energia-cambiata', {
          bubbles: true,
          detail: { tipo: bottone.dataset.tipo, delta: Number(bottone.dataset.energia) },
        }),
      );
    });
  }

  #disegna() {
    const perTipo = this.#dati?.perTipo ?? {};
    const totaleBase = this.#dati?.totaleBase ?? 0;
    const totaleSpeciali = this.#dati?.totaleSpeciali ?? 0;
    const senzaTipo = this.#dati?.senzaTipo ?? 0;
    const attivi = TIPI_BASE.filter((t) => (perTipo[t] ?? 0) > 0).length;

    const chips = TIPI_BASE.map((tipo) => {
      const n = perTipo[tipo] ?? 0;
      return `
        <div class="energia${n ? '' : ' vuota'}" data-tipo="${tipo}">
          <span class="nome">${tipo}</span>
          <div class="controlli">
            <button type="button" data-energia="-1" data-tipo="${tipo}"
                    aria-label="Una ${tipo} in meno"${n ? '' : ' disabled'}>−</button>
            <span class="num">${n}</span>
            <button type="button" data-energia="1" data-tipo="${tipo}"
                    aria-label="Una ${tipo} in più">+</button>
          </div>
        </div>`;
    }).join('');

    const note = [];
    if (totaleSpeciali) {
      note.push(`${totaleSpeciali} energia/e speciale/i (senza tipo elementale)`);
    }
    if (senzaTipo) {
      note.push(`<strong>${senzaTipo} energia/e base di tipo non riconosciuto</strong>`);
    }

    this.innerHTML = `
      <div class="intestazione-energie">
        <span class="titolo-energie">Energie base</span>
        <span class="totale-energie">${totaleBase} · ${attivi} ${attivi === 1 ? 'tipo' : 'tipi'}</span>
      </div>
      <div class="chips-energie">${chips}</div>
      ${note.length ? `<p class="nota-energie">${note.join(' · ')}</p>` : ''}
    `;
  }
}

customElements.define('contatore-energie', ContatoreEnergie);
