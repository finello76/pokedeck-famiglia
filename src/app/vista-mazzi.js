/**
 * La vista "Mazzi": libreria dei salvataggi, wizard, dettaglio di un piano.
 *
 * Qui non c'è logica di gioco: le decisioni le prende `pianifica()`. Questo
 * modulo raccoglie le risposte, gliele passa e disegna ciò che torna indietro.
 * La prosa che spiega il risultato sta in `schede-piano.js`.
 *
 * Tre stati e uno solo visibile per volta, scelti dalla rotta (`#mazzi`,
 * `#mazzi/nuovo`, `#mazzi/<id>`): vedi `mostraStato()`.
 *
 * @module app/vista-mazzi
 */

import { elencoCompleto, statistiche } from '../data/collezione.js';
import { indiceEvoluzioni, preEvoluzioniNonPokemon } from '../data/dataset.js';
import { bilancia, squilibrio } from '../engine/bilancia.js';
import { forza } from '../engine/forza.js';
import {
  squilibrati,
  riassunto,
  sezioneRichiudibile,
  schedaForza,
  statoForza,
  statoEquilibrio,
  spiegazioneLineeEvolutive,
  fogliaRegole,
} from './schede-piano.js';
import { rivaluta, carteConDeroga } from '../engine/pianifica.js';
import { cercaPiano, bersaglioPer } from '../engine/bersaglio.js';
import { salvaPiano, elencoPiani, leggiPiano, eliminaPiano } from '../data/mazzi-salvati.js';
import { disponibilitaResidua } from '../engine/alternative.js';
import { avvicinaAForza } from '../engine/obiettivo-forza.js';
import { leggiRiferimento } from '../data/riferimento.js';
import { elencoPrefatti, leggiPrefatto } from '../data/mazzi-prefatti.js';
import { opzioniDaRisposte } from '../ui/procedura-guidata/procedura-guidata.js';
import { arricchisciProxy, foglioProxy } from './foglio-proxy.js';
import { apriSostituzione } from './sostituzione.js';
import { chiediNome } from './chiedi-nome.js';
import { chiediConferma } from './chiedi-conferma.js';
import { analizza } from '../engine/analisi.js';
import '../ui/procedura-guidata/procedura-guidata.js';
import '../ui/mazzo-generato/mazzo-generato.js';
import '../ui/elenco-salvati/elenco-salvati.js';

const wizard = document.querySelector('#wizard');
const risultato = document.querySelector('#risultato-mazzi');
const salvati = document.querySelector('#mazzi-salvati');
const zonaWizard = document.querySelector('#zona-wizard');
const libreria = document.querySelector('#libreria-mazzi');

/** @type {object|null} ultimo piano mostrato */
let pianoCorrente = null;

/** @type {object|null} risposte del wizard, per poter rigenerare senza rifarlo */
let ultimeRisposte = null;

/**
 * Quale salvataggio è già disegnato a schermo.
 *
 * Serve a non rileggere il piano da IndexedDB e ridisegnarlo quando la rotta
 * torna la stessa — per esempio dopo un salvataggio, che cambia l'URL da
 * `mazzi/risultato` a `mazzi/<id>` senza che i mazzi siano cambiati.
 *
 * @type {string|null}
 */
let rottaDisegnata = null;

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
 * Prepara il wizard con i dati della collezione, così può saltare le domande
 * che non hanno senso (i proxy Pokémon senza evoluzioni orfane).
 * @returns {Promise<void>}
 */
