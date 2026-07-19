/**
 * Registrazione del service worker.
 *
 * Sta in un modulo a parte perché la registrazione ha un suo ciclo di vita
 * (installazione, attesa, attivazione) che non c'entra con la logica dell'app.
 *
 * @module app/registra-sw
 */

/**
 * Registra `sw.js` se il browser lo supporta.
 *
 * Lo `scope` è relativo alla pagina, non alla radice del dominio: è ciò che
 * permette all'app di funzionare da `https://utente.github.io/PokeDeckFamiglia/`.
 * Un service worker può controllare solo path uguali o più profondi del proprio,
 * quindi `sw.js` DEVE stare nella radice del progetto, non in `src/`.
 *
 * @returns {Promise<ServiceWorkerRegistration|null>} null se non supportato o fallito
 */
export async function registraServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.info('Service worker non supportato: l\'app funziona, ma senza offline.');
    return null;
  }

  // Con file:// la registrazione lancia sempre un errore di sicurezza: meglio
  // dirlo chiaramente che lasciare un'eccezione oscura in console.
  if (location.protocol === 'file:') {
    console.warn(
      'Aperta con file://: niente offline. Serve un web server, es. `python3 -m http.server`.',
    );
    return null;
  }

  try {
    const registrazione = await navigator.serviceWorker.register(
      new URL('../../sw.js', import.meta.url),
      { scope: './' },
    );
    console.info('Service worker registrato.');
    return registrazione;
  } catch (errore) {
    // L'app deve restare usabile anche se l'offline non parte.
    console.error('Registrazione service worker fallita:', errore);
    return null;
  }
}
