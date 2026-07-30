/**
 * La vista "Mazzo personalizzato": scegli tu le carte, l'app misura.
 *
 * È il complemento del wizard. Il wizard costruisce il mazzo al posto tuo e
 * spiega perché; qui il mazzo lo costruisci tu e l'app si limita a dirti
 * quanto vale e cosa non torna. Serve a due cose che il generatore non può
 * dare: provare un'idea (\"e se ci mettessi Lycanroc?\") e capire *perché* un
 * mazzo vale quello che vale, guardando il punteggio muoversi carta per carta.
 *
 * Gli avvisi non bloccano mai. In questo progetto violare il regolamento in
 * modo consapevole è esattamente ciò che fanno le regole della casa, e un
 * costruttore che impedisce di sbagliare impedirebbe anche di giocare come si
 * gioca a casa.
 *
 * @module app/vista-personalizzato
 */

import { elencoCompleto } from '../data/collezione.js';
import { forza, confronta } from '../engine/forza.js';
import { diagnostica, GRAVITA } from '../engine/mazzo-manuale.js';
import { completa, correggi, applica, differenza } from '../engine/completa-mazzo.js';
import { avvicinaAForza } from '../engine/obiettivo-forza.js';
import { disponibilitaResidua } from '../engine/alternative.js';
import { contaComposizione } from '../engine/mazzo.js';
import { TAGLIE } from '../engine/proporzioni.js';
import { elencoPrefatti } from '../data/mazzi-prefatti.js';
import { leggiRiferimento } from '../data/riferimento.js';
import { salvaPiano, leggiPiano, aggiornaPiano } from '../data/mazzi-salvati.js';
import { chiediNome } from './chiedi-nome.js';
import { scelteDaSalvataggio, raccontaRiapertura } from '../engine/riapertura.js';
import '../ui/costruttore-mazzo/costruttore-mazzo.js';

const sezione = document.querySelector('#mazzo-personalizzato');

/** @type {object[]} i mazzi di riferimento, già misurati */
let prefatti = [];

/** @type {number} taglia a cui punta il mazzo in costruzione */
let taglia = 30;

/**
 * La forza a cui puntare quando si completa. `0` = "non importa".
 *
 * Sta qui e non dentro `completa()` perché sono due domande diverse: `completa()`
 * risponde a "riempi il mazzo con le carte più utili", l'obiettivo risponde a
 * "quanto forte lo vuoi". Tenerle separate è ciò che permette di completare
 * senza obiettivo — che resta il caso normale — e di riusare per il costruttore
 * lo stesso `obiettivo-forza.js` che il wizard usa sui mazzi generati.
 *
 * @type {number}
 */
let forzaObiettivo = 0;

/** @type {object|null} il mazzo di riferimento scelto in Impostazioni */
let riferimento = null;

/** @type {Array<{carta: object, quantita: number}>} la collezione, per completare */
let disponibili = [];

/**
 * Il salvataggio che si sta modificando, se si è arrivati qui da "Modifica a
 * mano". Finché c'è, "Salva" **riscrive quello** invece di crearne un altro.
 * @type {{id: string, nome: string}|null}
 */
let apertoDa = null;

/** @type {number|null} la forza migliore raggiungibile con questa collezione */
let tetto = null;

/**
 * L'id del salvataggio da ricaricare nel costruttore appena è pronto.
 *
 * Lo scrive il router leggendo `#personalizzato/<id>`; `preparaPersonalizzato()`
 * lo consuma e lo azzera, così un ritorno nella vista senza parametro non
 * ricarica di nuovo il mazzo di prima sopra il lavoro in corso.
 *
 * @type {string|null}
 */
let daRiaprire = null;

/**
 * Prepara la vista: carica collezione e riferimenti.
 * @returns {Promise<void>}
 */
