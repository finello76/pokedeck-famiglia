/**
 * Web Component `<griglia-collezione>`: la collezione divisa per serie, coi filtri.
 *
 * Riceve le voci già pronte e non tocca il database: filtra, raggruppa e
 * disegna. Quando l'utente cambia una quantità emette un evento e sta a chi lo
 * ascolta decidere cosa farne. È la stessa separazione di un componente Angular
 * "dumb" con `@Input` ed `@Output`.
 *
 * Le carte sono divise per **serie** (Sole e Luna, Scarlatto e Violetto…) e poi
 * per set, perché è così che sono organizzati i raccoglitori veri. Ogni set
 * porta con sé quante ne hai su quante ne esistono, e a richiesta mostra anche
 * quelle che ti mancano: senza il confronto con la collezione di riferimento,
 * "ho 12 carte" non dice niente.
 *
 * @fires griglia-collezione#quantita-cambiata - detail: `{ idSet, numero, delta }`
 *
 * @example
 * const g = document.createElement('griglia-collezione');
 * g.caricaMancanti = (idSet) => carteMancanti(idSet, voci);
 * g.voci = await elencoCompleto();
 *
 * @module ui/griglia-collezione
 */

import '../scheda-carta/scheda-carta.js';
import { FILTRI_VUOTI, filtra, raggruppa, valoriDisponibili } from './raggruppa.js';

export class GrigliaCollezione extends HTMLElement {
  /** @type {Array<object>} */
  #voci = [];
  /** @type {typeof FILTRI_VUOTI} */
  #filtri = { ...FILTRI_VUOTI };
  /** @type {boolean} se mostrare anche le carte che mancano a ogni set */
  #mostraMancanti = false;

  /**
   * Come procurarsi le carte mancanti di un set.
   *
   * La inietta chi usa il componente: la griglia non conosce il dataset, e non
   * deve — è l'unico motivo per cui si può provare senza rete né database.
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
    // Niente Shadow DOM qui, a differenza di <scheda-carta>: questo componente
    // ospita altri componenti e vuole ereditare gli stili di pagina. Lo Shadow
    // DOM serve quando c'è dello stile da proteggere, non per abitudine.
    this.#disegna();

    this.addEventListener('input', (evento) => {
      const campo = evento.target.dataset?.filtro;
      if (!campo) return;
      this.#filtri[campo] = evento.target.value;
      // Cambiando serie il set scelto quasi certamente non le appartiene più.
      if (campo === 'serie') this.#filtri.set = '';
      this.#disegna();
    });

    this.addEventListener('change', (evento) => {
      if (evento.target.id !== 'mostra-mancanti') return;
      this.#mostraMancanti = evento.target.checked;
      this.#disegnaRisultati();
    });

    this.addEventListener('click', (evento) => {
      const bottone = evento.target.closest('[data-azione]');
      if (!bottone) return;

      if (bottone.dataset.azione === 'azzera-filtri') {
        this.#filtri = { ...FILTRI_VUOTI };
        this.#disegna();
        return;
      }

      this.dispatchEvent(
        new CustomEvent('quantita-cambiata', {
          bubbles: true,
          detail: {
            idSet: bottone.dataset.set,
            numero: bottone.dataset.numero,
            delta: Number(bottone.dataset.azione),
          },
        }),
      );
    });
  }

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
        .map((v) => `<option value="${v}"${v === selezionato ? ' selected' : ''}>${escapeHtml(v)}</option>`)
        .join('');

    // I set del menu si restringono alla serie scelta: elencarli tutti
    // significherebbe proporre set di serie che non stai guardando.
    const setVisibili = this.#filtri.serie
      ? set.filter((s) =>
          this.#voci.some((v) => v.idSet === s.id && v.serie?.id === this.#filtri.serie),
        )
      : set;

    this.innerHTML = `
      <div class="filtri">
        <div>
          <label for="filtro-testo">Nome</label>
          <input id="filtro-testo" data-filtro="testo" value="${escapeHtml(this.#filtri.testo)}"
                 placeholder="cerca…" />
        </div>
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
          <label for="filtro-tipo">Tipo</label>
          <select id="filtro-tipo" data-filtro="tipo">
            <option value="">tutti</option>${opzioniSemplici(tipi, this.#filtri.tipo)}
          </select>
        </div>
        <div>
          <label for="filtro-stadio">Stadio</label>
          <select id="filtro-stadio" data-filtro="stadio">
            <option value="">tutti</option>${opzioniSemplici(stadi, this.#filtri.stadio)}
          </select>
        </div>
      </div>
      <label class="interruttore">
        <input type="checkbox" id="mostra-mancanti" ${this.#mostraMancanti ? 'checked' : ''} />
        <span>Mostra anche le carte che mi mancano</span>
      </label>
      <p class="riepilogo"></p>
      <div class="serie-collezione"></div>
    `;
    this.#disegnaRisultati();
  }

  /** Ridisegna solo l'elenco: i filtri restano come sono, senza perdere il focus. */
  #disegnaRisultati() {
    const contenitore = this.querySelector('.serie-collezione');
    const riepilogo = this.querySelector('.riepilogo');
    if (!contenitore) return;

