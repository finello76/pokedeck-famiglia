/**
 * Web Component `<procedura-guidata>`: il wizard "Crea nuovi mazzi".
 *
 * Una domanda per schermata, come da specifica. Non è un vezzo: chi usa l'app
 * ha in mano un mazzo di carte fisiche e sta guardando il telefono, e un modulo
 * con sei campi insieme è ingestibile in quella posizione.
 *
 * Le domande sono **dati**, non markup: aggiungerne una significa aggiungere un
 * oggetto all'array, non scrivere HTML e gestori di eventi.
 *
 * @fires procedura-guidata#completata - detail: le risposte raccolte
 *
 * @module ui/procedura-guidata
 */

/**
 * Le domande, nell'ordine in cui vengono poste.
 *
 * `mostraSe` permette di saltare una domanda quando non ha senso: chiedere i
 * proxy Pokémon a chi non ha evoluzioni orfane sarebbe una schermata sprecata.
 */
const DOMANDE = [
  {
    chiave: 'difficolta',
    testo: 'Quanto deve essere semplice la partita?',
    aiuto: 'Determina quante carte ha ogni mazzo e quante regole vengono semplificate.',
    opzioni: [
      { valore: 'bambini', etichetta: 'Per bambini piccoli', dettaglio: '15 carte per mazzo, regole ridotte all\'osso', badge: '15' },
      { valore: 'facile', etichetta: 'Facile', dettaglio: '20 carte, si ignorano abilità e poteri', badge: '20' },
      { valore: 'intermedio', etichetta: 'Intermedio', dettaglio: '30 carte, quasi tutte le regole vere', badge: '30' },
      { valore: 'standard', etichetta: 'Standard', dettaglio: '60 carte, regole ufficiali', badge: '60' },
    ],
  },
  {
    chiave: 'numeroMazzi',
    testo: 'Quanti giocatori?',
    aiuto: 'Viene generato un mazzo per giocatore, tutti insieme, così sono equilibrati fra loro.',
    opzioni: [
      { valore: 2, etichetta: '2 giocatori', badge: '2' },
      { valore: 3, etichetta: '3 giocatori', badge: '3' },
      { valore: 4, etichetta: '4 giocatori', badge: '4' },
    ],
  },
  {
    chiave: 'proxyEnergia',
    testo: 'Vuoi stampare le Energie mancanti?',
    aiuto:
      'Se le Energie non bastano, il sistema può generarne di stampabili. ' +
      'Così si gioca con le regole vere invece di adattarle.',
    opzioni: [
      { valore: false, etichetta: 'No, adatta le regole', dettaglio: 'Ogni Energia varrà per qualsiasi tipo', badge: '✕' },
      { valore: true, etichetta: 'Sì, stampo le Energie', dettaglio: 'Foglio da ritagliare, misura reale', badge: '✓' },
    ],
  },
  {
    chiave: 'budgetProxy',
    testo: 'Quante carte puoi stampare per far evolvere i mazzi?',
    aiuto:
      'Le tue evoluzioni hanno bisogno della carta da cui evolvono, e quasi ' +
      'nessuna è in collezione. Più carte si stampano, più linee evolutive ' +
      'complete entrano nei mazzi: è la differenza fra giocare con i Livello 2 ' +
      'e giocare con soli Pokémon Base.',
    mostraSe: (contesto) => (contesto.orfani ?? 0) > 0,
    opzioni: [
      {
        valore: 0,
        etichetta: 'Nessuna',
        dettaglio: 'Solo carte vere: le evoluzioni si giocheranno come Base, con una regola della casa',
        badge: '0',
      },
      {
        valore: 4,
        etichetta: 'Poche',
        dettaglio: 'Fino a 4 carte per mazzo: una linea evolutiva completa',
        badge: '4',
      },
      {
        valore: 12,
        etichetta: 'Quante servono',
        dettaglio: 'Fino a 12 carte per mazzo: tre linee complete, mazzi che evolvono davvero',
        badge: '12',
      },
    ],
  },
];

export class ProceduraGuidata extends HTMLElement {
  /** @type {number} */
  #passo = 0;
  /** @type {Record<string, any>} */
  #risposte = {};
  /** @type {object} dati della collezione, per decidere quali domande porre */
  #contesto = {};

  /** @param {object} valore `{orfani, energie, carte}` */
  set contesto(valore) {
    this.#contesto = valore ?? {};
    this.#disegna();
  }

