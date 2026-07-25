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
import { forza, confronta } from '../engine/forza.js';
import { rivaluta, carteConDeroga } from '../engine/pianifica.js';
import { cercaPiano, bersaglioPer } from '../engine/bersaglio.js';
import { salvaPiano, elencoPiani, leggiPiano, eliminaPiano } from '../data/mazzi-salvati.js';
import { elencoPrefatti, leggiPrefatto } from '../data/mazzi-prefatti.js';
import { opzioniDaRisposte } from '../ui/procedura-guidata/procedura-guidata.js';
import { arricchisciProxy, foglioProxy } from './foglio-proxy.js';
import { apriSostituzione } from './sostituzione.js';
import '../ui/procedura-guidata/procedura-guidata.js';
import '../ui/mazzo-generato/mazzo-generato.js';

const wizard = document.querySelector('#wizard');
const risultato = document.querySelector('#risultato-mazzi');
const salvati = document.querySelector('#mazzi-salvati');
const prefatti = document.querySelector('#mazzi-prefatti');
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
    // I set presenti in collezione, per la domanda su cosa lasciare fuori. La
    // domanda esiste perché una parte delle carte può essere già impegnata:
    // il Kit Allenatore con cui gioca un altro membro della famiglia non è
    // disponibile, anche se sta nella stessa scatola.
    set: setInCollezione(voci),
    // I mazzi contro cui si può scegliere di giocare, già misurati: il wizard
    // mostra la forza accanto al nome, perché "Kit Lycanroc" da solo non aiuta
    // a decidere e il numero sì.
    // Quante carte desiderate: la domanda "uso anche i desideri?" ha senso
    // solo se ce ne sono.
    desideri: (await elencoCompleto({ conDesideri: true })).filter((v) => v.desiderata).length,
    prefatti: (await elencoPrefatti()).map((m) => ({
      id: m.id,
      nome: m.nome,
      taglia: m.taglia,
      forza: forza(m, { taglia: m.taglia }).totale,
    })),
  };
  await mostraSalvati();
  await mostraPrefatti();
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
 * Genera i mazzi a partire dalle risposte del wizard.
 * @param {object} risposte
 * @returns {Promise<void>}
 */
