/**
 * Aggiunta di una carta: pulsante flottante (FAB) + pannello a comparsa.
 *
 * È l'azione più ripetuta dell'app — si usa col telefono in mano mentre si
 * sfogliano le carte fisiche — quindi sta dietro a un pulsante sempre a portata
 * di pollice invece che in fondo alla pagina.
 *
 * Ci sono **due strade** per la stessa carta, e a scegliere è la carta:
 *
 * - **numero / totale** (`118/191`): la più rapida, ma il totale identifica il
 *   set solo per coincidenza — 101 è cinque set diversi — quindi i candidati
 *   possono essere parecchi e si toccano per scegliere;
 * - **nome (+ numero)**: l'unica possibile sulle **promo**, dove il totale non
 *   è stampato affatto (`032` e basta). Nome e numero insieme individuano una
 *   carta sola nel 97% dei casi.
 *
 * Qui non c'è logica di dominio: la ricerca la fanno `cercaPerNumeroStampato` e
 * `cercaPerNomeGlobale`, la scrittura `aggiungiCopie`. Questo modulo raccoglie
 * l'input, disegna i candidati e richiama chi deve aggiornare la collezione.
 *
 * @module app/aggiunta
 */

import {
  cercaPerNumeroStampato,
  cercaPerNomeGlobale,
  urlImmagine,
  caricaSet,
  elencoSet,
} from '../data/dataset.js';
import { aggiungiCopie, aggiungiMolte, impostaDesiderio } from '../data/collezione.js';
import { VARIANTI } from '../data/varianti.js';
import { elencoPrefatti } from '../data/mazzi-prefatti.js';
import { chiediConferma } from './chiedi-conferma.js';
import { segnaposto, seImmagineRotta } from '../ui/segnaposto.js';
import { pastigliaLingua } from '../ui/lingua-set.js';
import { bloccaScorrimento, sbloccaScorrimento } from './blocca-scroll.js';

/**
 * Collega FAB e pannello.
 *
 * @param {object} deps
 * @param {() => Promise<void>} deps.onAggiornata da chiamare dopo ogni aggiunta,
 *   per ricaricare collezione e statistiche.
 * @param {(testo: string) => void} deps.onMessaggio per il messaggio di conferma
 *   (toast).
 * @returns {void}
 */