  connectedCallback() {
    this.#disegna();
    this.addEventListener('click', (evento) => {
      const bottone = evento.target.closest('[data-valore], [data-azione]');
      if (!bottone) return;

      if (bottone.dataset.azione === 'indietro') {
        this.#indietro();
        return;
      }
      if (bottone.dataset.azione === 'ricomincia') {
        this.#passo = 0;
        this.#risposte = {};
        this.#disegna();
        return;
      }
      this.#rispondi(JSON.parse(bottone.dataset.valore));
    });
  }

  /** Le domande effettivamente da porre, viste le condizioni. */
  get #attive() {
    return DOMANDE.filter((d) => !d.mostraSe || d.mostraSe(this.#contesto));
  }

  /** @param {any} valore */
  #rispondi(valore) {
    const domanda = this.#attive[this.#passo];
    this.#risposte[domanda.chiave] = valore;
    this.#passo += 1;

    if (this.#passo >= this.#attive.length) {
      this.dispatchEvent(
        new CustomEvent('completata', { bubbles: true, detail: { ...this.#risposte } }),
      );
      return;
    }
    this.#disegna();
  }

  #indietro() {
    if (this.#passo === 0) return;
    this.#passo -= 1;
    // La risposta si cancella: se si torna indietro è perché la si vuole
    // cambiare, e lasciarla selezionata confonderebbe.
    delete this.#risposte[this.#attive[this.#passo].chiave];
    this.#disegna();
  }

  /** Riporta il wizard alla prima domanda. */
  ricomincia() {
    this.#passo = 0;
    this.#risposte = {};
    this.#disegna();
  }

  #disegna() {
    const attive = this.#attive;
    const domanda = attive[this.#passo];
    if (!domanda) {
      this.innerHTML = '<p class="stato">Elaborazione…</p>';
      return;
    }

    const opzioni = domanda.opzioni
      .map(
        (o) => `
        <button type="button" class="opzione" data-valore='${JSON.stringify(o.valore)}'>
          <span class="badge">${o.badge ?? '›'}</span>
          <span class="testi">
            <span class="etichetta">${o.etichetta}</span>
            ${o.dettaglio ? `<span class="dettaglio">${o.dettaglio}</span>` : ''}
          </span>
          <span class="cerchio" aria-hidden="true"></span>
        </button>`,
      )
      .join('');

    // Un segmento per domanda, pieni fino a quella corrente: si vede quanto
    // manca senza leggere numeri.
    const segmenti = attive
      .map((d, i) => `<span class="segmento${i <= this.#passo ? ' fatto' : ''}"></span>`)
      .join('');

    this.innerHTML = `
      <div class="segmenti">${segmenti}</div>
      <div class="passo-di">Passo ${this.#passo + 1} di ${attive.length}</div>
      <h3>${domanda.testo}</h3>
      <p class="aiuto">${domanda.aiuto}</p>
      <div class="opzioni">${opzioni}</div>
      ${this.#passo > 0 ? '<button type="button" class="indietro" data-azione="indietro">← Torna indietro</button>' : ''}
    `;
  }
}

customElements.define('procedura-guidata', ProceduraGuidata);

/**
 * Traduce le risposte del wizard nelle opzioni del motore.
 *
 * Sta qui e non nel motore perché è una questione di presentazione: il motore
 * ragiona su taglie e permessi, il wizard su "per bambini piccoli".
 *
 * @param {object} risposte
 * @returns {object} opzioni per `pianifica()`
 */
export function opzioniDaRisposte(risposte) {
  const taglie = { bambini: 15, facile: 20, intermedio: 30, standard: 60 };
  return {
    taglia: taglie[risposte.difficolta] ?? 15,
    numeroMazzi: Number(risposte.numeroMazzi) || 2,
    semplificata: risposte.difficolta === 'bambini' || risposte.difficolta === 'facile',
    proxyEnergia: Boolean(risposte.proxyEnergia),
    // Il motore ragiona su due cose distinte — se stampare e quanto — ma
    // chiederle separatamente sarebbe una schermata in più per una domanda
    // sola: "nessuna carta" è semplicemente budget zero.
    proxyPokemon: Number(risposte.budgetProxy) > 0,
    budgetProxy: Number(risposte.budgetProxy) || 0,
  };
}
