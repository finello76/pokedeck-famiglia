/**
 * Web Component `<vista-regole>`: la consultazione delle regole.
 *
 * Due contenuti diversi in una vista sola, perché rispondono alla stessa
 * domanda ("come si gioca?") in due momenti: le schede dei formati dicono con
 * quali numeri si gioca *questa* partita, il regolamento spiega il gioco.
 * Separarli in due voci di menu avrebbe costretto a indovinare quale delle due
 * aprire.
 *
 * I numeri dei formati arrivano da `engine/formati.js`, gli stessi che il
 * motore stampa sul foglio delle regole della casa: non possono divergere.
 *
 * @module ui/vista-regole
 */

import { FORMATI, MAX_COPIE, UFFICIALE } from '../../engine/formati.js';
import { REGOLAMENTO } from './testi-regolamento.js';

export class VistaRegole extends HTMLElement {
  /** @type {string} taglia del formato aperto, o '' per nessuno */
  #formatoAperto = '';

  connectedCallback() {
    // Niente Shadow DOM: questa vista è testo lungo e deve ereditare la
    // tipografia della pagina, non ricostruirsela.
    this.#disegna();

    this.addEventListener('click', (evento) => {
      const scheda = evento.target.closest('[data-formato]');
      if (scheda) {
        // Fisarmonica: aprendone una si chiude quella prima. Su telefono
        // quattro schede aperte sono già più di uno schermo.
        const taglia = scheda.dataset.formato;
        this.#formatoAperto = this.#formatoAperto === taglia ? '' : taglia;
        this.#disegna();
        return;
      }

      const salto = evento.target.closest('[data-vai-a]');
      if (salto) {
        this.querySelector(`#regola-${salto.dataset.vaiA}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    });
  }

  /**
   * Evidenzia il formato corrispondente a una taglia, e lo apre.
   *
   * La chiama la vista dei mazzi quando si arriva qui da un piano generato:
   * chi ha in mano mazzi da 20 vuole leggere quel formato, non scorrerli tutti.
   *
   * @param {number} taglia
   * @returns {void}
   */
  apriFormato(taglia) {
    this.#formatoAperto = String(taglia);
    this.#disegna();
  }

  #disegna() {
    this.innerHTML = `
      <section class="pannello">
        <h2>I formati</h2>
        <p class="aiuto">
          Quante carte ha il mazzo cambia mano iniziale, carte Premio e panchina.
          Tocca un formato per vedere cosa si può e non si può fare.
        </p>
        <div class="schede-formato">${FORMATI.map((f) => this.#schedaFormato(f)).join('')}</div>
      </section>

      <section class="pannello">
        <h2>Regolamento</h2>
        <p class="aiuto">
          Le regole del gioco vero, spiegate per essere consultate durante la partita.
          Valgono in tutti i formati, salvo dove le regole della casa dicono altro.
        </p>
        <nav class="indice-regole" aria-label="Indice del regolamento">
          ${REGOLAMENTO.map(
            (s) => `
            <button type="button" class="voce-indice" data-vai-a="${s.id}">
              <span class="titolo-indice">${escapeHtml(s.titolo)}</span>
              <span class="sommario-indice">${escapeHtml(s.sommario)}</span>
            </button>`,
          ).join('')}
        </nav>
        ${REGOLAMENTO.map((s) => this.#sezione(s)).join('')}
      </section>
    `;
  }

  /**
   * @param {object} formato
   * @returns {string}
   */
  #schedaFormato(formato) {
    const aperta = this.#formatoAperto === String(formato.taglia);
    return `
      <article class="scheda-formato${aperta ? ' aperta' : ''}"${
        formato.ufficiale ? ' data-ufficiale="si"' : ''
      }>
        <button type="button" class="testa-formato" data-formato="${formato.taglia}"
                aria-expanded="${aperta}">
          <span class="nome-formato">${escapeHtml(formato.nome)}</span>
          ${formato.ufficiale ? '<span class="bollino">ufficiale</span>' : ''}
          <span class="per-chi">${escapeHtml(formato.perChi)}</span>
          <span class="numeri">
            <span><b>${formato.manoIniziale}</b> in mano</span>
            <span><b>${formato.premi}</b> Premi</span>
            <span><b>${formato.panchina}</b> in panchina</span>
            <span><b>${formato.durata}</b></span>
          </span>
        </button>
        ${aperta ? this.#dettaglioFormato(formato) : ''}
      </article>`;
  }

  /**
   * @param {object} formato
   * @returns {string}
   */
  #dettaglioFormato(formato) {
    const elenco = (voci, classe) =>
      `<ul class="${classe}">${voci.map((v) => `<li>${escapeHtml(v)}</li>`).join('')}</ul>`;

    return `
      <div class="dettaglio-formato">
        <h4>Si può</h4>
        ${elenco(formato.siPuo, 'si-puo')}
        <h4>Non si può</h4>
        ${elenco(formato.nonSiPuo, 'non-si-puo')}
        <table class="numeri-formato">
          <caption>I numeri di questo formato</caption>
          <tbody>
            <tr><th scope="row">Carte nel mazzo</th><td>${formato.taglia}</td></tr>
            <tr><th scope="row">Mano iniziale</th>
                <td>${formato.manoIniziale}${confronto(formato.manoIniziale, UFFICIALE.manoIniziale)}</td></tr>
            <tr><th scope="row">Carte Premio</th>
                <td>${formato.premi}${confronto(formato.premi, UFFICIALE.premi)}</td></tr>
            <tr><th scope="row">Panchina</th>
                <td>${formato.panchina}${confronto(formato.panchina, UFFICIALE.panchina)}</td></tr>
            <tr><th scope="row">Copie della stessa carta</th>
                <td>${MAX_COPIE} (Energie base illimitate)</td></tr>
          </tbody>
        </table>
        ${formato.nota ? `<p class="nota-formato">${escapeHtml(formato.nota)}</p>` : ''}
      </div>`;
  }

  /**
   * @param {object} sezione
   * @returns {string}
   */
  #sezione(sezione) {
    return `
      <section class="sezione-regole" id="regola-${sezione.id}">
        <h3>${escapeHtml(sezione.titolo)}</h3>
        ${sezione.voci.map((v) => this.#voce(v)).join('')}
      </section>`;
  }

  /**
   * @param {object} voce
   * @returns {string}
   */
  #voce(voce) {
    return `
      <div class="voce-regola">
        <h4>${escapeHtml(voce.titolo)}</h4>
        ${voce.testo ? `<p>${escapeHtml(voce.testo)}</p>` : ''}
        ${
          voce.punti
            ? `<ul>${voce.punti.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
            : ''
        }
        ${
          voce.attenzione
            ? `<p class="attenzione"><b>Si sbaglia spesso:</b> ${escapeHtml(voce.attenzione)}</p>`
            : ''
        }
      </div>`;
  }
}

/**
 * Quanto un numero si discosta da quello ufficiale, da mostrare accanto.
 * Serve a capire a colpo d'occhio se il formato sta barando e di quanto.
 *
 * @param {number} valore
 * @param {number} ufficiale
 * @returns {string} stringa vuota se coincidono
 */
function confronto(valore, ufficiale) {
  if (valore === ufficiale) return ' <span class="uguale">come da regolamento</span>';
  return ` <span class="diverso">invece di ${ufficiale}</span>`;
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

customElements.define('vista-regole', VistaRegole);
