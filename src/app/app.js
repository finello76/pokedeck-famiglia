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
  impostaDesiderio,
  impostaPreferita,
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
import { avviaInvitoInstallazione } from './installazione.js';
import { avviaViste } from './viste.js';
import { avviaTema } from './tema.js';
import { avviaAggiunta } from './aggiunta.js';
import { mostraVersione } from './versione.js';
import './vista-mazzi.js';
import './vista-impostazioni.js';
import './vista-personalizzato.js';
import '../ui/scheda-carta/scheda-carta.js';
import '../ui/griglia-collezione/griglia-collezione.js';
import { carteMancanti, mancantiPerNome } from '../data/completamento.js';
import '../ui/contatore-energie/contatore-energie.js';
import '../ui/visore-carta/visore-carta.js';
import '../ui/vista-regole/vista-regole.js';
import '../ui/linea-evolutiva/linea-evolutiva.js';
import { avviaLineaEvolutiva } from './linea-evolutiva.js';

const griglia = document.querySelector('#griglia');
// La vista Preferiti è la stessa griglia con un filtro che l'utente non può
// togliere: nessun componente nuovo, nessun secondo modo di disegnare una card.
const grigliaPreferiti = document.querySelector('#griglia-preferiti');
grigliaPreferiti.titolo = 'I preferiti';
grigliaPreferiti.filtriFissi = { preferito: 'solo' };
/** Le griglie da tenere allineate: quello che vale per una vale per l'altra. */
const griglie = [griglia, grigliaPreferiti];
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
  // La griglia mostra anche i desideri, contrassegnati; tutto il resto —
  // statistiche, conteggio energie, carte mancanti — lavora solo su ciò che si
  // possiede davvero, o direbbe di avere carte che non hai.
  const voci = await elencoCompleto({ conDesideri: true });
  const possedute = voci.filter((v) => !v.desiderata);
  const stat = await statistiche(possedute);

  // Il confronto con la collezione di riferimento lo fa il livello dati: la
  // griglia riceve una funzione e non sa da dove arrivino le carte.
  griglia.caricaMancanti = (idSet) => carteMancanti(idSet, possedute);
  // La ricerca per nome deve trovare anche ciò che manca nei set di cui non
  // possiedi niente: là non c'è nessuna sezione da riempire. Qui si passano
  // **tutte** le voci, desideri compresi, o una carta già nella lista dei
  // desideri comparirebbe due volte.
  griglia.cercaMancantiPerNome = (testo) => mancantiPerNome(testo, voci);
  // Le energie base generiche non vanno nella griglia: non hanno scansione né
  // numero di collezione e si contano già nel contatore dedicato qui sotto.
  const daMostrare = voci.filter((voce) => voce.idSet !== SET_ENERGIE_GENERICHE);
  griglia.voci = daMostrare;
  // Alla griglia dei preferiti si passano **tutte** le voci, non solo quelle col
  // cuore: è il suo filtro fisso a scremarle. Passandole già scremate, i suoi
  // menu a tendina (serie, set, rarità) si ridurrebbero a ciò che è preferito e
  // non si capirebbe più cosa stanno filtrando.
  grigliaPreferiti.voci = daMostrare;
  contatore.dati = stat.energie;

  // I prezzi già scaricati si rimostrano subito, anche offline: sono l'ultima
  // quotazione nota, con la sua data. Non si va in rete finché non lo chiede
  // qualcuno col pulsante.
  const prezzi = await prezziConosciuti().catch(() => new Map());
  for (const g of griglie) g.prezzi = prezzi;

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
for (const g of griglie) g.addEventListener('quantita-cambiata', cambiaQuantita);
visore.addEventListener('quantita-cambiata', cambiaQuantita);

// Il cuore dei preferiti. La griglia si è già accesa da sola: qui si scrive nel
// database e si avvisano **tutte** le griglie, così le due viste (catalogo e
// preferiti) restano d'accordo — togliendo il cuore dai Preferiti, la carta
// deve sparire di lì.
//
// Non si passa da `aggiornaCollezione()`: un cuore non cambia né le statistiche
// né le energie né i prezzi, e ricaricare tutto significava rifare da capo
// l'intera griglia. Chi era in fondo alla collezione si ritrovava in cima a ogni
// carta messa fra i preferiti, che è esattamente il momento in cui non vuoi
// perdere il segno. Vedi `aggiornaPreferita()` in griglia-collezione.js.
for (const g of griglie) {
  g.addEventListener('preferita-cambiata', async (evento) => {
    const { idSet, numero, preferita } = evento.detail;
    // Lo stato vero lo decide il livello dati, che sa dire di no: su una carta
    // desiderata il cuore non si mette, e la risposta rimette a posto quello
    // che il tocco aveva già acceso.
    const stato = await impostaPreferita(idSet, numero, preferita);
    for (const altra of griglie) altra.aggiornaPreferita(idSet, numero, stato);
  });
}