async function genera(risposte, seme = nuovoSeme()) {
  ultimeRisposte = risposte;
  const tutte = await elencoCompleto({ conDesideri: Boolean(opzioniDaRisposte(risposte).usaDesideri) });

  // I set esclusi si tolgono QUI, prima del motore: per lui devono essere
  // carte che non esistono. Filtrare dopo significherebbe generare mazzi con
  // quelle carte e poi toglierle, lasciando buchi che nessuno ricuce.
  const esclusi = new Set(risposte.setEsclusi ?? []);
  const voci = esclusi.size ? tutte.filter((v) => !esclusi.has(v.idSet)) : tutte;

  if (tutte.length === 0) {
    risultato.innerHTML =
      '<p class="errore">La collezione è vuota: cataloga qualche carta prima di generare i mazzi.</p>';
    return;
  }

  if (voci.length === 0) {
    risultato.hidden = false;
    risultato.innerHTML = `<p class="errore">Hai escluso tutti i set che possiedi:
      non resta nessuna carta con cui costruire i mazzi. Torna indietro e lasciane fuori meno.</p>`;
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
  const riferimento = opzioni.riferimento ? await leggiPrefatto(opzioni.riferimento) : null;
  if (riferimento) {
    riferimento.forza = forza(riferimento, { taglia: riferimento.taglia }).totale;
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

  disegnaPiano(pianoCorrente, opzioni);
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
  // Con un mazzo solo non c'è niente da equilibrare: l'avversario ha il suo, e
  // dirgli "mazzi equilibrati" mostrando un punteggio solo sarebbe una risposta
  // a una domanda che nessuno ha fatto.
  if (piano.mazzi.length < 2) return '';

  const punteggi = eq.punteggi.map((p, i) => `${piano.mazzi[i]?.nome ?? i + 1}: ${p.totale}`);
  const spostate = eq.scambi?.length
    ? ` Il motore ha già spostato ${eq.scambi.length === 1 ? 'una linea evolutiva' : `${eq.scambi.length} linee evolutive`} per avvicinarli.`
    : '';

  if (!squilibrati(piano)) {
    return `<p class="aiuto">Mazzi equilibrati fra loro (${punteggi.join(' · ')}).${spostate}</p>`;
  }
  return `<p class="errore">I mazzi non sono del tutto pari: ${punteggi.join(' · ')}.
    ${piano.mazzi[eq.migliore]?.nome} è più forte, soprattutto per le linee evolutive.${spostate}
    Con questa collezione può non esserci di meglio: prova a rigenerare, o passa una carta
    da un mazzo all'altro col pulsante ⇄.</p>`;
}

/**
 * La forza di ogni mazzo sulla scala 0–100.
 *
 * È un'informazione diversa dall'equilibrio qui sopra, e va detta a parte:
 * quella dice se i mazzi si somigliano **fra loro**, questa quanto valgono in
 * assoluto. Due mazzi possono essere perfettamente pari e insieme troppo forti
 * per il Kit Allenatore con cui gioca il terzo.
 *
 * @param {object} piano
 * @param {object} opzioni
 * @returns {string} HTML
 */
function schedaForza(piano, opzioni) {
  // Un piano riaperto dal salvataggio porta la forza già calcolata: le sue
  // carte non conservano gli attacchi, quindi ricalcolarla darebbe zero.
  const forze = piano.mazzi.map((m) => m.forza ?? forza(m, { taglia: opzioni.taglia }));
  if (!forze.length) return '';

  const riferimento = opzioni.riferimentoForza ?? null;
  // La tacca sulla barra: si legge a colpo d'occhio se un mazzo sta sopra o
  // sotto il metro, che è più immediato di due numeri da confrontare a mente.
  const tacca =
    riferimento == null
      ? ''
      : `<span class="tacca-riferimento" style="inset-inline-start:${riferimento}%"></span>`;

  const barre = forze
    .map((f, i) => {
      const nome = piano.mazzi[i]?.nome ?? `Mazzo ${i + 1}`;
      const dettaglio = [
        `offesa ${Math.round(f.offesa * 100)}`,
        `resistenza ${Math.round(f.resistenza * 100)}`,
        `evoluzioni ${Math.round(f.struttura * 100)}`,
        `energie ${Math.round(f.motore * 100)}`,
        `avvio ${Math.round(f.costanza * 100)}`,
      ].join(' · ');
      return `
        <li>
          <span class="forza-nome">${nome}</span>
          <span class="forza-barra"><span class="forza-riempimento" style="inline-size:${f.totale}%"></span>${tacca}</span>
          <span class="forza-valore">${f.totale}</span>
          <span class="forza-dettaglio">${dettaglio}</span>
        </li>`;
    })
    .join('');

  // Se il dataset non ha i dati di attacco di abbastanza carte, il numero non
  // va presentato come una misura: dirlo è meno grave che farlo credere.
  const dubbio = forze.some((f) => !f.attendibile)
    ? `<p class="aiuto">Di alcune carte il dataset non ha i dati degli attacchi:
         la forza è approssimata per difetto.</p>`
    : '';

  return `
    <div class="forza-mazzi no-stampa">
      <h3>Quanto sono forti</h3>
      <p class="aiuto">Scala 0–100, confrontabile fra mazzi di taglia diversa:
        un mazzo da 15 e uno da 60 si leggono sullo stesso metro.</p>
      <ul class="elenco-forza">${barre}</ul>
      ${esitoBersaglio(piano, opzioni, forze)}
      ${dubbio}
    </div>`;
}

/**
 * Com'è andata la ricerca del bersaglio, detta prima di giocare.
 *
 * Quando non si è centrato il bersaglio va detto **esplicitamente**: la
 * collezione può semplicemente non contenere carte abbastanza deboli o
 * abbastanza forti, e scoprirlo perdendo una partita è il fallimento che
 * questa funzione doveva evitare.
 *
 * @param {object} piano
 * @param {object} opzioni
 * @param {object[]} forze
 * @returns {string} HTML
 */
function esitoBersaglio(piano, opzioni, forze) {
  const nome = opzioni.riferimentoNome;
  const suo = opzioni.riferimentoForza;
  if (!nome || suo == null) return '';

  const media = Math.round(forze.reduce((s, f) => s + f.totale, 0) / forze.length);
  const { verso, testo } = confronta(media, suo);
  const chiesto = { pari: 'alla pari', sotto: 'un po\' più debole', sopra: 'un po\' più forte' }[
    opzioni.versoBersaglio ?? 'pari'
  ];
  const tentativi = piano.ricerca?.tentativi;
  const quante = tentativi > 1 ? ` Provate ${tentativi} combinazioni.` : '';

  // Ciò che si è chiesto e ciò che si è ottenuto coincidono?
  const atteso = { pari: 'pari', sotto: 'sotto', sopra: 'sopra' }[opzioni.versoBersaglio ?? 'pari'];
  if (verso === atteso) {
    return `<p class="aiuto"><strong>${nome}</strong> vale ${suo}, i tuoi mazzi ${media}:
      ${testo}, come hai chiesto.${quante}</p>`;
  }
  return `<p class="errore"><strong>${nome}</strong> vale ${suo}, i tuoi mazzi ${media}:
    ${testo}. Avevi chiesto ${chiesto}, ma con questa collezione non si è riusciti
    ad avvicinarsi di più.${quante} Prova a rigenerare, o cambia la taglia dei mazzi.</p>`;
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
    <h2>${piano.mazzi.length === 1 ? 'Il mazzo' : 'I mazzi'}</h2>
    <p class="aiuto">
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
    }
    ${spiegazioneLineeEvolutive(piano)}
    ${statoEquilibrio(piano)}
    ${schedaForza(piano, opzioni)}
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

/**
 * I mazzi prefatti con la loro forza: il metro di paragone.
 *
 * Sta qui, sotto il wizard, e non in una vista sua: serve a leggere un numero
 * prima o dopo aver generato dei mazzi, non è una schermata in cui si va.
 *
 * @returns {Promise<void>}
 */
async function mostraPrefatti() {
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
    <h3>Mazzi di riferimento</h3>
    <p class="aiuto">
      Quanto valgono i mazzi già pronti, sulla stessa scala dei mazzi generati.
      Servono a capire se una partita sarà pari: un mazzo generato molto più
      forte del Kit con cui gioca l'altro non fa una partita.
    </p>
    <ul class="elenco-forza">${righe}</ul>
  `;
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
            ${contaMazzi(p.mazzi.length)} da ${p.opzioni?.taglia ?? '?'} carte
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
      if (!piano) return;
      // Diventa il piano corrente: le sostituzioni devono lavorare su di lui.
      pianoCorrente = piano;
      disegnaPiano(piano, piano.opzioni ?? {});
    }),
  );
  salvati.querySelectorAll('[data-elimina]').forEach((b) =>
    b.addEventListener('click', async () => {
      await eliminaPiano(b.dataset.elimina);
      await mostraSalvati();
    }),
  );
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
