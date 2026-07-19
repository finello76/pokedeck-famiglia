# Sessione 01 — Il guscio della PWA e il dataset delle carte

> Cosa è stato fatto nello step 1, perché in quel modo, e le tecnologie toccate.
> Prerequisiti: JS e CSS di base. Dove utile confronto con Java e Angular.

---

## 1. Cosa abbiamo costruito

Una PWA che si apre, funziona offline e sa rispondere a una domanda sola:
*"ho in mano la carta 118/191, cos'è?"*

| File | Responsabilità |
|---|---|
| [`tools/scarica-set.mjs`](../../tools/scarica-set.mjs) | Scarica i set da TCGdex e li normalizza (**sviluppo**, non runtime) |
| [`src/data/dataset.js`](../../src/data/dataset.js) | Carica i JSON e cerca le carte |
| [`src/ui/scheda-carta/`](../../src/ui/scheda-carta/) | Web Component che disegna una carta |
| [`src/app/app.js`](../../src/app/app.js) | Collega il DOM ai moduli |
| [`sw.js`](../../sw.js) | Service worker: offline |

---

## 2. Moduli ES — cosa cambia rispetto a Java

In Java l'unità di riuso è la classe e i package sono cartelle con un nome
gerarchico. In JS l'unità è **il file**: ciò che non esporti non esiste per gli altri.

```js
// src/data/dataset.js
const cacheSet = new Map();          // privato: nessun altro file lo vede
export async function trovaCarta() { /* pubblico */ }
```

Non c'è `public`/`private`: c'è `export` o niente. E non c'è un classpath — gli import
sono **percorsi di file veri**, con estensione obbligatoria:

```js
import { trovaCarta } from '../data/dataset.js';   // il .js NON si omette
```

Differenza importante rispetto ad Angular: lì scrivi `from '@app/servizi/carte'` e ci
pensa il bundler a risolvere. Qui **non c'è nessun bundler**, quindi quello che scrivi è
letteralmente l'URL che il browser andrà a chiedere al server. Se sbagli il path, vedi un
404 nella tab Network.

### Il problema della sottocartella, e `import.meta.url`

L'app dovrà stare su `https://utente.github.io/PokeDeckFamiglia/`, non sulla radice del
dominio. Se scrivessi:

```js
fetch('/data/set/indice.json')     // ← SBAGLIATO
```

il browser chiederebbe `https://utente.github.io/data/set/indice.json`, fuori dal progetto.

La soluzione in `dataset.js`:

```js
const BASE_DATI = new URL('../../data/set/', import.meta.url);
```

`import.meta.url` è l'URL assoluto **del modulo corrente**. Risalendo di due livelli si
ottiene la radice del progetto, ovunque sia pubblicato. È l'equivalente concettuale di
`getClass().getResource()` in Java: "trova la risorsa relativa a dove sto io", invece di
un percorso assoluto che presuppone una struttura.

---

## 3. Web Components — il confronto con Angular

`<scheda-carta>` è un componente vero, registrato nel browser:

```js
export class SchedaCarta extends HTMLElement { /* ... */ }
customElements.define('scheda-carta', SchedaCarta);
```

Da lì in poi `<scheda-carta>` è un tag come `<div>`. Nessuna compilazione, nessun modulo
da dichiarare, nessun `NgModule`.

### Le tre differenze che si sentono di più

**1. Non c'è change detection.** In Angular assegni una proprietà e la vista si aggiorna
da sola. Qui no: il ridisegno lo scateni tu.

```js
set carta(valore) {
  this.#carta = valore;
  this.#disegna();     // ← senza questa riga non succede niente
}
```

È più codice, ma è anche tutto quello che c'è: nessun ciclo di digest, nessun
`ExpressionChangedAfterItHasBeenCheckedError`.

**2. Il ciclo di vita è più corto.** `connectedCallback()` (≈ `ngOnInit`) quando l'elemento
entra nel DOM, `disconnectedCallback()` (≈ `ngOnDestroy`) quando esce. Basta.