// La stella sulle carte che non hai: le mette nella lista desideri, una copia.
// Non passa da `cambiaQuantita`: là si contano le carte tue, qui si dichiara di
// volerne una — due store diversi della stessa riga (vedi `impostaDesiderio`).
async function vogliCarta(evento) {
  const { idSet, numero } = evento.detail;
  await impostaDesiderio(idSet, numero, 1);
  await aggiornaCollezione();
  mostraToast('Aggiunta alla lista desideri.');
}
for (const g of griglie) g.addEventListener('desiderio-richiesto', vogliCarta);
// Anche dal visore a schermo intero, dove la stessa carta si guarda da vicino.
visore.addEventListener('desiderio-richiesto', vogliCarta);

// "Linea evolutiva", il pulsante che nei Preferiti sta al posto degli stepper.
// La finestra si apre subito e i gradini arrivano dopo: cercare Machop e
// Machamp nel catalogo può voler dire scaricare il file di un set.
avviaLineaEvolutiva(griglie, document.querySelector('#linea'));

// "Calcola quotazione": l'unico punto in cui l'app va in rete di sua volontà.
// La griglia dice quali carte sta mostrando, qui si scaricano i prezzi e le si
// restituiscono. Il tetto per volta è di `data/prezzi.js`: una richiesta per
// carta, e l'intera collezione sarebbero migliaia.
let quotazioneInCorso = false;
async function chiediQuotazione(evento) {
  if (quotazioneInCorso) return;
  // Il messaggio va scritto sulla griglia da cui è partita la richiesta: il
  // pulsante sta in entrambe, e rispondere sempre a quella del catalogo
  // lascerebbe muta quella dei preferiti.
  const griglia = evento.currentTarget;
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
    // I prezzi sono della collezione, non della vista: si aggiornano entrambe,
    // o tornando al catalogo la stessa carta risulterebbe non quotata.
    const aggiornati = await prezziConosciuti();
    for (const g of griglie) g.prezzi = aggiornati;
    griglia.statoQuotazione =
      `${quotate} carte quotate` +
      (falliti ? `, ${falliti} non lette (rete assente?)` : '') +
      '. Prezzi Cardmarket, indicativi.';
  } catch (errore) {
    griglia.statoQuotazione = `Quotazione non riuscita: ${errore.message}`;
  } finally {
    quotazioneInCorso = false;
  }
}
for (const g of griglie) g.addEventListener('quotazione-richiesta', chiediQuotazione);

document.querySelector('#bottone-esporta').addEventListener('click', async () => {
  try {
    const nome = await scaricaFile();
    mostraStato(statoScambio, `Dati esportati nel file ${nome}.`);
  } catch (errore) {
    mostraStato(statoScambio, `Esportazione non riuscita: ${errore.message}`, true);
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
    // I mazzi si nominano solo se ce n'erano: "e 0 mazzi" su un file di sola
    // collezione sembrerebbe che qualcosa sia andato perso.
    const conMazzi = esito.mazzi ? ` e ${esito.mazzi} ${esito.mazzi === 1 ? 'mazzo' : 'mazzi'}` : '';
    mostraStato(
      statoScambio,
      `Importate ${esito.importate} carte${conMazzi} (${esito.sostituito ? 'sostituzione' : 'unione'}).`,
    );
  } catch (errore) {
    mostraStato(statoScambio, `Importazione non riuscita: ${errore.message}`, true);
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

// L'invito a installare. Va dopo la barra di aggiornamento perché le due
// possono comparire insieme, e in quel caso l'aggiornamento viene prima: è
// l'unico modo di uscire da una versione rotta, installare può aspettare.
avviaInvitoInstallazione({
  barra: document.querySelector('#barra-installa'),
  // Il pannello in Regole è l'ancora: la barra si chiude e può essere zittita
  // per sempre, ma un modo per installare deve restare raggiungibile.
  pannello: document.querySelector('#pannello-installa'),
});

mostraVersione(document.querySelector('#versione'));