export async function preparaPersonalizzato() {
  if (!sezione) return;

  sezione.innerHTML = `
    <button type="button" class="indietro" data-vai="mazzi">I miei mazzi</button>
    <h3>Mazzo personalizzato</h3>
    <p class="aiuto">
      Scegli tu le carte, dalla tua collezione. Il punteggio si aggiorna a ogni
      carta, così vedi cosa cambia davvero — e gli avvisi ti dicono cosa non
      torna senza impedirti di procedere.
    </p>
    <p class="aiuto" id="tetto-personalizzato"></p>
    <div class="riga-taglia">
      <label for="taglia-personalizzato">Il mazzo deve avere</label>
      <select id="taglia-personalizzato">
        ${Object.values(TAGLIE)
          .map((t) => `<option value="${t}"${t === taglia ? ' selected' : ''}>${t} carte</option>`)
          .join('')}
      </select>
    </div>
    <div class="riga-taglia">
      <label for="forza-personalizzato">Completando, punta a</label>
      <select id="forza-personalizzato"></select>
    </div>
    <div id="esito-personalizzato"></div>
    <div class="azioni">
      <button type="button" id="completa-personalizzato">Completa il mazzo</button>
      <button type="button" id="verifica-personalizzato" class="secondario">Verifica</button>
      <button type="button" id="salva-personalizzato" class="secondario">Salva questo mazzo</button>
      <button type="button" id="svuota-personalizzato" class="secondario">Svuota</button>
    </div>
    <div id="proposta-personalizzato"></div>
    <p id="stato-personalizzato" class="stato" hidden></p>
    <!--
      Qui non c'e' piu' l'elenco dei mazzi salvati: sta nella libreria, che e'
      la schermata da cui si entra qui dentro. Tenerne una copia in fondo a una
      lista lunga come questa voleva dire scorrerla tutta per arrivarci.
    -->
    <costruttore-mazzo id="costruttore"></costruttore-mazzo>
  `;

  const costruttore = sezione.querySelector('#costruttore');
  const voci = await elencoCompleto();
  costruttore.voci = voci;
  // `idSet` e `numero` si prendono dalla RIGA, non dalla carta: il dataset non
  // li mette dentro la carta, e senza di loro la chiave usata per applicare le
  // mosse sarebbe "undefined/undefined" per tutte — le mosse si calcolavano
  // giuste e poi non si applicavano a niente.
  disponibili = voci
    .filter((v) => v.carta)
    .map((v) => ({
      carta: { ...v.carta, idSet: v.idSet, numero: v.numero },
      quantita: v.quantita,
    }));
  tetto = forzaMassima();
  mostraTetto();

  prefatti = (await elencoPrefatti()).map((m) => ({
    nome: m.nome,
    forza: forza(m, { taglia: m.taglia }).totale,
  }));

  // Il riferimento serve a due cose in questa schermata: come metro nel
  // confronto sotto il punteggio, e come scelta rapida nel menu della forza.
  riferimento = await leggiRiferimento().catch(() => null);
  mostraForze();

  sezione.querySelector('#forza-personalizzato').addEventListener('change', (evento) => {
    forzaObiettivo = Number(evento.target.value);
  });

  sezione.querySelector('#taglia-personalizzato').addEventListener('change', (evento) => {
    taglia = Number(evento.target.value);
    // Il tetto dipende dalla taglia: un 60 puo' arrivare piu' in alto di un 15.
    tetto = forzaMassima();
    mostraTetto();
    // I gradini di forza si fermano al tetto, quindi cambiano con lui.
    mostraForze();
    disegnaEsito(costruttore);
  });
  sezione.querySelector('#svuota-personalizzato').addEventListener('click', () => {
    costruttore.svuota();
  });
  sezione.querySelector('#salva-personalizzato').addEventListener('click', () => salva(costruttore));
  sezione
    .querySelector('#completa-personalizzato')
    .addEventListener('click', () => proponi(costruttore, 'completa'));
  sezione
    .querySelector('#verifica-personalizzato')
    .addEventListener('click', () => verifica(costruttore));

  costruttore.addEventListener('scelta-cambiata', () => disegnaEsito(costruttore));
  disegnaEsito(costruttore);

  // `#personalizzato/<id>` significa "riprendi a modificare questo salvataggio":
  // ci si arriva dal pulsante "Modifica a mano" nel dettaglio del mazzo.
  // Entrare in "Mazzo personalizzato" senza id vuol dire mazzo nuovo: se si
  // restasse legati al salvataggio di prima, il mazzo dopo lo sovrascriverebbe.
  if (!daRiaprire) {
    apertoDa = null;
    etichettaSalva();
  }

  if (daRiaprire) {
    const id = daRiaprire;
    daRiaprire = null;
    await riapri(costruttore, id).catch((errore) => {
      messaggio(`Non è stato possibile riaprirlo: ${errore.message}`);
    });
  }
}

