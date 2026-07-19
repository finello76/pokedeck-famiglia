/**
 * La vista "Crea mazzi": collega il wizard al motore e mostra il risultato.
 *
 * Qui non c'è logica di gioco: le decisioni le prende `pianifica()`. Questo
 * modulo raccoglie le risposte, gliele passa e disegna ciò che torna indietro.
 *
 * @module app/vista-mazzi
 */

import { elencoCompleto, statistiche } from '../data/collezione.js';
import { pianifica, carteConDeroga } from '../engine/pianifica.js';
import { salvaPiano, elencoPiani, leggiPiano, eliminaPiano } from '../data/mazzi-salvati.js';
import { opzioniDaRisposte } from '../ui/procedura-guidata/procedura-guidata.js';
import '../ui/procedura-guidata/procedura-guidata.js';
import '../ui/mazzo-generato/mazzo-generato.js';

const wizard = document.querySelector('#wizard');
const risultato = document.querySelector('#risultato-mazzi');
const salvati = document.querySelector('#mazzi-salvati');
const zonaWizard = document.querySelector('#zona-wizard');

/** @type {object|null} ultimo piano mostrato */
let pianoCorrente = null;

/**
 * Prepara il wizard con i dati della collezione, così può saltare le domande
 * che non hanno senso (i proxy Pokémon senza evoluzioni orfane).
 * @returns {Promise<void>}
 */
export async function preparaWizard() {
  const voci = await elencoCompleto();
  const stat = await statistiche(voci);
  wizard.contesto = {
    carte: stat.totaleCarte,
    energie: stat.energie.totaleBase,
    orfani: (await import('../engine/analisi.js')).analizza(voci).orfani.length,
  };
  await mostraSalvati();
}

/**
 * Genera i mazzi a partire dalle risposte del wizard.
 * @param {object} risposte
 * @returns {Promise<void>}
 */
async function genera(risposte) {
  const opzioni = opzioniDaRisposte(risposte);
  const voci = await elencoCompleto();

  if (voci.length === 0) {
    risultato.innerHTML =
      '<p class="errore">La collezione è vuota: cataloga qualche carta prima di generare i mazzi.</p>';
    return;
  }

  pianoCorrente = pianifica(voci, opzioni);
  pianoCorrente.opzioni = opzioni;
  disegnaPiano(pianoCorrente, opzioni);
}

/**
 * Disegna mazzi, regole e comandi.
 * @param {object} piano
 * @param {object} opzioni
 */
function disegnaPiano(piano, opzioni) {
  zonaWizard.hidden = true;
  risultato.hidden = false;
  risultato.replaceChildren();

  const incompleti = piano.carenze.filter((c) => c.codice === 'mazzo-incompleto');

  const intestazione = document.createElement('div');
  intestazione.className = 'no-stampa';
  intestazione.innerHTML = `
    <h2>I mazzi</h2>
    <p class="aiuto">
      ${piano.mazzi.length} mazzi da ${opzioni.taglia} carte.
      Pesca le carte elencate dalla tua collezione.
    </p>
    ${spiegazioneLineeEvolutive(piano)}
    ${
      incompleti.length
        ? `<p class="errore">Attenzione: ${incompleti.length} mazzo/i non si è potuto completare
             (${incompleti.map((c) => `${c.mazzo}: ${c.dati.effettive}/${c.dati.previste}`).join(', ')}).
             Servono più carte in collezione.</p>`
        : ''
    }
    <div class="azioni">
      <button type="button" id="bottone-stampa">Stampa mazzi e regole</button>
      <button type="button" id="bottone-salva" class="secondario">Salva questi mazzi</button>
      <button type="button" id="bottone-nuovo" class="secondario">Ricomincia</button>
    </div>
    <p id="stato-mazzi" class="stato" hidden></p>
  `;
  risultato.append(intestazione);

  const elenco = document.createElement('div');
  elenco.className = 'elenco-mazzi';
  for (const mazzo of piano.mazzi) {
    const elemento = document.createElement('mazzo-generato');
    elemento.conDeroga = carteConDeroga(mazzo, piano.permessi, piano.carenze);
    elemento.mazzo = mazzo;
    elenco.append(elemento);
  }
  risultato.append(elenco);
  risultato.append(fogliaRegole(piano.regole));

  intestazione.querySelector('#bottone-stampa').addEventListener('click', () => window.print());
  intestazione.querySelector('#bottone-nuovo').addEventListener('click', () => ricomincia());
  intestazione.querySelector('#bottone-salva').addEventListener('click', async () => {
    const stato = intestazione.querySelector('#stato-mazzi');
    try {
      await salvaPiano(piano, opzioni);
      await mostraSalvati();
      stato.textContent = 'Mazzi salvati.';
      stato.hidden = false;
    } catch (errore) {
      stato.textContent = `Salvataggio fallito: ${errore.message}`;
      stato.hidden = false;
    }
  });
}

