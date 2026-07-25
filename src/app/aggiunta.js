/**
 * Aggiunta di una carta: pulsante flottante (FAB) + pannello a comparsa.
 *
 * È l'azione più ripetuta dell'app — si usa col telefono in mano mentre si
 * sfogliano le carte fisiche — quindi sta dietro a un pulsante sempre a portata
 * di pollice invece che in fondo alla pagina. Si digita il numero stampato
 * (`118/191`), l'app cerca in tutti i set e mostra i candidati; se il numero è
 * ambiguo (più set con lo stesso totale) si toccano per scegliere.
 *
 * Qui non c'è logica di dominio: la ricerca la fa `cercaPerNumeroStampato`, la
 * scrittura `aggiungiCopie`. Questo modulo raccoglie l'input, disegna i
 * candidati e richiama chi deve aggiornare la collezione.
 *
 * @module app/aggiunta
 */

import { cercaPerNumeroStampato, urlImmagine } from '../data/dataset.js';
import { aggiungiCopie, impostaDesiderio } from '../data/collezione.js';
import { segnaposto, seImmagineRotta } from '../ui/segnaposto.js';
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
  const campoNumero = document.querySelector('#campo-numero');
  const stato = document.querySelector('#stato-ricerca');
  const risultati = document.querySelector('#risultati');
  if (!fab || !foglio || !form) return;

  /** Quante copie aggiunge un tocco su un candidato. */
  let quante = 1;

  /** Se il tocco mette la carta nella lista desideri invece che in collezione. */
  let desiderio = false;

  const suCatalogo = () => (location.hash.slice(1) || 'catalogo') === 'catalogo';
  const aggiornaFab = () => {
    fab.hidden = !(suCatalogo() && foglio.hidden);
  };

  function apri() {
    quante = 1;
    // Si riparte sempre da "ce l'ho": è il caso normale, e ricordare l'ultima
    // scelta farebbe catalogare come desiderate le carte che si hanno in mano.
    desiderio = false;
    foglio.hidden = false;
    bloccaScorrimento();
    aggiornaFab();
    campoNumero.focus();
  }

  function chiudi() {
    foglio.hidden = true;
    sbloccaScorrimento();
    form.reset();
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
  });
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

  /**
   * Disegna i candidati e il selettore di quante copie aggiungere.
   * @param {Array<{set: object, carta: object}>} trovate
   */
  function mostraCandidati(trovate) {
    risultati.replaceChildren();

    if (trovate.length > 1) {
      const avviso = document.createElement('p');
      avviso.className = 'aiuto';
      avviso.textContent =
        `${trovate.length} set hanno lo stesso numero di carte: confronta l'illustrazione ` +
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
        <span class="chips">${chip}</span>
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
          const totale = await aggiungiCopie(set.id, carta.numero, quante);
          await onAggiornata();
          onMessaggio(`${carta.nome}: ora ne hai ${totale}.`);
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