/**
 * Riempie il menu "Completando, punta a".
 *
 * Le scelte dipendono da cosa c'è in casa, come nel wizard: "come il mazzo di
 * riferimento" si propone solo a chi ne ha scelto uno, altrimenti sarebbe una
 * voce che non vuol dire niente. I gradini fissi si fermano al tetto della
 * collezione: chiedere 80 a chi arriva a 45 è una promessa che il motore non
 * può mantenere, e produrrebbe solo un "non ci sono riuscito".
 *
 * @returns {void}
 */
function mostraForze() {
  const menu = sezione.querySelector('#forza-personalizzato');
  if (!menu) return;

  const gradini = [20, 30, 40, 50, 60, 70, 80].filter((n) => !tetto || n <= tetto);
  const scelte = [
    { valore: 0, testo: 'Non importa: il mazzo migliore possibile' },
    ...(riferimento?.forza
      ? [
          {
            valore: riferimento.forza,
            testo: `Come «${riferimento.nome}» — forza ${riferimento.forza}`,
          },
        ]
      : []),
    ...gradini.map((n) => ({ valore: n, testo: `Forza ${n}` })),
  ];

  // Se l'obiettivo scelto prima non è più proponibile (la taglia è cambiata e
  // il tetto con lei), si torna a "non importa" invece di restare su un valore
  // che il menu non mostra più.
  if (!scelte.some((s) => s.valore === forzaObiettivo)) forzaObiettivo = 0;

  menu.innerHTML = scelte
    .map(
      (s) =>
        `<option value="${s.valore}"${s.valore === forzaObiettivo ? ' selected' : ''}>${escapeHtml(
          s.testo,
        )}</option>`,
    )
    .join('');
}

/**
 * Rimette nel costruttore le carte di un mazzo salvato.
 *
 * Funziona solo sui salvataggi da un mazzo solo — quelli fatti da qui. Un
 * salvataggio del wizard ne contiene tre o quattro, e non c'è modo sensato di
 * caricarli in un costruttore che ne tiene uno: si dice dove aprirli invece di
 * caricarne uno a caso.
 *
 * @param {HTMLElement} costruttore
 * @param {string} id
 * @returns {Promise<void>}
 */
async function riapri(costruttore, id) {
  const piano = await leggiPiano(id);
  if (!piano) return;

  if ((piano.mazzi?.length ?? 0) !== 1) {
    messaggio(
      `«${piano.nome}» contiene ${piano.mazzi?.length ?? 0} mazzi: si guardano fra ` +
        '"I miei mazzi", dove si possono confrontare fra loro.',
    );
    return;
  }

  // Il calcolo sta in `engine/riapertura.js`: è una regola di dominio — quali
  // carte tue corrispondono a questo salvataggio — ed è il punto in cui un
  // mazzo può riaprirsi vuoto, quindi si prova senza browser.
  const esito = scelteDaSalvataggio(piano.mazzi[0].carte ?? [], disponibili);
  const scelte = esito.scelte;

  const salvata = piano.opzioni?.taglia;
  if (salvata && salvata !== taglia) {
    taglia = salvata;
    sezione.querySelector('#taglia-personalizzato').value = String(taglia);
    tetto = forzaMassima();
    mostraTetto();
    mostraForze();
  }

  costruttore.scelte = scelte;
  // Da adesso "Salva" vuol dire "salva le modifiche a questo".
  apertoDa = { id, nome: piano.nome };
  etichettaSalva();
  disegnaEsito(costruttore);
  messaggio(raccontaRiapertura(piano.nome, esito));
}

