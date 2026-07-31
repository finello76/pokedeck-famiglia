/**
 * Web Component `<tavolo-partita>`: il campo di gioco della mini partita.
 *
 * Disegna lo stato che gli arriva da `engine/partita.js` e **non decide niente**:
 * non sa cosa sia una debolezza né quante Energie serva un attacco. Quando si
 * tocca una mossa emette un evento e chi lo ascolta chiama il motore. È la
 * stessa divisione della griglia della collezione, e qui conta ancora di più:
 * le regole di una partita devono stare in un posto solo, provabile.
 *
 * ## Le animazioni
 *
 * Sono la ragione per cui una partita si guarda invece di leggerla. Sono tutte
 * CSS — carta che ruota mentre si pesca, moneta che gira, attivo che scatta in
 * avanti, difensore che trema, danni che sbucano, KO che sbiadisce — e partono
 * da **quello che è successo**, non da chi le chiama: il componente confronta
 * le ultime righe del registro con quelle già mostrate e anima la differenza.
 *
 * Così un'animazione non può mai raccontare una cosa diversa da quella che il
 * motore ha fatto: se il registro non dice "attacco", nessuno trema.
 *
 * `prefers-reduced-motion` le spegne tutte (in `tavolo-partita.css`): restano i
 * numeri, che sono la sostanza.
 *
 * @fires tavolo-partita#mossa-scelta - detail: `{ mossa }`
 *
 * @module ui/tavolo-partita
 */

import { urlImmagine } from '../../data/dataset.js';
import { spiegazionePer } from '../../engine/spiegazioni.js';
import { segnaposto, seImmagineRotta } from '../segnaposto.js';

/** Quanto resta a schermo un numero di danno che sbuca. */
const DURATA_DANNO = 900;

export class TavoloPartita extends HTMLElement {
  /** @type {object|null} lo stato mostrato adesso */
  #stato = null;
  /** @type {Array<object>} le mosse proposte, per ritrovarle al click */
  #mosse = [];
  /** Quante righe di registro sono già state animate: la differenza è il nuovo. */
  #registroMostrato = 0;
  /**
   * Le regole già spiegate, per chiave. Alla terza volta un avviso non spiega
   * più niente: si chiude senza leggerlo.
   * @type {Set<string>}
   */
  #spiegate = new Set();
  /** @type {number|undefined} quando nascondere la moneta */
  #timerMoneta;

  connectedCallback() {
    if (this.dataset.pronto) return;
    this.dataset.pronto = '1';
    this.addEventListener('click', (evento) => {
      if (evento.target.closest('[data-chiudi-bolla]')) {
        this.querySelector('.bolla')?.remove();
        return;
      }
      const bottone = evento.target.closest('[data-mossa]');
      if (!bottone || bottone.disabled) return;
      const mossa = this.#mosse[Number(bottone.dataset.mossa)];
      if (mossa) this.dispatchEvent(new CustomEvent('mossa-scelta', { bubbles: true, detail: { mossa } }));
    });
  }

  /**
   * Lo stato da mostrare. Assegnarlo ridisegna il tavolo e anima ciò che è
   * cambiato dall'ultima volta.
   * @param {object} valore
   */
  set stato(valore) {
    const primaVolta = !this.#stato;
    this.#stato = valore;
    this.#disegna();
    if (primaVolta) this.#registroMostrato = valore?.registro?.length ?? 0;
    else this.#anima();
  }

  /** @param {Array<object>} valore le mosse da proporre */
  set mosse(valore) {
    this.#mosse = valore ?? [];
    this.#disegnaMosse();
  }

  /** Disegna tutto il tavolo: avversario in alto, tu in basso, come al tavolo vero. */
  #disegna() {
    const s = this.#stato;
    if (!s) return;
    const io = s.giocatori[0];
    const lui = s.giocatori[1];

    this.innerHTML = `
      <div class="tavolo">
        ${this.#lato(lui, 'avversario', s)}
        <div class="mezzo">
          <p class="dice-cosa"></p>
          <div class="moneta" hidden aria-hidden="true"><span class="faccia"></span></div>
        </div>
        ${this.#lato(io, 'mio', s)}
        <div class="mano-mia">${io.mano.map((c) => this.#miniatura(c)).join('')}</div>
        <div class="comandi"></div>
      </div>
    `;

