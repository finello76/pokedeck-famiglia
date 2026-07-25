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
import { TAGLIE } from '../engine/proporzioni.js';
import { elencoPrefatti } from '../data/mazzi-prefatti.js';
import { salvaPiano } from '../data/mazzi-salvati.js';
import '../ui/costruttore-mazzo/costruttore-mazzo.js';

const sezione = document.querySelector('#mazzo-personalizzato');

/** @type {object[]} i mazzi di riferimento, già misurati */
let prefatti = [];

/** @type {number} taglia a cui punta il mazzo in costruzione */
let taglia = 30;

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
      <button type="button" id="salva-personalizzato" class="secondario">Salva questo mazzo</button>
      <button type="button" id="svuota-personalizzato" class="secondario">Svuota</button>
    </div>
    <p id="stato-personalizzato" class="stato" hidden></p>
    <costruttore-mazzo id="costruttore"></costruttore-mazzo>
  `;

  const costruttore = sezione.querySelector('#costruttore');
  costruttore.voci = await elencoCompleto();

  prefatti = (await elencoPrefatti()).map((m) => ({
    nome: m.nome,
    forza: forza(m, { taglia: m.taglia }).totale,
  }));

  sezione.querySelector('#taglia-personalizzato').addEventListener('change', (evento) => {
    taglia = Number(evento.target.value);
    disegnaEsito(costruttore);
  });
  sezione.querySelector('#svuota-personalizzato').addEventListener('click', () => {
    costruttore.svuota();
  });
  sezione.querySelector('#salva-personalizzato').addEventListener('click', () => salva(costruttore));

  costruttore.addEventListener('scelta-cambiata', () => disegnaEsito(costruttore));
  disegnaEsito(costruttore);
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
        <span class="forza-valore">${f.totale}</span>
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
  if (evento.detail.nome === 'mazzi') preparaPersonalizzato();
});