**3. Lo Shadow DOM è un confine vero.** In Angular `ViewEncapsulation` si ottiene
riscrivendo i selettori con attributi. Qui il browser isola davvero:

```js
this.attachShadow({ mode: 'open' });
```

Gli stili dentro non escono, quelli fuori non entrano. Con una **eccezione fondamentale**:
le custom properties CSS attraversano il confine. È proprio per questo che il tema funziona:

```css
/* dentro lo Shadow DOM di scheda-carta */
background: var(--colore-superficie, #fff);   /* ← definita fuori, in base.css */
```

Il valore dopo la virgola è il default se la variabile non esiste: il componente resta
presentabile anche se lo usi fuori dall'app.

### `#` — campi privati veri

```js
class SchedaCarta extends HTMLElement {
  #carta = null;         // privato a livello di linguaggio
  #disegna() { }         // metodo privato
}
```

A differenza della convenzione `_nome`, questi sono inaccessibili dall'esterno: da console
`scheda.#carta` è un **errore di sintassi**. È il `private` di Java, ma applicato a runtime.

---

## 4. Il service worker

Un proxy scritto in JS che sta fra la pagina e la rete. Gira in un worker separato: **non
ha accesso al DOM**, non vede `document` né `window`.

### Il ciclo di vita

```
register() → install → (waiting) → activate → controlla le pagine
```

- **install**: si precarica il guscio (`cache.addAll(GUSCIO)`).
- **waiting**: normalmente la versione nuova aspetta che le vecchie schede si chiudano.
  Con `skipWaiting()` saltiamo l'attesa.
- **activate**: si cancellano le cache delle versioni precedenti; `clients.claim()` prende
  il controllo delle pagine già aperte.

Il dettaglio che spiazza: **al primo caricamento il service worker non controlla ancora la
pagina**. Si installa, ma le richieste di quel caricamento sono già partite. Serve un
secondo giro. È esattamente ciò che abbiamo osservato durante i test.

### Perché `sw.js` sta nella radice

Un service worker può intercettare solo URL al suo livello o più in basso. Se stesse in
`src/`, non potrebbe servire `index.html`. Questa è la ragione per cui è l'unico file JS
del progetto fuori da `src/`.

### Tre strategie per tre tipi di risorsa

| Risorsa | Strategia | Perché |
|---|---|---|
| Guscio + dati dei set (316 KB) | cache-first, precaricata | Cambiano solo quando pubblico |
| Immagini delle carte | cache-first a richiesta | Sono migliaia: si salvano man mano |
| Resto | rete | Non ci interessa |

---

## 5. I due bug che abbiamo trovato provando davvero

Questa parte è la più istruttiva, perché nessuno dei due si vedeva leggendo il codice.

### Bug 1 — gli zeri iniziali

Cercare `118/191` funzionava; cercare `84/132` no. Causa: TCGdex scrive i numeri con tre
cifre (`'084'`), e `'084' === '84'` è falso. Le carte a tre cifre funzionavano per puro caso.

La correzione non è un `parseInt` secco, perché **non tutti i numeri sono numeri**: le
sottoserie usano codici come `TG01` o `SV01`.

```js
function stessoNumero(a, b) {
  const na = Number(a), nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && a.trim() !== '' && b.trim() !== '') {
    return na === nb;                                  // 84 === 084
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();   // TG01
}
```

Attenzione a `Number('')` che vale `0`: senza il controllo sulla stringa vuota, una ricerca
a campo vuoto avrebbe trovato la carta numero 0.

### Bug 2 — le risposte *opaque*

Le immagini si vedevano, ma non finivano mai in cache: offline sarebbero rimaste vuote.

Quando un `<img>` punta a un altro dominio, la richiesta parte in modalità `no-cors` e il
browser restituisce una risposta **opaque**: la mostra, ma non fa leggere nulla al codice.
`status` vale `0`, quindi:

```js
if (risposta.ok) cache.put(...)     // ok === false SEMPRE, anche quando è andata bene
```

La correzione:

```js
if (risposta.ok || risposta.type === 'opaque') {
  await cache.put(richiesta, risposta.clone());
}
```

Due cose da ricordare:
- `risposta.clone()` è obbligatorio: il corpo di una `Response` si consuma una volta sola.
  Senza clone, metti in cache la risposta e la pagina riceve un corpo già vuoto.
- Essendo illeggibile, un'opaque viene salvata **anche se in realtà era un 404**.

---

## 6. CSS moderno: le due cose nuove

### Custom properties

Non sono le variabili di Sass. Quelle sparivano in compilazione; queste **esistono a
runtime**, si ereditano lungo l'albero e si possono cambiare da JS. È ciò che rende
possibile `tipi.css`:

```css
[data-tipo='Fuoco'] { --tipo-colore: #d8482b; --tipo-tenue: #fbe8e3; }
```

Il componente usa `var(--tipo-colore)` senza sapere quale tipo sta mostrando: il valore
arriva per eredità dall'attributo `data-tipo` messo sull'elemento contenitore.

Nota: le classi sono in italiano (`Fuoco`, `Lotta`, `Oscurità`) perché **i dati arrivano
già in italiano** da TCGdex. Nessuna tabella di traduzione a runtime.

### Container query

```css
@container (max-width: 26rem) { article { grid-template-columns: 1fr; } }
```

Differenza da una media query: la media query guarda **la finestra**, la container query
guarda **il contenitore dell'elemento**. Serve un contenitore dichiarato:

```css
#risultati { container-type: inline-size; }
```

Perché qui è la scelta giusta: la stessa `<scheda-carta>` comparirà a tutta larghezza nella
ricerca e dentro colonne strette nella griglia della collezione. Con una media query
dovrebbe indovinare in quale contesto si trova; con una container query si adatta e basta.

---

## 7. Esercizi

**1. Un set nuovo.** Aggiungi `sv04` (Paradosso Rift) a
[`tools/set-posseduti.json`](../../tools/set-posseduti.json), rilancia
`node tools/scarica-set.mjs`, ricarica l'app. Compare fra i set?
*Poi la domanda vera*: perché non basta, e cosa va toccato anche in
[`sw.js`](../../sw.js)? Cosa succederebbe offline se te lo dimenticassi?

**2. Ricerca per nome.** In `dataset.js` c'è già `cercaPerNome()`, ma nessuno la usa.
Aggiungi un secondo campo in `index.html` che la chiami e mostri i risultati con
`<scheda-carta>`. Quante carte scorre nel caso peggiore? (Suggerimento: carica **tutti**
i set, uno per uno.)

**3. Osserva il ciclo di vita.** Apri DevTools → Application → Service Workers su una
scheda nuova. Al **primo** caricamento, `navigator.serviceWorker.controller` è `null`?
Ricarica: cosa cambia? Prova poi a cambiare `VERSIONE` in `sw.js` da `v1` a `v2` e guarda
cosa succede alle cache vecchie.

**4. Domanda di verifica.** Perché `cache.put(richiesta, risposta)` senza `.clone()` fa sì
che la pagina riceva un'immagine vuota? Cosa hanno in comune questo e uno `InputStream`
Java letto due volte?

---

## 8. Cosa manca (step successivo)

- **IndexedDB**: adesso l'app trova le carte, ma non ricorda niente. La collezione con le
  quantità possedute è lo step 2.
- **Griglia con filtri** e contatore energie per tipo.
- **Export/import JSON**.
- Quando le immagini in griglia saranno centinaia, servirà un `IntersectionObserver`
  esplicito: `loading="lazy"` non funziona su un `<img>` inserito via `innerHTML` dentro
  uno Shadow DOM (verificato in questo step, vedi il commento in `scheda-carta.js`).
