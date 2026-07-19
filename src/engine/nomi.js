/**
 * Confronto fra nomi di carte.
 *
 * Sembra banale ma non lo è: il campo `evolveDa` contiene un **nome scritto a
 * mano**, non un identificativo, e non sempre coincide carattere per carattere
 * col nome della carta a cui si riferisce. Su 3.290 evoluzioni del dataset, 361
 * non trovavano la pre-evoluzione per differenze di sola forma
 * (`"Shaymin-V"` contro la carta chiamata `Shaymin V`).
 *
 * Normalizzando, i fallimenti scendono da 361 a 29 — e quei 29 non sono errori:
 * sono i **fossili**, che evolvono da una carta Allenatore. Vedi `analisi.js`.
 *
 * @module engine/nomi
 */

/**
 * Riduce un nome alla forma con cui si confronta: senza accenti, senza
 * maiuscole, con trattini e spazi multipli appiattiti a spazio singolo.
 *
 * @param {string} nome
 * @returns {string} forma normalizzata, `''` se il nome è vuoto o assente
 * @example
 * normalizzaNome('Shaymin-V');   // 'shaymin v'
 * normalizzaNome('Oscurità');    // 'oscurita'
 * normalizzaNome('  Mr.  Mime'); // 'mr. mime'
 */
export function normalizzaNome(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // toglie i diacritici staccati da NFD
    .replace(/-/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Se due nomi indicano la stessa carta.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean} `false` se uno dei due è vuoto: due assenze non sono
 *   un'uguaglianza, altrimenti tutte le carte senza pre-evoluzione
 *   risulterebbero collegate fra loro
 * @example
 * stessoNome('Shaymin-V', 'Shaymin V'); // true
 * stessoNome('', '');                   // false
 */
export function stessoNome(a, b) {
  const na = normalizzaNome(a);
  return na !== '' && na === normalizzaNome(b);
}
