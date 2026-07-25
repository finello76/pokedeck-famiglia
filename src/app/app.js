/**
 * Punto di ingresso dell'app: collega il DOM ai moduli dati.
 *
 * Qui non c'è logica di dominio, solo orchestrazione: leggere i campi, chiamare
 * `collezione.js`, aggiornare i componenti. Le regole stanno nei moduli di
 * `src/data/`, la resa a video nei componenti di `src/ui/`.
 *
 * @module app/app
 */

import {
  aggiungiCopie,
  elencoCompleto,
  statistiche,
  SET_ENERGIE_GENERICHE,
} from '../data/collezione.js';
import { scaricaFile, importa } from '../data/scambio.js';
import {
  aggiornaPrezzi,
  prezziConosciuti,
  MASSIMO_PER_VOLTA,
} from '../data/prezzi.js';
import { avviaBarraAggiornamento } from './barra-aggiornamento.js';
import { avviaViste } from './viste.js';
import { avviaTema } from './tema.js';
import { avviaAggiunta } from './aggiunta.js';
import { mostraVersione } from './versione.js';
import './vista-mazzi.js';
import './vista-personalizzato.js';
import '../ui/scheda-carta/scheda-carta.js';
import '../ui/griglia-collezione/griglia-collezione.js';
import { carteMancanti } from '../data/completamento.js';
import '../ui/contatore-energie/contatore-energie.js';
import '../ui/visore-carta/visore-carta.js';
import '../ui/vista-regole/vista-regole.js';

const griglia = document.querySelector('#griglia');
const contatore = document.querySelector('#contatore-energie');
const riepilogo = document.querySelector('#riepilogo-collezione');
const statoScambio = document.querySelector('#stato-scambio');
const fileImport = document.querySelector('#file-import');
const visore = document.querySelector('#visore');
const toast = document.querySelector('#toast');

/**
 * Mostra un messaggio effimero (toast) in fondo alla pagina.
 * @param {string} testo
 * @returns {void}
 */
let timerToast;
function mostraToast(testo) {
  if (!toast) return;
  toast.textContent = testo;
  toast.hidden = false;
  // Riavvia l'animazione anche quando un toast è già a schermo: senza il
  // reflow forzato il browser non la fa ripartire.
  toast.classList.remove('mostra');
  void toast.offsetWidth;
  toast.classList.add('mostra');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => {
    toast.hidden = true;
    toast.classList.remove('mostra');
  }, 2200);
}

/**
 * Scrive un messaggio in un elemento di stato.
 * @param {HTMLElement} elemento
 * @param {string} testo stringa vuota per nascondere
 * @param {boolean} [errore=false]
 */
function mostraStato(elemento, testo, errore = false) {
  elemento.textContent = testo;
  elemento.hidden = !testo;
  elemento.classList.toggle('errore', errore);
  elemento.classList.toggle('stato', !errore);
}

/**
 * Ricarica collezione, griglia e statistiche dal database.
 *
 * Unico punto di aggiornamento: qualunque modifica finisce qui, così le tre
 * viste non possono mai disallinearsi fra loro.
 *
 * @returns {Promise<void>}
 */
async function aggiornaCollezione() {
  const voci = await elencoCompleto();
  const stat = await statistiche(voci);

  // Il confronto con la collezione di riferimento lo fa il livello dati: la
  // griglia riceve una funzione e non sa da dove arrivino le carte.
  griglia.caricaMancanti = (idSet) => carteMancanti(idSet, voci);
  // Le energie base generiche non vanno nella griglia: non hanno scansione né
  // numero di collezione e si contano già nel contatore dedicato qui sotto.
  griglia.voci = voci.filter((voce) => voce.idSet !== SET_ENERGIE_GENERICHE);
  contatore.dati = stat.energie;

  // I prezzi già scaricati si rimostrano subito, anche offline: sono l'ultima
  // quotazione nota, con la sua data. Non si va in rete finché non lo chiede
  // qualcuno col pulsante.
  griglia.prezzi = await prezziConosciuti().catch(() => new Map());

  // Il riepilogo della collezione (conteggi, sezioni) lo mostra ora la griglia:
  // qui la riga serve solo per errori di caricamento, quindi resta nascosta.
  riepilogo.hidden = true;
  riepilogo.classList.remove('errore');
}

// Le energie base si aggiungono e si tolgono dal contatore stesso, una alla
// volta: numero di collezione non ne hanno, quindi la "chiave" è il tipo.
contatore.addEventListener('energia-cambiata', async (evento) => {
  const { tipo, delta } = evento.detail;
  await aggiungiCopie(SET_ENERGIE_GENERICHE, tipo, delta);
  await aggiornaCollezione();
});

