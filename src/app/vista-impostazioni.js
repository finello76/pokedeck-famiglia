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
});
