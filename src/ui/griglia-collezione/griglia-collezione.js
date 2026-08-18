/**
 * Web Component `<griglia-collezione>`: la collezione divisa per serie, coi filtri.
 *
 * Riceve le voci già pronte e non tocca il database: filtra, raggruppa e
 * disegna. Quando l'utente cambia una quantità o apre una carta emette un
 * evento e sta a chi lo ascolta decidere cosa farne. È la stessa separazione di
 * un componente Angular "dumb" con `@Input` ed `@Output`.
 *
 * Le carte sono divise per **serie** e poi per set, come i raccoglitori veri.
 * Ogni set porta quante ne hai su quante ne esistono, e a richiesta mostra anche
 * quelle che ti mancano.
 *
 * Disegna in **DOM normale, non Shadow DOM**: così le custom property dei tipi
 * (`tipi.css`, foglio della pagina) colorano le card, cosa che nello Shadow DOM
 * non accadrebbe (un foglio di pagina non attraversa il confine). Le card sono
 * costruite qui, non delegate a `<scheda-carta>`, proprio per poterle tingere.
 *
 * @fires griglia-collezione#quantita-cambiata - detail: `{ idSet, numero, delta }`
 * @fires griglia-collezione#preferita-cambiata - detail: `{ idSet, numero, preferita }`
 * @fires griglia-collezione#carta-scelta - detail: `{ carta, nomeSet, lista, indice }`
 * @fires griglia-collezione#linea-richiesta - detail: `{ voce }` (solo Preferiti)
 * @fires griglia-collezione#desiderio-richiesto - detail: `{ idSet, numero }`
 *
 * @example
 * const g = document.createElement('griglia-collezione');
 * g.caricaMancanti = (idSet) => carteMancanti(idSet, voci);
 * g.voci = await elencoCompleto();
 *
 * @module ui/griglia-collezione
 */

import { urlImmagine } from '../../data/dataset.js';
import { formattaEuro, valoreDi } from '../../data/prezzi.js';
import { formatoDi } from '../../data/legalita.js';
import { segnaposto, seImmagineRotta } from '../segnaposto.js';
import { pastigliaLingua } from '../lingua-set.js';
import { numeriDex } from '../../data/dex.js';
import { segniVarianti } from '../../data/varianti.js';
import { normalizzaNome } from '../../engine/nomi.js';
import {
  FILTRI_VUOTI,
  ORDINAMENTI,
  filtra,
  ordina,
  progressoSet,
  raggruppa,
  raggruppaPerSet,
  valoriDisponibili,
} from './raggruppa.js';

/**
 * Osservatore condiviso: carica l'immagine di una card solo quando sta per
 * entrare nel viewport. Con centinaia di carte, scaricarle tutte insieme
 * sarebbe uno spreco; `rootMargin` fa partire 200px prima così, scorrendo,
 * l'illustrazione è già pronta.
 */
const osservatore = new IntersectionObserver(
  (voci) => {
    for (const voce of voci) {
      if (!voce.isIntersecting) continue;
      const img = voce.target;
      if (img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
      }
      osservatore.unobserve(img);
    }
  },
  { rootMargin: '200px' },
);

/**
 * Ridà il controllo al browser, per spezzare un lavoro lungo in tanti corti:
 * fra un blocco e l'altro la pagina dipinge e raccoglie i tocchi.
 *
 * `scheduler.yield()` è fatto esattamente per questo; dove non c'è (Safari,
 * Firefox) un `setTimeout` di zero millisecondi fa lo stesso mestiere, perché
 * rimanda al prossimo giro del ciclo degli eventi.
 *
 * **Non** si usa `requestAnimationFrame`, che sarebbe la scelta istintiva: in
 * una scheda in secondo piano non scatta mai, e un inserimento cominciato prima
 * di cambiare app resterebbe congelato a metà. Inoltre `rAF` gira *prima* del
 * disegno, quindi le card costruite là dentro peserebbero comunque su quel
 * frame — che è proprio ciò che si vuole evitare.
 */
const cediIlPasso = () =>
  globalThis.scheduler?.yield?.() ?? new Promise((risolvi) => setTimeout(risolvi, 0));

/** Quante card mancanti si inseriscono per volta. Vedi `#aggiungiMancanti()`. */
const BLOCCO_MANCANTI = 60;

/**
 * Legge una preferenza di vista, sopravvivendo a un `localStorage` che non c'è.
 *
 * Succede davvero: navigazione privata su iOS, cookie di terze parti bloccati,
 * quota piena. Sono preferenze di aspetto — se non si ricordano, pazienza; se
 * fanno esplodere il componente, la collezione non si vede più.
 *
 * @param {string} chiave
 * @param {string} difetto
 * @returns {string}
 */
function scelta(chiave, difetto) {
  try {
    return localStorage.getItem(chiave) ?? difetto;
  } catch {
    return difetto;
  }
}

/** @see scelta @param {string} chiave @param {string} valore */
function ricorda(chiave, valore) {
  try {
    localStorage.setItem(chiave, valore);
  } catch {
    /* niente da fare, e niente di grave */
  }
}

export class GrigliaCollezione extends HTMLElement {
  /** @type {Array<object>} */
  #voci = [];
  /** @type {typeof FILTRI_VUOTI} */
  #filtri = { ...FILTRI_VUOTI };
  /**
   * Filtri **imposti da fuori**, che l'utente non può togliere: la vista
   * Preferiti è la stessa griglia con `{preferito: 'solo'}` fisso. Stanno a
   * parte da `#filtri` e non dentro, perché "azzera filtri" azzera i secondi e
   * non deve poter svuotare la vista di ciò che la definisce.
   * @type {Partial<typeof FILTRI_VUOTI>}
   */
  #fissi = {};
  /** @type {string} intestazione della griglia */
  #titolo = 'La collezione';
  /** @type {boolean} se mostrare anche le carte che mancano a ogni set */
  #mostraMancanti = false;
  /** @type {boolean} se il pannello dei filtri avanzati è aperto */
  #filtriAperti = false;
  /** @type {Animation|null} l'apertura/chiusura in corso del pannello filtri */
  #animazione = null;
  /**
   * Come sono ordinate le carte: uno dei codici di `ORDINAMENTI`. Solo `'set'`
   * le tiene divise per set; gli altri sono elenchi piatti.
   * @type {string}
   */
  #ordine = 'set';
  /**
   * Quanto è fitta la vista: `'lista'` sono le card con nome, tipo e comandi;
   * `'fitta'` sono le sole scansioni, tante per riga, come le pagine di un
   * raccoglitore da fiera. Cambia **solo il CSS** — stesse card, stesso DOM,
   * stessi eventi — perché due modi di disegnare la stessa carta sarebbero due
   * posti da ricordarsi di aggiornare.
   * @type {string}
   */
  #vista = 'lista';
  /** @type {Map<string, number>|null} nome normalizzato → numero del Pokédex */
  #dex = null;
  /** @type {Map<string, {euro: number|null, aggiornatoIl: string, senzaMercato: boolean}>} */
  #prezzi = new Map();
  /** @type {string} messaggio sotto il pulsante della quotazione */
  #statoQuotazione = '';
  /**
   * Osservatore delle sezioni-set: chiede le carte mancanti di un set solo
   * quando quel set sta entrando a schermo. Senza, accendere l'interruttore
   * senza aver scelto un set faceva partire un caricamento **per ogni set** in
   * collezione — decine di file JSON e decine di migliaia di card costruite
   * tutte insieme, cioè la pagina bloccata. Scorrendo, i set a schermo sono uno
   * o due: lo stesso costo che ha da sempre un set filtrato.
   * @type {IntersectionObserver|null}
   */
  #osservatoreSezioni = null;
  /**
   * I caricamenti delle mancanti si mettono in fila invece di partire insieme.
   * Se possiedi una carta sola di trenta set diversi le sezioni sono basse e a
   * schermo ce ne stanno tante: senza la fila, l'osservatore le sveglierebbe
   * tutte nello stesso istante e saremmo di nuovo al punto di partenza.
   * @type {Promise<void>}
   */
  #coda = Promise.resolve();
  /** @type {number|undefined} attesa fra l'ultimo tasto battuto e la ricerca */
  #attesaRicerca;
  /**
   * Numero del giro di ricerca. Serve a buttare i risultati **sorpassati**:
   * fra la partenza di una ricerca e il suo arrivo l'utente ha battuto altre
   * lettere, e una risposta lenta arrivata dopo una veloce mostrerebbe carte
   * che non corrispondono più a quello che c'è scritto nella casella.
   * @type {number}
   */
  #giroRicerca = 0;

  /**
   * Come procurarsi le carte mancanti di un set. La inietta chi usa il
   * componente: la griglia non conosce il dataset, e non deve.
   * @type {(idSet: string) => Promise<object[]>}
   */
  caricaMancanti = async () => [];

  /**
   * Come cercare per nome fra **tutte** le carte del catalogo quelle che non
   * hai. La inietta chi usa il componente, come `caricaMancanti`.
   * @type {(testo: string) => Promise<{trovate: Array<{set: object, carta: object}>, nonLetti: string[], troppi: boolean}>}
   */
  cercaMancantiPerNome = async () => ({ trovate: [], nonLetti: [], troppi: false });

  /** @param {Array<object>} valore risultato di `elencoCompleto()` */
  set voci(valore) {
    this.#voci = valore ?? [];
    this.#disegna();
  }

  get voci() {
    return this.#voci;
  }