/**
 * Spiega perché nei mazzi compaiono evoluzioni giocate come Base invece di
 * vere catene evolutive.
 *
 * Serve perché il risultato è controintuitivo: chi ha chiesto mazzi con le
 * evoluzioni si aspetta Base + evoluzione, e trovarsi un Livello 2 giocato
 * dalla mano sembra un errore del programma. Non lo è: è l'unica cosa
 * possibile con questa collezione, e va detto.
 *
 * @param {object} piano
 * @returns {string} HTML, vuoto se non c'è niente da spiegare
 */
function spiegazioneLineeEvolutive(piano) {
  const linee = piano.analisi?.linee ?? [];
  const complete = linee.filter(
    (l) => l.giocabile && l.livelli.filter((liv) => liv.length).length > 1,
  ).length;
  const derogate = piano.carenze
    .filter((c) => c.codice === 'orfani-nel-mazzo')
    .flatMap((c) => c.dati.orfani);

  if (!derogate.length) return '';

  const dettaglio =
    complete === 0
      ? 'Nella tua collezione <strong>non c\'è nessuna linea evolutiva completa</strong>: ' +
        'per ogni evoluzione che possiedi manca la carta da cui evolve.'
      : `Nella tua collezione ci sono solo ${complete} linee evolutive complete, ` +
        'non abbastanza per riempire i mazzi.';

  return `
    <div class="nota-spiegazione">
      <h3>Perché ci sono evoluzioni giocate come Base?</h3>
      <p>
        ${dettaglio}
        Le carte contrassegnate
        (${derogate.map((o) => o.nome).join(', ')})
        si possono usare solo grazie alla regola della casa: senza, resterebbero fuori dai mazzi.
      </p>
      <p class="aiuto">
        Per avere vere catene evolutive servirebbero le pre-evoluzioni mancanti
        (${[...new Set(derogate.map((o) => o.manca).filter(Boolean))].join(', ') || 'non identificabili dai dati'}),
        oppure i proxy stampabili.
      </p>
    </div>`;
}

/**
 * Il foglio regole: solo le regole attivate, ciascuna con la motivazione.
 * @param {object[]} regole
 * @returns {HTMLElement}
 */
function fogliaRegole(regole) {
  const sezione = document.createElement('section');
  sezione.className = 'foglio-regole pannello';

  if (!regole.length) {
    sezione.innerHTML = `
      <h2>Regole della casa</h2>
      <p>Nessuna regola speciale: la collezione basta per giocare con le regole ufficiali.</p>`;
    return sezione;
  }

  sezione.innerHTML = `
    <h2>Regole della casa</h2>
    <p class="aiuto no-stampa">
      Queste regole valgono solo per questa partita. Ognuna esiste per un motivo
      preciso, scritto sotto: leggetele insieme prima di cominciare.
    </p>
    ${regole
      .map(
        (r) => `
      <div class="regola">
        <h3>${r.titolo}</h3>
        <p class="testo">${r.testo}</p>
        <p class="motivazione">Perché: ${r.motivazione}</p>
      </div>`,
      )
      .join('')}
  `;
  return sezione;
}

/** Torna al wizard per una nuova generazione. */
function ricomincia() {
  risultato.hidden = true;
  zonaWizard.hidden = false;
  wizard.ricomincia();
}

/** Elenco dei mazzi già salvati, con anteprima e cancellazione. */
async function mostraSalvati() {
  const piani = await elencoPiani();
  if (!piani.length) {
    salvati.innerHTML = '<p class="stato">Nessun mazzo salvato.</p>';
    return;
  }

  salvati.innerHTML = `
    <h3>Mazzi salvati</h3>
    <ul class="elenco-salvati">
      ${piani
        .map(
          (p) => `
        <li>
          <span>
            ${new Date(p.creatoIl).toLocaleString('it-IT')} —
            ${p.mazzi.length} mazzi da ${p.opzioni?.taglia ?? '?'} carte
          </span>
          <span class="comandi-salvato">
            <button type="button" class="collegamento" data-apri="${p.id}">Apri</button>
            <button type="button" class="collegamento" data-elimina="${p.id}">Elimina</button>
          </span>
        </li>`,
        )
        .join('')}
    </ul>
  `;

  salvati.querySelectorAll('[data-apri]').forEach((b) =>
    b.addEventListener('click', async () => {
      const piano = await leggiPiano(b.dataset.apri);
      if (piano) disegnaPiano(piano, piano.opzioni ?? {});
    }),
  );
  salvati.querySelectorAll('[data-elimina]').forEach((b) =>
    b.addEventListener('click', async () => {
      await eliminaPiano(b.dataset.elimina);
      await mostraSalvati();
    }),
  );
}

wizard.addEventListener('completata', (evento) => {
  genera(evento.detail).catch((errore) => {
    risultato.hidden = false;
    risultato.innerHTML = `<p class="errore">Generazione fallita: ${errore.message}</p>`;
  });
});

// Il wizard va ripreparato ogni volta che si entra nella vista: la collezione
// può essere cambiata nel frattempo.
document.addEventListener('vista-cambiata', (evento) => {
  if (evento.detail.nome === 'mazzi') preparaWizard();
});
