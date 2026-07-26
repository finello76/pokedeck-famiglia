/**
 * La vista "Crea mazzi": collega il wizard al motore e mostra il risultato.
 *
 * Qui non c'è logica di gioco: le decisioni le prende `pianifica()`. Questo
 * modulo raccoglie le risposte, gliele passa e disegna ciò che torna indietro.
 *
 * @module app/vista-mazzi
 */

import { elencoCompleto, statistiche } from '../data/collezione.js';
import { indiceEvoluzioni, preEvoluzioniNonPokemon } from '../data/dataset.js';
import { bilancia, squilibrio, squilibrati as mazziSquilibrati } from '../engine/bilancia.js';
import { pianifica, rivaluta, carteConDeroga } from '../engine/pianifica.js';
import { salvaPiano, elencoPiani, leggiPiano, eliminaPiano } from '../data/mazzi-salvati.js';
import { opzioniDaRisposte } from '../ui/procedura-guidata/procedura-guidata.js';
import { arricchisciProxy, foglioProxy } from './foglio-proxy.js';
import { apriSostituzione } from './sostituzione.js';
import { chiediNome } from './chiedi-nome.js';
import { analizza } from '../engine/analisi.js';
import '../ui/procedura-guidata/procedura-guidata.js';
import '../ui/mazzo-generato/mazzo-generato.js';
import '../ui/elenco-salvati/elenco-salvati.js';

const wizard = document.querySelector('#wizard');
const risultato = document.querySelector('#risultato-mazzi');
const salvati = document.querySelector('#mazzi-salvati');
const zonaWizard = document.querySelector('#zona-wizard');

/** @type {object|null} ultimo piano mostrato */
let pianoCorrente = null;

/** @type {object|null} risposte del wizard, per poter rigenerare senza rifarlo */
let ultimeRisposte = null;

/**
 * Un seme nuovo per ogni generazione.
 *
 * Il motore è deterministico apposta (mazzi salvati riproducibili, test
 * stabili): senza un seme diverso a ogni giro produrrebbe sempre gli stessi
 * mazzi dalla stessa collezione. Il caso lo introduce qui il livello
 * applicativo, così il motore resta puro.
 *
 * @returns {number}
 */
function nuovoSeme() {
  return Math.floor(Math.random() * 2 ** 31);
}

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
async function genera(risposte, seme = nuovoSeme()) {
  ultimeRisposte = risposte;
  const voci = await elencoCompleto();

  if (voci.length === 0) {
    risultato.innerHTML =
      '<p class="errore">La collezione è vuota: cataloga qualche carta prima di generare i mazzi.</p>';
    return;
  }

  // L'indice serve al motore per ricostruire le linee evolutive intere, fino
  // alla Base che non possiedi; l'elenco dei fossili gli evita di stampare
  // come Pokémon una carta Allenatore (Omanyte "evolve" da Vecchio
  // Helixfossile). Il motore resta puro: i dati glieli passa l'app.
  const opzioni = {
    ...opzioniDaRisposte(risposte),
    seme,
    indiceEvoluzioni: await indiceEvoluzioni(),
    nonPokemon: await preEvoluzioniNonPokemon(),
  };
  pianoCorrente = pianifica(voci, opzioni);
  pianoCorrente.opzioni = opzioni;
  // Il motore dei proxy conosce solo i nomi: le scansioni le cerca il livello
  // applicativo nel dataset, prima di disegnare.
  await arricchisciProxy(pianoCorrente);

  // L'equilibrio si rimisura **dopo** l'arricchimento, e il riequilibrio si
  // rifà con i dati completi: una carta da stampare arriva dal motore col solo
  // nome, e solo qui acquista PS e attacchi veri. Misurata prima, la forza di
  // un mazzo pieno di stampe risultava molto più bassa del vero — e il
  // bilanciamento lavorava su numeri che non descrivevano quei mazzi.
  const scambi = bilancia(pianoCorrente.mazzi, {
    indiceEvoluzioni: opzioni.indiceEvoluzioni,
    nonPokemon: opzioni.nonPokemon,
  });
  pianoCorrente.equilibrio = {
    ...squilibrio(pianoCorrente.mazzi),
    scambi: [...(pianoCorrente.equilibrio?.scambi ?? []), ...scambi],
  };

  disegnaPiano(pianoCorrente, opzioni);
}

/**
 * Se i mazzi di questo piano sono troppo diversi fra loro.
 * @param {object} piano
 * @returns {boolean}
 */
