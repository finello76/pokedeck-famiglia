/**
 * La vista "Impostazioni": il mazzo di riferimento.
 *
 * Import ed export stanno nella stessa sezione ma restano collegati in
 * `app.js`, dove vive già tutto ciò che tocca la collezione: qui c'è solo il
 * riferimento.
 *
 * Come nelle altre viste, il modulo fa da tramite fra un componente che sa solo
 * disegnare e un modulo dati che sa solo leggere e scrivere.
 *
 * @module app/vista-impostazioni
 */

import { elencoPiani } from '../data/mazzi-salvati.js';
import { elencoPrefatti } from '../data/mazzi-prefatti.js';
import {
  leggiRiferimento,
  impostaRiferimento,
  impostaRiferimentoPrefatto,
  togliRiferimento,
} from '../data/riferimento.js';
import { forza } from '../engine/forza.js';
import '../ui/mazzo-riferimento/mazzo-riferimento.js';

const componente = document.querySelector('#riferimento');
const stato = document.querySelector('#stato-riferimento');
const prefatti = document.querySelector('#mazzi-prefatti');

/**
 * Il listino dei mazzi già pronti, con la loro forza.
 *
 * Sta in questa vista e non più sotto il wizard: è la tabella che si legge
 * **per decidere** quale mazzo eleggere a riferimento, e averla in un'altra
 * schermata obbligava a ricordarsi i numeri mentre si cambiava vista. Qui il
 * confronto è sotto gli occhi insieme alla scelta.
 *
 * @returns {Promise<void>}
 */
async function mostraPrefatti() {
  if (!prefatti) return;
  const mazzi = await elencoPrefatti();
  // Senza catalogo la sezione non esiste: è un termine di paragone, non una
  // funzione da cui dipende qualcosa.
  prefatti.hidden = !mazzi.length;
  if (!mazzi.length) return;

  const righe = mazzi
    .map((mazzo) => {
      const f = forza(mazzo, { taglia: mazzo.taglia });
      return `
        <li>
          <span class="forza-nome">${mazzo.nome}</span>
          <span class="forza-barra"><span class="forza-riempimento" style="inline-size:${f.totale}%"></span></span>
          <span class="forza-valore">${f.totale}</span>
          <span class="forza-dettaglio">${mazzo.taglia} carte${
            f.attendibile ? '' : ' · dati incompleti, valore approssimato'
          }</span>
        </li>`;
    })
    .join('');

  prefatti.innerHTML = `
    <h2>Mazzi di riferimento</h2>
    <p class="aiuto">
      Quanto valgono i mazzi già pronti, sulla stessa scala dei mazzi generati.
      Servono a capire se una partita sarà pari: un mazzo generato molto più
      forte del Kit con cui gioca l'altro non fa una partita.
    </p>
    <ul class="elenco-forza">${righe}</ul>
  `;
}

/**
 * Rilegge piani salvati e scelta corrente e li passa al componente.
 * @returns {Promise<void>}
 */
export async function aggiornaRiferimento() {
  componente.piani = await elencoPiani();
  // I prefatti portano la forza già misurata: il componente disegna e basta,
  // non gli si può chiedere di chiamare il motore.
  componente.prefatti = (await elencoPrefatti()).map((m) => {
    const misura = forza(m, { taglia: m.taglia });
    return {
      id: m.id,
      nome: m.nome,
      taglia: m.taglia,
      forza: misura.attendibile ? misura.totale : null,
    };
  });
  // Dopo le due sorgenti, così il componente può già evidenziare quello scelto:
  // al contrario il `<select>` non troverebbe l'opzione da selezionare.
  componente.scelto = await leggiRiferimento();
}

/**
 * @param {string} testo
 * @param {boolean} [errore=false]
 */
function messaggio(testo, errore = false) {
  stato.textContent = testo;
  stato.hidden = !testo;
  stato.classList.toggle('errore', errore);
}

componente.addEventListener('riferimento-scelto', async (evento) => {
  const { sorgente, idPiano, indice, idPrefatto } = evento.detail;
  try {
    const scelto =
      sorgente === 'prefatto'
        ? await impostaRiferimentoPrefatto(idPrefatto)
        : await impostaRiferimento(idPiano, indice);
    componente.scelto = scelto;
    messaggio(`«${scelto.nome}» è il mazzo di riferimento.`);
  } catch (errore) {
    messaggio(`Non si riesce a impostarlo: ${errore.message}`, true);
  }
});

componente.addEventListener('riferimento-tolto', async () => {
  await togliRiferimento();
  componente.scelto = null;
  messaggio('Nessun mazzo di riferimento: i mazzi nuovi non avranno una forza da eguagliare.');
});

// I mazzi salvati cambiano dall'altra vista: la scelta va rinfrescata a ogni
// ingresso, o si offrirebbe un elenco vecchio.
document.addEventListener('vista-cambiata', (evento) => {
  if (evento.detail.nome !== 'impostazioni') return;
  messaggio('');
  aggiornaRiferimento().catch((errore) => {
    messaggio(`Impossibile leggere i mazzi salvati: ${errore.message}`, true);
  });
  mostraPrefatti().catch(() => {
    // Il listino è un di più: se il catalogo non si carica, la scelta del
    // riferimento deve restare comunque utilizzabile.
    if (prefatti) prefatti.hidden = true;
  });
});
