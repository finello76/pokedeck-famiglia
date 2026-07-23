/**
 * Tema chiaro/scuro con memoria della scelta.
 *
 * Il default è il tema di sistema (`prefers-color-scheme`, gestito dal CSS). Il
 * pulsante in intestazione forza una scelta esplicita, salvata in localStorage,
 * che ha la precedenza sul sistema finché non la si cambia. La scelta viaggia
 * come attributo `data-theme` su `<html>` (`'chiaro'` | `'scuro'`); assente =
 * segui il sistema. Il CSS (base.css, tipi.css) reagisce a quell'attributo.
 *
 * Differenza rispetto ad Angular: niente servizio con `BehaviorSubject`. Lo
 * stato è un attributo sul DOM, che è anche l'unica cosa che il CSS può leggere;
 * la persistenza è tre righe di localStorage, sincrono, senza HttpClient.
 *
 * @module app/tema
 */

const CHIAVE = 'pokedeck-tema';

/** @returns {'chiaro'|'scuro'|null} la scelta salvata, o null per "segui il sistema" */
function scelta() {
  const v = localStorage.getItem(CHIAVE);
  return v === 'chiaro' || v === 'scuro' ? v : null;
}

/** @returns {'chiaro'|'scuro'} il tema effettivamente in vigore adesso */
function effettivo() {
  return scelta() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'scuro' : 'chiaro');
}

/**
 * Applica la scelta salvata a `<html>`.
 *
 * La chiama anche lo script in testa a `index.html`, prima del CSS, per non far
 * lampeggiare il tema sbagliato al caricamento; qui resta per completezza e per
 * i casi in cui la scelta cambia a runtime.
 * @returns {void}
 */
export function applicaTema() {
  const s = scelta();
  if (s) document.documentElement.setAttribute('data-theme', s);
  else document.documentElement.removeAttribute('data-theme');
}

/**
 * Collega il pulsante che alterna chiaro e scuro.
 * @param {HTMLButtonElement} bottone
 * @returns {void}
 */
export function avviaTema(bottone) {
  if (!bottone) return;
  applicaTema();
  aggiorna(bottone);

  bottone.addEventListener('click', () => {
    // Si parte sempre dal tema in vigore adesso, così il primo tocco fa
    // l'opposto di ciò che si vede, anche quando si stava seguendo il sistema.
    const nuovo = effettivo() === 'scuro' ? 'chiaro' : 'scuro';
    localStorage.setItem(CHIAVE, nuovo);
    applicaTema();
    aggiorna(bottone);
  });

  // Se si segue il sistema, un cambio a runtime (es. passaggio automatico al
  // tramonto) deve aggiornare l'icona; con una scelta esplicita il sistema non
  // conta e non si tocca nulla.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!scelta()) aggiorna(bottone);
  });
}

/**
 * Icona e stato del pulsante. Mostra il tema verso cui si passa: luna quando
 * ora è chiaro, sole quando ora è scuro.
 * @param {HTMLButtonElement} bottone
 */
function aggiorna(bottone) {
  const scuro = effettivo() === 'scuro';
  bottone.textContent = scuro ? '☀️' : '🌙';
  bottone.setAttribute('aria-pressed', String(scuro));
}
