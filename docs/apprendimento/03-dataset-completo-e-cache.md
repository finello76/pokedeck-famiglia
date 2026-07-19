# Sessione 03 — Un dataset da 6,4 MB in una PWA leggera

> Come si serve un catalogo di 21.000 carte senza far scaricare 6,4 MB a chi apre
> l'app, e perché la cache non è una cosa sola.

---

## 1. Il problema, che nasce da un fraintendimento

Fino allo step 2 il progetto assumeva che la collezione fosse fatta di **set**: c'era un
file `tools/set-posseduti.json` con l'elenco dei cinque set posseduti, e solo quelli
venivano scaricati.

L'assunzione era sbagliata. La collezione è fatta di **carte sciolte**: una bustina qui, un
regalo là, un mazzetto trovato in un cassetto. Qualsiasi carta può venire da qualsiasi
set, quindi qualsiasi elenco chiuso prima o poi impedisce di catalogare la carta
successiva.

Numeri della decisione:

| | Peso |
|---|---|
| Tutti i 190 set, 21.037 carte | **6,4 MB** |
| Solo `indice.json` (elenco dei set) | **~30 KB** |
| Un singolo set | 20–90 KB |

---

## 2. La soluzione: tutto nel repo, niente nel guscio

I 6,4 MB stanno nel repository, ma **il service worker ne precarica solo 30 KB**. Il file
di un set viene scaricato e messo in cache la prima volta che serve davvero.

Il risultato è che l'app si installa in un attimo, e diventa progressivamente più capace
offline man mano che la usi: i set che hai aperto restano, gli altri no.

### Tre cache, non una

In [`sw.js`](../../sw.js) convivono tre depositi con regole diverse:

```js
const CACHE_GUSCIO   = `pokedeck-guscio-${VERSIONE}`;   // versionata
const CACHE_IMMAGINI = `pokedeck-immagini-${VERSIONE}`; // versionata
const CACHE_DATI     = 'pokedeck-dati';                 // NON versionata
```

La differenza è il dettaglio più importante di questo step. Il guscio (HTML, CSS, JS) è
versionato: quando pubblico una versione nuova, la vecchia va buttata, altrimenti
resterebbe codice obsoleto. I **dati dei set** invece no:

```js
.filter((n) => n.startsWith('pokedeck-') && n !== CACHE_DATI && !n.endsWith(VERSIONE))
```

Se `CACHE_DATI` fosse versionata, correggere un colore nel CSS costringerebbe a
riscaricare ogni set già visto. Il contenuto di quei file non dipende dalla versione
dell'app, quindi non deve seguirne il ciclo di vita.

**Regola generale**: versiona ciò che cambia insieme al codice; lascia fuori ciò che ha una
vita sua.

### Le strategie, per tipo di risorsa

| Risorsa | Strategia | Perché |
|---|---|---|
| Guscio + indice (30 KB) | precaricata all'installazione | senza, l'app non parte offline |
| File dei set (6,4 MB) | cache alla prima lettura | precaricarli = scaricare tutto il catalogo |
| Immagini | cache alla prima vista | sono decine di migliaia |

Lo smistamento è un `if` sul path:

```js
if (url.pathname.includes('/data/set/') && !url.pathname.endsWith('indice.json')) {
  evento.respondWith(cacheARichiesta(richiesta, CACHE_DATI));
  return;
}
```

L'indice è l'eccezione dentro l'eccezione: sta in `data/set/` come gli altri, ma
appartiene al guscio, perché senza di lui l'app non sa nemmeno quali set esistano.

---

## 3. Le conseguenze sul codice: due funzioni diventate pericolose

Cambiare da 5 a 190 set ha reso sbagliato del codice che prima era corretto. È un caso
istruttivo: nessuna riga era "buggata", è cambiato il contesto.

### `cercaPerNome()` — scaricava tutto

```js
// prima: innocuo con 5 set, disastroso con 190
for (const infoSet of await elencoSet()) {
  const set = await caricaSet(infoSet.id);   // 6,4 MB a ogni ricerca!
```

Ora cerca **solo nei set già in memoria**. Non è pigrizia: per identificare una carta
fisica si usa il numero stampato, che carica solo i set giusti. La ricerca per nome è una
comodità su ciò che stai già usando.

### `cercaPerNumeroStampato()` — falliva tutta insieme

Con i set caricati su richiesta, offline un file può non esserci. Prima bastava un set
irraggiungibile per far fallire l'intera ricerca con un'eccezione.

```js
const esiti = await Promise.allSettled(
  candidati.map(async (infoSet) => ({ infoSet, carta: await trovaCarta(infoSet.id, numero) })),
);
```

`Promise.allSettled` invece di `Promise.all`: aspetta tutte le promise e restituisce
l'esito di ciascuna, **senza fallire alla prima che va male**. È la differenza fra "voglio
tutto o niente" e "voglio quello che si può avere".

E il risultato non è più un array ma un oggetto:

```js
return { trovate, nonLetti };
```

Perché un elenco vuoto ha due significati diversi — "questa carta non esiste" e "non ho
potuto controllare" — e confonderli farebbe credere all'utente di non possedere una carta
che ha in mano. Il primo tentativo era stato attaccare `nonLetti` come proprietà
dell'array: funziona, ma è un trucco che nessuna firma dichiara. Meglio un oggetto.

---

## 4. Testare codice che usa `fetch`

[`tests/dataset.test.js`](../../tests/dataset.test.js) non tocca la rete: sostituisce
`fetch` con una funzione che serve dati inventati.

```js
globalThis.fetch = async (url) => {
  const nome = String(url).split('/').pop();
  if (!FINTI[nome]) return { ok: false, status: 404 };   // simula il set irraggiungibile
  return { ok: true, status: 200, json: async () => FINTI[nome] };
};
```

Due vantaggi oltre alla velocità:

1. Si può **simulare il guasto**. Il set `rotto` non esiste apposta: è così che si verifica
   il comportamento offline senza staccare davvero la rete.
2. I dati finti **documentano il formato** che il modulo si aspetta, meglio di un commento.

Chi viene da Java riconoscerà Mockito, con la differenza che qui non serve libreria:
`fetch` è una proprietà di un oggetto globale, e si riassegna.

---

## 5. Esercizi

**1. Guarda le cache separarsi.** Apri DevTools → Application → Cache Storage. Prima di
cercare qualcosa, quante voci ha `pokedeck-dati`? Cerca una carta di un set mai aperto e
ricontrolla. Poi cambia `VERSIONE` in `sw.js`, ricarica due volte: quale cache sopravvive?

**2. Simula l'offline.** DevTools → Network → Offline. Cerca una carta di un set già
aperto: funziona? E una di un set mai aperto? Il messaggio che ricevi è comprensibile?

**3. Il caso limite dell'indice.** Cosa succederebbe se `indice.json` NON fosse nel guscio
precaricato e aprissi l'app offline? Prova a immaginare l'errore prima di verificarlo.

**4. Domanda di verifica.** `Promise.all` e `Promise.allSettled` ricevono lo stesso array
di promise. Perché qui la seconda è l'unica scelta corretta, e in quale altro punto del
progetto invece `Promise.all` va benissimo? (Suggerimento: guarda `scriviMolte()` in
`deposito.js` e pensa a cosa deve succedere se una scrittura fallisce.)

---

## 6. Cosa manca

La v1 è completa. Il prossimo passo è la **v2, il motore**: linee evolutive, Pokémon
orfani, generazione e bilanciamento dei mazzi. I prezzi (v1.1) sono rimandati alla fine,
e i dati per farli sono già nelle risposte TCGdex.
