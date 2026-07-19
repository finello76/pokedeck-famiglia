/**
 * Il foglio delle carte proxy da stampare e ritagliare.
 *
 * Il motore decide COSA stampare (nome, tipo, motivo); questo modulo è il
 * livello applicativo che ci mette le illustrazioni — è lui ad avere accesso
 * al dataset — e costruisce la griglia a misura reale 63×88 mm definita in
 * `stampa.css`. Uso esclusivamente domestico/familiare.
 *
 * @module app/foglio-proxy
 */

import { cercaPerNome, urlImmagine } from '../data/dataset.js';
import { normalizzaNome } from '../engine/nomi.js';

/**
 * Cerca nel dataset la scansione delle carte proxy e la aggancia alle voci.
 *
 * La ricerca usa solo i set già caricati in memoria (quelli della collezione):
 * di solito la pre-evoluzione sta nello stesso set dell'evoluzione, quindi la
 * carta si trova. Se non si trova, il proxy resta senza immagine e verrà
 * stampato come segnaposto testuale: peggio esteticamente, uguale come regole.
 *
 * Muta le voci dei mazzi: dopo questa chiamata i caroselli mostrano la carta
 * vera e il foglio di stampa ha la scansione.
 *
 * @param {object} piano risultato di `pianifica()`
 * @returns {Promise<void>}
 */
export async function arricchisciProxy(piano) {
  for (const mazzo of piano?.mazzi ?? []) {
    for (const voce of mazzo.carte) {
      if (!voce.proxy || voce.carta.immagine) continue;

      const trovate = await cercaPerNome(voce.carta.nome);
      const esatta = trovate.find(
        (t) =>
          normalizzaNome(t.carta.nome) === normalizzaNome(voce.carta.nome) && t.carta.immagine,
      );
      if (esatta) {
        // La carta del dataset porta con sé immagine, PS e attacchi veri: il
        // contrassegno proxy resta sulla VOCE, non sulla carta.
        voce.carta = esatta.carta;
      }
    }
  }
}

/**
 * Costruisce la sezione col foglio di stampa dei proxy.
 *
 * @param {object} piano risultato di `pianifica()`, già arricchito
 * @returns {HTMLElement|null} `null` se non ci sono proxy da stampare
 */
export function foglioProxy(piano) {
  const voci = (piano?.mazzi ?? []).flatMap((mazzo) =>
    mazzo.carte.filter((c) => c.proxy).map((c) => ({ mazzo: mazzo.nome, ...c })),
  );
  if (!voci.length) return null;

  const sezione = document.createElement('section');
  sezione.className = 'pannello foglio-proxy-cornice';

  const celle = voci
    .flatMap((voce) => Array.from({ length: voce.quantita }, () => cella(voce)))
    .join('');

  const scartati = piano.proxyScartati ?? [];

  sezione.innerHTML = `
    <h2>Carte da stampare (proxy)</h2>
    <p class="aiuto no-stampa">
      Queste carte non sono nella collezione: stampale, ritagliale lungo il
      tratteggio (misura reale 63×88 mm) e infilale nel mazzo indicato, magari
      dentro una bustina davanti a una carta qualsiasi. Valgono come la carta
      vera. Solo per giocare in famiglia.
    </p>
    <ul class="motivi-proxy no-stampa">
      ${voci
        .map(
          (v) => `
        <li>
          <strong>${v.quantita}× ${escapeHtml(v.carta.nome)}</strong>
          (${escapeHtml(v.mazzo)}) — ${escapeHtml(v.motivo ?? '')}
        </li>`,
        )
        .join('')}
    </ul>
    ${
      scartati.length
        ? `<p class="aiuto no-stampa">Non stampabili: ${scartati
            .map((s) => `${escapeHtml(s.nome)} (${escapeHtml(s.ragione)})`)
            .join(', ')}.</p>`
        : ''
    }
    <div class="foglio-proxy">${celle}</div>
  `;
  return sezione;
}

/**
 * Una cella 63×88 mm del foglio: scansione se c'è, segnaposto testuale se no.
 * @param {{carta: object, mazzo: string, motivo?: string}} voce
 * @returns {string}
 */
function cella(voce) {
  const { carta } = voce;
  const src = urlImmagine(carta, 'stampa');
  if (src) {
    return `
      <div class="carta-proxy">
        <img src="${src}" alt="Proxy di ${escapeHtml(carta.nome)}" loading="lazy" />
      </div>`;
  }
  return `
    <div class="carta-proxy" data-tipo="${escapeHtml(carta.tipi?.[0] ?? 'Incolore')}">
      <div class="segnaposto-proxy">
        <strong class="nome-proxy">${escapeHtml(carta.nome)}</strong>
        ${carta.tipi?.length ? `<span class="pastiglia-tipo">${escapeHtml(carta.tipi[0])}</span>` : ''}
        <span>${escapeHtml(carta.stadio ?? (carta.categoria === 'Energia' ? 'Energia base' : ''))}</span>
        <em>PROXY — vale come la carta vera<br />(${escapeHtml(voce.mazzo)})</em>
      </div>
    </div>`;
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
