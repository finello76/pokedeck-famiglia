/**
 * Da orientamento del telefono a inclinazione della carta.
 *
 * Sta in un modulo suo, separato dal componente, per una ragione precisa: è
 * l'unico pezzo del visore che **si può verificare senza un telefono in mano**.
 * Il resto (dialog, animazioni, permessi) va provato sul dispositivo; questa è
 * matematica pura, e come tale ha dei test.
 *
 * ## Il problema che risolve
 *
 * `deviceorientation` dà tre **angoli di Eulero** — `alpha`, `beta`, `gamma` —
 * e gli angoli di Eulero hanno una singolarità. Usarli come se fossero
 * coordinate lineari funziona finché il telefono sta quasi piatto, e si rompe
 * proprio quando lo si alza per guardarci dentro.
 *
 * Due guasti distinti:
 *
 * 1. **Blocco cardanico a `beta` = ±90°** (telefono in verticale). Lì `gamma`
 *    non è più definito: oscilla da solo, e quando `beta` attraversa i 90°
 *    salta di colpo da `+80` a `-80`. È lo scatto che si vede alzando il
 *    telefono, perché tenerlo verticale è esattamente come lo si tiene per
 *    guardare una carta.
 * 2. **Avvolgimento a ±180°** di `beta`: la differenza fra `179` e `-179` è di
 *    2 gradi, ma sottraendoli si ottiene `358`.
 *
 * ## Come li risolve
 *
 * - La differenza fra due angoli si misura sull'**arco più corto**, non
 *   sottraendo (guasto 2).
 * - Il contributo di `gamma` si **smorza con `cos(beta)`**: avvicinandosi alla
 *   verticale va a zero da solo, e con esso il salto (guasto 1). Non è una
 *   pezza arbitraria — è la stessa proiezione che dice quanto una rotazione
 *   attorno all'asse verticale conta ancora come "rollio" visto di faccia.
 * - `beta` **non** viene smorzato: la sensibilità avanti/indietro deve restare
 *   piena proprio in verticale, che è la posizione d'uso normale.
 * - Un filtro passa-basso finale trasforma qualunque scalino residuo in una
 *   scivolata.
 *
 * @module ui/visore-carta/inclinazione
 */

/** Massimo scostamento in gradi: dev'essere un luccichio, non una giostra. */
export const MASSIMO = 8;

/**
 * Quanto pesa un grado di rotazione del telefono. Tarato per corrispondere al
 * comportamento precedente sui piccoli movimenti, dove il vecchio calcolo era
 * corretto.
 */
const SCALA = 0.35;

/**
 * Quanta parte del valore nuovo entra a ogni evento (0–1). Più basso = più
 * morbido e più lento. A ~60 eventi al secondo, 0.25 smorza gli scatti senza
 * che si percepisca ritardo.
 */
const MORBIDEZZA = 0.25;

const GRADI = Math.PI / 180;

/**
 * Oltre quanti gradi di scostamento la carta è comunque al massimo.
 * Da lì in poi ruotare ancora non cambia più niente a schermo.
 */
const UTILE = MASSIMO / SCALA;

/**
 * Quanto la presa di riferimento insegue l'orientamento reale, per fotogramma,
 * **solo** oltre la zona utile.
 *
 * Serve a un problema che non ha altra soluzione: `beta` è una grandezza
 * *circolare*, e mappare un cerchio su un intervallo limitato produce per forza
 * uno strappo da qualche parte — a 180° dalla presa iniziale il valore
 * salterebbe da `+MASSIMO` a `-MASSIMO`. Invece di scegliere dove mettere lo
 * strappo, si fa in modo che quel punto **non venga mai raggiunto**: appena lo
 * scostamento supera la zona utile, il riferimento si sposta dietro.
 *
 * Effetto collaterale gradito: se si cambia posizione — ci si sdraia, si
 * appoggia il telefono sul tavolo — la carta si ricentra da sola invece di
 * restare incollata al fondocorsa. Dentro la zona utile la deriva è spenta,
 * quindi un'inclinazione tenuta ferma resta ferma.
 */