  /**
   * Filtri fissi della vista (es. `{ preferito: 'solo' }`).
   * @param {Partial<typeof FILTRI_VUOTI>} valore
   */
  set filtriFissi(valore) {
    this.#fissi = { ...valore };
    this.#disegna();
  }

  /** @param {string} valore l'intestazione, se non è "La collezione" */
  set titolo(valore) {
    this.#titolo = valore || 'La collezione';
    const testa = this.querySelector('.testa-collezione .titolo');
    if (testa) testa.textContent = this.#titolo;
  }

  /**
   * Accende o spegne il cuore di **una** carta senza ridisegnare la griglia.
   *
   * Prima il cuore passava da `voci`, cioè da un giro completo: rilettura della
   * collezione dal database e `innerHTML` rifatto da capo. Con qualche centinaio
   * di carte a schermo quel ricambio buttava via tutto ciò che era arrivato
   * scorrendo — le carte mancanti caricate set per set, le immagini già in
   * pagina — e la pagina si accorciava di colpo: il browser, non potendo tenere
   * lo scorrimento oltre il fondo, riportava l'utente in cima. Mettere una
   * decina di carte nei preferiti voleva dire risalire la collezione dieci
   * volte. Qui si tocca solo la card interessata, e la pagina non si muove.
   *
   * @param {string} idSet
   * @param {string} numero
   * @param {boolean} preferita lo stato **vero**, quello scritto nel database
   * @returns {void}
   * @example
   * const stato = await impostaPreferita('sv08', '118');
   * griglia.aggiornaPreferita('sv08', '118', stato);
   */
  aggiornaPreferita(idSet, numero, preferita) {
    const uguale = (v) => v.idSet === idSet && String(v.numero) === String(numero);
    // Le voci sono gli stessi oggetti in tutte le griglie: aggiornarle qui vale
    // anche per le altre, ma ognuna deve poi sistemarsi il DOM per conto suo.
    const voce = this.#voci.find(uguale);
    if (voce) voce.preferita = preferita;

    // Una vista che mostra **solo** i preferiti non cambia aspetto, cambia
    // elenco: la carta ci deve entrare o sparirne. È l'unico caso in cui il
    // ridisegno serve davvero, ed è anche quello che nessuno sta guardando —
    // il cuore si tocca nel catalogo, non nella vista che filtra i cuori.
    if (this.#effettivi().preferito === 'solo') {
      this.#disegnaRisultati();
      return;
    }

    const cuore = [...this.querySelectorAll('[data-preferita]')].find(
      (c) => c.dataset.set === idSet && c.dataset.numero === String(numero),
    );
    if (cuore) this.#accendiCuore(cuore, preferita);
  }

  /**
   * Rifà la card di una carta di cui sono cambiate le copie, senza ridisegnare
   * la griglia. Stessa ragione del cuore (`aggiornaPreferita()`): il `+` si
   * tocca scorrendo, e un ridisegno completo riportava in cima.
   *
   * Cambiano tre cose e solo tre: la card, i due contatori in alto, e — quando
   * la carta entra o esce dall'elenco visibile — l'elenco stesso. L'ultimo caso
   * è l'unico che vale un ridisegno, e non si indovina: si chiede al filtro se
   * quella voce passava prima e se passa adesso. Esempi di "esce": l'ultima
   * copia tolta con il filtro «solo ciò che ho» attivo, o un desiderio comprato
   * mentre guardi la lista dei desideri.
   *
   * @param {string} idSet
   * @param {string} numero
   * @param {number} quantita quante copie ne hai **adesso**
   * @param {{holo?: number, reverse?: number}|null} [varianti] com'è ripartita
   *   adesso quella pila. Va passata perché togliendo l'ultima copia normale se
   *   ne va una reverse, e il segno sulla card lo direbbe con un ridisegno di
   *   ritardo — cioè mai, che è il punto di questo metodo.
   * @returns {boolean} `false` se questa carta non è fra le voci che la griglia
   *   conosce: là non c'è card da aggiornare e chi chiama deve ricaricare.
   * @example
   * const quantita = await aggiungiCopie('sv08', '118', 1);
   * griglia.aggiornaQuantita('sv08', '118', quantita);
   */
  aggiornaQuantita(idSet, numero, quantita, varianti) {
    const voce = this.#voci.find(
      (v) => v.idSet === idSet && String(v.numero) === String(numero),
    );
    if (!voce) return false;

    // Comprare una carta desiderata la fa diventare tua: è la stessa regola di
    // `aggiungiCopie()`, e va rispecchiata qui o la card resterebbe tratteggiata.
    voce.quantita = quantita;
    if (quantita > 0) delete voce.desiderata;
    if (varianti !== undefined) {
      if (varianti) voce.varianti = varianti;
      else delete voce.varianti;
    }

    if (quantita === 0) {
      // L'elenco perde una voce: la riga nel database non c'è più. **Non** si
      // tocca l'array con `splice`, che è lo stesso oggetto passato a tutte le
      // griglie: si sostituisce il riferimento di questa, che è cosa sua.
      this.#voci = this.#voci.filter((v) => v !== voce);
      this.#disegnaRisultati();
      return true;
    }

    // Le voci sono oggetti condivisi fra le griglie, quindi la prima che passa
    // di qui le ha già cambiate sotto il naso alle altre: la domanda non può
    // essere «cos'era prima», che a quel punto nessuno sa più. Si guardano
    // invece due fatti osservabili — deve stare a schermo? ci sta? — e si
    // ridisegna solo quando non coincidono.
    const card = this.#cardDi(idSet, numero, false);
    if (filtra([voce], this.#effettivi()).length !== Number(Boolean(card))) {
      this.#disegnaRisultati();
      return true;
    }

    if (card) {
      const nuova = this.#card(voce);
      this.#riusaImmagine(card, nuova);
      card.replaceWith(nuova);
    }
    this.#scriviContatori();
    return true;
  }

  /**
   * Fa diventare desiderio, sul posto, una carta che la griglia stava mostrando
   * fra le mancanti. Terza sorella di `aggiornaPreferita()` e
   * `aggiornaQuantita()`, e per lo stesso motivo: la stella si tocca **mentre si
   * scorre** un set a caccia dei buchi, ed è proprio lì che ridisegnare
   * riportava in cima (`docs/apprendimento/20-lo-scorrimento-perduto.md`).
   *
   * La card resta dov'è, in fondo alla sezione fra le mancanti, e cambia
   * aspetto: bordo del desiderio e badge `★1` al posto della stella. Un
   * ridisegno la sposterebbe fra le carte tue, che è la sua casa definitiva —
   * ma spostarla adesso vorrebbe dire toglierla da sotto il dito che l'ha
   * appena toccata. Ci va al prossimo giro lungo.
   *
   * @param {string} idSet
   * @param {string|number} numero
   * @param {number} quante quante copie ne vorresti
   * @returns {boolean} `false` se di quella carta non c'è nessuna card mancante
   *   a schermo: là non c'è niente da correggere sul posto e chi chiama deve
   *   ricaricare.
   * @example
   * await impostaDesiderio('sv08', '118', 1);
   * griglia.aggiornaDesiderio('sv08', '118', 1);
   */
  aggiornaDesiderio(idSet, numero, quante) {
    const card = this.#cardDi(idSet, numero, true);
    if (!card) return false;

    // Da adesso è una carta di cui la griglia risponde: entra fra le voci, o il
    // `−` che la toglie dai desideri non troverebbe niente da togliere. La voce
    // arriva dalla card perché le mancanti non stanno in `#voci` — le costruisce
    // `#voceMancante()` e vivono solo nel DOM.
    //
    // Array nuovo e non `push`: quello di prima è lo **stesso oggetto** passato a
    // tutte le griglie, e allungarlo lo allungherebbe anche a loro.
    const voce = { ...card._voce, quantita: quante, desiderata: true };
    delete voce.mancante;
    this.#voci = [...this.#voci, voce];

    // Con un filtro sui desideri attivo la carta cambia di posto, non aspetto:
    // «solo ciò che ho» la fa sparire. È l'unico caso che vale un ridisegno, e
    // per fortuna è quello in cui la stella non c'è nemmeno — le mancanti non si
    // mostrano nelle viste che filtrano carte tue (`#soloTue()`).
    if (filtra([voce], this.#effettivi()).length === 0) {
      this.#disegnaRisultati();
      return true;
    }

    const nuova = this.#card(voce);
    this.#riusaImmagine(card, nuova);
    card.replaceWith(nuova);
    this.#scriviContatori();
    return true;
  }

  /**
   * La card a schermo di una carta, fra le tue o fra le mancanti.
   *
   * Il terzo parametro non è pignoleria: della stessa carta possono esserci due
   * card in pagina in due momenti diversi della sua vita — una fra le tue e una
   * nell'area «che non hai» della ricerca — e chi chiama sa quale delle due sta
   * cercando. Prendere quella sbagliata vorrebbe dire riscrivere la card che non
   * è cambiata.
   *
   * @param {string} idSet
   * @param {string|number} numero
   * @param {boolean} mancante quale delle due card si vuole
   * @returns {HTMLElement|undefined}
   */
  #cardDi(idSet, numero, mancante) {
    return [...this.querySelectorAll('.carta-griglia')].find(
      (c) =>
        Boolean(c._voce?.mancante) === mancante &&
        c._voce?.idSet === idSet &&
        String(c._voce?.numero) === String(numero),
    );
  }