/**
 * Il pulsante dice cosa fa: creare un mazzo nuovo o modificarne uno che c'è.
 * @returns {void}
 */
function etichettaSalva() {
  const bottone = sezione?.querySelector('#salva-personalizzato');
  if (!bottone) return;
  bottone.textContent = apertoDa ? `Salva le modifiche a «${apertoDa.nome}»` : 'Salva questo mazzo';
}

/**
 * Scrive una riga di stato sotto le azioni.
 * @param {string} testo
 * @returns {void}
 */
function messaggio(testo) {
  const stato = sezione.querySelector('#stato-personalizzato');
  if (!stato) return;
  stato.textContent = testo;
  stato.hidden = !testo;
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
 * La forza migliore che questa collezione può dare, a questa taglia.
 *
 * Si calcola completando un mazzo **vuoto**: `completa()` sceglie a ogni giro
 * la carta che serve di più, quindi il mazzo che ne esce è il meglio che il
 * motore sa fare con quelle carte. Non è un massimo dimostrato — servirebbe
 * provare tutte le combinazioni, che sono astronomiche — ma è un tetto onesto e
 * **coerente col pulsante**: è esattamente il mazzo che "Completa" produrrebbe
 * partendo da zero, quindi il numero non promette niente di irraggiungibile.
 *
 * @returns {number|null}
 */
function forzaMassima() {
  if (!disponibili.length) return null;
  const vuoto = { nome: 'Massimo', carte: [] };
  const { mosse } = completa(vuoto, disponibili, { taglia });
  return forza(applica(vuoto, mosse), { taglia }).totale;
}

/**
 * Scrive a schermo il tetto raggiungibile.
 *
 * È la risposta alla domanda che chi costruisce si fa per prima — *fin dove
 * posso arrivare con le carte che ho?* — e senza di essa il punteggio non ha
 * scala: 40 è tanto o poco dipende solo da quanto si poteva fare.
 *
 * @returns {void}
 */
function mostraTetto() {
  const p = sezione.querySelector('#tetto-personalizzato');
  if (!p) return;
  p.innerHTML = tetto
    ? `Con le carte che hai, un mazzo da ${taglia} arriva al massimo a ` +
      `<strong>forza ${tetto}</strong>.`
    : '';
}

/**
 * Il mazzo in costruzione, nella forma che il motore si aspetta.
 * @param {HTMLElement} costruttore
 * @returns {object}
 */
function mazzoCorrente(costruttore) {
  const carte = costruttore.carte;
  return {
    nome: 'Mazzo personalizzato',
    carte,
    totale: carte.reduce((s, v) => s + v.quantita, 0),
    tipi: tipiPrevalenti(carte),
    // Senza, il mazzo è incompleto rispetto a quelli generati, e le funzioni
    // del motore che la aggiornano invece di ricalcolarla — la sostituzione ⇄
    // dopo il salvataggio, gli scambi per la forza — esplodono sulla prima
    // carta che toccano.
    composizione: contaComposizione(carte),
  };
}

/**
 * I tipi più rappresentati fra i Pokémon scelti, al massimo due.
 *
 * Non lo sceglie l'utente: il tipo di un mazzo è una conseguenza delle carte
 * che contiene, e chiederlo sarebbe un dato in più da tenere coerente a mano.
 *
 * @param {Array<{carta: object, quantita: number}>} carte
 * @returns {string[]}
 */
function tipiPrevalenti(carte) {
  const conti = {};
  for (const voce of carte) {
    if (voce.carta?.categoria !== 'Pokémon') continue;
    for (const tipo of voce.carta.tipi ?? []) conti[tipo] = (conti[tipo] ?? 0) + voce.quantita;
  }
  return Object.entries(conti)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([tipo]) => tipo);
}

/**
 * Disegna punteggio, avvisi e confronto coi mazzi di riferimento.
 * @param {HTMLElement} costruttore
 */
