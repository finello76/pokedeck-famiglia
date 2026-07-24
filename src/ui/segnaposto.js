/**
 * Il segnaposto delle carte senza scansione, in un posto solo.
 *
 * Serve perché le carte senza immagine non sono un caso raro: i set vecchi
 * (Set Base, Team Rocket…) nei dati italiani di TCGdex non hanno nessuna
 * scansione, e le Energie base generiche non appartengono a nessun set. Finora
 * ognuna di quelle carte mostrava un punto interrogativo dentro un riquadro —
 * che sembra un errore dell'app, non una carta senza foto — e se l'immagine
 * arrivava rotta restava a schermo il testo alternativo, che è peggio ancora.
 *
 * Qui c'è un disegno solo, tinto dal tipo della carta, usato da tutte le viste;
 * e la funzione che lo sostituisce all'immagine quando il caricamento fallisce.
 *
 * @module ui/segnaposto
 */

/**
 * Il disegnino dentro il segnaposto: una carta stilizzata, sbarrata.
 *
 * È un SVG inline e non un'emoji o un carattere: eredita `currentColor` (quindi
 * il colore del tipo), non dipende dai font del dispositivo e resta nitido a
 * qualsiasi misura, dalla miniatura da 40px alla scheda.
 */
const GLIFO_CARTA = `
  <svg viewBox="0 0 24 24" fill="none" part="glifo">
    <rect x="4.6" y="2.6" width="14.8" height="18.8" rx="2.6"
          stroke="currentColor" stroke-width="1.5" opacity=".85" />
    <circle cx="10.2" cy="9" r="1.9" stroke="currentColor" stroke-width="1.4" />
    <path d="M6.6 18.4 10.8 13l2.6 3 1.9-2.2 2.1 4.6z" fill="currentColor" opacity=".45" />
    <path d="M5.2 21.6 18.8 2.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>`;

/** Le Energie base non sono carte mancanti: sono carte che non esistono. */
const GLIFO_ENERGIA = `
  <svg viewBox="0 0 24 24" fill="none" part="glifo">
    <circle cx="12" cy="12" r="8.2" stroke="currentColor" stroke-width="1.5" />
    <circle cx="12" cy="12" r="3.4" fill="currentColor" opacity=".55" />
  </svg>`;

/**
 * Il segnaposto da mettere al posto dell'immagine.
 *
 * `aria-hidden` perché non aggiunge niente: il nome della carta è già scritto
 * accanto, e farlo annunciare direbbe due volte la stessa cosa.
 *
 * @param {object|null} carta
 * @param {string} [classe='segnaposto'] la classe attesa da chi lo ospita
 * @returns {string} HTML
 * @example
 * elemento.innerHTML = segnaposto(carta, 'segnaposto-mini');
 */
export function segnaposto(carta, classe = 'segnaposto') {
  const glifo = carta?.categoria === 'Energia' ? GLIFO_ENERGIA : GLIFO_CARTA;
  return `<span class="${classe}" aria-hidden="true">${glifo}</span>`;
}

/**
 * Sostituisce l'immagine col segnaposto se non si riesce a caricarla.
 *
 * Senza, un URL che risponde 404 lascia a schermo l'icona di immagine rotta e
 * il testo alternativo: le due cose più brutte che una griglia di carte possa
 * mostrare. Capita davvero — offline, o quando TCGdex sposta una scansione.
 *
 * @param {HTMLImageElement|null} img
 * @param {object|null} carta
 * @param {string} [classe='segnaposto']
 * @returns {void}
 */
export function seImmagineRotta(img, carta, classe = 'segnaposto') {
  if (!img) return;
  img.addEventListener(
    'error',
    () => {
      img.outerHTML = segnaposto(carta, classe);
    },
    { once: true },
  );
}