    for (const img of this.querySelectorAll('img[data-carta]')) {
      seImmagineRotta(img, JSON.parse(img.dataset.carta), 'segnaposto-mini');
    }
    this.#disegnaMosse();
  }

  /**
   * Metà campo: Premi, mazzo, panchina e Pokémon attivo.
   * @param {object} g
   * @param {'mio'|'avversario'} lato
   * @param {object} s
   * @returns {string} HTML
   */
  #lato(g, lato, s) {
    const tocca = (lato === 'mio' ? 0 : 1) === s.diChi;
    return `
      <section class="lato ${lato}${tocca ? ' tocca' : ''}">
        <header class="riga-lato">
          <span class="nome-giocatore">${escapeHtml(g.nome)}${lato === 'mio' ? ' <em class="sei-tu">sei tu</em>' : ''}</span>
          <span class="conti">
            <span class="conto premi" title="Premi da prendere">🏆 ${g.premi.length}</span>
            <span class="conto mazzo" title="Carte nel mazzo">🂠 ${g.mazzo.length}</span>
            <span class="conto mano" title="Carte in mano">✋ ${g.mano.length}</span>
          </span>
        </header>
        <div class="campo">
          ${this.#inGioco(g.attivo, 'attivo')}
          <div class="panchina">
            ${g.panchina.map((p) => this.#inGioco(p, 'in-panchina')).join('') || '<span class="vuota">panchina vuota</span>'}
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Un Pokémon in gioco: scansione, PS residui, Energie e stati.
   *
   * I PS si mostrano come **residui su totali** e non come segnalini danno: al
   * tavolo si contano i segnalini, ma su uno schermo piccolo "40/60" si legge
   * in un colpo d'occhio e non richiede di fare la sottrazione a mente.
   *
   * @param {object|null} slot
   * @param {string} classe
   * @returns {string} HTML
   */
  #inGioco(slot, classe) {
    if (!slot) return `<div class="posto ${classe} vuoto"><span class="vuota">nessun Pokémon</span></div>`;
    const c = slot.carta;
    const restanti = Math.max(0, (c.ps ?? 0) - slot.danni);
    const percento = c.ps ? (restanti / c.ps) * 100 : 0;

    return `
      <div class="posto ${classe}" data-tipo="${escapeHtml(c.tipi?.[0] ?? 'Incolore')}" data-nome="${escapeHtml(c.nome)}">
        <div class="mini">${this.#immagine(c)}</div>
        <div class="dati">
          <span class="nome">${escapeHtml(c.nome)}</span>
          <span class="ps"><span class="barra-ps"><span class="riempi-ps" style="width:${percento}%"></span></span> ${restanti}/${c.ps ?? '?'}</span>
          <span class="energie">${slot.energie.map((t) => `<i class="pallina" data-tipo="${escapeHtml(t)}" title="Energia ${escapeHtml(t)}"></i>`).join('')}</span>
          ${slot.stati.map((st) => `<span class="stato-pill" data-stato="${escapeHtml(st)}">${escapeHtml(st)}</span>`).join('')}
        </div>
      </div>
    `;
  }

  /** @param {object} carta @returns {string} HTML */
  #miniatura(carta) {
    return `<span class="carta-mano" data-tipo="${escapeHtml(carta.tipi?.[0] ?? 'Incolore')}">
      ${this.#immagine(carta)}<span class="nome-mano">${escapeHtml(carta.nome)}</span>
    </span>`;
  }

  /** @param {object} c @returns {string} HTML */
  #immagine(c) {
    const src = urlImmagine(c, 'griglia');
    if (!src) return segnaposto(c, 'segnaposto-mini');
    const dati = escapeHtml(JSON.stringify({ nome: c.nome, tipi: c.tipi ?? [] }));
    return `<img src="${escapeHtml(src)}" alt="" loading="lazy" data-carta="${dati}" />`;
  }

  /**
   * I comandi: una riga per mossa, con il perché sotto quelle impossibili.
   *
   * Le mosse impossibili **restano a schermo** invece di sparire: un comando che
   * non c'è non insegna niente, uno spento che spiega perché insegna la regola.
   */
  #disegnaMosse() {
    const zona = this.querySelector('.comandi');
    if (!zona) return;
    if (!this.#mosse.length) {
      zona.innerHTML = '';
      return;
    }
    zona.innerHTML = this.#mosse
      .map(
        (m, i) => `
        <button type="button" class="mossa${m.aMano ? ' a-mano' : ''}" data-mossa="${i}" ${m.possibile ? '' : 'disabled'}>
          <span class="etichetta-mossa">${escapeHtml(m.etichetta)}</span>
          ${!m.possibile && m.perche ? `<small class="perche">${escapeHtml(m.perche)}</small>` : ''}
          ${m.aMano ? '<small class="perche">La applichi tu: leggi la carta.</small>' : ''}
        </button>`,
      )
      .join('');
  }

  /**
   * Anima quello che è successo dall'ultimo disegno, leggendolo dal registro.
   *
   * Il registro è la verità: se non c'è scritto, non si anima. Le righe già
   * mostrate si contano, così riassegnando lo stesso stato non si riparte.
   */
  #anima() {
    const s = this.#stato;
    const nuove = s.registro.slice(this.#registroMostrato);
    this.#registroMostrato = s.registro.length;
    if (!nuove.length) return;

    const racconto = [];
    for (const evento of nuove) {
      racconto.push(raccontaEvento(evento, s));
      if (evento.tipo === 'attacco') this.#animaAttacco(evento);
      if (evento.tipo === 'ko') this.#animaKo(evento);
      if (evento.tipo === 'stato') this.#animaStato(evento);
      if (evento.moneta !== undefined && evento.moneta !== null) this.#animaMoneta(evento.moneta);
      if (evento.tipo === 'moneta') this.#animaMoneta(evento.esito);
      this.#spiega(evento);
    }

    const riga = this.querySelector('.dice-cosa');
    if (riga) riga.textContent = racconto.filter(Boolean).join(' ');
  }

  /**
   * La moneta gira e si ferma sulla faccia uscita.
   *
   * Il risultato lo ha già deciso il motore: qui si mostra soltanto. Se
   * l'animazione decidesse da sé, potrebbe fermarsi su una faccia diversa da
   * quella che ha prodotto il danno — e chi guarda crederebbe all'animazione.
   *
   * @param {boolean} testa
   */
  #animaMoneta(testa) {
    const moneta = this.querySelector('.moneta');
    if (!moneta) return;
    moneta.hidden = false;
    moneta.classList.remove('gira');
    void moneta.offsetWidth;
    moneta.dataset.esito = testa ? 'testa' : 'croce';
    moneta.querySelector('.faccia').textContent = testa ? 'TESTA' : 'CROCE';
    moneta.classList.add('gira');
    clearTimeout(this.#timerMoneta);
    this.#timerMoneta = setTimeout(() => {
      moneta.hidden = true;
    }, 2200);
  }

  /**
   * Mostra la spiegazione di una regola, la prima volta che entra in gioco.
   *
   * Una sola per volta e una sola per regola: se ne arrivassero due insieme, la
   * seconda coprirebbe la prima e non si leggerebbe nessuna delle due.
   *
   * @param {object} evento
   */
  #spiega(evento) {
    const spiegazione = spiegazionePer(evento);
    if (!spiegazione || this.#spiegate.has(spiegazione.chiave)) return;
    if (this.querySelector('.bolla')) return;
    this.#spiegate.add(spiegazione.chiave);

    const bolla = document.createElement('div');
    bolla.className = 'bolla';
    bolla.innerHTML = `
      <strong class="titolo-bolla">${escapeHtml(spiegazione.titolo)}</strong>
      <p class="testo-bolla">${escapeHtml(spiegazione.testo)}</p>
      <button type="button" class="chiudi-bolla" data-chiudi-bolla>Ho capito</button>`;
    this.querySelector('.tavolo')?.append(bolla);
  }

  /** L'attaccante scatta, il difensore trema, il danno sbuca. */
  #animaAttacco(evento) {
    const attaccante = this.#postoAttivo(evento.chi);
    const difensore = this.#postoAttivo(1 - evento.chi);
    attaccante?.classList.add('colpisce');
    difensore?.classList.add('colpito');
    setTimeout(() => {
      attaccante?.classList.remove('colpisce');
      difensore?.classList.remove('colpito');
    }, 600);

    if (evento.danno > 0 && difensore) {
      this.#numeroVolante(difensore, `−${evento.danno}`, evento.debolezza ? 'debolezza' : '');
      if (evento.debolezza) this.#numeroVolante(difensore, 'debolezza ×2', 'etichetta');
      if (evento.resistenza) this.#numeroVolante(difensore, 'resistenza', 'etichetta');
    }
  }

  /** @param {object} evento */
  #animaKo(evento) {
    const posto = this.#postoAttivo(evento.chi);
    posto?.classList.add('esausto');
  }

  /** @param {object} evento */
  #animaStato(evento) {
    const posto = this.#postoAttivo(evento.chi);
    if (posto && evento.danno) this.#numeroVolante(posto, `−${evento.danno}`, 'stato');
  }

  /**
   * @param {number} chi
   * @returns {HTMLElement|null}
   */
  #postoAttivo(chi) {
    return this.querySelector(`.lato.${chi === 0 ? 'mio' : 'avversario'} .posto.attivo`);
  }

  /**
   * Un numero che sbuca sopra una carta e sale sfumando.
   * @param {HTMLElement} sopra
   * @param {string} testo
   * @param {string} [classe]
   */
  #numeroVolante(sopra, testo, classe = '') {
    const bolla = document.createElement('span');
    bolla.className = `volante ${classe}`.trim();
    bolla.textContent = testo;
    sopra.append(bolla);
    setTimeout(() => bolla.remove(), DURATA_DANNO);
  }
}

/**
 * La frase che racconta un evento del registro.
 *
 * Sta qui e non nel motore perché è **lingua**, non regola: il motore dice che
 * è successo un attacco da 40 con debolezza, questa funzione decide come dirlo
 * a un bambino.
 *
 * @param {object} evento
 * @param {object} stato
 * @returns {string}
 */
export function raccontaEvento(evento, stato) {
  const chi = stato.giocatori[evento.chi]?.nome ?? '';
  switch (evento.tipo) {
    case 'attacco': {
      // Il punto si mette **una volta sola**, alla fine: mettendolo dentro i
      // pezzi si finiva con "Ora è Addormentato.." — un dettaglio che si nota
      // subito e fa sembrare rotto tutto il resto.
      const pezzi = [`${chi} attacca con ${evento.attacco}: ${evento.danno} danni`];
      if (evento.debolezza) pezzi.push('(debolezza: il doppio!)');
      if (evento.resistenza) pezzi.push('(resistenza: meno danni)');
      if (evento.stati?.length) pezzi.push(`— ora è ${evento.stati.join(' e ')}`);
      return `${pezzi.join(' ')}.`;
    }
    case 'ko':
      return `${evento.carta.nome} è esausto!`;
    case 'premio':
      return `${chi} prende un Premio: ne restano ${evento.restano}.`;
    case 'promosso':
      return `${evento.carta.nome} va in prima linea.`;
    case 'stato':
      return evento.guarito
        ? `${chi} guarisce: non è più ${evento.stato}.`
        : `${evento.stato}: ${evento.danno ?? 0} danni.`;
    case 'confusione':
      return `Confuso! Si fa ${evento.danno} danni da solo.`;
    case 'ritirata':
      return evento.gratis ? `${chi} si ritira gratis (regola della casa).` : `${chi} si ritira.`;
    case 'allenatore':
      return evento.daApplicareAMano
        ? `${evento.carta.nome}: «${evento.testo}» — applicala tu.`
        : `${chi} gioca ${evento.carta.nome}.`;
    case 'schiera':
      return evento.dove === 'attivo'
        ? `${chi} manda in campo ${evento.carta.nome}.`
        : `${chi} mette ${evento.carta.nome} in panchina.`;
    case 'pesca':
      return `${chi} pesca una carta.`;
    case 'energia':
      return `${chi} attacca un'Energia.`;
    case 'evoluzione':
      return `${evento.carta.nome} si evolve!`;
    case 'turno':
      return `Turno ${evento.numero}: tocca a ${stato.giocatori[evento.chi].nome}.`;
    case 'mulligan':
      return `${chi} non aveva Pokémon Base: rimescola.`;
    case 'mazzo-finito':
      return `${chi} non ha più carte da pescare.`;
    case 'vittoria':
      return `Vince ${stato.giocatori[evento.chi].nome}!`;
    default:
      return '';
  }
}

/** @param {string} testo @returns {string} */
function escapeHtml(testo) {
  return String(testo ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}

customElements.define('tavolo-partita', TavoloPartita);
