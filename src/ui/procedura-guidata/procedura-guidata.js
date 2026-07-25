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
    testo: 'Quanti mazzi servono?',
    aiuto:
      'Uno per giocatore: vengono generati tutti insieme, così sono equilibrati ' +
      'fra loro. Se chi gioca con te ha già il suo mazzo, ne basta uno.',
    opzioni: [
      {
        valore: 1,
        etichetta: 'Un mazzo solo',
        dettaglio: 'Per giocare contro chi ha già un mazzo suo',
        badge: '1',
      },
      { valore: 2, etichetta: '2 mazzi', dettaglio: 'Due giocatori', badge: '2' },
      { valore: 3, etichetta: '3 mazzi', dettaglio: 'Tre giocatori', badge: '3' },
      { valore: 4, etichetta: '4 mazzi', dettaglio: 'Quattro giocatori', badge: '4' },
    ],
  },
  {
    chiave: 'riferimento',
    testo: 'Contro quale mazzo si gioca?',
    aiuto:
      'Se chi gioca con te usa un mazzo già pronto, i mazzi generati possono ' +
      'essere costruiti su misura per reggerlo. Senza un termine di paragone ' +
      'vengono come vengono, e possono risultare molto più forti.',
    // Senza catalogo la domanda non ha risposte: sarebbe una schermata con un
    // pulsante solo.
    mostraSe: (contesto) => (contesto.prefatti?.length ?? 0) > 0,
    opzioni: (contesto) => [
      {
        valore: 'nessuno',
        etichetta: 'Nessuno in particolare',
        dettaglio: 'I mazzi vengono equilibrati solo fra loro, come prima',
        badge: '·',
      },
      ...(contesto.prefatti ?? []).map((m) => ({
        valore: m.id,
        etichetta: m.nome,
        dettaglio: `${m.taglia} carte · forza ${m.forza}`,
        badge: String(m.forza),
      })),
    ],
  },
  {
    chiave: 'bersaglio',
    testo: 'Che partita vuoi?',
    aiuto:
      'I mazzi verranno rigenerati finché non valgono quanto hai chiesto. ' +
      'Non sempre ci si riesce: dipende da cosa c\'è in collezione.',
    // Dipende dalla risposta precedente, non dalla collezione: senza un mazzo
    // di riferimento non c'è nessun "alla pari" rispetto a cosa.
    mostraSe: (contesto, risposte) => risposte?.riferimento && risposte.riferimento !== 'nessuno',
    opzioni: [
      {
        valore: 'pari',
        etichetta: 'Alla pari',
        dettaglio: 'Stessa forza: vince chi gioca meglio, non chi ha il mazzo migliore',
        badge: '=',
      },
      {
        valore: 'sotto',
        etichetta: 'Un po\' più debole',
        dettaglio: 'Per dare un vantaggio a chi sta imparando',
        badge: '−',
      },
      {
        valore: 'sopra',
        etichetta: 'Un po\' più forte',
        dettaglio: 'Per una sfida, o se chi gioca col mazzo pronto è più esperto',
        badge: '+',
      },
    ],
  },
  {
    chiave: 'setEsclusi',
    // L'unica domanda a scelta multipla: le altre si toccano e si va avanti,
    // questa ha bisogno di un "Continua" perché non rispondere (nessun set
    // escluso) è la risposta più comune, e va potuta dare esplicitamente.
    tipo: 'multi',
    testo: 'Ci sono set da lasciare fuori?',
    aiuto:
      'Le carte dei set che spunti non entreranno in nessun mazzo. Serve quando ' +
      'quelle carte sono già impegnate: se tuo figlio gioca col suo Kit Allenatore, ' +
      'quelle carte non le hai a disposizione.',
    // Con un set solo in collezione non c'è niente da escludere: sarebbe una
    // schermata per dire "togli tutto".
    mostraSe: (contesto) => (contesto.set?.length ?? 0) > 1,
    opzioni: (contesto) =>
      (contesto.set ?? []).map((s) => ({
        valore: s.id,
        etichetta: s.nome,
        dettaglio: `${s.carte} cart${s.carte === 1 ? 'a' : 'e'} in collezione`,
        badge: s.anno ?? '·',
      })),
  },
  {
    chiave: 'usaDesideri',
    testo: 'Uso anche le carte che desideri?',
    aiuto:
      'Le carte della lista desideri non ce le hai: i mazzi che le usano non ' +
      'si possono costruire davvero. Servono a vedere quanto migliorerebbero ' +
      'giocando, cioè se valga la pena comprarle.',
    mostraSe: (contesto) => (contesto.desideri ?? 0) > 0,
    opzioni: [
      {
        valore: false,
        etichetta: 'No, solo le carte che ho',
        dettaglio: 'Il mazzo si costruisce davvero, prendendo le carte dalla scatola',
        badge: '✓',
      },
      {
        valore: true,
        etichetta: 'Sì, anche i desideri',
        dettaglio: 'Per vedere che mazzo verrebbe fuori comprandole',
        badge: '★',
      },
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
      // Domanda a scelta multipla: il tocco accende o spegne una casella e la
      // schermata resta dov'è. Si va avanti solo con "Continua".
      if (bottone.dataset.azione === 'segno') {
        bottone.classList.toggle('scelta');
        bottone.setAttribute('aria-pressed', String(bottone.classList.contains('scelta')));
        this.#aggiornaContinua();
        return;
      }
      if (bottone.dataset.azione === 'continua') {
        this.#rispondi(
          [...this.querySelectorAll('.opzione.scelta')].map((b) => JSON.parse(b.dataset.valore)),
        );
        return;
      }
      this.#rispondi(JSON.parse(bottone.dataset.valore));
    });
  }

  /** Il pulsante "Continua" dice quante caselle sono accese, o che non lo è nessuna. */
  #aggiornaContinua() {
    const bottone = this.querySelector('[data-azione="continua"]');
    if (!bottone) return;
    const quanti = this.querySelectorAll('.opzione.scelta').length;
    bottone.textContent = quanti
      ? `Continua senza ${quanti} set`
      : 'Continua con tutti i set';
  }

  /**
   * Le domande effettivamente da porre, viste le condizioni.
   *
   * `mostraSe` riceve anche le risposte già date, non solo la collezione: la
   * domanda sul bersaglio esiste solo se prima si è scelto un mazzo di
   * riferimento, e questo non si può sapere guardando la collezione.
   *
   * L'elenco si ricalcola a ogni accesso, quindi una risposta può far comparire
   * o sparire una domanda successiva mentre si procede. Va bene perché le
   * condizioni guardano solo **all'indietro**: una domanda non può dipendere da
   * una risposta che non è ancora stata data, quindi il numero di passi già
   * fatti non cambia mai sotto i piedi.
   */
  get #attive() {
    return DOMANDE.filter((d) => !d.mostraSe || d.mostraSe(this.#contesto, this.#risposte));
  }

  /** @param {any} valore */
  #rispondi(valore) {
    const domanda = this.#attive[this.#passo];
    // Nessuna domanda in corso: si è già risposto a tutte e i mazzi si stanno
    // generando. Capita davvero, perché la generazione non è istantanea e chi
    // non vede cambiare nulla ripreme — prima questo secondo tocco faceva
    // esplodere il wizard invece di essere ignorato.
    if (!domanda) return;

    this.#risposte[domanda.chiave] = valore;
    this.#passo += 1;

    if (this.#passo >= this.#attive.length) {
      // Si ridisegna PRIMA di annunciare: la schermata deve dire subito che sta
      // lavorando, altrimenti resta l'ultima domanda a schermo — con le sue
      // opzioni ancora toccabili — per tutto il tempo della generazione.
      this.#disegna();
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

    const multipla = domanda.tipo === 'multi';
    // Le opzioni possono essere una funzione: quelle dei set dipendono da cosa
    // c'è in collezione, e non si possono scrivere nell'elenco delle domande.
    const elencoOpzioni =
      typeof domanda.opzioni === 'function' ? domanda.opzioni(this.#contesto) : domanda.opzioni;

    const opzioni = elencoOpzioni
      .map(
        (o) => `
        <button type="button" class="opzione${multipla ? ' multipla' : ''}"
                ${multipla ? 'data-azione="segno" aria-pressed="false"' : ''}
                data-valore='${JSON.stringify(o.valore)}'>
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
      ${multipla ? '<button type="button" class="continua" data-azione="continua">Continua con tutti i set</button>' : ''}
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
    // Non è un'opzione del motore: le carte escluse non gli arrivano proprio,
    // le toglie chi legge la collezione. Viaggia qui perché finisca nel piano
    // salvato — riaprendolo, deve essere leggibile con quali carte è nato.
    setEsclusi: Array.isArray(risposte.setEsclusi) ? risposte.setEsclusi : [],
    // Le carte desiderate non le possiedi: entrano nel motore solo se lo hai
    // chiesto, e il piano salvato deve ricordarlo o riaprendolo sembrerebbe
    // costruibile con la scatola che hai in casa.
    usaDesideri: Boolean(risposte.usaDesideri),
    // Nemmeno questi sono opzioni del motore: `pianifica()` non sa cosa sia un
    // mazzo di riferimento. Servono a `cercaPiano()`, che gli sta sopra, e
    // viaggiano qui perché finiscano nel piano salvato — riaprendolo si deve
    // poter leggere contro cosa era stato costruito.
    riferimento: risposte.riferimento && risposte.riferimento !== 'nessuno'
      ? risposte.riferimento
      : null,
    versoBersaglio: risposte.bersaglio ?? 'pari',
  };
}
