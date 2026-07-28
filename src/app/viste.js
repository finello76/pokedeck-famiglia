/**
 * Routing minimo basato sul frammento dell'URL (`#catalogo`, `#mazzi/nuovo`).
 *
 * Si usa il frammento e non la History API perché su GitHub Pages non c'è un
 * server da configurare: aprendo `/pokedeck-famiglia/mazzi` il server
 * risponderebbe 404, mentre `#mazzi` non lascia mai la pagina.
 *
 * Il frammento ha due parti separate da una barra: `#vista/parametro`. La prima
 * sceglie la sezione, la seconda dice *cosa* mostrarci dentro — quale mazzo
 * salvato aprire, o se siamo nel wizard. Serve perché un mazzo aperto era prima
 * uno stato invisibile all'URL: il tasto Indietro del browser, non avendo niente
 * da annullare, usciva dalla schermata invece di tornare all'elenco.
 *
 * @module app/viste
 */

/**
 * Spezza un frammento nelle sue due parti.
 *
 * Funzione pura ed esportata apposta per poterla provare senza un DOM: è
 * l'unico pezzo del router con una logica da sbagliare.
 *
 * @param {string} frammento con o senza `#` iniziale
 * @returns {{nome: string, parametro: string}} `parametro` è `''` se manca
 * @example
 * spezzaFrammento('#mazzi/2026-07-28T10:00:00.000Z')
 * // → {nome: 'mazzi', parametro: '2026-07-28T10:00:00.000Z'}
 */
export function spezzaFrammento(frammento) {
  const pulito = String(frammento ?? '').replace(/^#/, '');
  const barra = pulito.indexOf('/');

  if (barra === -1) return { nome: pulito, parametro: '' };
  return { nome: pulito.slice(0, barra), parametro: pulito.slice(barra + 1) };
}

/**
 * Attiva la vista richiesta e disattiva le altre.
 *
 * @param {string} nome id della sezione, senza `#`
 * @param {string} [parametro] la parte dopo la barra, passata agli ascoltatori
 * @returns {void}
 */
function attiva(nome, parametro = '') {
  const viste = document.querySelectorAll('[data-vista]');
  let attivata = null;

  for (const vista of viste) {
    const suo = vista.dataset.vista === nome;
    vista.hidden = !suo;
    if (suo) attivata = vista;
  }

  // Frammento sconosciuto (link vecchio, refuso): si torna alla prima vista
  // invece di lasciare la pagina vuota.
  if (!attivata && viste.length) {
    attivata = viste[0];
    attivata.hidden = false;
    nome = attivata.dataset.vista;
    parametro = '';
  }

  // Una vista può delegare l'evidenziazione a un'altra icona: il costruttore
  // manuale è una schermata sua, ma si raggiunge dalla libreria dei mazzi e
  // deve lasciare accesa quella. Senza `data-tab`, entrandoci non si accendeva
  // nessuna icona e non si capiva più dove si era finiti.
  const acceso = attivata?.dataset.tab ?? nome;
  for (const collegamento of document.querySelectorAll('[data-vai]')) {
    const suo = collegamento.dataset.vai === acceso;
    collegamento.classList.toggle('attivo', suo);
    collegamento.setAttribute('aria-current', suo ? 'page' : 'false');
  }

  document.dispatchEvent(new CustomEvent('vista-cambiata', { detail: { nome, parametro } }));
}

/**
 * Avvia il routing e collega i pulsanti di navigazione.
 * @returns {void}
 */
export function avviaViste() {
  const vaiA = (rotta) => {
    if (location.hash === `#${rotta}`) {
      const { nome, parametro } = spezzaFrammento(rotta);
      attiva(nome, parametro);
    } else location.hash = rotta;
  };

  // Un ascoltatore solo sul documento invece di uno per pulsante: metà dei
  // `data-vai` nascono dopo l'avvio — il "torna ai miei mazzi" del dettaglio si
  // ridisegna a ogni piano — e collegandoli uno per uno all'avvio quelli
  // costruiti dopo restavano muti.
  document.addEventListener('click', (evento) => {
    const collegamento = evento.target.closest('[data-vai]');
    if (collegamento) vaiA(collegamento.dataset.vai);
  });

  const dallUrl = () => {
    const { nome, parametro } = spezzaFrammento(location.hash);
    attiva(nome || 'catalogo', parametro);
  };

  window.addEventListener('hashchange', dallUrl);
  dallUrl();
}