const DERIVA = 0.06;

/**
 * Limita un valore fra `-tetto` e `+tetto`.
 * @param {number} valore
 * @param {number} tetto
 * @returns {number}
 */
export function limita(valore, tetto) {
  return Math.max(-tetto, Math.min(tetto, valore));
}

/**
 * Differenza fra due angoli, misurata sull'**arco più corto**.
 *
 * Da 179° a -179° ci sono 2 gradi, non 358: sottrarre e basta produce uno
 * scatto ogni volta che si attraversa il confine.
 *
 * @param {number} a gradi
 * @param {number} b gradi
 * @returns {number} gradi in `[-180, 180]`
 * @example
 * arcoCorto(179, -179); // → -2  (non 358)
 * arcoCorto(10, 350);   // → 20
 */
export function arcoCorto(a, b) {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/**
 * Sposta il riferimento dietro all'angolo attuale, ma **solo** per la parte di
 * scostamento che eccede la zona utile.
 *
 * Dentro la zona utile restituisce il riferimento intatto: un'inclinazione
 * tenuta ferma deve restare ferma, non scivolare via da sola.
 *
 * @param {number} riferimento gradi
 * @param {number} attuale gradi
 * @returns {number} il riferimento nuovo, in gradi
 */
function trascina(riferimento, attuale) {
  const scarto = arcoCorto(attuale, riferimento);
  const eccesso = Math.abs(scarto) - UTILE;
  if (eccesso <= 0) return riferimento;
  return riferimento + Math.sign(scarto) * eccesso * DERIVA;
}

/**
 * Calcolatore d'inclinazione con memoria: tiene la presa iniziale e il valore
 * smorzato fra un evento e l'altro.
 *
 * Si crea uno per ogni apertura del visore, così la carta parte sempre piatta
 * comunque si stia tenendo il telefono.
 *
 * @returns {{ passo: (beta: number, gamma: number) => {rx: number, ry: number}, azzera: () => void }}
 * @example
 * const t = creaInclinazione();
 * t.passo(45, 0);        // → { rx: 0, ry: 0 }  la prima lettura fa da zero
 * t.passo(40, 0).rx;     // → positivo: il telefono si è inclinato in avanti
 */
export function creaInclinazione() {
  /** @type {{beta: number, gamma: number}|null} la presa all'apertura */
  let base = null;
  let rx = 0;
  let ry = 0;

  return {
    /**
     * @param {number} beta avanti/indietro, in gradi
     * @param {number} gamma sinistra/destra, in gradi
     * @returns {{rx: number, ry: number}} gradi da applicare alla carta
     */
    passo(beta, gamma) {
      if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return { rx, ry };
      if (!base) base = { beta, gamma };

      // `cos(beta)` è il fattore che salva tutto: vale 1 col telefono piatto e
      // 0 in verticale, dove `gamma` impazzisce. Il valore assoluto perché a
      // beta = -90 la singolarità è la stessa che a +90.
      const tenuta = Math.abs(Math.cos(beta * GRADI));

      // La presa insegue l'orientamento solo fuori dalla zona utile: così lo
      // scostamento non arriva mai ai 180° dove il cerchio si richiude.
      base.beta = trascina(base.beta, beta);
      base.gamma = trascina(base.gamma, gamma);

      const obiettivoX = limita(arcoCorto(base.beta, beta) * SCALA, MASSIMO);
      const obiettivoY = limita(arcoCorto(gamma, base.gamma) * SCALA * tenuta, MASSIMO);

      // Passa-basso: ci si avvicina all'obiettivo invece di saltarci sopra.
      rx += (obiettivoX - rx) * MORBIDEZZA;
      ry += (obiettivoY - ry) * MORBIDEZZA;
      return { rx, ry };
    },

    /** Dimentica la presa: la prossima lettura ridiventa lo zero. */
    azzera() {
      base = null;
      rx = 0;
      ry = 0;
    },
  };
}