function disegnaEsito(costruttore) {
  const esito = sezione.querySelector('#esito-personalizzato');
  const mazzo = mazzoCorrente(costruttore);

  if (!mazzo.totale) {
    esito.innerHTML =
      '<p class="aiuto">Aggiungi la prima carta col tasto <strong>+</strong> qui sotto.</p>';
    return;
  }

  const f = forza(mazzo, { taglia });
  const avvisi = diagnostica(mazzo, { taglia });

  const dettaglio = [
    `offesa ${Math.round(f.offesa * 100)}`,
    `resistenza ${Math.round(f.resistenza * 100)}`,
    `evoluzioni ${Math.round(f.struttura * 100)}`,
    `energie ${Math.round(f.motore * 100)}`,
    `avvio ${Math.round(f.costanza * 100)}`,
  ].join(' · ');

  // Il confronto col riferimento più vicino: è il numero che rende leggibile
  // il punteggio. "Forza 44" non dice niente; "come il Kit di Alola" sì.
  const vicino = prefatti.length
    ? prefatti.reduce((a, b) =>
        Math.abs(b.forza - f.totale) < Math.abs(a.forza - f.totale) ? b : a,
      )
    : null;

  esito.innerHTML = `
    <ul class="elenco-forza">
      <li>
        <span class="forza-nome">${mazzo.totale} / ${taglia} carte</span>
        <span class="forza-barra">
          <span class="forza-riempimento" style="inline-size:${f.totale}%"></span>
          ${
            vicino
              ? `<span class="tacca-riferimento" style="inset-inline-start:${vicino.forza}%"></span>`
              : ''
          }
        </span>
        <span class="forza-valore">${f.totale}${tetto ? ` <small>/ ${tetto}</small>` : ''}</span>
        <span class="forza-dettaglio">${dettaglio}</span>
      </li>
    </ul>
    ${
      vicino
        ? `<p class="aiuto">Rispetto a <strong>${vicino.nome}</strong> (${vicino.forza}):
             ${confronta(f.totale, vicino.forza).testo}.</p>`
        : ''
    }
    ${
      f.attendibile
        ? ''
        : '<p class="aiuto">Di alcune carte il dataset non ha i dati degli attacchi: il punteggio è approssimato.</p>'
    }
    ${avvisi.map(riga).join('')}
  `;
}

/**
 * Un avviso, con le carte a cui si riferisce.
 *
 * L'elenco delle carte non è un ornamento: "ci sono evoluzioni orfane" non si
 * può correggere, "Machamp non ha Machoke" sì.
 *
 * @param {object} avviso
 * @returns {string} HTML
 */
function riga(avviso) {
  const classe = avviso.gravita === GRAVITA.BLOCCANTE ? 'errore' : 'aiuto';
  const elenco = avviso.carte.length
    ? `<br /><span class="carte-avviso">${avviso.carte.join(' · ')}</span>`
    : '';
  return `<p class="${classe}">${avviso.testo}${elenco}</p>`;
}

/**
 * Propone di completare o correggere il mazzo, e mostra cosa succederebbe.
 *
 * Le mosse si **mostrano prima** di applicarle. Un pulsante che riempie il
 * mazzo da solo e in silenzio è magia, e la magia non insegna niente a chi sta
 * imparando a costruire mazzi: qui ogni carta aggiunta porta con sé il perché.
 *
 * @param {HTMLElement} costruttore
 * @param {'completa'|'correggi'} modo
 * @returns {void}
 */
