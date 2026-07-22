# Sessione 07 — Aggiornare una PWA su un telefono

> Il problema che non esiste sul web e non esiste nelle app native, ma esiste
> nelle PWA: la versione vecchia che non se ne va. Tecnologie: service worker,
> ciclo di vita, cache HTTP.

---

## 1. La domanda

> «Da un browser mobile è difficile invalidare la cache, che si può fare?»

Sul desktop si aprono gli strumenti per sviluppatori e si svuota la cache. Su un
telefono, con la PWA installata, **non c'è nemmeno il pulsante "ricarica"**: c'è
una finestra a tutto schermo che mostra quello che il service worker decide di
mostrare.

## 2. Il difetto vero (e come si trova)

Prima di aggiungere qualunque cosa, un controllo banale:

```js
const elenco = [...sw.matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1]);
elenco.filter((p) => !fs.existsSync(p.replace('./', '')));
// → [ './src/engine/scelta-linee.js' ]
```

Quel modulo era stato **cancellato tre versioni prima**, ma era rimasto
nell'elenco `GUSCIO` dei file da precaricare. E qui sta il punto:

```js
await cache.addAll(GUSCIO);   // tutto-o-niente
```

`cache.addAll()` fallisce **per intero** se anche un solo file risponde 404. Il
service worker nuovo non completava l'installazione, quindi non entrava mai in
attesa, quindi il vecchio restava al comando. Per sempre. Senza un errore
visibile da nessuna parte: l'app continuava a funzionare benissimo — con il
codice di tre versioni prima.

> **Lezione trasferibile.** Le operazioni atomiche sono ottime quando il
> fallimento va notato. Qui il fallimento avveniva in un contesto senza nessuno
> che ascoltasse, e l'atomicità ha trasformato un file mancante in un blocco
> totale degli aggiornamenti. Chiedersi sempre: *chi legge questo errore?*

Ora i file si precaricano uno per uno con `Promise.allSettled`, e ciò che manca
viene segnalato in console senza bloccare il resto:

```js
const esiti = await Promise.allSettled(GUSCIO.map(async (url) => { … }));
const falliti = esiti.filter((e) => e.status === 'rejected');
if (falliti.length) console.warn(`Guscio incompleto: ${falliti.length} file…`);
```

E un test lo impedisce in futuro ([`tests/guscio.test.js`](../../tests/guscio.test.js)):
ogni file elencato deve esistere, e ogni modulo del progetto deve essere
elencato. Tre asserzioni, un millisecondo, un'intera classe di guasti eliminata.

## 3. Il ciclo di vita, e perché `skipWaiting()` non basta

Un service worker nuovo attraversa tre stati:

```
installing ──▶ installed (waiting) ──▶ activated
```

Il passaggio da `waiting` ad `activated` **non avviene** finché tutte le schede
controllate dal vecchio non si chiudono. Su un telefono non si chiudono mai: si
passa ad altre app e si torna, ma la pagina resta viva.

La versione precedente chiamava `self.skipWaiting()` durante l'installazione,
saltando l'attesa. Sembra la soluzione, ed è una trappola:

- il service worker nuovo prende il comando **subito**;
- la pagina però ha già in memoria i moduli vecchi;
- da quel momento un `import()` fatto in ritardo o una `fetch` prendono file
  **nuovi**, dentro un'applicazione **vecchia**.

Due versioni dell'app mescolate nella stessa pagina, con bug irriproducibili. Il
motivo per cui `skipWaiting()` esiste è un altro: usarlo **quando l'utente ha
appena chiesto di aggiornare**, subito prima di ricaricare.

## 4. Il flusso corretto

```
sw.js nuovo pubblicato
   └─▶ install: precarica, poi resta in waiting  (non salta niente)
         └─▶ la pagina se ne accorge (updatefound → state 'installed')
               └─▶ mostra la barra: «È disponibile una versione nuova»
                     └─▶ l'utente tocca "Aggiorna"
                           └─▶ postMessage({tipo:'attiva-subito'})
                                 └─▶ sw: self.skipWaiting()
                                       └─▶ evento controllerchange
                                             └─▶ location.reload()
```