export async function preparaWizard() {
  const voci = await elencoCompleto();
  const stat = await statistiche(voci);
  const riferimento = await leggiRiferimento();
  wizard.contesto = {
    carte: stat.totaleCarte,
    energie: stat.energie.totaleBase,
    orfani: (await import('../engine/analisi.js')).analizza(voci).orfani.length,
    // I set presenti in collezione, per la domanda su cosa lasciare fuori. La
    // domanda esiste perché una parte delle carte può essere già impegnata:
    // il Kit Allenatore con cui gioca un altro membro della famiglia non è
    // disponibile, anche se sta nella stessa scatola.
    set: setInCollezione(voci),
    // Quante carte desiderate: la domanda "uso anche i desideri?" ha senso
    // solo se ce ne sono.
    desideri: (await elencoCompleto({ conDesideri: true })).filter((v) => v.desiderata).length,
    // I mazzi contro cui si può scegliere di giocare, già misurati: il wizard
    // mostra la forza accanto al nome, perché "Kit Lycanroc" da solo non aiuta
    // a decidere e il numero sì.
    prefatti: (await elencoPrefatti()).map((m) => ({
      id: m.id,
      nome: m.nome,
      taglia: m.taglia,
      forza: forza(m, { taglia: m.taglia }).totale,
    })),
    // Il riferimento scelto in Impostazioni — un mazzo salvato o un prefatto —
    // diventa la scelta rapida della domanda sulla forza obiettivo: è il
    // paragone che si ha davvero in casa.
    forzaRiferimento: riferimento?.forza ?? null,
    nomeRiferimento: riferimento?.nome ?? null,
    // Se il riferimento è un prefatto, la domanda "contro quale mazzo" lo
    // segnala nell'elenco invece di aggiungerne una copia in cima.
    idRiferimentoPrefatto: riferimento?.idPrefatto ?? null,
  };
}

/**
 * I set da cui hai almeno una carta, dal più vecchio, con l'anno e quante ne hai.
 *
 * Stesso ordine del menu della collezione: un set si riconosce dall'epoca, e
 * due elenchi degli stessi set in ordini diversi si contraddicono a vicenda.
 *
 * @param {object[]} voci risultato di `elencoCompleto()`
 * @returns {Array<{id: string, nome: string, anno: number|null, carte: number}>}
 */
function setInCollezione(voci) {
  const set = new Map();
  for (const voce of voci) {
    const suo = set.get(voce.idSet) ?? {
      id: voce.idSet,
      nome: voce.nomeSet ?? voce.idSet,
      anno: voce.uscitaSet ? Number(String(voce.uscitaSet).slice(0, 4)) : null,
      uscita: voce.uscitaSet ?? null,
      carte: 0,
    };
    suo.carte += 1;
    set.set(voce.idSet, suo);
  }
  return [...set.values()].sort(
    (a, b) =>
      // Senza data (Energie base) in fondo: in cima sembrerebbero antichissime.
      Number(Boolean(b.uscita)) - Number(Boolean(a.uscita)) ||
      String(a.uscita).localeCompare(String(b.uscita)) ||
      a.nome.localeCompare(b.nome, 'it'),
  );
}

/**
 * Un errore che ferma la generazione, mostrato senza lasciare il wizard.
 *
 * Il wizard resta a schermo apposta: questi errori si correggono tornando
 * indietro di una domanda (lasciare fuori meno set), e nasconderlo per mostrare
 * un messaggio significherebbe far ricominciare tutto da capo.
 *
 * @param {string} testo
 * @returns {void}
 */
function mostraErroreNelWizard(testo) {
  let avviso = zonaWizard.querySelector('#errore-generazione');
  if (!avviso) {
    avviso = document.createElement('p');
    avviso.id = 'errore-generazione';
    avviso.className = 'errore';
    avviso.setAttribute('role', 'alert');
    zonaWizard.append(avviso);
  }
  avviso.textContent = testo;
}

/**
 * Genera i mazzi a partire dalle risposte del wizard.
 * @param {object} risposte
 * @returns {Promise<void>}
 */
