# Sessione 09 — Sfogliare le carte nel visore

> Aggiungere navigazione avanti/indietro a una finestra che finora mostrava una
> carta sola. Tecnologie: `<dialog>` modale, eventi `touch` per lo swipe, eventi
> `keydown`, e il modo in cui un evento che *sale* attraversa il DOM permette a
> chi conosce l'ordine delle carte di arricchirlo al volo.

---

## 0. I file toccati

| File | Cos'è cambiato |
|---|---|
| [`src/ui/visore-carta/visore-carta.js`](../../src/ui/visore-carta/visore-carta.js) | frecce, tastiera, swipe; `mostra()` accetta lista + indice |
| [`src/ui/visore-carta/visore-carta.css`](../../src/ui/visore-carta/visore-carta.css) | le due frecce laterali |
| [`src/ui/scheda-carta/scheda-carta.js`](../../src/ui/scheda-carta/scheda-carta.js) | aggiunto il getter `nomeSet` |
| [`src/ui/griglia-collezione/griglia-collezione.js`](../../src/ui/griglia-collezione/griglia-collezione.js) | arricchisce l'evento con l'elenco delle carte |
| [`src/ui/mazzo-generato/mazzo-generato.js`](../../src/ui/mazzo-generato/mazzo-generato.js) | idem, con l'elenco delle carte del mazzo |
| [`src/app/app.js`](../../src/app/app.js) | passa lista e indice al visore |

---

## 1. Il problema: chi conosce l'ordine?

Il visore mostrava una carta e basta. Per sfogliare serve sapere **quali sono le
altre carte** e **dove sei dentro l'elenco**. Ma il visore non lo sa: è
volutamente ignorante, gli si dà una carta e lui la disegna.

Chi conosce l'ordine è chi *contiene* le carte:

- la **griglia** sa che dopo Exeggcute viene Durant-ex, perché le ha disegnate lei;
- il **mazzo generato** conosce l'ordine delle sue carte, che ha nell'array `mazzo.carte`.

La scheda cliccata, invece, sa solo di se stessa. Ed è la scheda a lanciare
l'evento `carta-scelta`. Come fa l'informazione sull'*elenco* a raggiungere il
visore, se chi lancia l'evento non ce l'ha?

---

## 2. Un evento che sale può essere arricchito per strada

Un `CustomEvent` con `bubbles: true` non arriva dritto a destinazione: **sale**
di genitore in genitore fino a `document`. Ogni antenato lo vede passare. E il
suo `detail` è un normale oggetto: chi lo intercetta a metà strada può
**aggiungerci roba** prima che arrivi in fondo.

```js
// scheda-carta.js — la scheda sa solo di sé
this.dispatchEvent(new CustomEvent('carta-scelta', {
  bubbles: true, composed: true,
  detail: { carta: this.#carta, nomeSet: this.#nomeSet },
}));

// griglia-collezione.js — la griglia lo intercetta salendo e completa il detail
this.addEventListener('carta-scelta', (evento) => {
  const schede = [...this.querySelectorAll('scheda-carta')].filter((s) => s.carta);
  evento.detail.lista = schede.map((s) => ({ carta: s.carta, nomeSet: s.nomeSet }));
  evento.detail.indice = schede.findIndex((s) => s.carta === evento.detail.carta);
});

// app.js — l'ascoltatore finale trova detail già arricchito
document.addEventListener('carta-scelta', (evento) => {
  const { carta, nomeSet, lista, indice } = evento.detail;
  visore.mostra(carta, nomeSet, lista, indice);
});
```

La scheda resta ignorante come prima; la griglia aggiunge ciò che solo lei sa;
l'app non sa (e non deve sapere) da dove venga la carta. Ognuno sa il minimo.

> **Rispetto ad Angular.** È il flusso `@Output` che risale l'albero, ma qui puoi
> *modificare* l'evento in transito perché `detail` è un riferimento condiviso,
> non una copia. In Angular passeresti un `EventEmitter` tipizzato; qui il
> contratto è solo una convenzione sulla forma di `detail`.

