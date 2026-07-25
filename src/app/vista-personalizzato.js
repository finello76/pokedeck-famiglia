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
import { completa, correggi, applica } from '../engine/completa-mazzo.js';
import { TAGLIE } from '../engine/proporzioni.js';
import { elencoPrefatti } from '../data/mazzi-prefatti.js';
import { salvaPiano } from '../data/mazzi-salvati.js';
import '../ui/costruttore-mazzo/costruttore-mazzo.js';

const sezione = document.querySelector('#mazzo-personalizzato');

/** @type {object[]} i mazzi di riferimento, già misurati */
let prefatti = [];

/** @type {number} taglia a cui punta il mazzo in costruzione */
let taglia = 30;

/** @type {Array<{carta: object, quantita: number}>} la collezione, per completare */
let disponibili = [];

/** @type {number|null} la forza migliore raggiungibile con questa collezione */
let tetto = null;

/**
 * Prepara la vista: carica collezione e riferimenti.
 * @returns {Promise<void>}
 */
export async function preparaPersonalizzato() {
  if (!sezione) return;

  sezione.innerHTML = `
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
    <div id="esito-personalizzato"></div>
    <div class="azioni">
      <button type="button" id="completa-personalizzato">Completa il mazzo</button>
      <button type="button" id="verifica-personalizzato" class="secondario">Verifica</button>
      <button type="button" id="salva-personalizzato" class="secondario">Salva questo mazzo</button>
      <button type="button" id="svuota-personalizzato" class="secondario">Svuota</button>
    </div>
    <div id="proposta-personalizzato"></div>
    <p id="stato-personalizzato" class="stato" hidden></p>
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

  sezione.querySelector('#taglia-personalizzato').addEventListener('change', (evento) => {
    taglia = Number(evento.target.value);
    // Il tetto dipende dalla taglia: un 60 puo' arrivare piu' in alto di un 15.
    tetto = forzaMassima();
    mostraTetto();
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
  const mosse = esito.mosse ?? [];

  if (!mosse.length) {
    zona.innerHTML = `<p class="aiuto">${
      modo === 'correggi'
        ? 'Non c\'è niente da correggere.'
        : 'Il mazzo è già completo, o fra le carte rimaste non ce n\'è nessuna utile.'
    }</p>`;
    return;
  }

  const dopo = applica(attuale, mosse);
  const f = forza(dopo, { taglia });

  zona.innerHTML = `
    <div class="proposta">
      <p><strong>${modo === 'correggi' ? 'Correzione proposta' : 'Completamento proposto'}</strong>
         — il mazzo passerebbe a <strong>${f.totale}</strong> di forza.</p>
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
  const stato = sezione.querySelector('#stato-personalizzato');
  const mazzo = mazzoCorrente(costruttore);
  stato.hidden = false;

  if (!mazzo.totale) {
    stato.textContent = 'Il mazzo è vuoto: non c\'è niente da salvare.';
    return;
  }

  try {
    // Si costruisce un piano finto con un mazzo solo: il formato salvato è
    // quello dei mazzi generati, e riusarlo evita un secondo elenco nella
    // schermata dei salvataggi.
    await salvaPiano(
      { mazzi: [mazzo], regole: [], carenze: [], permessi: {} },
      { taglia, numeroMazzi: 1, personalizzato: true },
    );
    stato.textContent = `Mazzo salvato (${mazzo.totale} carte).`;
  } catch (errore) {
    stato.textContent = `Non è stato possibile salvare: ${errore.message}`;
  }
}

// Si prepara entrando nella vista, non al caricamento della pagina: legge
// l'intera collezione, e chi apre l'app sul catalogo non deve pagarne il costo.
// Stessa scelta fatta per il wizard in `vista-mazzi.js`.
document.addEventListener('vista-cambiata', (evento) => {
  if (evento.detail.nome === 'personalizzato') preparaPersonalizzato();
});
