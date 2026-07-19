/**
 * Punto di ingresso dell'app: collega il DOM della pagina ai moduli dati.
 *
 * In v1 fa una cosa sola — cercare una carta per numero/totale — perché serve a
 * verificare che dataset, componenti e service worker funzionino insieme.
 * Catalogo e IndexedDB arrivano nello step successivo.
 *
 * @module app/app
 */

import { elencoSet, cercaPerNumeroStampato } from '../data/dataset.js';
import { registraServiceWorker } from './registra-sw.js';
import '../ui/scheda-carta/scheda-carta.js';

const modulo = document.querySelector('#modulo-ricerca');
const stato = document.querySelector('#stato-ricerca');
const risultati = document.querySelector('#risultati');
const elencoSetDom = document.querySelector('#elenco-set');

/**
 * Mostra un messaggio sotto il modulo.
 * @param {string} testo
 * @param {boolean} [errore=false]
 */
function mostraStato(testo, errore = false) {
  stato.textContent = testo;
  stato.hidden = !testo;
  stato.classList.toggle('errore', errore);
  stato.classList.toggle('stato', !errore);
}

/**
 * Disegna i candidati trovati.
 * @param {Array<{set: object, carta: object}>} trovate
 */
function mostraRisultati(trovate) {
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
    const scheda = document.createElement('scheda-carta');
    scheda.nomeSet = set.nome;
    scheda.carta = carta;
    risultati.append(scheda);
  }
}

modulo.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  risultati.replaceChildren();

  const dati = new FormData(modulo);
  const numero = String(dati.get('numero')).trim();
  const totale = String(dati.get('totale')).trim();

  mostraStato('Cerco…');
  try {
    // Il numero si passa così com'è digitato: gli zeri iniziali e i codici non
    // numerici (TG01, SV01) li normalizza il dataset.
    const trovate = await cercaPerNumeroStampato(numero, totale);

    if (trovate.length === 0) {
      mostraStato(
        `Nessuna carta ${numero}/${totale} nei set scaricati. ` +
          'Se il set non è ancora nella collezione, va aggiunto in tools/set-posseduti.json.',
        true,
      );
      return;
    }
    mostraStato('');
    mostraRisultati(trovate);
  } catch (errore) {
    mostraStato(`Errore nel caricamento dei dati: ${errore.message}`, true);
  }
});

/** Riempie l'elenco dei set disponibili, così si vede subito cosa c'è. */
async function mostraSetDisponibili() {
  try {
    const set = await elencoSet();
    elencoSetDom.classList.remove('stato');
    elencoSetDom.replaceChildren(
      ...set.map((s) => {
        const li = document.createElement('li');
        li.textContent = `${s.nome} — ${s.totale} carte (id ${s.id})`;
        return li;
      }),
    );
  } catch (errore) {
    elencoSetDom.replaceChildren(
      Object.assign(document.createElement('li'), {
        className: 'errore',
        textContent: `Dati non caricati: ${errore.message}`,
      }),
    );
  }
}

mostraSetDisponibili();
registraServiceWorker();
