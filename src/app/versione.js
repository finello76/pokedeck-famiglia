/**
 * Mostra il numero di build nel piè di pagina.
 *
 * Serve a capire, guardando la pagina pubblicata su GitHub Pages, se il deploy
 * è arrivato o se il browser mostra ancora una versione vecchia dalla cache. Il
 * numero lo scrive `tools/timbra-versione.mjs` a ogni commit.
 *
 * La lettura è **network-first** (vedi anche `sw.js`): il file va preso fresco
 * dalla rete, altrimenti mostrerebbe sempre la versione in cache — cioè proprio
 * ciò che vogliamo poter verificare. Offline si ripiega su quel che c'è.
 *
 * @module app/versione
 */

/**
 * Legge `version.json` e scrive il testo nel piè di pagina.
 *
 * @param {HTMLElement} elemento dove scrivere la versione
 * @returns {Promise<void>}
 */
export async function mostraVersione(elemento) {
  if (!elemento) return;
  try {
    // `cache: 'no-store'` scavalca la cache HTTP del browser; il service worker
    // ha la sua regola network-first per lo stesso file.
    const risposta = await fetch(new URL('../../version.json', import.meta.url), {
      cache: 'no-store',
    });
    if (!risposta.ok) throw new Error(String(risposta.status));
    const { numero, data } = await risposta.json();
    elemento.textContent = `build ${numero} · ${data}`;
    elemento.hidden = false;
  } catch {
    // In sviluppo il file può non esserci ancora, o si è offline: nessun numero
    // è meglio di un numero sbagliato, quindi il piè di pagina resta nascosto.
    elemento.hidden = true;
  }
}