// Le schede annunciano il click da qualunque punto della pagina: un solo
// ascoltatore sul document invece di uno per scheda.
document.addEventListener('carta-scelta', (evento) => {
  // `lista` e `indice` li aggiunge chi contiene le carte (griglia o mazzo), che
  // è l'unico a conoscerne l'ordine: se ci sono, il visore ci scorre dentro.
  const { carta, nomeSet, lista, indice } = evento.detail;
  visore.mostra(carta, nomeSet, lista, indice);
});

// La stessa modifica arriva da due parti: gli stepper della griglia e quello
// del visore a schermo intero. Un solo gestore per entrambe.
async function cambiaQuantita(evento) {
  const { idSet, numero, delta } = evento.detail;
  await aggiungiCopie(idSet, numero, delta);
  await aggiornaCollezione();
}
griglia.addEventListener('quantita-cambiata', cambiaQuantita);
visore.addEventListener('quantita-cambiata', cambiaQuantita);

// "Calcola quotazione": l'unico punto in cui l'app va in rete di sua volontà.
// La griglia dice quali carte sta mostrando, qui si scaricano i prezzi e le si
// restituiscono. Il tetto per volta è di `data/prezzi.js`: una richiesta per
// carta, e l'intera collezione sarebbero migliaia.
let quotazioneInCorso = false;
griglia.addEventListener('quotazione-richiesta', async (evento) => {
  if (quotazioneInCorso) return;
  const voci = evento.detail.voci.filter((v) => v.carta);

  if (voci.length === 0) {
    griglia.statoQuotazione = 'Nessuna carta da quotare fra quelle a schermo.';
    return;
  }
  if (voci.length > MASSIMO_PER_VOLTA) {
    griglia.statoQuotazione =
      `Sono ${voci.length} carte: si quotano le prime ${MASSIMO_PER_VOLTA}. ` +
      'Restringi coi filtri (per esempio per rarità) per avere il resto.';
  }

  quotazioneInCorso = true;
  try {
    const { falliti, quotate } = await aggiornaPrezzi(voci, {
      avanzamento: (fatte, totale) => {
        griglia.statoQuotazione = `Chiedo i prezzi… ${fatte}/${Math.min(totale, MASSIMO_PER_VOLTA)}`;
      },
    });
    griglia.prezzi = await prezziConosciuti();
    griglia.statoQuotazione =
      `${quotate} carte quotate` +
      (falliti ? `, ${falliti} non lette (rete assente?)` : '') +
      '. Prezzi Cardmarket, indicativi.';
  } catch (errore) {
    griglia.statoQuotazione = `Quotazione non riuscita: ${errore.message}`;
  } finally {
    quotazioneInCorso = false;
  }
});

document.querySelector('#bottone-esporta').addEventListener('click', async () => {
  try {
    const nome = await scaricaFile();
    mostraStato(statoScambio, `Esportato in ${nome}.`);
  } catch (errore) {
    mostraStato(statoScambio, `Export fallito: ${errore.message}`, true);
  }
});

document.querySelector('#bottone-importa').addEventListener('click', () => fileImport.click());

fileImport.addEventListener('change', async () => {
  const file = fileImport.files?.[0];
  if (!file) return;

  // L'import sovrascrive dati esistenti: si chiede conferma, indicando cosa
  // succede alle carte non presenti nel file.
  const sostituisci = confirm(
    'Sostituire la collezione attuale?\n\n' +
      'OK = cancella tutto e carica il file.\n' +
      'Annulla = unisci, tenendo le carte che non sono nel file.',
  );

  try {
    const esito = await importa(await file.text(), { sostituisci });
    await aggiornaCollezione();
    mostraStato(
      statoScambio,
      `Importate ${esito.importate} carte (${esito.sostituito ? 'sostituzione' : 'unione'}).`,
    );
  } catch (errore) {
    mostraStato(statoScambio, `Import fallito: ${errore.message}`, true);
  } finally {
    // Senza questo, riselezionare lo stesso file non scatena 'change'.
    fileImport.value = '';
  }
});

avviaViste();
avviaTema(document.querySelector('#cambia-tema'));
avviaAggiunta({ onAggiornata: aggiornaCollezione, onMessaggio: mostraToast });

aggiornaCollezione().catch((errore) => {
  riepilogo.hidden = false;
  riepilogo.textContent = `Impossibile leggere la collezione: ${errore.message}`;
  riepilogo.classList.add('errore');
});

// L'aggiornamento non è automatico: ricaricare butterebbe via i mazzi appena
// generati. Si avvisa e si lascia decidere — ma l'avviso deve esserci, o su
// telefono non c'è modo di uscire dalla versione vecchia.
avviaBarraAggiornamento({
  barra: document.querySelector('#barra-aggiornamento'),
  versione: document.querySelector('#versione'),
});

mostraVersione(document.querySelector('#versione'));
