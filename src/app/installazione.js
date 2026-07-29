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
export function avviaInvitoInstallazione({ barra, pannello = null }) {
  if (giaInstallata()) return;

  /**
   * L'evento del browser, messo da parte per usarlo quando lo decide l'utente.
   *
   * **Vive per tutta la sessione e non viene mai buttato via**, nemmeno dopo un
   * rifiuto. Questa è la lezione del guasto che ha reso "Aggiungi come app"
   * irraggiungibile su PC: chiamare `preventDefault()` significa **prendersi la
   * responsabilità** dell'installazione, perché da quel momento il browser non
   * la propone più da sé. Se poi si chiude la barra e si azzera l'evento, non
   * resta nessuna via: né la nostra, né quella di Chrome.
   */
  let invitoBrowser = null;

  /** I punti che sanno offrire l'installazione, da riaccendere quando è possibile. */
  const bottonePannello = pannello?.querySelector('#bottone-installa-ora') ?? null;
  const testo = barra?.querySelector('[data-testo]');
  const bottoneInstalla = barra?.querySelector('#bottone-installa') ?? null;
  const bottonePiuTardi = barra?.querySelector('#bottone-installa-dopo') ?? null;
  const spunta = barra?.querySelector('#non-chiedere-installa') ?? null;

  /**
   * Accende o spegne il pannello permanente in Regole → Installazione.
   *
   * È l'ancora di sicurezza: la barra si può chiudere, si può dire "non
   * chiedermelo più", ma un modo per installare deve restare **sempre
   * raggiungibile** da qualche parte che non sparisce.
   */
  const aggiornaPannello = () => {
    if (!pannello) return;
    pannello.hidden = !(invitoBrowser || suIOS());
  };

  const chiudiBarra = () => {
    if (spunta?.checked) ricorda(CHIAVE);
    if (barra) barra.hidden = true;
  };

  /**
   * Fa comparire l'installazione vera, o le istruzioni dove non esiste.
   * @param {HTMLElement|null} dove il contenitore da cui è partito il comando
   */
  const installa = async (dove) => {
    if (!invitoBrowser) {
      // Su iOS non c'è nessuna API: si mostrano le istruzioni. Fingere
      // un'installazione automatica sarebbe peggio che non offrirla.
      dove?.querySelector('[data-istruzioni]')?.removeAttribute('hidden');
      return;
    }
    const invito = invitoBrowser;
    // Un evento già usato non si può riusare: si sgancia PRIMA di chiamarlo,
    // così un doppio tocco non prova a mostrare due volte lo stesso prompt.
    invitoBrowser = null;
    chiudiBarra();
    try {
      invito.prompt();
      await invito.userChoice;
    } catch {
      /* prompt già consumato o rifiutato dal browser: sotto si riaccende */
    }
    // Rifiutato o fallito, il pannello resta com'era: Chrome rimanda
    // `beforeinstallprompt` alla visita successiva, e nel frattempo le
    // istruzioni del menu del browser restano l'altra via.
    aggiornaPannello();
  };

  bottonePiuTardi?.addEventListener('click', chiudiBarra);
  bottoneInstalla?.addEventListener('click', () => installa(barra));
  bottonePannello?.addEventListener('click', () => installa(pannello));

  window.addEventListener('beforeinstallprompt', (evento) => {
    // `preventDefault()` toglie di mezzo la barra automatica di Chrome, che
    // altrimenti sarebbe un doppione della nostra. Da qui in poi la via
    // d'installazione la offriamo noi: vedi `invitoBrowser` sopra.
    evento.preventDefault();
    invitoBrowser = evento;
    aggiornaPannello();
    // La barra invadente rispetta il "non chiedermelo più"; il pannello no,
    // perché quello si va a cercare apposta.
    if (barra && !ricordato(CHIAVE)) barra.hidden = false;
  });

  // Installata durante la sessione: l'invito non ha più senso, e riproporlo
  // dopo che si è appena fatto è il modo più veloce di sembrare rotti.
  window.addEventListener('appinstalled', () => {
    invitoBrowser = null;
    if (barra) barra.hidden = true;
    if (pannello) pannello.hidden = true;
  });

  if (suIOS()) {
    if (testo) {
      testo.textContent = 'Aggiungi YouPokèDeck alla schermata Home: funziona anche offline.';
    }
    if (bottoneInstalla) bottoneInstalla.textContent = 'Come si fa';
    if (bottonePannello) bottonePannello.textContent = 'Come si fa';
    if (barra && !ricordato(CHIAVE)) barra.hidden = false;
  }
  aggiornaPannello();
}