function proponi(costruttore, modo) {
  const zona = sezione.querySelector('#proposta-personalizzato');
  const attuale = mazzoCorrente(costruttore);
  const funzione = modo === 'correggi' ? correggi : completa;
  const esito = funzione(attuale, disponibili, { taglia });
  let mosse = esito.mosse ?? [];

  // Riempito il mazzo, lo si porta alla forza chiesta. Sono due passi distinti
  // e in quest'ordine per forza: `avvicinaAForza()` **scambia** carte, quindi
  // ha bisogno di un mazzo già completo su cui lavorare — su un mazzo a metà
  // sposterebbe un punteggio destinato a cambiare di nuovo al riempimento.
  const misure = modo === 'completa' && forzaObiettivo > 0 ? scambiaPerForza(attuale, mosse) : null;
  if (misure?.scambi) mosse = misure.mosse;

  if (!mosse.length) {
    zona.innerHTML = `<p class="aiuto">${
      modo === 'correggi'
        ? 'Non c\'è niente da correggere.'
        : 'Il mazzo è già completo, o fra le carte rimaste non ce n\'è nessuna utile.'
    }</p>${misure ? testoObiettivo(misure.esito, misure.esito.arrivo) : ''}`;
    return;
  }

  const dopo = applica(attuale, mosse);
  const f = forza(dopo, { taglia });

  zona.innerHTML = `
    <div class="proposta">
      <p><strong>${modo === 'correggi' ? 'Correzione proposta' : 'Completamento proposto'}</strong>
         — il mazzo passerebbe a <strong>${f.totale}</strong> di forza.</p>
      ${misure ? testoObiettivo(misure.esito, f.totale) : ''}
      <ul class="elenco-mosse">
        ${mosse
          .map(
            (m) => `<li class="${m.verso}">
              <span class="segno">${m.verso === 'togli' ? '−' : '+'}${m.quante}</span>
              <span class="nome">${m.carta.nome}</span>
              <span class="perche">${m.motivo}</span>
            </li>`,
          )
          .join('')}
      </ul>
      ${
        esito.mancanti
          ? `<p class="errore">Restano ${esito.mancanti} carte scoperte: la collezione non basta
               per un mazzo da ${taglia}.</p>`
          : ''
      }
      <div class="azioni">
        <button type="button" data-applica>Applica</button>
        <button type="button" class="secondario" data-annulla>Lascia stare</button>
      </div>
    </div>`;

  zona.querySelector('[data-applica]').addEventListener('click', () => {
    const scelte = costruttore.scelte;
    for (const mossa of mosse) {
      const k = `${mossa.carta.idSet}/${mossa.carta.numero}`;
      const ora = scelte.get(k) ?? 0;
      const nuova = mossa.verso === 'togli' ? ora - mossa.quante : ora + mossa.quante;
      if (nuova > 0) scelte.set(k, nuova);
      else scelte.delete(k);
    }
    costruttore.scelte = scelte;
    zona.innerHTML = '';
    disegnaEsito(costruttore);
  });
  zona.querySelector('[data-annulla]').addEventListener('click', () => {
    zona.innerHTML = '';
  });
}

/**
 * Porta il mazzo completato alla forza chiesta, e rifà l'elenco delle mosse.
 *
 * `avvicinaAForza()` è lo stesso modulo che il wizard usa sui mazzi generati,
 * e riusarlo qui non è comodità: se il costruttore inseguisse la forza con una
 * regola propria, lo stesso obiettivo darebbe due mazzi diversi a seconda di
 * dove lo si è chiesto, e il numero smetterebbe di voler dire una cosa sola.
 *
 * @param {object} attuale il mazzo com'è adesso
 * @param {import('../engine/completa-mazzo.js').Mossa[]} mosse quelle di `completa()`
 * @returns {{mosse: object[], esito: object, scambi: boolean}|null}
 */
function scambiaPerForza(attuale, mosse) {
  // `applica()` non ricostruisce `composizione`, che `aggiungiAlMazzo()` e
  // `togliDalMazzo()` invece aggiornano a ogni scambio: senza, il primo scambio
  // fallirebbe leggendo un campo di `undefined`.
  const bozza = conComposizione(applica(attuale, mosse));

  const { esiti } = avvicinaAForza([bozza], {
    obiettivo: forzaObiettivo,
    taglia,
    dispensa: disponibilitaResidua(disponibili, [bozza]),
  });
  const esito = esiti[0] ?? null;
  if (!esito) return null;

  return {
    esito,
    scambi: esito.scambi.length > 0,
    mosse: differenza(attuale, bozza, {
      motivi: mosse,
      altrimenti: `Scambiata per portare il mazzo a forza ${forzaObiettivo}.`,
    }),
  };
}

/**
 * Un mazzo con `totale` e `composizione` coerenti, come li vuole `engine/mazzo.js`.
 *
 * @param {object} mazzo
 * @returns {object}
 */
