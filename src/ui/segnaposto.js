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
 * Sostituisce l'immagine col segnaposto se non si riesce a caricarla — ma
 * prima riprova in **alta qualità**.
 *
 * Il motivo del secondo tentativo, misurato sul Trainer Kit di Alola: la carta
 * 17 (Raichu di Alola) ha `low.webp` che risponde **404** e `high.webp` che
 * risponde **200**. TCGdex pubblica l'URL della carta senza estensione e lascia
 * scegliere la qualità a chi la mostra, ma non tutte le qualità esistono
 * davvero per tutte le carte: l'URL è costruito, non verificato. Il risultato
 * era mezzo Trainer Kit fatto di segnaposti, con la scansione lì disponibile.
 *
 * Si riprova con `high.webp` e non con `high.png`: stessa immagine, un decimo
 * del peso (la png sfiora gli 830 KB, e questa è la griglia).
 *
 * Il ripiego costa una richiesta fallita per carta, e solo per le carte che
 * quel problema ce l'hanno davvero: chi ha la sua `low.webp` non se ne accorge.
 * Se anche l'alta qualità non c'è — o si è offline — allora sì, segnaposto.
 *
 * @param {HTMLImageElement|null} img
 * @param {object|null} carta
 * @param {string} [classe='segnaposto']
 * @returns {void}
 */
export function seImmagineRotta(img, carta, classe = 'segnaposto') {
  if (!img) return;
  img.addEventListener('error', function suErrore() {
    const alta = inAltaQualita(img.currentSrc || img.src);
    if (alta) {
      // Un solo ripiego: `inAltaQualita()` torna null su un URL già alto,
      // quindi al secondo errore si finisce nel segnaposto e non in un ciclo.
      img.src = alta;
      return;
    }
    img.removeEventListener('error', suErrore);
    img.outerHTML = segnaposto(carta, classe);
  });
}

/**
 * Lo stesso URL in alta qualità, o `null` se non c'è niente da ritentare.
 *
 * @param {string} src
 * @returns {string|null}
 * @example
 * inAltaQualita('https://…/tk-sm-r/17/low.webp'); // '…/17/high.webp'
 * inAltaQualita('https://…/tk-sm-r/17/high.webp'); // null
 */
export function inAltaQualita(src) {
  if (!src || !/\/low\.(webp|png)$/.test(src)) return null;
  return src.replace(/\/low\.(webp|png)$/, '/high.webp');
}
