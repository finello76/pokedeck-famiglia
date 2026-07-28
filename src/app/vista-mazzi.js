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
import { disponibilitaResidua } from '../engine/alternative.js';
import { avvicinaAForza } from '../engine/obiettivo-forza.js';
import { leggiRiferimento } from '../data/riferimento.js';
import { elencoPrefatti, leggiPrefatto } from '../data/mazzi-prefatti.js';
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
 * La riga che dice com'è andata la rifinitura verso la forza chiesta.
 *
 * È il secondo stadio della cascata: `cercaPiano()` ha già scelto il piano più
 * vicino al bersaglio, `avvicinaAForza()` ha poi scambiato qualche carta per
 * chiudere la distanza rimasta. Qui si racconta **solo quel secondo passo** —
 * quanto valgono i mazzi lo dice `schedaForza()` qui sotto.
 *
 * Va detto sempre, anche — soprattutto — quando l'obiettivo non si è
 * raggiunto: chi ha chiesto mazzi da 45 e se ne ritrova due da 70 deve sapere
 * che non è stato ignorato, ma che la collezione non contiene carte più deboli
 * da metterci dentro.
 *
 * @param {object} piano
 * @returns {string} HTML, vuoto se non era stata chiesta nessuna forza
 */
function statoForza(piano) {
  const esito = piano.forza;
  if (!esito?.obiettivo || !esito.esiti?.length) return '';

  const arrivi = esito.esiti.map((e) => `${e.mazzo}: ${e.arrivo}`).join(' · ');
  const scambiate = esito.esiti.reduce((somma, e) => somma + e.scambi.length, 0);

  if (esito.esiti.every((e) => e.raggiunto)) {
    return `<p class="aiuto">Forza richiesta ${esito.obiettivo}, ottenuta (${arrivi})${
      scambiate ? `, cambiando ${scambiate} ${scambiate === 1 ? 'carta' : 'carte'}` : ''
    }.</p>`;
  }

  // Un mazzo di cui il dataset non conosce gli attacchi non è stato toccato: il
  // suo punteggio non è una misura, e scambiare carte per spostarlo sarebbe
  // stato rimescolare inseguendo rumore. Dirlo evita che sembri un rifiuto.
  if (esito.esiti.some((e) => e.motivo === 'nonMisurabile')) {
    return `<p class="aiuto">Forza richiesta ${esito.obiettivo}: di alcune carte il
      dataset non ha i dati degli attacchi, quindi quei mazzi non sono stati
      ritoccati — il loro punteggio non sarebbe affidabile.</p>`;
  }

  // Fermarsi perché la collezione non offre di meglio e fermarsi perché sono
  // finiti i tentativi sono due cose diverse: nel secondo caso rigenerare o
  // scambiare a mano può ancora servire, e dirlo cambia cosa si fa dopo.
  const perTentativi = esito.esiti.some((e) => !e.raggiunto && e.motivo === 'passi');

  return `<p class="aiuto">Forza richiesta ${esito.obiettivo}: il più vicino che si è
    riusciti a fare è ${arrivi}.
    ${
      perTentativi
        ? 'Il motore si è fermato dopo un certo numero di scambi per non stravolgere i mazzi: prova a rigenerare, o cambia qualche carta col pulsante ⇄.'
        : 'Con le carte che hai non si va oltre — per scendere servirebbero Pokémon più deboli da mettere al posto di quelli forti, per salire ne servirebbero di più forti.'
    }</p>`;
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
    ${statoForza(piano)}
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

salvati.addEventListener('piano-eliminato', async (evento) => {
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
  try {
    await apriSalvato(parametro);
    rottaDisegnata = parametro;
  } catch (errore) {
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
