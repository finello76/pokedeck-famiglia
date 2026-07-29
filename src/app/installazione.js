/**
 * L'invito a installare la PWA sulla schermata Home.
 *
 * Perché serve. Installata, l'app parte a schermo intero e — soprattutto —
 * **funziona offline**: è il modo in cui è pensata per essere usata, col
 * telefono in mano davanti alle carte, non necessariamente sotto rete. Ma il
 * browser l'invito lo nasconde in un menu che nessuno apre.
 *
 * Perché una barra e non una finestra modale. Una modale al primo avvio blocca
 * l'app prima ancora che si sia capito cosa fa, e si impara a chiuderla senza
 * leggerla. La barra sta in fondo, si ignora, e resta lì finché non si decide.
 *
 * **Le due strade dei browser.** Chrome, Edge e Android annunciano
 * `beforeinstallprompt`: si può intercettare, mostrare il proprio invito e poi
 * far comparire quello vero del browser. Safari su iPhone **non lo emette
 * affatto** e non offre nessuna API: lì l'installazione si fa solo a mano da
 * Condividi → "Aggiungi alla schermata Home", quindi l'unica cosa utile è
 * spiegare come. È il motivo per cui questo modulo ha due modi invece di uno.
 *
 * @module app/installazione
 */

/** Dove si ricorda che l'invito non va più mostrato. Come il tema. */
const CHIAVE = 'pokedeck-niente-installa';

/**
 * Legge una preferenza booleana senza esplodere.
 *
 * In navigazione privata `localStorage` può lanciare al solo accesso: qui il
 * fallimento vale "non ho mai detto di no", che è il comportamento innocuo.
 *
 * @param {string} chiave
 * @returns {boolean}
 */
function ricordato(chiave) {
  try {
    return localStorage.getItem(chiave) === 'si';
  } catch {
    return false;
  }
}

/**
 * @param {string} chiave
 * @returns {void}
 */
function ricorda(chiave) {
  try {
    localStorage.setItem(chiave, 'si');
  } catch {
    // Preferenza persa alla chiusura: meglio di un errore in faccia.
  }
}

/**
 * Se l'app sta già girando installata.
 *
 * Due controlli perché i browser non concordano: lo standard è la media query
 * `display-mode`, ma Safari su iPhone usa da sempre `navigator.standalone`.
 *
 * @returns {boolean}
 */
function giaInstallata() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.navigator.standalone === true
  );
}

/**
 * Se siamo su un iPhone o iPad, dove l'installazione è solo manuale.
 * @returns {boolean}
 */
function suIOS() {
  const ua = navigator.userAgent;
  // `MSStream` esclude i vecchi Windows Phone, che si spacciavano per iPhone.
  // `MacIntel` con più punti di tocco è un iPad recente, che dichiara macOS.
  const iPadRecente = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) || iPadRecente;
}

/**
 * Mostra l'invito a installare, quando ha senso mostrarlo.
 *
 * Non fa niente se l'app è già installata, se l'utente ha spuntato "non
 * chiedere più", o se il browser non offre alcuna via di installazione.
 *
 * @param {object} elementi
 * @param {HTMLElement|null} elementi.barra il contenitore dell'invito
 * @returns {void}
 * @example
 * avviaInvitoInstallazione({ barra: document.querySelector('#barra-installa') });
 */
export function avviaInvitoInstallazione({ barra }) {
  if (!barra || giaInstallata() || ricordato(CHIAVE)) return;

  const testo = barra.querySelector('[data-testo]');
  const bottoneInstalla = barra.querySelector('#bottone-installa');
  const bottonePiuTardi = barra.querySelector('#bottone-installa-dopo');
  const spunta = barra.querySelector('#non-chiedere-installa');

  /** L'evento del browser, messo da parte per usarlo quando lo decide l'utente. */
  let invitoBrowser = null;

  const chiudi = () => {
    // La spunta si legge alla chiusura, qualunque pulsante l'abbia causata:
    // "Installa" + "non chiedere più" è una combinazione sensata — installo
    // adesso e non voglio più sentirne parlare — e ignorarla sarebbe una
    // piccola bugia sull'unico comando che l'utente ha per zittire l'app.
    if (spunta?.checked) ricorda(CHIAVE);
    barra.hidden = true;
  };

  const mostra = () => {
    barra.hidden = false;
  };

  bottonePiuTardi?.addEventListener('click', chiudi);

  bottoneInstalla?.addEventListener('click', async () => {
    if (!invitoBrowser) {
      // Su iOS il pulsante non installa niente: apre le istruzioni, perché
      // fingere che ci sia un'installazione automatica sarebbe peggio che
      // non offrirla. La barra resta aperta mentre si leggono.
      barra.querySelector('[data-istruzioni]')?.removeAttribute('hidden');
      bottoneInstalla.hidden = true;
      return;
    }
    chiudi();
    invitoBrowser.prompt();
    // `userChoice` si risolve comunque, accettata o no. Se ha installato non
    // c'è nulla da fare: `appinstalled` sotto pensa a non riproporlo.
    await invitoBrowser.userChoice.catch(() => null);
    invitoBrowser = null;
  });

  window.addEventListener('beforeinstallprompt', (evento) => {
    // Senza questo, Chrome mostra la sua barra e la nostra diventa un doppione.
    evento.preventDefault();
    invitoBrowser = evento;
    mostra();
  });

  // Installata durante la sessione: l'invito non ha più senso, e riproporlo
  // dopo che si è appena fatto è il modo più veloce di sembrare rotti.
  window.addEventListener('appinstalled', () => {
    ricorda(CHIAVE);
    barra.hidden = true;
  });

  if (suIOS()) {
    // Niente evento da aspettare: si mostra subito, ma con le istruzioni al
    // posto dell'installazione automatica.
    if (testo) {
      testo.textContent = 'Aggiungi YouPokèDeck alla schermata Home: funziona anche offline.';
    }
    if (bottoneInstalla) bottoneInstalla.textContent = 'Come si fa';
    mostra();
  }
}