async function genera(risposte, seme = nuovoSeme()) {
  ultimeRisposte = risposte;
  zonaWizard.querySelector('#errore-generazione')?.remove();
  const tutte = await elencoCompleto({ conDesideri: Boolean(opzioniDaRisposte(risposte).usaDesideri) });

  // I set esclusi si tolgono QUI, prima del motore: per lui devono essere
  // carte che non esistono. Filtrare dopo significherebbe generare mazzi con
  // quelle carte e poi toglierle, lasciando buchi che nessuno ricuce.
  const esclusi = new Set(risposte.setEsclusi ?? []);
  const voci = esclusi.size ? tutte.filter((v) => !esclusi.has(v.idSet)) : tutte;

  if (tutte.length === 0) {
    mostraErroreNelWizard(
      'La collezione è vuota: cataloga qualche carta prima di generare i mazzi.',
    );
    return;
  }

  if (voci.length === 0) {
    mostraErroreNelWizard(`Hai escluso tutti i set che possiedi: non resta nessuna carta
      con cui costruire i mazzi. Torna indietro e lasciane fuori meno.`);
    return;
  }

  // L'indice serve al motore per ricostruire le linee evolutive intere, fino
  // alla Base che non possiedi; l'elenco dei fossili gli evita di stampare
  // come Pokémon una carta Allenatore (Omanyte "evolve" da Vecchio
  // Helixfossile). Il motore resta puro: i dati glieli passa l'app.
  const opzioni = {
    ...opzioniDaRisposte(risposte),
    // I nomi, non solo gli id: il piano si può riaprire fra un mese, e
    // "sv03.5" non dice a nessuno quali carte erano fuori.
    setEsclusiNomi: [...esclusi]
      .map((id) => tutte.find((v) => v.idSet === id)?.nomeSet ?? id)
      .sort((a, b) => a.localeCompare(b, 'it')),
    seme,
    indiceEvoluzioni: await indiceEvoluzioni(),
    nonPokemon: await preEvoluzioniNonPokemon(),
  };
  // Il mazzo contro cui si giocherà, se ne è stato scelto uno: la sua forza è
  // il bersaglio, spostato secondo la partita che si vuole.
  const riferimento = await risolviRiferimento(opzioni.riferimento);
  if (riferimento) {
    opzioni.riferimentoNome = riferimento.nome;
    opzioni.riferimentoForza = riferimento.forza;
  }
  const bersaglio = riferimento
    ? bersaglioPer(riferimento.forza, opzioni.versoBersaglio)
    : null;

  const ricerca = await cercaPiano(voci, opzioni, {
    bersaglio,
    // Le carte da stampare escono dal generatore col solo nome: senza questo
    // passaggio la ricerca misurerebbe mazzi molto più deboli di quelli che
    // poi finiscono a schermo, e sceglierebbe il seme sbagliato.
    rifinisci: arricchisciProxy,
    onTentativo: (fatti, totali) => {
      if (bersaglio == null) return;
      risultato.hidden = false;
      risultato.innerHTML = `<p class="stato">Cerco mazzi da forza ${bersaglio}…
        tentativo ${fatti} di ${totali}</p>`;
    },
  });

  pianoCorrente = ricerca.piano;
  pianoCorrente.opzioni = opzioni;
  pianoCorrente.ricerca = { bersaglio, ...ricerca, piano: undefined };

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

  // La forza obiettivo si insegue **dopo** il pareggio fra i mazzi, e non al
  // posto suo: portare tutti allo stesso numero li rende anche pari fra loro,
  // mentre il contrario non vale. Si lavora sulle copie ancora libere in
  // collezione, che è l'unico posto da cui possono arrivare carte vere.
  if (opzioni.forzaObiettivo > 0) {
    pianoCorrente.forza = avvicinaAForza(pianoCorrente.mazzi, {
      obiettivo: opzioni.forzaObiettivo,
      // La stessa taglia con cui `forza()` misura ovunque nella pagina: senza,
      // la salita di collina normalizzerebbe sul numero di carte del momento e
      // inseguirebbe un numero diverso da quello mostrato accanto al mazzo.
      taglia: opzioni.taglia,
      dispensa: disponibilitaResidua(voci, pianoCorrente.mazzi),
    });
    pianoCorrente.equilibrio = {
      ...squilibrio(pianoCorrente.mazzi),
      scambi: pianoCorrente.equilibrio.scambi,
    };
    // Le carte cambiate possono aver creato o risolto una carenza: il foglio
    // regole deve descrivere i mazzi che si hanno in mano adesso.
    rivaluta(pianoCorrente, opzioni);
  }

  disegnaPiano(pianoCorrente, opzioni);
  // Il risultato è uno stato suo nell'URL: il tasto Indietro riporta al wizard
  // invece di uscire dalla schermata.
  if (location.hash === '#mazzi/risultato') mostraStato('risultato');
  else location.hash = 'mazzi/risultato';
}

/**
 * Il mazzo contro cui si giocherà, qualunque sia la sorgente scelta.
 *
 * La risposta del wizard è `'riferimento'` — il mazzo eletto in Impostazioni,
 * che può essere un mazzo salvato — oppure l'id di un prefatto. Le due strade
 * si uniscono qui e non più a valle: `cercaPiano()` ha bisogno di un numero e
 * di un nome, non di sapere da dove vengono.
 *
 * @param {string|null} scelta il valore di `opzioni.riferimento`
 * @returns {Promise<{nome: string, forza: number}|null>} `null` se non c'è
 *   riferimento o se non è misurabile
 */
