# Sessione 02 — IndexedDB e la collezione

> Cosa è stato fatto nello step 2 e perché. Il confronto principale è con JDBC e
> con il modello transazionale che conosci da Java: le somiglianze sono
> ingannevoli, e le differenze sono proprio dove si sbaglia.

---

## 1. Cosa abbiamo costruito

| File | Responsabilità |
|---|---|
| [`src/data/deposito.js`](../../src/data/deposito.js) | Wrapper su IndexedDB: conosce il database, non le carte |
| [`src/data/collezione.js`](../../src/data/collezione.js) | Cosa possiedo e in quante copie; statistiche |
| [`src/data/energie.js`](../../src/data/energie.js) | Riconosce il tipo delle energie (puro, testato) |
| [`src/data/scambio.js`](../../src/data/scambio.js) | Export/import JSON |
| [`src/ui/griglia-collezione/`](../../src/ui/griglia-collezione/) | Griglia con filtri |
| [`src/ui/contatore-energie/`](../../src/ui/contatore-energie/) | Energie per tipo |
| [`tests/energie.test.js`](../../tests/energie.test.js) | 11 test, `node --test` |

---

## 2. IndexedDB: cosa aspettarsi (e cosa no)

Non è SQL. Non ci sono tabelle, colonne, join, né un linguaggio di query. È un
**archivio chiave-valore transazionale**: conserva oggetti JavaScript interi, indicizzati
da una chiave, con eventuali indici secondari.

| Java / JDBC | IndexedDB |
|---|---|
| Tabella | Object store |
| Riga | Oggetto JS (annidato quanto vuoi) |
| Chiave primaria | `keyPath` |
| `CREATE TABLE` / migrazioni | `onupgradeneeded` |
| `SELECT ... WHERE` | Indici + cursori, oppure filtri in JS |
| `Connection` | `IDBDatabase` |

Non essendoci le query, **il filtro sui dati lo fai tu in JavaScript**. È il motivo per cui
`griglia-collezione.js` filtra a mano un array: con qualche migliaio di carte è
istantaneo, e un indice per ogni possibile filtro sarebbe sproporzionato.

### La API è a eventi, non a Promise

```js
const richiesta = store.get('sv08:118');
richiesta.onsuccess = () => console.log(richiesta.result);
richiesta.onerror   = () => console.error(richiesta.error);
```

Verboso e impossibile da comporre. Lo si avvolge **una volta sola**, in `deposito.js`:

```js
function promessa(richiesta) {
  return new Promise((risolvi, rifiuta) => {
    richiesta.onsuccess = () => risolvi(richiesta.result);
    richiesta.onerror = () => rifiuta(richiesta.error);
  });
}
```

Da lì in poi il resto dell'app scrive `await leggi(...)` come se fosse normale.

### Lo schema si tocca in un posto solo

```js
const richiesta = indexedDB.open(NOME_DB, VERSIONE_DB);
richiesta.onupgradeneeded = (evento) => { /* unico posto */ };
```

`onupgradeneeded` scatta solo quando la versione sul disco è più vecchia di quella
richiesta. È l'equivalente di Flyway o Liquibase, ma scritto a mano. Il punto delicato:
**le migrazioni si scrivono a cascata, senza `else`**.

```js
if (daVersione < 1) { /* crea lo store */ }
if (daVersione < 2) { /* aggiungi l'indice */ }   // in futuro
```

Chi installa l'app oggi parte da `oldVersion = 0` ed esegue tutti i passi. Chi ce l'ha già
da ieri parte da 1 ed esegue solo il secondo. Con un `else` il secondo utente non
riceverebbe mai lo store creato al passo 1.

### La trappola vera: le transazioni si chiudono da sole

Questa è la differenza che fa più male venendo da Java. In JDBC una transazione resta
aperta finché non fai `commit()`. In IndexedDB **si chiude da sola** appena il ciclo di
eventi resta senza richieste in sospeso su quella transazione.

Conseguenza pratica:

```js
// ROTTO
const t = db.transaction('collezione', 'readwrite');
const carta = await fetch('...');      // ← il turno del ciclo di eventi finisce qui
t.objectStore('collezione').put(carta); // ← TransactionInactiveError
```

Non si può mettere un `await` su qualcosa di **estraneo** (una `fetch`, un timer) in mezzo
a una transazione: al risveglio è già chiusa. È il motivo del commento in
`inTransazione()` e il motivo per cui `collezione.js` legge il dataset **prima** o **dopo**
la transazione, mai dentro.

E per sapere che una scrittura è davvero andata a buon fine non basta il successo della
singola richiesta: serve il `complete` della transazione, che è il commit vero.

```js
await new Promise((risolvi, rifiuta) => {
  transazione.oncomplete = () => risolvi();
  transazione.onerror = () => rifiuta(transazione.error);
  transazione.onabort = () => rifiuta(transazione.error ?? new Error('Transazione annullata'));
});
```

Senza questa attesa si potrebbe rileggere subito dopo e non trovare ancora i dati.

---

## 3. La scelta di modellazione: cosa NON salvare

Nel database finiscono solo tre cose:

```js
{ id: 'sv08:118', idSet: 'sv08', numero: '118', quantita: 4, aggiornatoIl: '...' }
```

Niente nome, niente tipo, niente PS, niente attacchi. Quelli stanno nel dataset e si
rileggono da lì a ogni visualizzazione (`collezione.js` → `elencoCompleto()`).

Il ragionamento è lo stesso della normalizzazione in un database relazionale: **un dato
duplicato è un dato che prima o poi diverge**. Se salvassimo il nome e domani TCGdex
correggesse una traduzione, la collezione resterebbe con quello vecchio per sempre.
Così invece basta rilanciare `node tools/scarica-set.mjs` e tutto si aggiorna.

Il costo è una join fatta a mano a ogni lettura. Con 13 carte non si nota; con 3000
converrà una cache in memoria, non un cambio di modello.

### Il caso che ha richiesto una deroga: le energie base

Le energie base che si usano davvero arrivano dai mazzi di partenza e **non appartengono a
nessuno dei set catalogati**. Nei tuoi 5 set ci sono in tutto 12 carte Energia, quasi tutte
versioni rare da collezione: le energie normali che useresti per giocare semplicemente non
ci sono.

Senza una via d'uscita, il contatore energie — il dato da cui dipende metà del motore in
v2 — sarebbe rimasto a zero per sempre. La soluzione è un set fittizio:

```js
export const SET_ENERGIE_GENERICHE = '@base';
// chiave: '@base:Fuoco'
```

La `@` non può comparire in un id reale di TCGdex, quindi non ci sono collisioni possibili.

---

## 4. I dati sporchi: perché `energie.js` esiste

Le carte Energia nel dataset **non hanno il campo `types`**, a differenza dei Pokémon.
L'unico appiglio è il nome, che è incoerente:

| Nome nel dataset | Tipo corretto | Problema |
|---|---|---|
| `Energia Erba` | `Erba` | nessuno |
| `Energia Psiche` | `Psico` | il tipo dei Pokémon si chiama diversamente |
| `Energia Combattimento` | `Lotta` | idem |
| `Energia base Psychic` | `Psico` | rimasto in inglese |

Da qui la tabella esplicita in `energie.js`. È il classico caso in cui la traduzione va
scritta a mano e **testata**, perché un errore qui non si vede: produce solo mazzi
sbilanciati, molto più tardi.

### Il bug che i test hanno trovato

Scrivendo i test è emerso un errore vero, non nel test ma nel codice. L'app genera le
energie base generiche con `Energia ${tipo}`, cioè `Energia Lotta` e `Energia Psico` —
i nomi *canonici*. Ma la tabella conosceva solo `Combattimento` e `Psiche`:

```
✖ ignora le carte che non sono energie
   actual: {}   expected: { Lotta: 1 }
```