  /**
   * Passa alla card nuova l'immagine che quella vecchia aveva già a schermo.
   *
   * Senza, ogni tocco su `+` rimetterebbe la miniatura a `data-src`: l'immagine
   * sparisce, l'osservatore la richiede, e la card sfarfalla mentre conti le
   * copie. La scansione è la stessa carta di un istante fa — non c'è niente da
   * ricaricare.
   *
   * @param {HTMLElement} vecchia
   * @param {HTMLElement} nuova
   */
  #riusaImmagine(vecchia, nuova) {
    const prima = vecchia.querySelector('img:not([data-src])');
    const dopo = nuova.querySelector('img[data-src]');
    if (!prima?.getAttribute('src') || !dopo) return;
    dopo.src = prima.getAttribute('src');
    delete dopo.dataset.src;
    osservatore.unobserve(dopo);
  }

  /**
   * Porta un cuore nello stato dato: classe, stato ARIA, etichette e bordo
   * della card. Un posto solo, perché lo stesso cambio arriva da due parti —
   * il tocco (che anticipa) e la risposta del database (che conferma o smentisce).
   * @param {HTMLElement} cuore
   * @param {boolean} acceso
   */
  #accendiCuore(cuore, acceso) {
    cuore.classList.toggle('acceso', acceso);
    cuore.setAttribute('aria-pressed', String(acceso));
    const etichetta = acceso ? 'Togli dai preferiti' : 'Aggiungi ai preferiti';
    cuore.title = etichetta;
    cuore.setAttribute('aria-label', etichetta);
    cuore.closest('.carta-griglia')?.classList.toggle('preferita', acceso);
  }

  /** I filtri scelti dall'utente più quelli imposti dalla vista. */
  #effettivi() {
    return { ...this.#filtri, ...this.#fissi };
  }

  /**
   * Le quotazioni note, per chiave `"<idSet>:<numero>"`. Le passa chi ha accesso
   * al database: la griglia mostra numeri, non li va a cercare.
   * @param {Map<string, object>} valore
   */
  set prezzi(valore) {
    this.#prezzi = valore ?? new Map();
    this.#disegnaRisultati();
  }

  get prezzi() {
    return this.#prezzi;
  }

  /** @param {string} valore messaggio di avanzamento della quotazione */
  set statoQuotazione(valore) {
    this.#statoQuotazione = valore ?? '';
    const riga = this.querySelector('.stato-quotazione');
    if (riga) {
      riga.textContent = this.#statoQuotazione;
      riga.hidden = !this.#statoQuotazione;
    }
  }

  connectedCallback() {
    // Ordine e densità si ricordano **per griglia**: il catalogo e i Preferiti
    // si guardano in due modi diversi — là si cerca una carta, qui si sfoglia —
    // e una preferenza sola costringerebbe a rigirare l'interruttore a ogni
    // passaggio fra le due schede.
    this.#ordine = scelta(`pokedeck-ordine:${this.id || 'griglia'}`, 'set');
    this.#vista = scelta(`pokedeck-vista:${this.id || 'griglia'}`, 'lista');
    this.#disegna();
    // Riaprendo l'app su "Pokédex" i numeri non ci sono ancora: si disegna
    // subito con quello che si ha e si riordina quando arrivano, invece di
    // tenere la collezione in attesa di un file da 60 KB.
    if (this.#ordine === 'dex') this.#cambiaOrdine();

    // La casella di ricerca ridisegna solo i risultati, per non perdere il
    // focus mentre si scrive; i menu a tendina rifanno tutto.
    this.addEventListener('input', (evento) => {
      // L'ordinamento non è un filtro: non toglie carte, le rimescola. Per
      // "Pokédex" servono i numeri, che sono un file a parte e si scaricano
      // solo a chi li chiede — quindi qui si può aspettare.
      if (evento.target.dataset?.ordine !== undefined) {
        this.#ordine = evento.target.value;
        ricorda(`pokedeck-ordine:${this.id || 'griglia'}`, this.#ordine);
        this.#cambiaOrdine();
        return;
      }

      const campo = evento.target.dataset?.filtro;
      if (!campo) return;
      this.#filtri[campo] = evento.target.value;
      // Solo il cambio di serie ridisegna tutto: le opzioni del menu "set"
      // dipendono dalla serie scelta. Gli altri filtri (testo, set, categoria,
      // stadio) ridisegnano i risultati e basta, così la casella non perde il
      // focus e il pannello "Altri filtri" non si richiude a ogni scelta.
      if (campo === 'serie') {
        this.#filtri.set = '';
        this.#disegna();
      } else {
        this.#disegnaRisultati();
      }
    });

    this.addEventListener('click', (evento) => {
      // Lista o griglia fitta: cambia solo l'aspetto, quindi niente ridisegno.
      //
      // L'attributo si chiama `data-densita` e **non** `data-vista`, che
      // sembrerebbe il nome giusto: `data-vista` ce l'hanno già le quattro
      // sezioni dell'app (`app/viste.js`, «catalogo», «preferiti», …), e
      // `closest()` risale fino a loro. Chiamandolo così, questo primo `if`
      // ingoiava **ogni** clic della griglia — aprire una carta, il cuore, gli
      // stepper — impostando come densità la stringa "catalogo".
      const vista = evento.target.closest('[data-densita]');
      if (vista) {
        this.#vista = vista.dataset.densita;
        ricorda(`pokedeck-vista:${this.id || 'griglia'}`, this.#vista);
        this.#applicaVista();
        return;
      }

      // Chip di un tipo elementale: agisce come il filtro "tipo", e ritoccarlo
      // lo azzera.
      const chip = evento.target.closest('[data-tipo-filtro]');
      if (chip) {
        const valore = chip.dataset.tipoFiltro;
        this.#filtri.tipo = this.#filtri.tipo === valore ? '' : valore;
        this.#disegna();
        return;
      }

      // Apri/chiudi il pannello dei filtri avanzati, senza ridisegnare tutto.
      const apriFiltri = evento.target.closest('[data-apri-filtri]');
      if (apriFiltri) {
        this.#filtriAperti = !this.#filtriAperti;
        this.#animaPannello(this.#filtriAperti);
        apriFiltri.setAttribute('aria-expanded', String(this.#filtriAperti));
        return;
      }

      // "Mostra anche le carte che mi mancano": ridisegna solo i risultati, così
      // il pannello dei filtri resta aperto.
      const mancanti = evento.target.closest('[data-mancanti]');
      if (mancanti) {
        this.#mostraMancanti = mancanti.checked;
        this.#disegnaRisultati();
        return;
      }

      // Si quotano le carte A SCHERMO, non tutta la collezione: una richiesta
      // di rete per carta, e il senso della funzione è "quanto vale questa
      // manciata di rare", non "censisci ventimila carte".
      if (evento.target.closest('[data-quotazione]')) {
        this.dispatchEvent(
          new CustomEvent('quotazione-richiesta', {
            bubbles: true,
            detail: { voci: filtra(this.#voci, this.#effettivi()) },
          }),
        );
        return;
      }

      if (evento.target.closest('[data-azione="azzera-filtri"]')) {
        this.#filtri = { ...FILTRI_VUOTI };
        this.#mostraMancanti = false;
        this.#disegna();
        return;
      }

      // Il cuore: si accende subito, senza aspettare il giro nel database. È un
      // tocco che deve rispondere come un interruttore, e la verità arriva
      // comunque dopo — chi ascolta l'evento richiama `aggiornaPreferita()` con
      // lo stato che il livello dati ha davvero scritto.
      const cuore = evento.target.closest('[data-preferita]');
      if (cuore) {
        const acceso = cuore.getAttribute('aria-pressed') !== 'true';
        this.#accendiCuore(cuore, acceso);
        this.dispatchEvent(
          new CustomEvent('preferita-cambiata', {
            bubbles: true,
            detail: {
              idSet: cuore.dataset.set,
              numero: cuore.dataset.numero,
              preferita: acceso,
            },
          }),
        );
        return;
      }

      // "Linea evolutiva": la card sa già tutto della sua carta, ma
      // ricostruire la famiglia vuol dire leggere l'indice delle evoluzioni e
      // cercare nel catalogo — due cose che la griglia non fa. Si chiede e
      // basta; risponde `app/linea-evolutiva.js`.
      const linea = evento.target.closest('[data-linea]');
      if (linea) {
        const voce = linea.closest('.carta-griglia')?._voce;
        if (voce?.carta) {
          this.dispatchEvent(
            new CustomEvent('linea-richiesta', { bubbles: true, detail: { voce } }),
          );
        }
        return;
      }

      // Aprire una card: si costruisce l'elenco ordinato di tutte le carte a
      // schermo, così il visore ci scorre dentro con frecce e swipe.
      const apri = evento.target.closest('.apri-carta');
      if (apri) {
        this.#apri(apri.closest('.carta-griglia'));
        return;
      }

      // La stella delle carte che non hai: non tocca le copie, mette la carta
      // nella lista desideri. È un evento suo e non `quantita-cambiata` con un
      // flag, perché sono due domande diverse — "quante ne ho" e "la voglio" —
      // e chi ascolta finisce in due funzioni diverse del livello dati.
      const voglio = evento.target.closest('[data-desiderio]');
      if (voglio) {
        this.dispatchEvent(
          new CustomEvent('desiderio-richiesto', {
            bubbles: true,
            detail: { idSet: voglio.dataset.set, numero: voglio.dataset.numero },
          }),
        );
        return;
      }

      const passo = evento.target.closest('[data-azione="1"], [data-azione="-1"]');
      if (passo) {
        this.dispatchEvent(
          new CustomEvent('quantita-cambiata', {
            bubbles: true,
            detail: {
              idSet: passo.dataset.set,
              numero: passo.dataset.numero,
              delta: Number(passo.dataset.azione),
            },
          }),
        );
      }
    });
  }

  disconnectedCallback() {
    // Le sezioni osservate non esistono più: tenerle sotto osservazione
    // significherebbe solo trattenerle in memoria.
    this.#osservatoreSezioni?.disconnect();
  }

  /**
   * Annuncia la carta aperta, con l'elenco scorribile e la sua posizione.
   * @param {HTMLElement|null} cardEl
   */
  #apri(cardEl) {
    if (!cardEl?._voce?.carta) return;
    const carte = [...this.querySelectorAll('.carta-griglia')].filter((c) => c._voce?.carta);
    const lista = carte.map((c) => c._voce);
    const indice = Math.max(carte.indexOf(cardEl), 0);
    this.dispatchEvent(
      new CustomEvent('carta-scelta', {
        bubbles: true,
        detail: { carta: cardEl._voce.carta, nomeSet: cardEl._voce.nomeSet, lista, indice },
      }),
    );
  }

  /** Disegna la barra di controlli (ricerca, chip, filtri) e il contenitore. */
  #disegna() {
    const { categorie, tipi, stadi, serie, set, rarita, formati } = valoriDisponibili(this.#voci);

    // I set portano l'anno fra parentesi: due set possono avere nomi simili, e
    // l'anno è il modo in cui ci si ricorda le carte che si hanno in mano.
    const opzioni = (valori, selezionato) =>
      valori
        .map(
          ({ id, nome, anno }) =>
            `<option value="${id}"${id === selezionato ? ' selected' : ''}>${escapeHtml(nome)}${anno ? ` (${anno})` : ''}</option>`,
        )
        .join('');
    const opzioniSemplici = (valori, selezionato) =>
      valori
        .map(
          (v) => `<option value="${v}"${v === selezionato ? ' selected' : ''}>${escapeHtml(v)}</option>`,
        )
        .join('');

    const setVisibili = this.#filtri.serie
      ? set.filter((s) =>
          this.#voci.some((v) => v.idSet === s.id && v.serie?.id === this.#filtri.serie),
        )
      : set;

    // Il pulsante-filtro si accende quando c'è un filtro avanzato attivo, così
    // si capisce che sta filtrando anche col pannello chiuso.
    const filtriAvanzatiAttivi = Boolean(
      this.#filtri.serie ||
        this.#filtri.set ||
        this.#filtri.categoria ||
        this.#filtri.stadio ||
        this.#filtri.rarita ||
        this.#filtri.formato ||
        this.#filtri.preferito ||
        this.#mostraMancanti,
    );

    // Dentro la vista Preferiti le due domande "solo i preferiti?" e "mostro
    // anche ciò che non ho?" hanno già una risposta fissa: lasciarle a schermo
    // sarebbe offrire comandi che non comandano niente.
    const dentroPreferiti = Boolean(this.#fissi.preferito);

    // Chip dei tipi presenti in collezione. "Tutti" non ha data-tipo, così resta
    // neutro (il colore grigio glielo dà il CSS).
    const chipTipi = [
      `<button type="button" class="chip-tipo${this.#filtri.tipo ? '' : ' attivo'}" data-tipo-filtro="">Tutti</button>`,
      ...tipi.map(
        (t) =>
          `<button type="button" class="chip-tipo${this.#filtri.tipo === t ? ' attivo' : ''}" data-tipo="${escapeHtml(t)}" data-tipo-filtro="${escapeHtml(t)}">${escapeHtml(t)}</button>`,
      ),
    ].join('');

    const pannelloFiltri = this.#pannelloFiltri({
      serie,
      setVisibili,
      categorie,
      stadi,
      rarita,
      formati,
      dentroPreferiti,
      opzioni,
      opzioniSemplici,
    });

    this.innerHTML = `
      <div class="testa-collezione">
        <span class="titolo">${escapeHtml(this.#titolo)}</span>
        <span class="conteggio-vis"></span>
      </div>

      <div class="barra-collezione">
        <div class="campo-cerca">
          <span class="lente" aria-hidden="true">⌕</span>
          <input type="search" data-filtro="testo" value="${escapeHtml(this.#filtri.testo)}"
                 placeholder="cerca per nome…" aria-label="Cerca per nome" />
        </div>
        <button type="button" class="bottone-filtri${filtriAvanzatiAttivi ? ' attivo' : ''}"
                data-apri-filtri aria-expanded="${this.#filtriAperti}" aria-label="Altri filtri">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          ${filtriAvanzatiAttivi ? '<span class="pallino-filtri" aria-hidden="true"></span>' : ''}
        </button>
      </div>

      ${pannelloFiltri}

      <div class="chip-tipi">${chipTipi}</div>

      <div class="barra-ordine">
        <select data-ordine aria-label="Ordina le carte">
          ${ORDINAMENTI.map(
            ({ codice, etichetta }) =>
              `<option value="${codice}"${codice === this.#ordine ? ' selected' : ''}>${escapeHtml(etichetta)}</option>`,
          ).join('')}
        </select>
        <div class="scelta-vista" role="group" aria-label="Quanto fitte le carte">
          ${this.#bottoneVista(
            'lista',
            'Card grandi, con nome e comandi',
            // Due card larghe: si legge "poche e grandi" anche a 20px, mentre
            // le tre righe di prima somigliavano all'icona dei filtri qui
            // accanto — due comandi diversi con lo stesso disegno.
            '<rect x="3.5" y="4.5" width="17" height="6.2" rx="1.8"/><rect x="3.5" y="13.3" width="17" height="6.2" rx="1.8"/>',
          )}
          ${this.#bottoneVista(
            'fitta',
            'Solo le figurine, tante per riga',
            // Nove riquadri: la griglia fitta vera ne mette quattro o cinque
            // per riga, e tre file dicono "tante" meglio di quattro quadrati.
            '<rect x="3.5" y="3.5" width="4.6" height="4.6" rx="1.1"/><rect x="9.7" y="3.5" width="4.6" height="4.6" rx="1.1"/><rect x="15.9" y="3.5" width="4.6" height="4.6" rx="1.1"/><rect x="3.5" y="9.7" width="4.6" height="4.6" rx="1.1"/><rect x="9.7" y="9.7" width="4.6" height="4.6" rx="1.1"/><rect x="15.9" y="9.7" width="4.6" height="4.6" rx="1.1"/><rect x="3.5" y="15.9" width="4.6" height="4.6" rx="1.1"/><rect x="9.7" y="15.9" width="4.6" height="4.6" rx="1.1"/><rect x="15.9" y="15.9" width="4.6" height="4.6" rx="1.1"/>',
          )}
        </div>
      </div>

      <p class="riepilogo"></p>
      <div class="serie-collezione"></div>
      <!-- Le carte trovate col nome in set di cui non possiedi niente stanno
           qui, fuori dalle serie: dentro falserebbero i conteggi "12/62". -->
      <div class="trovate-mancanti"></div>
    `;
    this.#applicaVista();
    this.#disegnaRisultati();
  }

  /**
   * Apre o chiude il pannello dei filtri srotolandolo.
   *
   * L'animazione la fa **JavaScript** (Web Animations) e non una transizione
   * CSS, per una ragione precisa: da `display: none` non parte nessuna
   * transizione, e le due alternative CSS hanno entrambe un difetto.
   * `grid-template-rows: 0fr → 1fr`, che sarebbe l'idioma moderno, qui collassa
   * a zero — l'`overflow: hidden` del contenuto porta a zero il minimo
   * automatico della riga, e con l'altezza del contenitore indefinita `1fr` non
   * ha niente da cui prendere; misurato, non supposto. Un `max-height` a numero
   * fisso invece funziona ma va indovinato: troppo basso taglia il pannello,
   * troppo alto rende la transizione irregolare.
   *
   * Con `animate()` l'altezza si **misura** (`scrollHeight`) e, finita
   * l'animazione, il valore torna a quello del foglio di stile: da aperto il
   * pannello non ha nessun tetto, quindi può crescere — è quello che fa quando
   * compare la riga di stato della quotazione.
   *
   * @param {boolean} apri
   * @returns {void}
   */
  #animaPannello(apri) {
    const pannello = this.querySelector('.pannello-filtri');
    if (!pannello) return;

    // Due tocchi rapidi: la seconda animazione deve sostituire la prima, o si
    // accavallano e il pannello resta a mezz'aria.
    this.#animazione?.cancel();

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pannello.classList.toggle('aperto', apri);
      return;
    }

    // Da chiuso `scrollHeight` misura comunque il contenuto: `max-height: 0` lo
    // taglia, non lo rimpicciolisce.
    const altezza = `${pannello.scrollHeight}px`;
    // `overflow: hidden` in **entrambi** i fotogrammi: da aperto il foglio di
    // stile lo mette a `visible` (o l'ombra e la punta verrebbero tagliate), e
    // senza questa riga il contenuto straborderebbe mentre il pannello si
    // chiude, invece di essere ritagliato dal bordo che sale.
    const fotogrammi = [
      { maxHeight: '0px', opacity: 0, overflow: 'hidden' },
      { maxHeight: altezza, opacity: 1, overflow: 'hidden' },
    ];
    if (apri) pannello.classList.add('aperto');

    this.#animazione = pannello.animate(apri ? fotogrammi : [...fotogrammi].reverse(), {
      duration: 240,
      easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
    });
    // Chiudendo, la classe se ne va **dopo**: finché l'animazione corre serve
    // l'altezza naturale sotto, o si chiuderebbe di scatto e poi si animerebbe
    // il vuoto. `catch` perché un `cancel()` fa fallire la promessa.
    if (!apri) {
      this.#animazione.finished
        .then(() => pannello.classList.remove('aperto'))
        .catch(() => {});
    }
  }

  /**
   * Il pannello dei filtri avanzati, dal pulsante-imbuto in giù.
   *
   * Sta in un pezzo a parte per una ragione di **posizione**: il pannello deve
   * comparire subito sotto il pulsante che lo apre, cioè fra la barra di ricerca
   * e i chip dei tipi. Prima stava in fondo ai controlli, sotto i chip e sotto
   * la riga dell'ordinamento: si toccava l'imbuto in alto e compariva roba tre
   * righe più giù, abbastanza lontano da non sembrare una conseguenza del
   * tocco.
   *
   * Non è `hidden` ma una classe: `display: none` non si può animare, e
   * un pannello che appare di scatto è la stessa cosa che non capire se si è
   * aperto. L'apertura la fa il CSS con `grid-template-rows: 0fr → 1fr`.
   *
   * @param {object} dati i valori già calcolati da `#disegna()`
   * @returns {string} HTML
   */
  #pannelloFiltri({ serie, setVisibili, categorie, stadi, rarita, formati, dentroPreferiti, opzioni, opzioniSemplici }) {
    return `
      <div class="pannello-filtri${this.#filtriAperti ? ' aperto' : ''}">
       <div class="pannello-dentro">
        <div class="pannello-corpo">
        <div class="filtri-extra">
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
            <label for="filtro-stadio">Stadio</label>
            <select id="filtro-stadio" data-filtro="stadio">
              <option value="">tutti</option>${opzioniSemplici(stadi, this.#filtri.stadio)}
            </select>
          </div>
          <div${dentroPreferiti ? ' hidden' : ''}>
            <label for="filtro-desiderio">Lista desideri</label>
            <select id="filtro-desiderio" data-filtro="desiderio">
              <option value=""${this.#filtri.desiderio === '' ? ' selected' : ''}>tutto</option>
              <option value="solo"${this.#filtri.desiderio === 'solo' ? ' selected' : ''}>solo i desideri</option>
              <option value="escludi"${this.#filtri.desiderio === 'escludi' ? ' selected' : ''}>solo ciò che ho</option>
            </select>
          </div>
          ${
            dentroPreferiti
              ? ''
              : `<div>
            <label for="filtro-preferito">Preferiti</label>
            <select id="filtro-preferito" data-filtro="preferito">
              <option value=""${this.#filtri.preferito === '' ? ' selected' : ''}>tutto</option>
              <option value="solo"${this.#filtri.preferito === 'solo' ? ' selected' : ''}>solo i preferiti</option>
            </select>
          </div>`
          }
          <div>
            <label for="filtro-rarita">Rarità</label>
            <select id="filtro-rarita" data-filtro="rarita">
              <option value="">tutte</option>${rarita
                .map(
                  (r) =>
                    `<option value="${r.codice}"${r.codice === this.#filtri.rarita ? ' selected' : ''}>${escapeHtml(r.etichetta)}</option>`,
                )
                .join('')}
            </select>
          </div>
          <div>
            <label for="filtro-formato">Tornei</label>
            <select id="filtro-formato" data-filtro="formato">
              <option value="">tutte</option>${formati
                .map(
                  (f) =>
                    `<option value="${f.codice}"${f.codice === this.#filtri.formato ? ' selected' : ''} title="${escapeHtml(f.spiegazione)}">${escapeHtml(f.etichetta)}</option>`,
                )
                .join('')}
            </select>
          </div>
        </div>
        <label class="interruttore-mancanti"${dentroPreferiti ? ' hidden' : ''}>
          <input type="checkbox" data-mancanti ${this.#mostraMancanti ? 'checked' : ''} />
          <span>
            <strong>Mostra anche le carte che mi mancano</strong>
            <small>Le carte che non hai compaiono in grigio: dei set che possiedi in parte arrivano un set per volta, mentre scorri. Se cerchi un nome, si cerca in <strong>tutti</strong> i set, anche in quelli di cui non hai niente.</small>
          </span>
        </label>

        <!-- La quotazione è un'azione, non un filtro: scarica dalla rete, quindi
             si fa quando la si chiede e su quello che si sta guardando. -->
        <div class="zona-quotazione">
          <button type="button" class="secondario" data-quotazione>Calcola quotazione</button>
          <p class="stato-quotazione" hidden></p>
        </div>
        </div>
       </div>
      </div>
    `;
  }

  /**
   * Uno dei due pulsanti della densità.
   *
   * @param {string} codice `'lista'` o `'fitta'`
   * @param {string} spiegazione cosa si vede scegliendolo
   * @param {string} disegno il corpo dell'SVG
   * @returns {string} HTML
   */
  #bottoneVista(codice, spiegazione, disegno) {
    const attivo = this.#vista === codice;
    // I riquadri sono pieni, non contornati: a 20px un contorno da 2px si
    // chiude su se stesso e diventa una macchia. Il pieno resta leggibile.
    return `
      <button type="button" data-densita="${codice}" class="bottone-vista${attivo ? ' attivo' : ''}"
              aria-pressed="${attivo}" title="${escapeHtml(spiegazione)}"
              aria-label="${escapeHtml(spiegazione)}">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${disegno}</svg>
      </button>`;
  }

  /**
   * Porta la densità scelta sul componente: una classe, e il CSS fa il resto.
   *
   * Le card non si ridisegnano — sono le stesse — quindi cambiare vista non
   * costa un ridisegno e non perde né le mancanti caricate scorrendo né la
   * posizione della pagina (vedi il documento 20).
   */
  #applicaVista() {
    this.classList.toggle('vista-fitta', this.#vista === 'fitta');
    for (const bottone of this.querySelectorAll('[data-densita]')) {
      const attivo = bottone.dataset.densita === this.#vista;
      bottone.classList.toggle('attivo', attivo);
      bottone.setAttribute('aria-pressed', String(attivo));
    }
  }

  /** Ridisegna solo l'elenco e i contatori: i controlli restano come sono. */
  #disegnaRisultati() {
    const contenitore = this.querySelector('.serie-collezione');
    const riepilogo = this.querySelector('.riepilogo');
    const conteggio = this.querySelector('.conteggio-vis');
    if (!contenitore) return;

    // Le sezioni di prima stanno per essere buttate: quelle che aspettavano il
    // proprio turno non devono più chiedere niente.
    this.#osservatoreSezioni?.disconnect();

    const voci = this.#ordinate(filtra(this.#voci, this.#effettivi()));
    const gruppi = raggruppa(voci);

    this.#scriviContatori(voci, gruppi);
    contenitore.replaceChildren(
      ...(raggruppaPerSet(this.#ordine)
        ? gruppi.map((gruppo) => this.#disegnaSerie(gruppo))
        : [this.#disegnaPiatto(voci)]),
    );
    this.#aggiornaTrovate();
  }

  /**
   * Cambia ordinamento, procurandosi prima i dati che gli servono.
   *
   * Solo il Pokédex ne ha bisogno: i numeri stanno in `data/dex.json` e si
   * scaricano **la prima volta che qualcuno sceglie quell'ordine**, non
   * all'avvio. Sono 60 KB che a chi ordina per set non servono mai, e dopo la
   * prima volta li serve il service worker anche offline.
   *
   * @returns {Promise<void>}
   */
  async #cambiaOrdine() {
    if (this.#ordine === 'dex' && !this.#dex) this.#dex = await numeriDex();
    this.#disegnaRisultati();
  }

  /**
   * Applica l'ordinamento scelto, procurando a `ordina()` i due dati che la
   * parte pura non può avere: il numero del Pokédex e il prezzo.
   *
   * @param {object[]} voci già filtrate
   * @returns {object[]}
   */
  #ordinate(voci) {
    return ordina(voci, this.#ordine, {
      // Il nome si normalizza con la **stessa** funzione che ha scritto
      // l'indice (`engine/nomi.js`): se le due divergessero, l'indice
      // smetterebbe di trovare in silenzio — vedi `data/dex.js`.
      dex: (voce) => this.#dex?.get(normalizzaNome(voce.carta?.nome ?? '')) ?? null,
      valore: (voce) => this.#prezzi.get(`${voce.idSet}:${voce.numero}`)?.euro ?? null,
    });
  }

  /**
   * L'elenco senza sezioni: una griglia sola, nell'ordine scelto.
   *
   * Le carte restano **le stesse card** della vista per set — stesso `#card()`,
   * stessi eventi — perché l'unica cosa che cambia è che non stanno più dentro
   * un set. Le intestazioni sparirebbero comunque da sole: ordinando per
   * Pokédex, un set con dentro una carta sola è un titolo su niente.
   *
   * @param {object[]} voci già filtrate e ordinate
   * @returns {HTMLElement}
   */
  #disegnaPiatto(voci) {
    const griglia = document.createElement('div');
    griglia.className = 'griglia-carte griglia-piatta';
    griglia.replaceChildren(...voci.map((voce) => this.#card(voce)));
    return griglia;
  }

  /**
   * Riscrive le due righe che contano: «12 carte» in testata e «31 copie in 3
   * serie» sotto i filtri.
   *
   * Sta a parte dal disegno dell'elenco perché una copia in più o in meno
   * cambia **questi numeri e basta**: la card la si riscrive da sola, e le
   * sezioni non hanno motivo di essere buttate via (vedi `aggiornaQuantita()`).
   *
   * @param {object[]} [voci] le voci già filtrate, se chi chiama le ha
   * @param {import('./raggruppa.js').GruppoSerie[]} [gruppi] idem
   */
  #scriviContatori(voci, gruppi) {
    const riepilogo = this.querySelector('.riepilogo');
    if (!riepilogo) return;
    const conteggio = this.querySelector('.conteggio-vis');
    const visibili = voci ?? filtra(this.#voci, this.#effettivi());
    const serie = gruppi ?? raggruppa(visibili);
    const copie = visibili.reduce((s, v) => s + v.quantita, 0);
    const filtriAttivi = Object.values(this.#filtri).some(Boolean);

    if (conteggio) {
      conteggio.textContent = `${visibili.length} ${visibili.length === 1 ? 'carta' : 'carte'}`;
    }

    riepilogo.innerHTML =
      this.#voci.length === 0
        ? 'La collezione è vuota: tocca il pulsante <strong>＋</strong> in basso per aggiungere la prima carta.'
        : `${copie} copie in ${serie.length} serie` +
          valoreAschermo(visibili, this.#prezzi) +
          (filtriAttivi
            ? ' · <button type="button" data-azione="azzera-filtri" class="collegamento">azzera filtri</button>'
            : '');
  }

  /**
   * Se le carte che ti mancano vanno cercate in tutto il catalogo invece che
   * set per set.
   *
   * Le due strade non convivono: cercando "pikachu", la ricerca globale trova
   * anche i Pikachu dei set che possiedi in parte, e la strada per set li
   * troverebbe una seconda volta.
   *
   * Il testo si conta in caratteri perché con una lettera sola i tetti di
   * `cercaPerNomeGlobale()` troncherebbero comunque su corrispondenze casuali.
   * E con un filtro sui desideri attivo le mancanti non c'entrano: "solo i
   * desideri" e "solo ciò che ho" sono due domande su carte *tue*.
   * @returns {boolean}
   */
  #mancantiPerSet() {
    // Le mancanti di un set arrivano **dentro la sua sezione**, e in un elenco
    // piatto le sezioni non ci sono: senza questa condizione finirebbero in
    // fondo alla griglia tutte insieme, fuori dall'ordine scelto.
    return (
      this.#mostraMancanti &&
      raggruppaPerSet(this.#ordine) &&
      !this.#soloTue() &&
      !this.#filtri.testo.trim()
    );
  }

  /** @see #mancantiPerSet */
  #ricercaGlobale() {
    return this.#mostraMancanti && !this.#soloTue() && this.#filtri.testo.trim().length >= 2;
  }

  /**
   * Se la vista sta rispondendo a una domanda su carte **tue**: la lista dei
   * desideri e i preferiti lo sono entrambe, e in nessuna delle due ha senso
   * riempire le sezioni di carte che non hai.
   * @returns {boolean}
   */
  #soloTue() {
    const { desiderio, preferito } = this.#effettivi();
    return Boolean(desiderio || preferito);
  }

  /**
   * Fa ripartire la ricerca per nome fra tutte le carte, o pulisce l'area se
   * non serve.
   */
  #aggiornaTrovate() {
    const area = this.querySelector('.trovate-mancanti');
    if (!area) return;

    // Qualunque cosa accada, i risultati di prima non valgono più.
    clearTimeout(this.#attesaRicerca);
    const giro = ++this.#giroRicerca;

    if (!this.#ricercaGlobale()) {
      area.replaceChildren();
      return;
    }

    const testo = this.#filtri.testo.trim();
    area.replaceChildren(nota('attesa-mancanti', `cerco «${testo}» fra tutte le carte…`));
    // Si aspetta che l'utente smetta di scrivere: ogni ricerca può scaricare
    // fino a dodici file di set, e otto lettere battute non devono costare otto
    // ricerche.
    this.#attesaRicerca = setTimeout(() => this.#disegnaTrovate(testo, giro), 300);
  }

  /**
   * Disegna le carte che non hai trovate per nome in tutto il catalogo,
   * raggruppate per set.
   * @param {string} testo
   * @param {number} giro il giro di ricerca a cui appartiene questa richiesta
   */
  async #disegnaTrovate(testo, giro) {
    let esito = null;
    try {
      esito = await this.cercaMancantiPerNome(testo);
    } catch {
      /* Indice dei nomi o set non raggiungibili: si mostra solo ciò che si ha. */
    }

    const area = this.querySelector('.trovate-mancanti');
    // Ricerca sorpassata (altre lettere battute) o filtri cambiati sotto i
    // piedi: questi risultati non rispondono più alla domanda di adesso.
    if (!area || giro !== this.#giroRicerca) return;
    if (!esito) {
      area.replaceChildren();
      return;
    }

    // Gli **altri** filtri valgono anche qui; il testo no, l'ha già applicato
    // la ricerca — e con una normalizzazione più larga (accenti, punteggiatura)
    // che rifiltrare a mano butterebbe via risultati giusti.
    const voci = filtra(
      esito.trovate.map(({ set, carta }) => ({
        idSet: set.id,
        numero: String(carta.numero),
        quantita: 0,
        carta,
        nomeSet: set.nome,
        serie: set.serie ?? null,
        linguaSet: set.lingua ?? null,
      })),
      { ...this.#effettivi(), testo: '' },
    );

    /** @type {Map<string, {nomeSet: string, voci: object[]}>} */
    const perSet = new Map();
    for (const voce of voci) {
      if (!perSet.has(voce.idSet)) perSet.set(voce.idSet, { nomeSet: voce.nomeSet, voci: [] });
      perSet.get(voce.idSet).voci.push(voce);
    }

    const pezzi = [];
    if (perSet.size) {
      pezzi.push(nota('etichetta-serie', `Che non hai — «${testo}»`));
      for (const gruppo of perSet.values()) {
        pezzi.push(this.#sezioneTrovate(gruppo));
      }
    }
    // I limiti si dicono sempre: una ricerca troncata che tace si legge come
    // "non esiste altro", ed è la bugia peggiore che possa raccontare un elenco.
    if (esito.troppi) {
      pezzi.push(
        nota(
          'nota-ricerca',
          `Ci sono troppe carte con questo nome: ${perSet.size ? 'queste sono le prime' : 'nessuna mostrata'}. Scrivi qualche lettera in più.`,
        ),
      );
    }
    if (esito.nonLetti?.length) {
      pezzi.push(
        nota('nota-ricerca', `Set non disponibili adesso: ${esito.nonLetti.join(', ')}.`),
      );
    }
    if (!pezzi.length && this.#voci.length) {
      pezzi.push(nota('nota-ricerca', `Nessun'altra carta con questo nome fuori dalla collezione.`));
    }
    area.replaceChildren(...pezzi);
  }

  /**
   * Un set di carte trovate col nome: intestazione e griglia, senza barra di
   * completamento — qui non si sta completando niente, si sta cercando.
   * @param {{nomeSet: string, voci: object[]}} gruppo
   * @returns {HTMLElement}
   */
  #sezioneTrovate(gruppo) {
    const sezione = document.createElement('section');
    sezione.className = 'set-collezione';
    sezione.innerHTML = `
      <div class="testa-set">
        <span class="nome-set"></span>
        <span class="prog"></span>
      </div>
      <div class="griglia-carte"></div>
    `;
    // textContent e non innerHTML: il nome del set arriva dai dati, e qui non
    // c'è nessun escape da ricordarsi.
    sezione.querySelector('.nome-set').textContent = gruppo.nomeSet;
    sezione.querySelector('.prog').textContent =
      gruppo.voci.length === 1 ? '1 da trovare' : `${gruppo.voci.length} da trovare`;
    sezione
      .querySelector('.griglia-carte')
      .replaceChildren(...gruppo.voci.map((voce) => this.#card(voce, true)));
    return sezione;
  }

  /**
   * Una serie, con tutti i suoi set.
   * @param {import('./raggruppa.js').GruppoSerie} gruppo
   * @returns {HTMLElement}
   */
  #disegnaSerie(gruppo) {
    const sezione = document.createElement('section');
    sezione.className = 'serie';
    sezione.innerHTML = `<div class="etichetta-serie">${escapeHtml(gruppo.nome)}</div>`;
    sezione.append(...gruppo.set.map((set) => this.#disegnaSet(set)));
    return sezione;
  }

  /**
   * Un set: intestazione col completamento, poi la griglia di card.
   * @param {import('./raggruppa.js').GruppoSet} set
   * @returns {HTMLElement}
   */
  #disegnaSet(set) {
    const sezione = document.createElement('section');
    sezione.className = 'set-collezione';
    sezione.innerHTML = `
      <div class="testa-set">${testaSet(set)}</div>
      <div class="griglia-carte"></div>
    `;

    const griglia = sezione.querySelector('.griglia-carte');
    griglia.replaceChildren(...set.voci.map((voce) => this.#card(voce)));

    if (this.#mancantiPerSet() && confrontabile(set)) {
      // Il set viaggia sull'elemento, come `_voce` sulle card: quando
      // l'osservatore chiamerà, l'unica cosa che ha in mano è la sezione.
      sezione._set = set;
      this.#osserva(sezione);
    }
    return sezione;
  }

  /**
   * Mette una sezione-set in coda: chiederà le sue carte mancanti quando starà
   * per entrare a schermo, e una volta sola.
   * @param {HTMLElement} sezione
   */
  #osserva(sezione) {
    this.#osservatoreSezioni ??= new IntersectionObserver(
      (voci) => {
        for (const voce of voci) {
          if (!voce.isIntersecting) continue;
          // Prima di tutto smettere di osservare: il caricamento è asincrono e
          // una seconda intersezione raddoppierebbe le card.
          this.#osservatoreSezioni.unobserve(voce.target);
          const griglia = voce.target.querySelector('.griglia-carte');
          if (!griglia || !voce.target._set) continue;
          const set = voce.target._set;
          // Il segnaposto si mette **subito**, non quando arriva il turno:
          // altrimenti una sezione in fila sembrerebbe semplicemente completa.
          const attesa = document.createElement('p');
          attesa.className = 'attesa-mancanti';
          attesa.textContent = 'cerco le carte che mancano…';
          griglia.append(attesa);
          this.#coda = this.#coda.then(() => this.#aggiungiMancanti(griglia, set, attesa));
        }
      },
      // Meno dei 200px delle immagini: qui non si precarica un'immagine, si
      // scarica un file di set intero. Basta arrivare poco prima.
      { rootMargin: '100px' },
    );
    this.#osservatoreSezioni.observe(sezione);
  }

  /**
   * Aggiunge in coda le carte del set che non possiedi. Caricamento asincrono:
   * le tue carte si vedono subito, le mancanti compaiono dopo.
   * @param {HTMLElement} griglia
   * @param {import('./raggruppa.js').GruppoSet} set
   * @param {HTMLElement} attesa il segnaposto da togliere quando si è finito
   */
  async #aggiungiMancanti(griglia, set, attesa) {
    // Filtro cambiato mentre questa sezione era in fila: non c'è più niente da
    // riempire, e il file del set non va nemmeno chiesto.
    if (!griglia.isConnected) return;

    let mancanti;
    try {
      mancanti = await this.caricaMancanti(set.idSet);
    } catch {
      // Set non leggibile offline: meglio niente che riempire di errori.
      attesa.remove();
      return;
    }
    if (!griglia.isConnected) return;
    attesa.remove();

    // Le mancanti passano dagli **stessi filtri** delle tue carte. Prima non lo
    // facevano, ed era un guasto silenzioso: filtrando per tipo Fuoco, o per
    // rarità, in fondo alla sezione arrivavano comunque tutte le carte del set.
    // Il testo qui è sempre vuoto — con una ricerca in corso le mancanti le
    // trova `#disegnaTrovate()`, che cerca in tutto il catalogo e non solo qui.
    mancanti = filtra(
      mancanti.map((carta) => this.#voceMancante(carta, set)),
      this.#effettivi(),
    );

    // Inserimento a blocchi: costruire 250 card in un colpo tiene occupato il
    // thread abbastanza da far scattare lo scorrimento proprio mentre l'utente
    // sta scorrendo.
    for (let i = 0; i < mancanti.length; i += BLOCCO_MANCANTI) {
      if (i > 0) await cediIlPasso();
      // Fra un blocco e l'altro l'utente può aver cambiato filtro.
      if (!griglia.isConnected) return;
      griglia.append(...mancanti.slice(i, i + BLOCCO_MANCANTI).map((voce) => this.#card(voce, true)));
    }
  }

  /**
   * Una carta del dataset vestita da voce di collezione, per poter passare dai
   * filtri (che ragionano su voci) e da `#card()`. `quantita: 0` è il punto:
   * questa carta non ce l'hai.
   *
   * `serie` e `linguaSet` si prendono da una tua carta dello stesso set: sono
   * dati del set, non della carta, e `GruppoSet` non li porta.
   *
   * @param {object} carta
   * @param {import('./raggruppa.js').GruppoSet} set
   * @returns {object}
   */
  #voceMancante(carta, set) {
    const compagna = set.voci?.[0];
    return {
      idSet: set.idSet,
      numero: String(carta.numero),
      quantita: 0,
      carta,
      nomeSet: set.nomeSet,
      serie: compagna?.serie ?? null,
      linguaSet: compagna?.linguaSet ?? null,
    };
  }

  /**
   * Una card della griglia (DOM normale, tinta dal suo tipo).
   * @param {object} voce
   * @param {boolean} [mancante] se è una carta che non possiedi
   * @returns {HTMLElement}
   */
  #card(voce, mancante = false) {
    const card = document.createElement('article');
    // Tre stati, non due: posseduta, desiderata, e "manca al set" (che è una
    // carta di cui l'app sa l'esistenza ma che tu non hai mai né avuto né
    // chiesto). Il desiderio è una scelta tua, quindi si vede di più.
    card.className = 'carta-griglia';
    if (mancante) card.classList.add('mancante');
    if (voce.desiderata) card.classList.add('desiderata');
    if (voce.preferita) card.classList.add('preferita');
    // La voce **intera**, più il fatto che questa card è una carta che non hai.
    // Prima qui se ne copiavano sette campi scelti a mano — quelli che serviva
    // al visore — e per il visore bastavano: `idSet`/`numero`/`quantita` per
    // modificare le copie, `linguaSet` perché là la scansione è tutto ciò che si
    // legge e sapere che è inglese conta di più, `mancante` perché su una carta
    // che non hai il contatore delle copie non deve comparire.
    //
    // Non bastano più da quando una card mancante può diventare un desiderio
    // **sul posto** (`aggiornaDesiderio()`): quella voce entra fra le voci della
    // griglia, e una voce amputata di `serie` finirebbe nel gruppo sbagliato al
    // primo cambio di filtro. L'elenco dei campi da copiare era diventato
    // "tutti": tanto vale dirlo.
    card._voce = { ...voce, mancante };

    // Carta di un set non più scaricato: non sappiamo nulla, mostriamo solo la
    // sigla e il tasto per aggiungerne una copia.
    if (!voce.carta) {
      card.dataset.tipo = 'Incolore';
      card.innerHTML = `
        <div class="miniatura">${segnaposto(null, 'segnaposto-mini')}</div>
        <div class="corpo">
          <div class="nome-carta">${escapeHtml(voce.idSet)} n. ${escapeHtml(voce.numero)}</div>
          <div class="meta-carta">Set non più disponibile: riscarica i dati.</div>
        </div>
        ${this.#piede(voce, mancante)}
      `;
      return card;
    }

    const c = voce.carta;
    const tipo = c.tipi?.[0] ?? 'Incolore';
    card.dataset.tipo = tipo;

    const numero = String(c.numero ?? voce.numero ?? '').split('/')[0];
    // Sul desiderio il numero non dice "ne ho", dice "ne vorrei": la stellina
    // lo distingue senza bisogno di leggere una legenda.
    const badge = voce.desiderata
      ? `<span class="badge-qty badge-desiderio" title="Nella lista desideri">★${voce.quantita}</span>`
      : mancante || !voce.quantita
        ? ''
        : `<span class="badge-qty">×${voce.quantita}</span>${this.#segniFinitura(voce)}`;
    const prezzo = this.#badgePrezzo(voce);
    const meta =
      c.categoria === 'Pokémon'
        ? `n. ${escapeHtml(numero)} · ${escapeHtml(c.stadio ?? 'Base')}`
        : `n. ${escapeHtml(numero)} · ${escapeHtml(c.categoria ?? '')}`;
    const chipEvo = c.evolveDa
      ? `<span class="chip chip-evo">da ${escapeHtml(c.evolveDa)}</span>`
      : '';
    const chipTipo =
      c.categoria === 'Pokémon' && c.tipi?.length
        ? `<span class="chip chip-tipo-carta" data-tipo="${escapeHtml(tipo)}">${escapeHtml(tipo)}</span>`
        : `<span class="chip chip-evo">${escapeHtml(c.categoria ?? '')}</span>`;
    // Il formato da torneo si mostra solo quando è una buona notizia. "Fuori
    // formato" è la condizione della maggior parte delle carte di casa: dirlo
    // su ognuna sarebbe rumore, e chi cerca proprio quelle ha il filtro Tornei.
    const formato = formatoDi(c);
    const chipFormato =
      formato && formato.codice !== 'fuori'
        ? `<span class="chip chip-formato" data-formato="${formato.codice}" title="${escapeHtml(formato.spiegazione)}">${escapeHtml(formato.etichetta)}</span>`
        : '';

    card.innerHTML = `
      <button class="apri-carta" type="button" title="Ingrandisci ${escapeHtml(c.nome)}">
        <div class="miniatura">
          ${this.#htmlImmagine(c)}
          ${badge}
          ${prezzo}
          <span class="scan">n. ${escapeHtml(numero)}</span>
        </div>
        <div class="corpo">
          <div class="nome-carta">${escapeHtml(c.nome)}</div>
          <div class="meta-carta">${meta}</div>
          <div class="chips">${chipTipo}${pastigliaLingua(voce)}${chipFormato}${chipEvo}</div>
        </div>
      </button>
      ${this.#cuore(voce, mancante)}
      ${this.#piede(voce, mancante)}
    `;

    const img = card.querySelector('img[data-src]');
    if (img) {
      osservatore.observe(img);
      seImmagineRotta(img, c, 'segnaposto-mini');
    }
    return card;
  }

  /**
   * Le finiture speciali possedute, sotto il contatore delle copie: `1H`, `2R`.
   *
   * Sigle e non parole: a questa taglia "reverse holo" non ci sta, e sulla card
   * la domanda è solo *ne ho una lucida?*. Il conto per esteso lo dice il
   * visore, dove c'è spazio per scriverlo.
   *
   * Niente sulle carte tutte normali, che sono la gran parte: un segno che
   * compare su ogni card non è più un segno.
   *
   * @param {object} voce
   * @returns {string} HTML, vuoto quando non c'è niente da dire
   */
  #segniFinitura(voce) {
    const segni = segniVarianti(voce);
    if (!segni.length) return '';
    return `<span class="badge-finiture">${segni
      .map(
        (s) =>
          `<span class="segno-finitura" title="${escapeHtml(`${s.quante} ${s.etichetta}`)}">${s.quante}${s.sigla}</span>`,
      )
      .join('')}</span>`;
  }

  /**
   * La targhetta col prezzo, se per quella carta ne conosciamo uno.
   *
   * Le carte digitali (Pokémon Pocket) non hanno mercato: si dice "digitale"
   * invece di lasciare il vuoto, che si confonderebbe con "non l'ho ancora
   * chiesto". La data serve perché un prezzo senza data non è un prezzo.
   *
   * @param {object} voce
   * @returns {string} HTML
   */
  #badgePrezzo(voce) {
    const prezzo = this.#prezzi.get(`${voce.idSet}:${voce.numero}`);
    if (!prezzo) return '';
    if (prezzo.euro === null) {
      return `<span class="badge-prezzo senza" title="${prezzo.senzaMercato ? 'Carta digitale: non ha un mercato' : 'Nessun prezzo disponibile'}">${prezzo.senzaMercato ? 'digitale' : '—'}</span>`;
    }
    const quando = new Date(prezzo.aggiornatoIl).toLocaleDateString('it-IT');
    return `<span class="badge-prezzo" title="Cardmarket, tendenza del ${quando}">${formattaEuro(prezzo.euro)}</span>`;
  }

  /** L'immagine (in lazy-load) o il segnaposto tinto per le carte senza scan. */
  #htmlImmagine(c) {
    const src = urlImmagine(c, 'griglia');
    if (!src) return segnaposto(c, 'segnaposto-mini');
    // `alt=""`: il nome della carta è già scritto sotto la miniatura, e un
    // testo alternativo comparirebbe a schermo se l'immagine non arrivasse.
    return `<img data-src="${src}" alt="" />`;
  }

  /**
   * Il cuore dei preferiti, in alto a sinistra della miniatura.
   *
   * **Cuore e non stella**: la stella in questa app è già occupata dal badge
   * `★2` dei desideri, e due stelle sulla stessa miniatura — una che dice "ne
   * vorrei due" e una che dice "mi piace" — sarebbero indistinguibili proprio
   * dove servono, cioè con l'occhio che scorre. Il cuore sta a sinistra, il
   * badge a destra, e i colori sono diversi (rosso contro viola dei proxy).
   *
   * Compare **solo sulle carte che hai**: su un desiderio o su una carta
   * mancante non c'è niente da preferire, e il livello dati rifiuterebbe
   * comunque di segnarle (`impostaPreferita()`).
   *
   * È fratello di `.apri-carta` e non figlio: un `<button>` dentro un altro
   * `<button>` è HTML non valido, e i browser lo riscrivono spostandolo fuori
   * dalla card — con l'aria di un bug del CSS.
   *
   * @param {object} voce
   * @param {boolean} mancante
   * @returns {string} HTML, vuoto dove il cuore non ha senso
   */
  #cuore(voce, mancante) {
    if (mancante || voce.desiderata || !voce.quantita) return '';
    const acceso = Boolean(voce.preferita);
    return `
      <button type="button" class="cuore${acceso ? ' acceso' : ''}" data-preferita
              data-set="${escapeHtml(voce.idSet)}" data-numero="${escapeHtml(voce.numero)}"
              aria-pressed="${acceso}"
              title="${acceso ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}"
              aria-label="${acceso ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20.4 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 0 1 19.4 13Z"
                fill="${acceso ? 'currentColor' : 'none'}" stroke="currentColor"
                stroke-width="1.8" stroke-linejoin="round" />
        </svg>
      </button>`;
  }

  /**
   * Il piede della card, che cambia a seconda della vista.
   *
   * Nel catalogo si contano le copie, e il piede sono gli stepper. Nei
   * **Preferiti** no: là le carte ci sono finite perché ti piacciono, non
   * perché le stai catalogando, e `+`/`−` sono due bersagli da 38px sotto ogni
   * miniatura che nessuno tocca mai — anzi, che si toccano per sbaglio
   * scorrendo. Al loro posto la domanda che in quella vista viene davvero:
   * *di questo Pokémon ho anche il resto della linea?*
   *
   * Le copie restano modificabili aprendo la carta nel visore, quindi non si
   * perde niente.
   *
   * @param {object} voce
   * @param {boolean} mancante
   * @returns {string} HTML
   */
  #piede(voce, mancante) {
    if (!this.#fissi.preferito) return this.#stepper(voce, mancante);
    // Solo i Pokémon hanno una linea evolutiva: su un Allenatore o su
    // un'Energia il pulsante aprirebbe una finestra con dentro una carta sola.
    if (voce.carta?.categoria !== 'Pokémon') return '';
    return `
      <div class="piede-preferito">
        <button type="button" class="bottone-linea" data-linea
                title="Mostra la linea evolutiva di ${escapeHtml(voce.carta.nome)}">
          Linea evolutiva
        </button>
      </div>
    `;
  }

  /**
   * Gli stepper. Su una carta che non hai il "−" non ha senso.
   * @param {object} voce
   * @param {boolean} mancante
   */
  #stepper(voce, mancante) {
    // Su una carta che NON hai il "+" era una bugia: diceva "ne ho una in più"
    // di una carta che non è mai stata nella scatola. Quello che si vuole
    // davvero, guardando un buco in un set, è segnarsela — quindi una stella,
    // che in quest'app significa "la voglio" (vedi il badge ★2 dei desideri).
    if (mancante) {
      return `
        <div class="stepper">
          <button type="button" class="voglio" data-desiderio data-set="${escapeHtml(voce.idSet)}"
                  data-numero="${escapeHtml(voce.numero)}"
                  title="Aggiungi alla lista desideri"
                  aria-label="Aggiungi alla lista desideri">★</button>
        </div>
      `;
    }
    return `
      <div class="stepper">
        <button type="button" class="meno" data-azione="-1" data-set="${escapeHtml(voce.idSet)}"
                data-numero="${escapeHtml(voce.numero)}" aria-label="Togli una copia">−</button>
        <button type="button" class="piu" data-azione="1" data-set="${escapeHtml(voce.idSet)}"
                data-numero="${escapeHtml(voce.numero)}"
                aria-label="Aggiungi una copia">+</button>
      </div>
    `;
  }
}

/**
 * Il valore delle carte a schermo, quando qualche prezzo è noto.
 *
 * Si conta **per copie possedute**, non per carte distinte: tre copie della
 * stessa rara valgono tre volte. E si dichiara sempre quante carte non hanno
 * prezzo, altrimenti un totale parziale si legge come un totale.
 *
 * @param {object[]} voci le voci filtrate, cioè quelle visibili
 * @param {Map<string, object>} prezzi
 * @returns {string} HTML, vuoto se non si conosce nessun prezzo
 */
function valoreAschermo(voci, prezzi) {
  if (!prezzi.size) return '';
  const { totale, quotate, senzaPrezzo } = valoreDi(voci, prezzi);
  if (!quotate) return '';
  return (
    ` · <strong class="valore-totale">${formattaEuro(totale)}</strong>` +
    ` (${quotate} quotate${senzaPrezzo ? `, ${senzaPrezzo} senza prezzo` : ''})`
  );
}

/**
 * Se di questo set sappiamo abbastanza da parlare di completamento.
 * @param {import('./raggruppa.js').GruppoSet} set
 * @returns {boolean}
 */
function confrontabile(set) {
  return Boolean(set.totale) && set.ufficiali !== 0;
}

/**
 * L'intestazione di un set: nome, barra di completamento e "possedute/totali".
 * Tre casi diversi come prima — i set promo non hanno una numerazione da
 * completare, e quelli con dati parziali non devono mostrare come "mancanti"
 * carte che non esistono nei file.
 * @param {import('./raggruppa.js').GruppoSet} set
 * @returns {string} HTML
 */
function testaSet(set) {
  if (!confrontabile(set)) {
    return `
      <span class="nome-set">${escapeHtml(set.nomeSet)}</span>
      <span class="prog">${set.distinte} carte</span>`;
  }

  const { riferimento, pct, parziale } = progressoSet(set);
  return `
    <span class="nome-set">${escapeHtml(set.nomeSet)}</span>
    <span class="barra"><span class="riempi" style="width:${pct}%"></span></span>
    <span class="prog">${set.distinte}/${riferimento}</span>
    ${
      parziale
        ? `<span class="dati-parziali" title="Il set è numerato fino a ${set.totale}, ma le carte diverse note nei dati italiani di TCGdex sono ${set.ufficiali}: il conteggio è su quelle.">parziali</span>`
        : ''
    }`;
}

/**
 * Un elemento con del testo dentro, e nient'altro.
 *
 * Serve dove il testo contiene roba scritta dall'utente (il nome cercato) o
 * dai dati (i nomi dei set): con `textContent` non c'è nessun escape da
 * ricordarsi, perché non si sta costruendo HTML.
 *
 * @param {string} classe
 * @param {string} testo
 * @returns {HTMLElement}
 */
function nota(classe, testo) {
  const p = document.createElement('p');
  p.className = classe;
  p.textContent = testo;
  return p;
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