function conComposizione(mazzo) {
  const carte = (mazzo.carte ?? []).map((v) => ({ ...v }));
  return {
    ...mazzo,
    carte,
    totale: carte.reduce((s, v) => s + v.quantita, 0),
    composizione: contaComposizione(carte),
  };
}

/**
 * Cosa dire dell'obiettivo di forza: raggiunto, mancato, o non misurabile.
 *
 * Il motivo si scrive per esteso perché sono situazioni diverse che meritano
 * risposte diverse — "la tua collezione non ha carte più deboli" si risolve
 * comprando o abbassando l'obiettivo, "non riesco a misurare questo mazzo" no.
 *
 * @param {object} esito da `avvicinaAForza()`
 * @param {number} arrivo la forza del mazzo proposto
 * @returns {string} HTML
 */
function testoObiettivo(esito, arrivo) {
  if (!esito) return '';
  if (esito.motivo === 'nonMisurabile') {
    return `<p class="aiuto">Obiettivo forza ${forzaObiettivo}: non applicato, perché di queste
      carte il catalogo non conosce abbastanza attacchi per misurarle.</p>`;
  }
  if (esito.raggiunto) {
    return `<p class="aiuto">Obiettivo forza ${forzaObiettivo}: centrato (${arrivo}).</p>`;
  }
  const perche =
    esito.motivo === 'collezione'
      ? 'fra le tue carte non ce n\'è nessuna che lo avvicini di più'
      : 'si è fermato dopo i tentativi previsti';
  return `<p class="aiuto">Obiettivo forza ${forzaObiettivo}: si arriva a ${arrivo},
    ${perche}.</p>`;
}

/**
 * Verifica il mazzo e, se non va, chiede come correggerlo.
 *
 * La domanda è il punto: correggere d'ufficio significherebbe riscrivere il
 * mazzo di qualcun altro, e in questo progetto un mazzo fuori regolamento è
 * spesso una scelta — le regole della casa nascono da lì.
 *
 * @param {HTMLElement} costruttore
 * @returns {void}
 */
function verifica(costruttore) {
  const zona = sezione.querySelector('#proposta-personalizzato');
  const mazzo = mazzoCorrente(costruttore);
  const avvisi = diagnostica(mazzo, { taglia });
  const bloccanti = avvisi.filter((a) => a.gravita === GRAVITA.BLOCCANTE);

  // Su un mazzo vuoto `diagnostica()` tace apposta — non c'è niente da dire a
  // chi non ha ancora scelto — ma qui il silenzio verrebbe letto come "tutto a
  // posto", che su zero carte è la risposta sbagliata alla domanda giusta.
  if (!mazzo.totale) {
    zona.innerHTML = '<p class="aiuto">Il mazzo è vuoto: non c\'è ancora niente da verificare.</p>';
    return;
  }
  if (!avvisi.length) {
    zona.innerHTML = '<p class="aiuto">Verifica superata: il mazzo si può giocare così com\'è.</p>';
    return;
  }
  if (!bloccanti.length) {
    zona.innerHTML = `<p class="aiuto">Nessun problema che impedisca di giocare.
      Rest${avvisi.length === 1 ? 'a 1 osservazione' : `ano ${avvisi.length} osservazioni`},
      elencat${avvisi.length === 1 ? 'a' : 'e'} qui sopra: puoi ignorarl${
        avvisi.length === 1 ? 'a' : 'e'
      }.</p>`;
    return;
  }

  zona.innerHTML = `
    <div class="proposta">
      <p class="errore"><strong>Verifica non superata:</strong> ${bloccanti.length}
         problem${bloccanti.length === 1 ? 'a impedisce' : 'i impediscono'} di giocare questo mazzo.</p>
      <ul>${bloccanti.map((a) => `<li>${a.testo}</li>`).join('')}</ul>
      <p class="aiuto">Come vuoi sistemarli?</p>
      <div class="azioni">
        <button type="button" data-auto>Correggi tu</button>
        <button type="button" class="secondario" data-manuale>Faccio io</button>
      </div>
    </div>`;

  zona.querySelector('[data-auto]').addEventListener('click', () => proponi(costruttore, 'correggi'));
  zona.querySelector('[data-manuale]').addEventListener('click', () => {
    zona.innerHTML =
      '<p class="aiuto">Va bene: i problemi restano elencati qui sopra, con le carte a cui si riferiscono.</p>';
  });
}

