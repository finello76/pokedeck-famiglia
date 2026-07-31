/**
 * La vista della mini partita: scegli due mazzi salvati e si gioca.
 *
 * Qui non c'è nessuna regola del gioco — stanno tutte in `engine/partita.js` —
 * e nessun disegno: quello lo fa `<tavolo-partita>`. Questo modulo tiene i tre
 * fili insieme: prende i mazzi da IndexedDB, chiama il motore quando si sceglie
 * una mossa, e passa lo stato nuovo al tavolo perché lo animi.
 *
 * Le **regole della casa** del mazzo salvato entrano in partita per codice: un
 * mazzo generato con "ogni Energia vale per qualsiasi tipo" si gioca così anche
 * qui, altrimenti la partita insegnerebbe un gioco diverso da quello che i
 * ragazzi giocano al tavolo con quel mazzo in mano.
 *
 * @module app/vista-partita
 */

import { elencoPiani, leggiPiano } from '../data/mazzi-salvati.js';
import { giocaAllenatore, attacca, attaccaEnergia, evolvi, iniziaPartita, manoImpossibile, mosseDisponibili, passa, rimescolaMano, ritirati, schiera } from '../engine/partita.js';
import '../ui/tavolo-partita/tavolo-partita.js';

const sezione = document.querySelector('[data-vista="partita"]');
const tavolo = sezione?.querySelector('#tavolo');
const scelta = sezione?.querySelector('#scelta-partita');

/** @type {object|null} la partita in corso */
let stato = null;
/**
 * Com'era stata cominciata: i due mazzi e il seme.
 *
 * Serve al "rigioca": con lo stesso seme il mescolamento è identico, quindi la
 * partita riparte esattamente uguale. È l'unica cosa che serve, ed è il motivo
 * per cui il motore prende un seme invece di chiamare `Math.random()`.
 * @type {{idMio: string, idSuo: string, seme: number}|null}
 */
let ultima = null;

/**
 * Riempie i due menu coi mazzi salvati.
 *
 * Si offrono solo i salvataggi con **un mazzo solo**: un piano del wizard ne
 * contiene tre o quattro e non si sa quale mandare in campo. Chi ne ha uno solo
 * può comunque giocarci contro sé stesso — è il modo in cui si impara, provando
 * le due parti.
 *
 * @returns {Promise<void>}
 */