async function risolviRiferimento(scelta) {
  if (!scelta) return null;

  if (scelta === 'riferimento') {
    const scelto = await leggiRiferimento();
    // Può essersi sciolto fra l'apertura del wizard e il "Genera": il piano
    // puntato cancellato dall'altra vista. Meglio nessun bersaglio che uno
    // inventato.
    return scelto?.forza != null ? { nome: scelto.nome, forza: scelto.forza } : null;
  }

  const prefatto = await leggiPrefatto(scelta);
  if (!prefatto) return null;
  const misura = forza(prefatto, { taglia: prefatto.taglia });
  // Un prefatto di cui il dataset non conosce gli attacchi non è un metro:
  // usarlo come bersaglio farebbe cercare mazzi attorno a un numero inventato.
  return misura.attendibile ? { nome: prefatto.nome, forza: misura.totale } : null;
}

/**
 * "1 mazzo" o "3 mazzi". Vale la pena di una funzione perché il numero lo
 * sceglie l'utente e la frase compare in più punti: "1 mazzi" è il genere di
 * dettaglio che fa sembrare l'app un prototipo.
 *
 * @param {number} quanti
 * @returns {string}
 */
function contaMazzi(quanti) {
  return quanti === 1 ? '1 mazzo' : `${quanti} mazzi`;
}

/**
 * I mazzi del piano, uno per volta su schermo stretto.
 *
 * Sotto i 46rem `.elenco-mazzi` è a colonna singola: tre mazzi impilati sono
 * tre schermate di scorrimento, e ognuno porta già dentro di sé carosello ed
 * elenco carte. Le schede sono lo stesso rimedio che `<mazzo-generato>` applica
 * alle proprie categorie (`mazzo-generato.js:176`), alzato di un livello: un
 * tocco al posto di uno scorrimento.
 *
 * In stampa le schede spariscono e tornano visibili tutti i mazzi — il CSS di
 * stampa fa questo, qui si costruisce solo la struttura.
 *
 * @param {object} piano
 * @returns {DocumentFragment}
 */
function elencoMazzi(piano) {
  const frammento = document.createDocumentFragment();
  const tanti = piano.mazzi.length > 1;

  const elenco = document.createElement('div');
  elenco.className = 'elenco-mazzi';
  const schede = [];

  piano.mazzi.forEach((mazzo, indice) => {
    const elemento = document.createElement('mazzo-generato');
    elemento.conDeroga = carteConDeroga(mazzo, piano.permessi, piano.carenze);
    elemento.mazzo = mazzo;
    elemento.id = `mazzo-${indice}`;
    if (tanti && indice > 0) elemento.hidden = true;
    elenco.append(elemento);
    schede.push({ nome: mazzo.nome ?? `Mazzo ${indice + 1}`, indice });
  });

  if (tanti) {
    const barra = document.createElement('div');
    barra.className = 'mazzi-schede no-stampa';
    barra.setAttribute('role', 'tablist');
    barra.innerHTML = schede
      .map(
        (s) => `
        <button type="button" role="tab" data-mazzo="${s.indice}"
                aria-controls="mazzo-${s.indice}"
                aria-selected="${s.indice === 0}">${escapeHtml(s.nome)}</button>`,
      )
      .join('');

    barra.addEventListener('click', (evento) => {
      const scelto = evento.target.closest('[data-mazzo]');
      if (!scelto) return;
      const indice = Number(scelto.dataset.mazzo);
      for (const bottone of barra.querySelectorAll('[data-mazzo]')) {
        bottone.setAttribute('aria-selected', String(Number(bottone.dataset.mazzo) === indice));
      }
      piano.mazzi.forEach((_, i) => {
        elenco.querySelector(`#mazzo-${i}`).hidden = i !== indice;
      });
    });

    frammento.append(barra);
  }

  frammento.append(elenco);
  return frammento;
}

/**
 * Disegna mazzi, regole e comandi.
 * @param {object} piano
 * @param {object} opzioni
 */