Se la lista non arriva (nessun contenitore l'ha aggiunta), il visore se la cava
da solo costruendone una di **una carta sola**: le frecce spariscono e non c'è
nessun caso speciale da gestire.

```js
this.#lista = Array.isArray(lista) && lista.length ? lista : [{ carta, nomeSet }];
```

---

## 3. Tre modi per la stessa azione: `#scorri(±1)`

Frecce col mouse, frecce della tastiera, swipe col dito: tre gesti diversi, una
sola funzione. Il segreto è far convergere tutto su `#scorri(passo)`, che sposta
l'indice restando dentro i limiti e ridisegna solo se qualcosa è cambiato.

```js
#scorri(passo) {
  const nuovo = Math.min(Math.max(this.#indice + passo, 0), this.#lista.length - 1);
  if (nuovo === this.#indice) return;   // già agli estremi: non fare nulla
  this.#indice = nuovo;
  this.#rendi();
}
```

### La tastiera

```js
this.#dialogo.addEventListener('keydown', (evento) => {
  if (evento.key === 'ArrowLeft') this.#scorri(-1);
  else if (evento.key === 'ArrowRight') this.#scorri(1);
});
```

`Esc` non compare: lo gestisce già il `<dialog>` nativo, che con `showModal()`
chiude da solo. Aggiungerlo a mano sarebbe duplicare lavoro del browser.

### Lo swipe

Non esiste un evento "swipe". Lo si ricostruisce da due eventi grezzi: dove il
dito **tocca** (`touchstart`) e dove lo **alza** (`touchend`). La differenza in
orizzontale, oltre una soglia, è uno scorrimento.

```js
figura.addEventListener('touchstart', (e) => {
  this.#tocco = e.changedTouches[0]?.clientX ?? null;
}, { passive: true });

figura.addEventListener('touchend', (e) => {
  if (this.#tocco === null) return;
  const delta = (e.changedTouches[0]?.clientX ?? this.#tocco) - this.#tocco;
  this.#tocco = null;
  if (Math.abs(delta) < 40) return;      // sotto 40px è un tocco, non uno swipe
  this.#scorri(delta < 0 ? 1 : -1);      // verso sinistra = carta dopo
}, { passive: true });
```

Due dettagli non ovvi:

- **`changedTouches`, non `touches`.** In `touchend` la lista `touches` (dita
  ancora appoggiate) è vuota: il dito se n'è appena andato. `changedTouches`
  contiene proprio i tocchi *cambiati*, cioè quello sollevato.
- **`{ passive: true }`.** Promette al browser che non chiamerai
  `preventDefault()`: così non deve aspettare il tuo codice prima di far scorrere
  la pagina, e lo scroll resta fluido. È un'ottimizzazione che su mobile si sente.
- **La soglia di 40px** distingue lo swipe dal dito che trema su un tocco. Senza,
  ogni tocco un po' storto salterebbe carta.

---

## 3.5. Il girotondo di caricamento

L'immagine ad alta risoluzione pesa ~830 KB e arriva con ritardo. Senza un
segnale, sfogliando sembra che il tocco non abbia fatto nulla — e si preme due
volte. Un girotondo sopra la carta dice "sto lavorando":

```js
if (img.getAttribute('src') !== src) {   // solo se la sorgente cambia davvero
  this.#caricamento(true);               // accendi la spia
  img.src = src;
}
img.hidden = false;
if (img.complete && img.naturalWidth > 0) this.#caricamento(false);  // già in cache
```

```js
// una volta sola, in connectedCallback
img.addEventListener('load', () => this.#caricamento(false));
img.addEventListener('error', () => this.#caricamento(false));
```

Tre trappole, tutte già viste in cima al codice:

- **Riassegnare la stessa `src` non fa ripartire `load`.** Se ritorni su una
  carta già mostrata e riscrivi lo stesso URL, l'evento non riscatta e il
  girotondo girerebbe per sempre. Il confronto `getAttribute('src') !== src`
  evita di accenderlo quando non c'è niente da caricare.
- **L'immagine in cache non emette sempre `load`.** Se è già scaricata,
  `img.complete` è vero all'istante e `load` può non arrivare: si spegne la spia
  a mano leggendo `complete && naturalWidth > 0`.
- **`error` deve spegnere quanto `load`.** Una carta senza immagine, o una rete
  che cade, non devono lasciare il girotondo acceso in eterno.

E per chi ha chiesto meno animazioni (`prefers-reduced-motion`), la spia resta
visibile ma **ferma**: l'informazione "sta caricando" c'è, il movimento no.

---

## 4. Frecce agli estremi: disabilitare, non nascondere

A inizio elenco la freccia "‹" non porta da nessuna parte. Due scelte: farla
**sparire** o **smorzarla**. Sparire sposta di lato la carta a ogni scorrimento,
perché lo spazio che occupava si libera. Smorzarla la tiene ferma:

```js
prec.disabled = this.#indice <= 0;
succ.disabled = this.#indice >= this.#lista.length - 1;
```

```css
.freccia:disabled { opacity: 0.3; cursor: default; }
```

Con **una carta sola** invece spariscono davvero (`hidden`): lì non c'è nessuna
carta accanto, e mostrare due frecce sempre spente confonderebbe.

---

## 5. Perché è servito un getter

La griglia legge `s.nomeSet` da ogni scheda per costruire la lista. Ma
`scheda-carta` aveva solo il **setter** `nomeSet`, non il getter: lo si poteva
scrivere, non rileggere. In una classe ES `set x()` e `get x()` sono due metodi
indipendenti — averne uno non regala l'altro (in Java è lo stesso: `setX` non
implica `getX`). È bastato aggiungerlo:

```js
get nomeSet() { return this.#nomeSet; }
```

---

## 6. Esercizi

1. **Ciclo continuo.** Ora agli estremi ci si ferma. Modifica `#scorri` perché
   dopo l'ultima carta torni alla prima (e viceversa). Quale riga cambia? E le
   frecce `disabled` come le gestiresti — le toglieresti del tutto?

2. **Swipe verticale per chiudere.** Aggiungi: uno swipe deciso verso il basso
   chiude il visore. Ti serve tenere anche la `clientY` iniziale. Attento a non
   confonderlo con uno swipe orizzontale: quando è "abbastanza verticale"?

3. **Precaricare la carta successiva.** L'immagine ad alta risoluzione pesa
   ~830 KB e si scarica solo quando arrivi sulla carta. Come faresti a
   precaricare in silenzio la *prossima*, così che sfogliando appaia subito?
   (Suggerimento: un `new Image()` di cui non fai nulla.)

4. **Domanda.** Perché la griglia aggiunge `lista` a `evento.detail` con un
   ascoltatore *proprio*, invece di far costruire la lista ad `app.js`? Cosa
   saprebbe `app.js` che oggi non sa, se lo facesse lì?
