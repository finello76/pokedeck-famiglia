/**
 * Routing minimo basato sul frammento dell'URL (`#catalogo`, `#mazzi`).
 *
 * Si usa il frammento e non la History API perché su GitHub Pages non c'è un
 * server da configurare: aprendo `/pokedeck-famiglia/mazzi` il server
 * risponderebbe 404, mentre `#mazzi` non lascia mai la pagina.
 *
 * @module app/viste
 */

/**
 * Attiva la vista richiesta e disattiva le altre.
 *
 * @param {string} nome id della sezione, senza `#`
 * @returns {void}
 */
function attiva(nome) {
  const viste = document.querySelectorAll('[data-vista]');
  let trovata = false;

  for (const vista of viste) {
    const suo = vista.dataset.vista === nome;
    vista.hidden = !suo;
    if (suo) trovata = true;
  }

  // Frammento sconosciuto (link vecchio, refuso): si torna alla prima vista
  // invece di lasciare la pagina vuota.
  if (!trovata && viste.length) {
    viste[0].hidden = false;
    nome = viste[0].dataset.vista;
  }

  for (const collegamento of document.querySelectorAll('[data-vai]')) {
    collegamento.classList.toggle('attivo', collegamento.dataset.vai === nome);
    collegamento.setAttribute('aria-current', collegamento.dataset.vai === nome ? 'page' : 'false');
  }

  document.dispatchEvent(new CustomEvent('vista-cambiata', { detail: { nome } }));
}

/**
 * Avvia il routing e collega i pulsanti di navigazione.
 * @returns {void}
 */
export function avviaViste() {
  const vaiA = (nome) => {
    if (location.hash === `#${nome}`) attiva(nome);
    else location.hash = nome;
  };

  for (const collegamento of document.querySelectorAll('[data-vai]')) {
    collegamento.addEventListener('click', () => vaiA(collegamento.dataset.vai));
  }

  window.addEventListener('hashchange', () => attiva(location.hash.slice(1)));
  attiva(location.hash.slice(1) || 'catalogo');
}
