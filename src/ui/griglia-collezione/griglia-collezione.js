/**
 * Web Component `<griglia-collezione>`: mostra la collezione con i filtri.
 *
 * Riceve le voci già pronte e non tocca il database: filtra e disegna. Quando
 * l'utente cambia una quantità emette un evento e sta a chi lo ascolta
 * decidere cosa farne. È la stessa separazione di un componente Angular
 * "dumb" con `@Input` ed `@Output`.
 *
 * @fires griglia-collezione#quantita-cambiata - detail: `{ idSet, numero, delta }`
 *
 * @example
 * const g = document.createElement('griglia-collezione');
 * g.voci = await elencoCompleto();
 * g.addEventListener('quantita-cambiata', (e) => console.log(e.detail));
 *
 * @module ui/griglia-collezione
 */

import '../scheda-carta/scheda-carta.js';

/** Filtri correnti; `''` significa "tutti". */
const FILTRI_VUOTI = { categoria: '', tipo: '', stadio: '', testo: '' };

export class GrigliaCollezione extends HTMLElement {
  /** @type {Array<object>} */
  #voci = [];
  /** @type {{categoria: string, tipo: string, stadio: string, testo: string}} */
  #filtri = { ...FILTRI_VUOTI };

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

  /** Valori distinti presenti nella collezione, per riempire i menu a tendina. */
  #valoriDisponibili() {
    const categorie = new Set();
    const tipi = new Set();
    const stadi = new Set();
    for (const { carta } of this.#voci) {
      if (!carta) continue;
      categorie.add(carta.categoria);
      for (const t of carta.tipi ?? []) tipi.add(t);
      if (carta.stadio) stadi.add(carta.stadio);
    }
    return {
      categorie: [...categorie].sort(),
      tipi: [...tipi].sort(),
      // Alfabetico va bene: "Base" < "Livello 1" < "Livello 2" coincide con
      // l'ordine di gioco. Se comparissero altri stadi (MEGA, VMAX) servirebbe
      // un ordinamento esplicito.
      stadi: [...stadi].sort(),
    };
  }

  /** Applica i filtri correnti. */
  #filtrate() {
    const { categoria, tipo, stadio, testo } = this.#filtri;
    const ago = testo.trim().toLowerCase();

    return this.#voci.filter(({ carta }) => {
      if (!carta) return !categoria && !tipo && !stadio && !ago;
      if (categoria && carta.categoria !== categoria) return false;
      if (tipo && !(carta.tipi ?? []).includes(tipo)) return false;
      if (stadio && carta.stadio !== stadio) return false;
      if (ago && !carta.nome.toLowerCase().includes(ago)) return false;
      return true;
    });
  }

  #disegna() {
    const { categorie, tipi, stadi } = this.#valoriDisponibili();
    const opzioni = (valori, selezionato) =>
      valori.map((v) => `<option value="${v}"${v === selezionato ? ' selected' : ''}>${v}</option>`).join('');

    this.innerHTML = `
      <div class="filtri">
        <div>
          <label for="filtro-testo">Nome</label>
          <input id="filtro-testo" data-filtro="testo" value="${this.#filtri.testo}"
                 placeholder="cerca…" />
        </div>
        <div>
          <label for="filtro-categoria">Tipo di carta</label>
          <select id="filtro-categoria" data-filtro="categoria">
            <option value="">tutte</option>${opzioni(categorie, this.#filtri.categoria)}
          </select>
        </div>
        <div>
          <label for="filtro-tipo">Tipo</label>
          <select id="filtro-tipo" data-filtro="tipo">
            <option value="">tutti</option>${opzioni(tipi, this.#filtri.tipo)}
          </select>
        </div>
        <div>
          <label for="filtro-stadio">Stadio</label>
          <select id="filtro-stadio" data-filtro="stadio">
            <option value="">tutti</option>${opzioni(stadi, this.#filtri.stadio)}
          </select>
        </div>
      </div>
      <p class="riepilogo"></p>
      <div class="griglia"></div>
    `;
    this.#disegnaRisultati();
  }

  /** Ridisegna solo l'elenco: i filtri restano come sono, senza perdere il focus. */
  #disegnaRisultati() {
    const griglia = this.querySelector('.griglia');
    const riepilogo = this.querySelector('.riepilogo');
    if (!griglia) return;

    const voci = this.#filtrate();
    const copie = voci.reduce((s, v) => s + v.quantita, 0);
    const filtriAttivi = Object.values(this.#filtri).some(Boolean);

    riepilogo.innerHTML =
      this.#voci.length === 0
        ? 'La collezione è vuota: aggiungi la prima carta qui sopra.'
        : `${voci.length} carte diverse, ${copie} copie in totale` +
          (filtriAttivi ? ' <button type="button" data-azione="azzera-filtri" class="collegamento">azzera filtri</button>' : '');

    griglia.replaceChildren(
      ...voci.map((voce) => {
        const cella = document.createElement('div');
        cella.className = 'cella';

        if (!voce.carta) {
          cella.innerHTML = `
            <p class="mancante">
              <strong>${voce.idSet} n. ${voce.numero}</strong><br />
              Set non più disponibile: aggiungilo a tools/set-posseduti.json
              per rivederne i dati.
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
        comandi.innerHTML = `
          <button type="button" data-azione="-1" data-set="${voce.idSet}"
                  data-numero="${voce.numero}" aria-label="Togli una copia">−</button>
          <button type="button" data-azione="1" data-set="${voce.idSet}"
                  data-numero="${voce.numero}" aria-label="Aggiungi una copia">+</button>
        `;
        cella.append(comandi);
        return cella;
      }),
    );
  }
}

customElements.define('griglia-collezione', GrigliaCollezione);