Nel service worker:

```js
self.addEventListener('message', (evento) => {
  if (evento.data?.tipo === 'attiva-subito') self.skipWaiting();
});
```

E nella pagina, la ricarica **non** la fa il pulsante: la fa `controllerchange`,
cioè quando il passaggio è davvero avvenuto. Ricaricare subito dopo il click
rimetterebbe in piedi la stessa versione di prima, perché il vecchio worker è
ancora al comando.

```js
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (ricaricaInCorso) return;   // senza guardia: ciclo di ricariche
  ricaricaInCorso = true;
  location.reload();
});
```

## 5. Chiedere, non decidere

L'aggiornamento automatico sarebbe stato più semplice da scrivere. È stato
scartato perché **ricaricare butta via i mazzi appena generati**: perdere il
lavoro di dieci minuti senza averlo chiesto è peggio che restare indietro di una
versione. La barra ha due pulsanti, "Aggiorna" e "Più tardi".

Regola generale: l'automatismo è giusto quando le decisioni sono del programma,
non quando sono dell'utente.

## 6. Gli altri due buchi, meno vistosi

**Quando si controlla?** Il browser cerca aggiornamenti alla registrazione,
cioè all'avvio della pagina. Su un telefono la pagina non riparte quasi mai — si
torna a una scheda già in memoria. Quindi si ricontrolla anche quando l'app
torna in primo piano, e ogni quarto d'ora:

```js
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') registrazione.update().catch(() => {});
});
```

**La cache HTTP sotto quella del service worker.** GitHub Pages serve i file con
`Cache-Control: max-age=600`. Due conseguenze, entrambe corrette:

```js
navigator.serviceWorker.register(url, { updateViaCache: 'none' });   // per sw.js
new Request(url, { cache: 'reload' });                                // per il guscio
```

Senza la prima, il browser può servire un `sw.js` vecchio dalla sua cache HTTP e
non accorgersi mai che ne esiste uno nuovo. Senza la seconda, il service worker
nuovo precaricherebbe file presi dalla cache HTTP vecchia: si installerebbe una
versione nuova **piena di file vecchi**, che è il modo più raffinato di
sprecare un deploy.

---

## 7. Il confronto con Angular

Chi viene da Angular ha già visto questo problema, risolto da `SwUpdate`:

```ts
this.swUpdate.versionUpdates
  .pipe(filter((e) => e.type === 'VERSION_READY'))
  .subscribe(() => { if (confirm('Aggiornare?')) location.reload(); });
```

È esattamente lo stesso flusso: il framework nasconde `updatefound`,
`statechange` e `postMessage`, ma le decisioni difficili — *quando avvisare*,
*se ricaricare da soli*, *cosa fare del lavoro in corso* — restano in mano a chi
scrive l'app. Nasconde la meccanica, non il problema.

---

## 8. Esercizi

**1. La guardia sulla ricarica.** Togli `ricaricaInCorso` da
[`registra-sw.js`](../../src/app/registra-sw.js) e immagina due schede aperte
sulla stessa app. Cosa succede quando una delle due accetta l'aggiornamento?

**2. Il test del guscio.** `tests/guscio.test.js` verifica che ogni modulo di
`src/` sia precaricato. Aggiungi un file `src/engine/prova.js` vuoto e fai
girare i test: quale fallisce e perché è giusto che fallisca?

**3. Domanda di verifica.** Perché `CACHE_DATI` (i file dei set) **non** ha il
suffisso di versione, mentre `CACHE_GUSCIO` sì? Cosa succederebbe agli utenti a
ogni pubblicazione se ce l'avesse?

**4. Un caso che non abbiamo gestito.** Se l'utente tocca "Più tardi", la barra
sparisce e non torna fino al prossimo riavvio della pagina. Come la faresti
ricomparire — e ogni quanto — senza diventare molesto?