Ogni energia Lotta o Psico inserita a mano sarebbe finita fra quelle "di tipo non
riconosciuto", e il motore avrebbe creduto di non averne. Correzione: i nomi canonici
mappano su se stessi.

Morale: la logica pura, isolata dal DOM e dal database, si testa in due minuti e ripaga
subito. È la ragione per cui `src/engine/` in v2 dovrà restare altrettanto puro.

---

## 5. Perché è comparso `package.json`

Node tratta i file `.js` come CommonJS a meno che il progetto non dichiari il contrario.
Senza questa dichiarazione i test non possono usare `import`:

```json
{ "type": "module" }
```

**Non è un sistema di build e non introduce dipendenze**: non c'è un campo `dependencies`
e non va mai eseguito `npm install`. Il browser non lo legge nemmeno — a lui basta
`<script type="module">`. Serve solo a Node, e solo per i test.

---

## 6. Shadow DOM sì, Shadow DOM no

`<scheda-carta>` usa lo Shadow DOM, `<griglia-collezione>` no. Non è un'incoerenza:

- **scheda-carta** ha uno stile suo da proteggere e viene riusata in contesti diversi
  (ricerca, collezione, in futuro i mazzi): l'isolamento serve.
- **griglia-collezione** è soprattutto un contenitore di altri componenti e vuole
  ereditare il tema della pagina, i `<label>`, i bottoni. Metterla in uno shadow root
  avrebbe significato ricopiare tutto lo stile dei moduli lì dentro.

Regola pratica: lo Shadow DOM serve quando c'è dello stile da difendere, non per abitudine.
Il prezzo è che il CSS di `griglia-collezione` va incluso da `index.html`, perché nel DOM
normale non c'è modo di legare un foglio di stile a un componente.

### Eventi al posto delle callback

La griglia non conosce il database. Quando premi `+` emette un evento:

```js
this.dispatchEvent(new CustomEvent('quantita-cambiata', {
  bubbles: true,
  detail: { idSet, numero, delta },
}));
```

e `app.js` decide cosa farne. È lo stesso schema di un `@Output()` con `EventEmitter` in
Angular, solo che qui l'evento è un evento DOM vero: risale l'albero e chiunque può
ascoltarlo. `bubbles: true` è ciò che glielo permette — senza, resterebbe sull'elemento.

---

## 7. Esercizi

**1. Una migrazione vera.** Aggiungi un campo `note` alle carte (un testo libero, es. "carta
rovinata"). Serve un cambio di `VERSIONE_DB`? E un nuovo `if (daVersione < 2)`? Provaci, poi
apri DevTools → Application → IndexedDB e guarda cosa è successo ai dati già inseriti.

**2. La trappola della transazione.** In `deposito.js`, dentro `inTransazione()`, prova ad
aggiungere `await new Promise(r => setTimeout(r, 10))` prima di usare lo store. Che errore
esce? Perché è esattamente quello che ci si deve aspettare?

**3. Un indice utile.** C'è un indice `perSet` creato ma **mai usato**: la griglia filtra
in JavaScript. Scrivi una funzione in `deposito.js` che usi l'indice per leggere solo le
carte di un set. Con quante carte inizierebbe a convenire davvero?

**4. Domanda di verifica.** L'export contiene il campo `nome`, ma `validaImport()` lo
ignora completamente. Perché è la scelta giusta? Cosa si romperebbe se l'import si fidasse
del nome invece che di `idSet` + `numero`?

---

## 8. Cosa manca

- **v1.1**: i prezzi. Sono già dentro le risposte TCGdex (`pricing.cardmarket`, in EUR),
  ma lo script attuale li scarta in `normalizza()`: vanno tenuti, con la data.
- **v2**: il motore. Le statistiche che calcoliamo ora (energie per tipo, conteggi per
  stadio) sono esattamente il suo ingresso. Manca il riconoscimento delle **linee
  evolutive** e dei **Pokémon orfani** — e le tue carte ne sono piene: su 9 carte, 4 sono
  evoluzioni senza la loro pre-evoluzione.