    const voci = filtra(this.#voci, this.#filtri);
    const gruppi = raggruppa(voci);
    const copie = voci.reduce((s, v) => s + v.quantita, 0);
    const filtriAttivi = Object.values(this.#filtri).some(Boolean);

    riepilogo.innerHTML =
      this.#voci.length === 0
        ? 'La collezione è vuota: aggiungi la prima carta qui sopra.'
        : `${voci.length} carte diverse, ${copie} copie, in ${gruppi.length} serie` +
          (filtriAttivi
            ? ' <button type="button" data-azione="azzera-filtri" class="collegamento">azzera filtri</button>'
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
    sezione.innerHTML = `
      <h3 class="titolo-serie">
        ${escapeHtml(gruppo.nome)}
        <span class="conteggio">${gruppo.distinte} carte · ${gruppo.set.length} set</span>
      </h3>
    `;
    sezione.append(...gruppo.set.map((set) => this.#disegnaSet(set)));
    return sezione;
  }

  /**
   * Un set: intestazione col completamento, poi le carte.
   * @param {import('./raggruppa.js').GruppoSet} set
   * @returns {HTMLElement}
   */
  #disegnaSet(set) {
    const sezione = document.createElement('section');
    sezione.className = 'set-collezione';

    sezione.innerHTML = `
      <header class="testa-set">
        <strong>${escapeHtml(set.nomeSet)}</strong>
        ${completamentoDi(set)}
      </header>
      <div class="griglia"></div>
    `;

    const griglia = sezione.querySelector('.griglia');
    griglia.replaceChildren(...set.voci.map((voce) => this.#cella(voce)));

    // Le mancanti si possono elencare solo dove i dati ci sono davvero.
    if (this.#mostraMancanti && confrontabile(set)) this.#aggiungiMancanti(griglia, set);
    return sezione;
  }

  /**
   * Aggiunge in coda le carte del set che non possiedi.
   *
   * Il caricamento è asincrono e non blocca il resto: le tue carte si vedono
   * subito, le mancanti compaiono quando il file del set è arrivato.
   *
   * @param {HTMLElement} griglia
   * @param {import('./raggruppa.js').GruppoSet} set
   */
  #aggiungiMancanti(griglia, set) {
    this.caricaMancanti(set.idSet)
      .then((mancanti) => {
        // Nel frattempo l'utente può aver cambiato filtro: se la griglia non è
        // più nel documento, il risultato non serve più a nessuno.
        if (!griglia.isConnected) return;
        griglia.append(
          ...mancanti.map((carta) =>
            this.#cella(
              { idSet: set.idSet, numero: carta.numero, quantita: 0, carta, nomeSet: set.nomeSet },
              true,
            ),
          ),
        );
      })
      .catch(() => {
        // Set non leggibile (offline, mai scaricato): meglio non dire niente
        // che riempire la griglia di errori. Le carte possedute restano.
      });
  }

  /**
   * Una cella della griglia.
   * @param {object} voce
   * @param {boolean} [mancante] se è una carta che non possiedi
   * @returns {HTMLElement}
   */
  #cella(voce, mancante = false) {
    const cella = document.createElement('div');
    cella.className = mancante ? 'cella mancante-in-set' : 'cella';

    if (!voce.carta) {
      cella.innerHTML = `
        <p class="mancante">
          <strong>${escapeHtml(voce.idSet)} n. ${escapeHtml(voce.numero)}</strong><br />
          Set non più disponibile: riscarica i dati per rivederne la carta.
        </p>`;
    } else {
      const scheda = document.createElement('scheda-carta');
      scheda.nomeSet = voce.nomeSet;
      scheda.quantita = voce.quantita;
      scheda.carta = voce.carta;
      cella.append(scheda);
    }

    const comandi = document.createElement('div');
    comandi.className = 'comandi';
    // Su una carta che non hai il "−" non ha senso: si può solo aggiungerla.
    comandi.innerHTML = `
      ${
        mancante
          ? ''
          : `<button type="button" data-azione="-1" data-set="${voce.idSet}"
                     data-numero="${voce.numero}" aria-label="Togli una copia">−</button>`
      }
      <button type="button" data-azione="1" data-set="${voce.idSet}"
              data-numero="${voce.numero}"
              aria-label="${mancante ? 'Aggiungi alla collezione' : 'Aggiungi una copia'}">+</button>
    `;
    cella.append(comandi);
    return cella;
  }
}

/**
 * Se di questo set sappiamo abbastanza da parlare di completamento.
 *
 * @param {import('./raggruppa.js').GruppoSet} set
 * @returns {boolean}
 */
function confrontabile(set) {
  return Boolean(set.totale) && set.ufficiali !== 0;
}

/**
 * Il completamento di un set, detto onestamente.
 *
 * Tre casi, tre messaggi diversi. Un solo messaggio per tutti mentirebbe in due
 * casi su tre: i set promo non hanno una numerazione da completare, e quelli
 * con dati parziali mostrerebbero come "mancanti" carte che non esistono nei
 * file — irraggiungibili per sempre, senza che si capisca perché.
 *
 * @param {import('./raggruppa.js').GruppoSet} set
 * @returns {string} HTML
 */
function completamentoDi(set) {
  if (!confrontabile(set)) {
    return `<span class="completamento">${set.distinte} carte</span>`;
  }

  const parziale = set.ufficiali !== null && set.ufficiali < set.totale;
  return `
    <span class="completamento">${set.distinte}<span class="su">/${set.totale}</span></span>
    <progress max="${set.totale}" value="${set.distinte}"></progress>
    ${
      parziale
        ? `<span class="dati-parziali" title="Di questo set conosciamo solo ${set.ufficiali} carte su ${set.totale}: le altre non sono nei dati italiani di TCGdex.">dati parziali</span>`
        : ''
    }
  `;
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