function squilibrati(piano) {
  return mazziSquilibrati(piano.equilibrio);
}

/**
 * La riga che dice quanto i mazzi si somigliano.
 *
 * Va detto **prima** della partita: uno squilibrio scoperto giocando è una
 * partita rovinata, e chi legge non ha modo di sapere che il motore ci ha
 * provato.
 *
 * @param {object} piano
 * @returns {string} HTML
 */
function statoEquilibrio(piano) {
  const eq = piano.equilibrio;
  if (!eq?.punteggi?.length) return '';

  const punteggi = eq.punteggi.map((p, i) => `${piano.mazzi[i]?.nome ?? i + 1}: ${p.totale}`);
  const spostate = eq.scambi?.length
    ? ` Il motore ha già spostato ${eq.scambi.length === 1 ? 'una linea evolutiva' : `${eq.scambi.length} linee evolutive`} per avvicinarli.`
    : '';

  if (!squilibrati(piano)) {
    return `<p class="aiuto">Mazzi equilibrati (forza ${punteggi.join(' · ')}).${spostate}</p>`;
  }
  return `<p class="errore">I mazzi non sono del tutto pari: forza ${punteggi.join(' · ')}.
    ${piano.mazzi[eq.migliore]?.nome} è più forte, soprattutto per le linee evolutive.${spostate}
    Con questa collezione può non esserci di meglio: prova a rigenerare, o passa una carta
    da un mazzo all'altro col pulsante ⇄.</p>`;
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
      <button type="button" class="collegamento" id="vai-formato">
        Come si gioca con ${opzioni.taglia} carte?
      </button>
    </p>
    ${spiegazioneLineeEvolutive(piano)}
    ${statoEquilibrio(piano)}
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
      ${ultimeRisposte ? '<button type="button" id="bottone-rigenera" class="secondario">Rigenera diversi</button>' : ''}
      ${
        squilibrati(piano)
          ? '<button type="button" id="bottone-riequilibra" class="secondario">Riequilibra i mazzi</button>'
          : ''
      }
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

  const proxy = foglioProxy(piano);
  if (proxy) risultato.append(proxy);

  intestazione.querySelector('#bottone-stampa').addEventListener('click', () => window.print());

  // Porta alla scheda del formato di QUESTI mazzi, già aperta: chi ha appena
  // generato mazzi da 20 vuole le regole di quel formato, non l'elenco di tutti.
  intestazione.querySelector('#vai-formato').addEventListener('click', () => {
    document.querySelector('#regole')?.apriFormato(opzioni.taglia);
    location.hash = 'regole';
  });
  intestazione.querySelector('#bottone-nuovo').addEventListener('click', () => ricomincia());

  // Il riequilibrio dopo le modifiche a mano è un pulsante, non un automatismo:
  // se hai appena scelto tu una carta, il motore non deve spostartela altrove
  // senza chiedere. Compare solo quando i mazzi si sono davvero allontanati.
  intestazione.querySelector('#bottone-riequilibra')?.addEventListener('click', async () => {
    const scambi = bilancia(piano.mazzi, {
      indiceEvoluzioni: await indiceEvoluzioni(),
      nonPokemon: await preEvoluzioniNonPokemon(),
    });
    piano.equilibrio = { ...squilibrio(piano.mazzi), scambi };
    rivaluta(piano, piano.opzioni ?? {});
    disegnaPiano(piano, piano.opzioni ?? {});
    const stato = document.querySelector('#stato-mazzi');
    if (stato) {
      stato.hidden = false;
      stato.textContent = scambi.length
        ? `Spostate ${scambi.length} linee: ${scambi.map((s) => `${s.linea} → ${s.a}`).join(', ')}.`
        : 'Non c\'è uno scambio che migliori le cose: le linee disponibili sono queste.';
    }
  });

  // Rigenera con le stesse risposte ma un seme nuovo: stessa collezione, mazzi
  // diversi. Senza questo pulsante la varietà del motore non si vedrebbe,
  // perché rifare il wizard per intero scoraggia dal riprovare.
  intestazione.querySelector('#bottone-rigenera')?.addEventListener('click', () => {
    genera(ultimeRisposte).catch((errore) => {
      const stato = intestazione.querySelector('#stato-mazzi');
      stato.textContent = `Rigenerazione fallita: ${errore.message}`;
      stato.hidden = false;
    });
  });
  // Il nome si chiede PRIMA di scrivere: un elenco di "26/07/2026, 3 mazzi da
  // 20" non dice quale fosse il mazzo del torneo di Natale, e senza nome i
  // salvataggi diventano indistinguibili dopo il terzo.
  intestazione.querySelector('#bottone-salva').addEventListener('click', async () => {
    const stato = intestazione.querySelector('#stato-mazzi');
    const nome = await chiediNome({
      titolo: 'Che nome dai a questi mazzi?',
      aiuto: 'Serve a ritrovarli nell\'elenco "Mazzi salvati", qui sotto.',
      valore: piano.nome ?? nomeProposto(piano, opzioni),
    });
    if (nome === null) return;

    try {
      await salvaPiano(piano, piano.opzioni ?? opzioni, nome);
      piano.nome = nome;
      await mostraSalvati();
      stato.textContent = `Salvato come «${nome}»: lo trovi qui sotto, in "Mazzi salvati".`;
      stato.hidden = false;
      // Si va a vedere dove è finito: salvare e non vedere niente cambiare
      // sembra un salvataggio non riuscito.
      salvati.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

/**
 * Un nome di partenza per il salvataggio: la data e la taglia.
 *
 * Si propone invece di lasciare il campo vuoto perché chi non ha voglia di
 * inventare un nome deve poter premere Salva e basta.
 *
 * @param {object} piano
 * @param {object} opzioni
 * @returns {string}
 */
function nomeProposto(piano, opzioni) {
  const taglia = opzioni?.taglia ?? piano.opzioni?.taglia;
  return `Mazzi da ${taglia ?? '?'} del ${new Date().toLocaleDateString('it-IT')}`;
}

/** Elenco dei mazzi già salvati: il componente si occupa della resa. */
async function mostraSalvati() {
  let elenco = salvati.querySelector('elenco-salvati');
  if (!elenco) {
    elenco = document.createElement('elenco-salvati');
    elenco.addEventListener('piano-aperto', (evento) => {
      apriSalvato(evento.detail.id).catch((errore) => {
        risultato.hidden = false;
        risultato.innerHTML = `<p class="errore">Non si riesce ad aprire il mazzo: ${errore.message}</p>`;
      });
    });
    elenco.addEventListener('piano-eliminato', async (evento) => {
      await eliminaPiano(evento.detail.id);
      await mostraSalvati();
    });
    salvati.replaceChildren(elenco);
  }
  elenco.piani = await elencoPiani();
}

/**
 * Riapre un piano salvato e lo rende di nuovo modificabile.
 *
 * Il record su disco è una fotografia dei mazzi, non della collezione: analisi
 * e indice delle evoluzioni non ci sono e vanno ricostruiti sui dati di oggi,
 * che è anche la cosa giusta da fare — una sostituzione pesca dalla collezione
 * di adesso, non da quella del giorno del salvataggio.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
async function apriSalvato(id) {
  const piano = await leggiPiano(id);
  if (!piano) return;

  const voci = await elencoCompleto();
  piano.opzioni = {
    ...(piano.opzioni ?? {}),
    indiceEvoluzioni: await indiceEvoluzioni(),
    nonPokemon: await preEvoluzioniNonPokemon(),
  };
  piano.analisi = analizza(voci, { ammettiEsotici: piano.opzioni.ammettiEsotici ?? false });

  // "Rigenera diversi" rifarebbe i mazzi con le risposte dell'ultima
  // generazione, che non c'entrano con quelli appena riaperti.
  ultimeRisposte = null;
  // Diventa il piano corrente: le sostituzioni devono lavorare su di lui.
  pianoCorrente = piano;
  disegnaPiano(piano, piano.opzioni);
}

// Richiesta di sostituzione da una riga di un mazzo: si propone la scelta e,
// a cose fatte, si ridisegna l'intero piano perché contrassegni, regole e
// foglio proxy devono restare coerenti con le carte nuove.
risultato.addEventListener('sostituzione-richiesta', (evento) => {
  const { mazzo, indice } = evento.detail;
  if (!pianoCorrente) return;
  apriSostituzione(pianoCorrente, mazzo, indice, () =>
    disegnaPiano(pianoCorrente, pianoCorrente.opzioni ?? {}),
  ).catch((errore) => {
    risultato.insertAdjacentHTML(
      'beforeend',
      `<p class="errore">Sostituzione non riuscita: ${errore.message}</p>`,
    );
  });
});

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