export function avviaAggiunta({ onAggiornata, onMessaggio }) {
  const fab = document.querySelector('#fab-aggiungi');
  const foglio = document.querySelector('#foglio-aggiunta');
  const form = document.querySelector('#modulo-ricerca');
  const formNome = document.querySelector('#modulo-nome');
  const campoNumero = document.querySelector('#campo-numero');
  const campoNome = document.querySelector('#campo-nome');
  const stato = document.querySelector('#stato-ricerca');
  const risultati = document.querySelector('#risultati');
  if (!fab || !foglio || !form) return;

  const sceltaMazzo = document.querySelector('#scelta-mazzo');
  const bottoneMazzo = document.querySelector('#aggiungi-mazzo');

  /** Quale delle tre strade è a schermo: `'frazione'`, `'nome'` o `'mazzo'`. */
  let modoRicerca = 'frazione';

  /**
   * I mazzi aggiungibili, letti una volta sola alla prima apertura del modo.
   * @type {Array<{id: string, nome: string, dettaglio: string, carte: Array<{idSet: string, numero: string, copie: number}>}>|null}
   */
  let mazzi = null;

  /** Quante copie aggiunge un tocco su un candidato. */
  let quante = 1;

  /** Se il tocco mette la carta nella lista desideri invece che in collezione. */
  let desiderio = false;

  /**
   * Che finitura hanno le copie che si stanno aggiungendo.
   *
   * Resta scelta fra una carta e l'altra, come `quante`: chi apre una bustina
   * si trova in mano una fila di reverse, e rimettere "Normale" a ogni carta
   * sarebbe un tocco in più ogni volta. Si azzera solo alla chiusura del
   * pannello, dove si azzerano anche le altre due.
   */
  let variante = 'normale';

  const suCatalogo = () => (location.hash.slice(1) || 'catalogo') === 'catalogo';
  const aggiornaFab = () => {
    fab.hidden = !(suCatalogo() && foglio.hidden);
  };

  /**
   * Mostra una delle due strade di ricerca e nasconde l'altra.
   *
   * Il modo **non** si ricorda fra un'apertura e l'altra: si riparte dalla
   * frazione perché è il caso normale: la stragrande maggioranza delle carte
   * il totale ce l'ha stampato.
   *
   * @param {'frazione'|'nome'|'mazzo'} quale
   */
  function mostraModo(quale) {
    modoRicerca = quale;
    for (const elemento of foglio.querySelectorAll('[data-per]')) {
      elemento.hidden = elemento.dataset.per !== quale;
    }
    for (const bottone of foglio.querySelectorAll('[data-ricerca]')) {
      bottone.classList.toggle('attivo', bottone.dataset.ricerca === quale);
    }
    risultati.replaceChildren();
    mostraStato('');
    if (quale === 'mazzo') {
      // L'elenco si costruisce alla prima apertura e non all'avvio dell'app:
      // legge il catalogo dei prefatti e l'indice dei set, e chi non aggiunge
      // mai un mazzo intero non deve pagarli.
      riempiMazzi();
      return;
    }
    (quale === 'nome' ? campoNome : campoNumero)?.focus();
  }

  /**
   * Riempie il menu dei mazzi, la prima volta che serve.
   *
   * Due sorgenti, e la differenza conta:
   *
   * - i **mazzi prefatti** (`data/mazzi-prefatti.json`) hanno la composizione
   *   vera, copie comprese: il Kit Allenatore Lycanroc sono 18 carte diverse e
   *   30 copie, perché le Energie base dentro sono tredici;
   * - gli altri **Kit Allenatore** sono set del catalogo, e di un set si sa
   *   quali carte contiene ma non in quante copie: là si aggiunge una copia di
   *   ciascuna, e l'etichetta lo dice invece di far finta.
   *
   * @returns {Promise<void>}
   */
  async function riempiMazzi() {
    if (!sceltaMazzo || mazzi) return;
    sceltaMazzo.innerHTML = '<option>carico i mazzi…</option>';

    const [prefatti, set] = await Promise.all([elencoPrefatti(), elencoSet()]);
    const daPrefatti = prefatti.map((m) => ({
      id: `prefatto:${m.id}`,
      nome: m.nome,
      dettaglio: `${m.carte.reduce((s, c) => s + (c.quantita ?? 1), 0)} carte`,
      carte: m.carte.map((c) => ({
        idSet: c.carta.idSet,
        numero: String(c.carta.numero),
        copie: c.quantita ?? 1,
      })),
    }));

    // I kit già coperti dai prefatti non si ripetono: la versione con le copie
    // vere è sempre migliore di "una di ciascuna".
    const giaPresi = new Set(prefatti.flatMap((m) => m.carte.map((c) => c.carta.idSet)));
    const daSet = set
      .filter(
        (s) => /trainer kit|kit allenatore/i.test(s.nome) && !giaPresi.has(s.id) && s.carte > 0,
      )
      .map((s) => ({
        id: `set:${s.id}`,
        nome: s.nome,
        dettaglio: etichettaSet(s),
        carte: null,
      }));

    mazzi = [...daPrefatti, ...daSet];
    sceltaMazzo.innerHTML = mazzi.length
      ? mazzi
          .map(
            (m) =>
              `<option value="${escapeHtml(m.id)}">${escapeHtml(m.nome)} — ${escapeHtml(m.dettaglio)}</option>`,
          )
          .join('')
      : '<option value="">nessun mazzo disponibile</option>';
  }

  /**
   * Aggiunge alla collezione tutte le carte del mazzo scelto.
   *
   * Si chiede conferma perché è l'unica azione dell'app che scrive **decine di
   * righe** in un colpo: sbagliare mazzo e accorgersene dopo vorrebbe dire
   * togliere trenta carte a mano.
   *
   * @returns {Promise<void>}
   */
  async function aggiungiMazzo() {
    const mazzo = mazzi?.find((m) => m.id === sceltaMazzo?.value);
    if (!mazzo) return;

    try {
      mostraStato('Leggo il mazzo…');
      // I prefatti la lista ce l'hanno già; per un set va letto il file, e può
      // volerci una richiesta.
      const carte = mazzo.carte ?? (await carteDelSet(mazzo.id.slice(4)));
      if (!carte.length) {
        mostraStato('Di questo mazzo non conosco le carte.', true);
        return;
      }
      const copie = carte.reduce((s, c) => s + c.copie, 0);
      mostraStato('');

      const va = await chiediConferma({
        titolo: `Aggiungere «${mazzo.nome}»?`,
        aiuto: `Entrano ${copie} carte (${carte.length} diverse). Le copie si sommano a quelle che hai già.`,
        conferma: 'Aggiungi',
      });
      if (!va) return;

      const { aggiunte, nuove } = await aggiungiMolte(carte);
      await onAggiornata();
      onMessaggio(
        `${mazzo.nome}: ${aggiunte} carte aggiunte` +
          (nuove ? `, ${nuove} mai avute prima.` : '.'),
      );
      chiudi();
    } catch (errore) {
      mostraStato(`Aggiunta non riuscita: ${errore.message}`, true);
    }
  }

  /**
   * Cosa promette un kit preso dal catalogo dei set.
   *
   * Di alcuni kit vecchi il dataset ha una carta sola su trenta — sono set che
   * TCGdex elenca ma non ha riempito. Dirlo è meglio che scrivere "una copia di
   * ognuna delle 30 carte" e aggiungerne una: chi lo legge sceglie sapendo.
   *
   * @param {{carte?: number, totale?: number}} s la voce dell'indice dei set
   * @returns {string}
   */
  function etichettaSet(s) {
    const ho = s.carte ?? 0;
    const totale = s.totale ?? ho;
    const carte = `${ho} ${ho === 1 ? 'carta' : 'carte'}`;
    return ho < totale
      ? `${carte} su ${totale}: le altre non sono nei dati`
      : `una copia di ognuna delle ${totale} carte`;
  }

  /**
   * Le carte di un set, una copia ciascuna.
   * @param {string} idSet
   * @returns {Promise<Array<{idSet: string, numero: string, copie: number}>>}
   */
  async function carteDelSet(idSet) {
    const set = await caricaSet(idSet);
    return (set?.carte ?? []).map((c) => ({ idSet, numero: String(c.numero), copie: 1 }));
  }

  function apri() {
    quante = 1;
    // Si riparte sempre da "ce l'ho": è il caso normale, e ricordare l'ultima
    // scelta farebbe catalogare come desiderate le carte che si hanno in mano.
    desiderio = false;
    // Stesso ragionamento: la finitura più comune è quella normale, e
    // ricordarla farebbe segnare reverse una fila di carte che non lo sono.
    variante = 'normale';
    foglio.hidden = false;
    bloccaScorrimento();
    aggiornaFab();
    mostraModo('frazione');
  }

  function chiudi() {
    foglio.hidden = true;
    sbloccaScorrimento();
    form.reset();
    formNome?.reset();
    risultati.replaceChildren();
    mostraStato('');
    aggiornaFab();
  }

  function mostraStato(testo, errore = false) {
    stato.textContent = testo;
    stato.hidden = !testo;
    stato.classList.toggle('errore', errore);
  }

  fab.addEventListener('click', apri);
  foglio.addEventListener('click', (evento) => {
    if (evento.target.closest('[data-chiudi]')) chiudi();
    const scelta = evento.target.closest('[data-ricerca]');
    if (scelta) mostraModo(scelta.dataset.ricerca);
  });
  bottoneMazzo?.addEventListener('click', aggiungiMazzo);
  document.addEventListener('vista-cambiata', aggiornaFab);
  aggiornaFab();

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    risultati.replaceChildren();

    const dati = new FormData(form);
    const numero = String(dati.get('numero')).trim();
    const totale = String(dati.get('totale')).trim();
    if (!numero || !totale) return;

    mostraStato('Cerco…');
    try {
      const { trovate, nonLetti } = await cercaPerNumeroStampato(numero, totale);

      if (trovate.length === 0) {
        const motivo = nonLetti.length
          ? ` Non è stato possibile leggere ${nonLetti.length} set (${nonLetti.join(', ')}): ` +
            'probabilmente sei senza rete e quei set non erano ancora stati aperti.'
          : ' Controlla il numero e il totale stampati sulla carta.';
        mostraStato(`Nessuna carta ${numero}/${totale}.${motivo}`, true);
        return;
      }

      mostraStato(
        nonLetti.length ? `Attenzione: ${nonLetti.length} set non leggibili offline.` : '',
      );
      mostraCandidati(trovate);
    } catch (errore) {
      mostraStato(`Errore nel caricamento dei dati: ${errore.message}`, true);
    }
  });

  formNome?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    risultati.replaceChildren();

    const dati = new FormData(formNome);
    const nome = String(dati.get('nome')).trim();
    // Il numero qui è **facoltativo**: è quello che rende il nome un
    // identificatore vero, ma su una carta rovinata può non essere leggibile e
    // non deve bloccare la ricerca.
    const numero = String(dati.get('numero') ?? '').trim();
    if (!nome) return;

    mostraStato('Cerco…');
    try {
      const { trovate, nonLetti, troppi } = await cercaPerNomeGlobale(nome, numero || null);

      if (trovate.length === 0) {
        const motivo = nonLetti.length
          ? ` Non è stato possibile leggere ${nonLetti.length} set (${nonLetti.join(', ')}): ` +
            'probabilmente sei senza rete e quei set non erano ancora stati aperti.'
          : numero
            ? ' Prova senza il numero, o controlla come è scritto il nome.'
            : ' Controlla come è scritto il nome sulla carta.';
        mostraStato(`Nessuna carta "${nome}"${numero ? ` n. ${numero}` : ''}.${motivo}`, true);
        return;
      }

      const avvisi = [];
      // Il tetto va detto: chi cerca "ar" vede una manciata di risultati e deve
      // sapere che non sono tutti, o crede che la sua carta non esista.
      // Il consiglio cambia col caso: a chi ha già scritto il nome per intero —
      // "Articuno" esiste in decine di stampe — dire "scrivi di più" non serve
      // a niente, mentre il numero taglia l'elenco a una carta.
      if (troppi) {
        avvisi.push(
          numero
            ? 'Ci sono altre carte con questo nome: se non è fra queste, controlla il numero.'
            : 'Troppe carte con questo nome: aggiungi il numero stampato sulla carta.',
        );
      }
      if (nonLetti.length) avvisi.push(`${nonLetti.length} set non leggibili offline.`);
      mostraStato(avvisi.join(' '));

      mostraCandidati(trovate);
    } catch (errore) {
      mostraStato(`Errore nel caricamento dei dati: ${errore.message}`, true);
    }
  });

  /**
   * Disegna i candidati e il selettore di quante copie aggiungere.
   *
   * La spiegazione dell'ambiguità **dipende dalla strada seguita**, perché le
   * due ricerche sono ambigue per ragioni diverse: con la frazione i candidati
   * sono set che per coincidenza hanno lo stesso totale, col nome sono stampe
   * diverse della stessa carta. Dare la spiegazione sbagliata manda a
   * cercare la differenza nel posto sbagliato.
   *
   * @param {Array<{set: object, carta: object}>} trovate
   */
  function mostraCandidati(trovate) {
    risultati.replaceChildren();

    if (trovate.length > 1) {
      const avviso = document.createElement('p');
      avviso.className = 'aiuto';
      avviso.textContent =
        modoRicerca === 'nome'
          ? `${trovate.length} stampe diverse di questa carta: confronta l'illustrazione ` +
            'con quella che hai in mano e tocca la tua.'
          : `${trovate.length} set hanno lo stesso numero di carte: confronta l'illustrazione ` +
            'con la carta che hai in mano e tocca quella giusta.';
      risultati.append(avviso);
    }

    risultati.append(selettoreQuante());

    for (const { set, carta } of trovate) {
      risultati.append(rigaCandidato(set, carta));
    }
  }

  /**
   * Lo stepper delle copie e la scelta fra "ce l'ho" e "la voglio".
   *
   * Le due cose stanno insieme perché sono la stessa domanda — *quante e in che
   * senso* — e separarle avrebbe voluto dire due pannelli per un gesto solo,
   * proprio nel punto in cui si hanno le carte in mano e si va di fretta.
   */
  function selettoreQuante() {
    const riga = document.createElement('div');
    riga.className = 'quante-riga';
    riga.innerHTML = `
      <div class="quante-modo" role="group" aria-label="Cosa stai aggiungendo">
        <button type="button" class="modo${desiderio ? '' : ' attivo'}" data-modo="ho">Ce l'ho</button>
        <button type="button" class="modo${desiderio ? ' attivo' : ''}" data-modo="voglio">La voglio</button>
      </div>
      <div class="quante-stepper">
        <span class="quante-etichetta">${desiderio ? 'Ne vorrei' : 'Copie'}</span>
        <button type="button" class="meno" aria-label="Una in meno">−</button>
        <span class="quante-num">${quante}</span>
        <button type="button" class="piu" aria-label="Una in più">+</button>
      </div>
      ${
        desiderio
          ? ''
          : `<div class="quante-finitura" role="group" aria-label="Che finitura ha la carta">
        ${VARIANTI.map(
          ({ codice, etichetta }) =>
            `<button type="button" class="finitura${codice === variante ? ' attivo' : ''}" data-finitura="${codice}">${escapeHtml(etichetta)}</button>`,
        ).join('')}
      </div>`
      }
    `;
    const num = riga.querySelector('.quante-num');
    riga.querySelector('.meno').addEventListener('click', () => {
      quante = Math.max(1, quante - 1);
      num.textContent = quante;
    });
    riga.querySelector('.piu').addEventListener('click', () => {
      quante += 1;
      num.textContent = quante;
    });
    // La finitura non cambia niente a schermo se non se stessa: la si sceglie e
    // vale per i tocchi seguenti, come le copie. Sui desideri non compare —
    // "ne vorrei due, di cui una reverse" è un dettaglio che una lista della
    // spesa non porta, e la riga del desiderio non lo salverebbe comunque.
    riga.querySelectorAll('[data-finitura]').forEach((bottone) =>
      bottone.addEventListener('click', () => {
        variante = bottone.dataset.finitura;
        for (const b of riga.querySelectorAll('[data-finitura]')) {
          b.classList.toggle('attivo', b.dataset.finitura === variante);
        }
      }),
    );

    riga.querySelectorAll('[data-modo]').forEach((bottone) =>
      bottone.addEventListener('click', () => {
        desiderio = bottone.dataset.modo === 'voglio';
        // Si ridisegnano i candidati, non solo questa riga: cambia anche il
        // verbo sul tasto di ogni carta, e lasciarlo vecchio sarebbe il modo
        // più facile di catalogare come posseduta una carta che non hai.
        riga.replaceWith(selettoreQuante());
        for (const b of risultati.querySelectorAll('.candidato')) aggiornaVerbo(b);
      }),
    );
    return riga;
  }

  /**
   * Aggiorna il simbolo del tasto di una riga-candidato secondo il modo.
   * @param {HTMLElement} bottone
   */
  function aggiornaVerbo(bottone) {
    const segno = bottone.querySelector('.aggiungi');
    if (segno) segno.textContent = desiderio ? '★' : '＋';
    bottone.classList.toggle('candidato-desiderio', desiderio);
  }

  /**
   * Una riga-candidato: miniatura, nome, set, tipo e il tasto per aggiungere.
   * @param {object} set
   * @param {object} carta
   * @returns {HTMLElement}
   */
  function rigaCandidato(set, carta) {
    const bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'candidato';
    const tipo = carta.tipi?.[0] ?? 'Incolore';
    const src = urlImmagine(carta, 'griglia');
    const numero = String(carta.numero ?? '').split('/')[0];
    const chip =
      carta.categoria === 'Pokémon' && carta.tipi?.length
        ? `<span class="chip chip-tipo-carta" data-tipo="${escapeHtml(tipo)}">${escapeHtml(tipo)}</span>`
        : `<span class="chip chip-evo">${escapeHtml(carta.categoria ?? '')}</span>`;

    bottone.innerHTML = `
      <span class="mini" data-tipo="${escapeHtml(tipo)}">
        ${src ? `<img src="${src}" alt="" />` : segnaposto(carta, 'segnaposto-mini')}
      </span>
      <span class="testo">
        <span class="nome-carta">${escapeHtml(carta.nome)}</span>
        <span class="meta-carta">${escapeHtml(set.nome)} · n. ${escapeHtml(numero)}</span>
        <span class="chips">${chip}${pastigliaLingua(set)}</span>
      </span>
      <span class="aggiungi" aria-hidden="true">${desiderio ? '★' : '＋'}</span>
    `;
    if (desiderio) bottone.classList.add('candidato-desiderio');

    seImmagineRotta(bottone.querySelector('img'), carta, 'segnaposto-mini');

    bottone.addEventListener('click', async () => {
      try {
        if (desiderio) {
          await impostaDesiderio(set.id, carta.numero, quante);
          await onAggiornata();
          onMessaggio(`${carta.nome}: nella lista desideri (${quante}).`);
        } else {
          const totale = await aggiungiCopie(set.id, carta.numero, quante, variante);
          await onAggiornata();
          const finitura = VARIANTI.find((v) => v.codice === variante);
          // La finitura si dice solo quando non è quella normale: "ora ne hai 3
          // (normale)" sarebbe rumore su nove aggiunte su dieci.
          onMessaggio(
            `${carta.nome}: ora ne hai ${totale}` +
              (variante === 'normale' ? '.' : ` (+${quante} ${finitura.etichetta.toLowerCase()}).`),
          );
        }
        // Pronti per la prossima carta senza chiudere il pannello.
        risultati.replaceChildren();
        form.reset();
        mostraStato('');
        campoNumero.focus();
      } catch (errore) {
        mostraStato(`Aggiunta non riuscita: ${errore.message}`, true);
      }
    });

    return bottone;
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