async function preparaScelta() {
  if (!scelta) return;
  const piani = (await elencoPiani()).filter((p) => (p.mazzi?.length ?? 0) === 1);

  if (!piani.length) {
    scelta.innerHTML = `
      <p class="aiuto">Per giocare serve almeno un mazzo salvato: creane uno da
      <strong>I miei mazzi</strong>, poi torna qui.</p>`;
    return;
  }

  const opzioni = piani
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)}</option>`)
    .join('');

  scelta.innerHTML = `
    <div class="scelta-mazzi">
      <label>Tu giochi con
        <select id="mazzo-mio">${opzioni}</select>
      </label>
      <label>Contro
        <select id="mazzo-suo">${opzioni}</select>
      </label>
      <button type="button" id="via-partita">Comincia la partita</button>
    </div>
    <p class="aiuto">Le regole della casa del primo mazzo valgono per tutta la partita.</p>`;

    // Non `addEventListener('click', avvia)`: l'evento del click finirebbe come
  // primo argomento, e le opzioni si leggerebbero da un MouseEvent.
  scelta.querySelector('#via-partita').addEventListener('click', () => avvia());
}

/**
 * Legge i due mazzi scelti e comincia.
 * @returns {Promise<void>}
 */
async function avvia({ stessoSeme = false } = {}) {
  const idMio = stessoSeme ? ultima.idMio : scelta.querySelector('#mazzo-mio').value;
  const idSuo = stessoSeme ? ultima.idSuo : scelta.querySelector('#mazzo-suo').value;
  const seme = stessoSeme ? ultima.seme : Date.now() % 100000;
  ultima = { idMio, idSuo, seme };
  const [mio, suo] = await Promise.all([leggiPiano(idMio), leggiPiano(idSuo)]);
  if (!mio || !suo) return;

  stato = iniziaPartita({
    // I nomi finiscono dentro le frasi del racconto ("Machop attacca con…"),
    // quindi devono leggersi come nomi: "Tu — Mazzo prova attacca" no. Chi sei
    // lo dice il campo, non l'etichetta.
    mazzi: [
      { nome: mio.nome, carte: mio.mazzi[0].carte },
      { nome: idSuo === idMio ? `${suo.nome} (avversario)` : suo.nome, carte: suo.mazzi[0].carte },
    ],
    taglia: mio.opzioni?.taglia ?? mio.mazzi[0].totale,
    regole: (mio.regole ?? []).map((r) => r.codice).filter(Boolean),
    seme,
  });

  // Mano senza Pokémon Base: si rimescola prima ancora di cominciare, come al
  // tavolo. Si fa per tutti e due, o uno dei due non potrebbe schierare.
  for (let chi = 0; chi < 2; chi += 1) {
    let giri = 0;
    while (manoImpossibile(stato, chi) && giri < 10) {
      stato = rimescolaMano(stato, chi);
      giri += 1;
    }
  }

  mostra();
}

/**
 * I due pulsanti di fine partita.
 *
 * "Rigioca questa partita" rimette lo stesso seme: stesse mani, stesse pescate.
 * Serve a capire cosa sarebbe successo cambiando **una** scelta — che è il modo
 * in cui si impara un gioco, e che al tavolo vero non si può fare.
 *
 * @returns {void}
 */
function mostraRipartenza() {
  const zona = sezione.querySelector('#dopo-partita');
  if (!zona) return;
  if (!stato || stato.fase !== 'finita') {
    zona.innerHTML = '';
    return;
  }
  const vincitore = stato.giocatori[stato.vincitore]?.nome ?? '';
  zona.innerHTML = `
    <p class="esito-partita">Ha vinto <strong>${escapeHtml(vincitore)}</strong>.</p>
    <div class="azioni">
      <button type="button" id="rigioca">Rigioca questa partita</button>
      <button type="button" id="nuova" class="secondario">Un'altra partita</button>
    </div>
    <p class="aiuto">Rigiocandola le carte escono nello stesso ordine: puoi provare
    a fare una scelta diversa e vedere come va a finire.</p>`;
  zona.querySelector('#rigioca').addEventListener('click', () => avvia({ stessoSeme: true }));
  zona.querySelector('#nuova').addEventListener('click', () => avvia());
}

/**
 * Passa al tavolo lo stato e le mosse.
 *
 * L'avversario lo muove l'app da sé (`giocaAvversario`): serve un secondo
 * giocatore, e un bambino che impara non deve anche fare le mosse di chi ha di
 * fronte. Le sue mosse restano visibili nel racconto, che è come si impara
 * guardando giocare qualcuno.
 *
 * @returns {void}
 */
function mostra() {
  tavolo.stato = stato;
  tavolo.mosse = stato.diChi === 0 ? mosseDisponibili(stato) : [];
  mostraRipartenza();
  if (stato.fase !== 'finita' && stato.diChi === 1) setTimeout(giocaAvversario, 900);
}

/**
 * L'avversario: sceglie la prima mossa sensata, senza strategia.
 *
 * Non è un giocatore forte e non deve esserlo: serve a far vedere il turno
 * dell'altro. L'ordine — schiera, attacca energia, attacca, passa — è quello
 * che insegna il turno tipo.
 *
 * @returns {void}
 */
function giocaAvversario() {
  if (!stato || stato.diChi !== 1 || stato.fase === 'finita') return;
  const mosse = mosseDisponibili(stato).filter((m) => m.possibile);
  const preferenza = ['schiera-attivo', 'attacco', 'energia', 'schiera-panchina', 'passa'];
  const scelta_ = preferenza.map((t) => mosse.find((m) => m.tipo === t)).find(Boolean);
  stato = applica(stato, scelta_ ?? { tipo: 'passa' });
  mostra();
}

/**
 * Esegue una mossa chiamando il motore.
 * @param {object} s
 * @param {{tipo: string, indice?: number}} mossa
 * @returns {object}
 */
function applica(s, mossa) {
  switch (mossa.tipo) {
    case 'schiera-attivo':
      return schiera(s, mossa.indice, 'attivo');
    case 'schiera-panchina':
      return schiera(s, mossa.indice, 'panchina');
    case 'energia':
      return attaccaEnergia(s, mossa.indice, 'attivo');
    case 'evoluzione':
      return evolvi(s, mossa.indice, 'attivo');
    case 'allenatore':
      return giocaAllenatore(s, mossa.indice);
    case 'attacco':
      return attacca(s, mossa.indice);
    case 'ritirata':
      return ritirati(s, mossa.indice);
    default:
      return passa(s);
  }
}

tavolo?.addEventListener('mossa-scelta', (evento) => {
  if (!stato || stato.diChi !== 0) return;
  stato = applica(stato, evento.detail.mossa);
  mostra();
});

// Entrando nella vista si ricaricano i mazzi salvati: uno appena creato deve
// comparire senza ricaricare l'app.
document.addEventListener('vista-cambiata', (evento) => {
  if (evento.detail.nome !== 'partita') return;
  stato = null;
  preparaScelta();
});

/** @param {string} testo @returns {string} */
function escapeHtml(testo) {
  return String(testo ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}