function disegnaPiano(piano, opzioni) {
  // La visibilità dei tre stati la decide `mostraStato()` leggendo l'URL: se la
  // decidesse anche questa funzione, un piano ridisegnato dopo una sostituzione
  // riaprirebbe il dettaglio anche stando altrove.
  risultato.replaceChildren();

  const incompleti = piano.carenze.filter((c) => c.codice === 'mazzo-incompleto');

  const intestazione = document.createElement('div');
  intestazione.className = 'no-stampa';
  intestazione.innerHTML = `
    <button type="button" class="indietro" data-vai="mazzi">I miei mazzi</button>
    <h2>${escapeHtml(piano.nome ?? (piano.mazzi.length === 1 ? 'Il mazzo' : 'I mazzi'))}</h2>
    ${riassunto(piano, opzioni)}
    ${
      // I mazzi incompleti restano **fuori** da ogni sezione richiudibile: un
      // errore che bisogna aprire per scoprire non è un errore.
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
      ${
        // Un mazzo costruito a mano si riprende dove lo si era lasciato: il
        // costruttore lo ricarica carta per carta. Per i mazzi del wizard non
        // avrebbe senso, ne contengono tre o quattro insieme.
        piano.opzioni?.personalizzato && rottaDisegnata
          ? `<button type="button" class="secondario"
               data-vai="personalizzato/${escapeHtml(rottaDisegnata)}">Modifica a mano</button>`
          : ''
      }
      <button type="button" class="secondario" data-vai="mazzi/nuovo">Crea altri mazzi</button>
    </div>
    <p id="stato-mazzi" class="stato" hidden></p>
  `;
  risultato.append(intestazione);

  // I mazzi vengono subito, prima di ogni spiegazione: chi riapre un mazzo
  // salvato vuole l'elenco delle carte da pescare, non la relazione su come è
  // stato costruito. Le spiegazioni restano, sotto, chiuse.
  risultato.append(elencoMazzi(piano));

  const sotto = document.createElement('div');
  sotto.className = 'sezioni-piano';
  sotto.innerHTML = `
    ${sezioneRichiudibile(
      `Regole della casa${piano.regole.length ? ` (${piano.regole.length})` : ''}`,
      fogliaRegole(piano.regole),
      // Se ci sono regole attive si apre da sola: sono istruzioni da leggere
      // prima di giocare, non un approfondimento.
      { aperta: piano.regole.length > 0 },
    )}
    ${sezioneRichiudibile('Quanto sono forti', `
      ${schedaForza(piano, opzioni)}
      ${statoForza(piano)}
      ${statoEquilibrio(piano)}
    `)}
    ${sezioneRichiudibile(
      'Perché ci sono evoluzioni giocate come Base?',
      spiegazioneLineeEvolutive(piano),
    )}
    ${sezioneRichiudibile(
      'Come si gioca',
      `<p class="aiuto">
        ${contaMazzi(piano.mazzi.length)} da ${opzioni.taglia} carte.
        Pesca le carte elencate dalla tua collezione.
        <button type="button" class="collegamento" id="vai-formato">
          Come si gioca con ${opzioni.taglia} carte?
        </button>
      </p>
      ${
        opzioni.setEsclusiNomi?.length
          ? `<p class="aiuto">Lasciati fuori: ${opzioni.setEsclusiNomi.join(', ')}.
               Le loro carte non compaiono nei mazzi né fra le sostituzioni.</p>`
          : ''
      }`,
    )}`;
  risultato.append(sotto);

  // Il foglio proxy è fatto di celle da 63×88 mm, una per copia: a schermo è il
  // blocco più alto di tutti, e serve solo a chi sta per stampare.
  const proxy = foglioProxy(piano);
  if (proxy) {
    const contenitore = document.createElement('details');
    contenitore.className = 'sezione-piano';
    contenitore.innerHTML = '<summary>Carte da stampare</summary>';
    contenitore.append(proxy);
    risultato.append(contenitore);
  }

  // Prima di stampare si aprono tutte le sezioni: il CSS da solo non basta,
  // perché il contenuto di un `<details>` chiuso non è reso in modo affidabile
  // in stampa su tutti i motori. Un foglio senza le regole della casa sarebbe
  // proprio il foglio che questa app esiste per produrre.
  intestazione.querySelector('#bottone-stampa').addEventListener('click', () => {
    for (const d of risultato.querySelectorAll('details')) d.open = true;
    window.print();
  });

  // Porta alla scheda del formato di QUESTI mazzi, già aperta: chi ha appena
  // generato mazzi da 20 vuole le regole di quel formato, non l'elenco di tutti.
  risultato.querySelector('#vai-formato')?.addEventListener('click', () => {
    document.querySelector('#regole')?.apriFormato(opzioni.taglia);
    location.hash = 'regole';
  });

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
      aiuto: 'Serve a ritrovarli fra "I miei mazzi".',
      valore: piano.nome ?? nomeProposto(piano, opzioni),
    });
    if (nome === null) return;

    try {
      const id = await salvaPiano(piano, piano.opzioni ?? opzioni, nome);
      piano.nome = nome;
      stato.textContent = `Salvato come «${nome}»: lo ritrovi fra "I miei mazzi".`;
      stato.hidden = false;
      // Da qui in poi il piano ha un'identità: l'URL la prende, così Indietro
      // porta alla libreria e non al wizard. `rottaDisegnata` evita di
      // rileggerlo da IndexedDB e ridisegnarlo: è già quello a schermo.
      pianoCorrente = piano;
      rottaDisegnata = id;
      location.hash = `mazzi/${id}`;
    } catch (errore) {
      stato.textContent = `Salvataggio fallito: ${errore.message}`;
      stato.hidden = false;
    }
  });
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
  salvati.piani = await elencoPiani();
}