---

## 9. Poscritto: il meccanismo di aggiornamento si è incastrato

Prima segnalazione dopo la pubblicazione: *«l'app mostra sempre Aggiorna e Più
tardi, la pressione dei due pulsanti non fa nulla»*.

È il difetto peggiore possibile in questa parte del programma, perché **si
manifesta proprio dove non ci sono alternative**: se il pulsante che serve ad
aggiornare non funziona, su un telefono non resta niente da provare.

### Il difetto di progetto, prima ancora del difetto di codice

Il flusso della sezione 4 ha un punto cieco:

```js
alPronto(() => lavoratore.postMessage({ tipo: 'attiva-subito' }));
```

`postMessage` è **senza risposta**. Se il worker in attesa non raccoglie il
messaggio — perché è nato da un file che quel messaggio non lo conosce, o
perché è in errore — non succede assolutamente nulla, e il pulsante resta lì a
non fare niente per sempre.

La correzione non è un `try/catch`: è ammettere che il percorso pulito può
fallire e prevederne uno che non può.

```js
function applica(lavoratore) {
  lavoratore.postMessage({ tipo: 'attiva-subito' });
  setTimeout(() => { if (!ricaricaInCorso) forzaAggiornamento(); }, ATTESA_RISPOSTA);
}
```

`forzaAggiornamento()` disinstalla i service worker, cancella le cache (tranne
quella dei set: sono megabyte che non c'entrano con la versione dell'app) e
ricarica con un indirizzo mai visto:

```js
const url = new URL(location.href);
url.searchParams.set('aggiornato', String(Date.now()));
location.replace(url.toString());
```

> **Lezione trasferibile.** Un meccanismo di recupero deve avere un piano B che
> non dipende da nulla di ciò che potrebbe essersi rotto. Qui il piano A
> dipende dal service worker, cioè esattamente dal componente che potrebbe
> essere il problema.

### Gli ascoltatori nel posto sbagliato

I click erano registrati **dentro** la richiamata che annuncia la versione
nuova. Basta un'eccezione fra `barra.hidden = false` e la riga dopo, e la barra
resta visibile con i pulsanti morti — cioè il sintomo esatto.

Ora stanno in [`barra-aggiornamento.js`](../../src/app/barra-aggiornamento.js) e
si registrano **una volta sola all'avvio**, indipendentemente da quello che
succede dopo. Se non c'è nessun worker in attesa, "Aggiorna" ricade sulla
pulizia forzata: il pulsante fa sempre qualcosa.

### La via di fuga permanente

Il numero di build in fondo alla pagina è diventato un pulsante. Serve a chi si
trova bloccato **senza** che l'avviso sia mai comparso: è l'unico appiglio
possibile dentro una PWA installata, dove non esiste "svuota la cache di questo
sito".

Attenzione a un dettaglio che sembra minore e non lo è:

```css
.pie-versione #versione { inline-size: auto; }
```

Il CSS del progetto ha `button { width: 100% }` per i moduli delle form. Senza
quell'override il numero di build diventava una fascia larga quanto la pagina —
invisibile ma cliccabile — e ricaricava l'app a chi sfiorava il fondo pagina.

### E la diagnosi, per la prossima volta

```js
console.info('Service worker registrato.',
  `attivo=${registrazione.active?.state ?? 'nessuno'}`,
  `in attesa=${registrazione.waiting?.state ?? 'nessuno'}`,
  `controlla questa pagina=${Boolean(navigator.serviceWorker.controller)}`);
```

La riga di prima diceva soltanto "registrato", che è la cosa meno utile da
sapere quando qualcosa non va: era vera anche mentre l'aggiornamento era
bloccato.

### Esercizio

**5. Il tempo di attesa.** `ATTESA_RISPOSTA` è tre secondi. Cosa succede se lo
si mette a 300 ms su una connessione lenta? E se lo si mette a 30 secondi?
Quale dei due errori è peggiore, e perché dipende da *chi* sta guardando lo
schermo in quel momento?