/**
 * Salva il mazzo fra quelli conservati, riusando lo stesso deposito dei mazzi
 * generati: per chi lo rilegge, un mazzo è un mazzo.
 *
 * @param {HTMLElement} costruttore
 * @returns {Promise<void>}
 */
async function salva(costruttore) {
  const mazzo = mazzoCorrente(costruttore);

  if (!mazzo.totale) {
    messaggio('Il mazzo è vuoto: non c\'è niente da salvare.');
    return;
  }

  // Mazzo riaperto da "Modifica a mano": si riscrive **quello**, senza chiedere
  // niente. Chiedere di nuovo il nome era il difetto: chi cambia tre carte a un
  // mazzo che ha già un nome non lo sta ribattezzando, e accettando la proposta
  // si ritrovava due mazzi quasi uguali nell'elenco.
  if (apertoDa) {
    try {
      await aggiornaPiano(
        apertoDa.id,
        { mazzi: [{ ...mazzo, nome: apertoDa.nome }], regole: [], carenze: [], permessi: {} },
        { taglia, numeroMazzi: 1, personalizzato: true },
      );
      location.hash = `mazzi/${apertoDa.id}`;
    } catch (errore) {
      messaggio(`Non è stato possibile salvare le modifiche: ${errore.message}`);
    }
    return;
  }

  // Il nome si chiede PRIMA di scrivere, come per i mazzi generati. Non è solo
  // simmetria: `istantanea()` rifiuta i salvataggi senza nome, quindi finché
  // qui non lo si chiedeva il pulsante "Salva" falliva **sempre**, e l'errore
  // arrivava dal fondo del deposito invece che dalla schermata.
  const nome = await chiediNome({
    titolo: 'Che nome dai a questo mazzo?',
    aiuto: 'Serve a ritrovarlo fra "I miei mazzi".',
    valore: nomeProposto(mazzo),
  });
  if (nome === null) return;

  try {
    // Si costruisce un piano finto con un mazzo solo: il formato salvato è
    // quello dei mazzi generati, e riusarlo evita un secondo elenco nella
    // schermata dei salvataggi.
    const id = await salvaPiano(
      { mazzi: [{ ...mazzo, nome }], regole: [], carenze: [], permessi: {} },
      { taglia, numeroMazzi: 1, personalizzato: true },
      nome,
    );
    // Si va a vederlo dove è finito: salvare e non vedere niente cambiare
    // sembra un salvataggio non riuscito. Prima si scorreva fino in fondo alla
    // pagina; ora il mazzo salvato ha una schermata sua.
    location.hash = `mazzi/${id}`;
  } catch (errore) {
    messaggio(`Non è stato possibile salvare: ${errore.message}`);
  }
}

/**
 * Un nome già scritto nel dialogo, da accettare o correggere.
 *
 * Si costruisce sui tipi prevalenti perché è così che i mazzi si chiamano fra
 * loro al tavolo ("quello d'Erba"), e un campo già pieno si conferma con un
 * tocco — che è quanto vale la pena spendere per un nome.
 *
 * @param {object} mazzo
 * @returns {string}
 */
function nomeProposto(mazzo) {
  const tipi = mazzo.tipi?.length ? mazzo.tipi.join('/') : 'Misto';
  return `${tipi} da ${mazzo.totale}`;
}

// Si prepara entrando nella vista, non al caricamento della pagina: legge
// l'intera collezione, e chi apre l'app sul catalogo non deve pagarne il costo.
// Stessa scelta fatta per il wizard in `vista-mazzi.js`.
document.addEventListener('vista-cambiata', (evento) => {
  if (evento.detail.nome !== 'personalizzato') return;
  daRiaprire = evento.detail.parametro || null;
  preparaPersonalizzato();
});