// Aprire è una navigazione, non un ridisegno: l'id finisce nell'URL, così il
// tasto Indietro del browser riporta all'elenco. Prima il mazzo aperto era uno
// stato invisibile e Indietro usciva dalla schermata.
salvati.addEventListener('piano-aperto', (evento) => {
  location.hash = `mazzi/${evento.detail.id}`;
});

// L'eliminazione chiede conferma: nella card il cestino sta accanto all'area
// che apre il mazzo, e un tocco storto non deve cancellare per sempre il lavoro
// di una serata. Prima i due comandi erano lontani e non si chiedeva niente.
salvati.addEventListener('piano-eliminato', async (evento) => {
  const piano = salvati.piani.find((p) => p.id === evento.detail.id);
  const confermato = await chiediConferma({
    titolo: `Eliminare «${piano?.nome ?? 'questo mazzo'}»?`,
    aiuto: 'Le carte restano in collezione: si perde solo questo salvataggio, e non si recupera.',
  });
  if (!confermato) return;

  await eliminaPiano(evento.detail.id);
  await mostraSalvati();
});

/**
 * Mostra lo stato corrispondente alla rotta: libreria, wizard o dettaglio.
 *
 * @param {string} parametro la parte dopo `#mazzi/`
 * @returns {Promise<void>}
 */
async function mostraStato(parametro) {
  const nelWizard = parametro === 'nuovo';
  const nelDettaglio = parametro !== '' && !nelWizard;

  libreria.hidden = parametro !== '';
  zonaWizard.hidden = !nelWizard;
  risultato.hidden = !nelDettaglio;

  if (parametro === '') {
    rottaDisegnata = null;
    await mostraSalvati();
    return;
  }

  if (nelWizard) {
    rottaDisegnata = null;
    // La collezione può essere cambiata da quando si è entrati l'ultima volta:
    // il wizard va ripreparato ogni volta, non una sola.
    await preparaWizard();
    zonaWizard.querySelector('#errore-generazione')?.remove();
    wizard.ricomincia();
    return;
  }

  // Il piano appena generato non ha ancora un id: vive in memoria e basta.
  // Ricaricando la pagina su questa rotta non c'è niente da mostrare.
  if (parametro === 'risultato') {
    if (!pianoCorrente) location.hash = 'mazzi';
    return;
  }

  if (rottaDisegnata === parametro) return;
  // Si segna PRIMA di disegnare, non dopo: `disegnaPiano()` la legge per
  // costruire il pulsante "Modifica a mano", che ha bisogno dell'id nel
  // proprio `data-vai`. Assegnandola dopo, quel pulsante non compariva mai.
  rottaDisegnata = parametro;
  try {
    await apriSalvato(parametro);
  } catch (errore) {
    rottaDisegnata = null;
    risultato.innerHTML = `<p class="errore">Non si riesce ad aprire il mazzo: ${errore.message}</p>`;
  }
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
    mostraErroreNelWizard(`Generazione fallita: ${errore.message}`);
  });
});

// L'unico ingresso: la rotta decide cosa si vede.
document.addEventListener('vista-cambiata', (evento) => {
  if (evento.detail.nome === 'mazzi') mostraStato(evento.detail.parametro ?? '');
});
