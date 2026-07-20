/**
 * Punto di ingresso dell'app: collega il DOM ai moduli dati.
 *
 * Qui non c'è logica di dominio, solo orchestrazione: leggere i campi, chiamare
 * `collezione.js`, aggiornare i componenti. Le regole stanno nei moduli di
 * `src/data/`, la resa a video nei componenti di `src/ui/`.
 *
 * @module app/app
 */

import { cercaPerNumeroStampato } from '../data/dataset.js';
import {
  aggiungiCopie,
  elencoCompleto,
  statistiche,
  SET_ENERGIE_GENERICHE,
} from '../data/collezione.js';
import { scaricaFile, importa } from '../data/scambio.js';
import { registraServiceWorker } from './registra-sw.js';
import { avviaViste } from './viste.js';
import { mostraVersione } from './versione.js';
import './vista-mazzi.js';
import '../ui/scheda-carta/scheda-carta.js';
import '../ui/griglia-collezione/griglia-collezione.js';
import '../ui/contatore-energie/contatore-energie.js';
import '../ui/visore-carta/visore-carta.js';
import '../ui/vista-regole/vista-regole.js';

const moduloRicerca = document.querySelector('#modulo-ricerca');
const moduloEnergie = document.querySelector('#modulo-energie');
const statoRicerca = document.querySelector('#stato-ricerca');
const risultati = document.querySelector('#risultati');
const griglia = document.querySelector('#griglia');
const contatore = document.querySelector('#contatore-energie');
const riepilogo = document.querySelector('#riepilogo-collezione');
const statoScambio = document.querySelector('#stato-scambio');
const fileImport = document.querySelector('#file-import');
const visore = document.querySelector('#visore');

/**
 * I nomi delle carte vengono da un dataset esterno: mai interpolati grezzi.
 * @param {string} testo
 * @returns {string}
 */
function escapeHtml(testo) {
  return String(testo ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
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

  griglia.voci = voci;
  contatore.dati = stat.energie;

  const pezzi = Object.entries(stat.perCategoria)
    .sort((a, b) => b[1] - a[1])
    .map(([categoria, quante]) => `${quante} ${categoria}`);

  riepilogo.textContent = voci.length
    ? `${stat.totaleCarte} carte in totale (${pezzi.join(', ')})`
    : 'Nessuna carta ancora catalogata.';
}

/** Disegna i candidati di una ricerca, con il modulo per aggiungerli. */
function mostraCandidati(trovate) {
  risultati.replaceChildren();

  if (trovate.length > 1) {
    const avviso = document.createElement('p');
    avviso.className = 'aiuto';
    avviso.textContent =
      `${trovate.length} set hanno lo stesso numero di carte: confronta l'illustrazione ` +
      'con la carta che hai in mano per capire qual è la tua.';
    risultati.append(avviso);
  }

  for (const { set, carta } of trovate) {
    // Ogni candidato sta in un riquadro suo: con due carte diverse che hanno lo
    // stesso numero, un pulsante "Aggiungi" sospeso sotto le schede non lascia
    // capire a quale delle due si riferisca.
    const contenitore = document.createElement('div');
    contenitore.className = 'proposta';

    const scheda = document.createElement('scheda-carta');
    scheda.nomeSet = set.nome;
    scheda.carta = carta;

    const azioni = document.createElement('div');
    azioni.className = 'azioni-aggiunta';
    azioni.innerHTML = `
      <label for="quante-${set.id}-${carta.numero}">Copie possedute</label>
      <input id="quante-${set.id}-${carta.numero}" type="number" min="1" value="1" />
      <button type="button">Aggiungi ${escapeHtml(carta.nome)}</button>
    `;

    const campo = azioni.querySelector('input');
    azioni.querySelector('button').addEventListener('click', async () => {
      const quante = Math.max(1, Number(campo.value) || 1);
      const totale = await aggiungiCopie(set.id, carta.numero, quante);
      await aggiornaCollezione();
      mostraStato(statoRicerca, `${carta.nome}: ora ne hai ${totale}.`);
      risultati.replaceChildren();
      moduloRicerca.reset();
      document.querySelector('#campo-numero').focus();
    });

    contenitore.append(scheda, azioni);
    risultati.append(contenitore);
  }
}

moduloRicerca.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  risultati.replaceChildren();

  const dati = new FormData(moduloRicerca);
  const numero = String(dati.get('numero')).trim();
  const totale = String(dati.get('totale')).trim();

  mostraStato(statoRicerca, 'Cerco…');
  try {
    // Il numero si passa così com'è digitato: gli zeri iniziali e i codici non
    // numerici (TG01, SV01) li normalizza il dataset.
    const { trovate, nonLetti } = await cercaPerNumeroStampato(numero, totale);

    if (trovate.length === 0) {
      const motivo = nonLetti.length
        ? ` Non è stato possibile leggere ${nonLetti.length} set (${nonLetti.join(', ')}): ` +
          'probabilmente sei senza rete e quei set non erano ancora stati aperti.'
        : ' Controlla il numero e il totale stampati sulla carta.';
      mostraStato(statoRicerca, `Nessuna carta ${numero}/${totale}.${motivo}`, true);
      return;
    }

    mostraStato(
      statoRicerca,
      nonLetti.length ? `Attenzione: ${nonLetti.length} set non leggibili offline.` : '',
    );
    mostraCandidati(trovate);
  } catch (errore) {
    mostraStato(statoRicerca, `Errore nel caricamento dei dati: ${errore.message}`, true);
  }
});

moduloEnergie.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const dati = new FormData(moduloEnergie);
  const tipo = String(dati.get('tipo'));
  const quante = Math.max(1, Number(dati.get('quante')) || 1);

  await aggiungiCopie(SET_ENERGIE_GENERICHE, tipo, quante);
  await aggiornaCollezione();
});

// Le schede annunciano il click da qualunque punto della pagina: un solo
// ascoltatore sul document invece di uno per scheda.
document.addEventListener('carta-scelta', (evento) => {
  visore.mostra(evento.detail.carta, evento.detail.nomeSet);
});

griglia.addEventListener('quantita-cambiata', async (evento) => {
  const { idSet, numero, delta } = evento.detail;
  await aggiungiCopie(idSet, numero, delta);
  await aggiornaCollezione();
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

aggiornaCollezione().catch((errore) => {
  riepilogo.textContent = `Impossibile leggere la collezione: ${errore.message}`;
  riepilogo.classList.add('errore');
});

registraServiceWorker();

mostraVersione(document.querySelector('#versione'));
