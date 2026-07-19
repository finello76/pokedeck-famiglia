# Sessione 04 — L'analisi: dati sporchi e codice puro

> Il primo pezzo del motore. Meno sulle tecnologie del browser, più su come si
> ragiona quando i dati non sono come vorresti.

---

## 1. Cosa abbiamo costruito

| File | Responsabilità |
|---|---|
| [`src/engine/nomi.js`](../../src/engine/nomi.js) | Confronto fra nomi di carte |
| [`src/engine/stadi.js`](../../src/engine/stadi.js) | Classificazione degli stadi evolutivi |
| [`src/engine/analisi.js`](../../src/engine/analisi.js) | Linee evolutive, orfani, quadro completo |
| [`tests/analisi.test.js`](../../tests/analisi.test.js) | 20 test |

Nessuno di questi file importa il DOM, IndexedDB o `fetch`. Ricevono dati,
restituiscono dati. È l'unico motivo per cui si possono provare in 40 millisecondi.

---

## 2. Il problema vero non era l'algoritmo

L'idea di partenza è semplice: le carte dichiarano `evolveDa`, quindi basta seguire
i riferimenti e le linee evolutive si ricostruiscono da sole.

Poi si guardano i dati:

```
evoluzioni nel dataset:                    3.290
di cui NON trovano la pre-evoluzione:        361
```

Il motivo: **`evolveDa` è un nome scritto a mano, non un identificativo.** Una carta
chiamata `Shaymin V` viene citata come `"Shaymin-V"`. Nessun errore di logica, solo
un trattino.

```js
export function normalizzaNome(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // toglie gli accenti
    .replace(/-/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
```

Risultato: **da 361 fallimenti a 29**.

### I 29 residui non erano un bug

Guardarli uno per uno è stato più utile che raffinare l'algoritmo:

```
Omanyte      evolveDa="Helixfossile di Omanyte"
Kabuto       evolveDa="Domofossile di Kabuto"
Aerodactyl   evolveDa="Ambra Antica di Aerodactyl"
```

Sono i **fossili**: Pokémon che evolvono da una carta **Allenatore**, non da un altro
Pokémon. Non è un difetto dei dati, è una meccanica del gioco. Verificato: 15 di quei
16 nomi esistono nel dataset come carte Allenatore.

**Lezione**: prima di dichiarare "dati sporchi" e scrivere un'euristica, guarda i casi
che falliscono. Spesso non sono rumore, sono una regola che non conoscevi.

### `normalize('NFD')`, cioè perché "à" può non essere "à"

Unicode può scrivere `à` in due modi: un carattere solo (U+00E0), oppure `a` seguito
da un accento combinante (U+0061 U+0300). Sembrano identici e **non lo sono** per
`===`. `normalize('NFD')` scompone sempre nella seconda forma, e togliendo l'intervallo
dei diacritici (`\u0300`–`\u036f`) resta la lettera nuda.

In Java c'è la stessa identica API: `java.text.Normalizer.normalize(s, Form.NFD)`.

---

## 3. Due decisioni di modellazione

### Gli stadi non sono tre, sono dieci

Il progetto ragiona su Base → Livello 1 → Livello 2. Il dataset contiene anche VMAX,
V ASTRO, MEGA, TURBO, V UNIONE, Ricreato, più 589 carte senza stadio.

Prima versione: gli esotici hanno `livello: null` e vengono esclusi. Sembrava
ragionevole — finché un test non ha mostrato che l'opzione "ammettili" **non faceva
nulla**: senza livello restavano fuori dalle linee comunque.

La correzione è venuta dal gioco, non dal codice: un VMAX evolve da un V, che è una
carta Base. Quindi occupa il posto di un Livello 1.

```js
const ESOTICI = {
  VMAX: 1, 'V ASTRO': 1, MEGA: 1, TURBO: 1,   // evolvono da un Base
  'V UNIONE': 0, Ricreato: 0,                  // si giocano dalla mano
};
```

Restano esclusi **per scelta**, non per impossibilità: hanno regole complesse e
l'obiettivo sono partite in famiglia. Ma ora l'opzione funziona davvero.

### Quello che non si può sapere

`evolveDa` dà un nome, non una carta. Se possiedi **Garganacl** (Livello 2, evolve da
Naclstack) ma non hai Naclstack, non puoi leggere il suo `evolveDa`: la carta non ce
l'hai. Quindi non puoi sapere che sotto c'è anche Nacli.

Il primo risultato diceva "manca: Naclstack" — vero ma fuorviante, perché di carte ne
mancano **due**. La soluzione non è indovinare il nome, è usare un'altra informazione
già presente:

```js
const piuBasso = linea.livelli.findIndex((v) => v.length > 0);
linea.anelliMancanti = piuBasso <= 0 ? 0 : piuBasso;
```

Lo **stadio** dice a che altezza sei nella piramide. Se il più basso che possiedi è un
Livello 2, sotto mancano due gradini, comunque si chiamino.

Da qui la distinzione nel risultato:

- `mancanti` — i nomi **conoscibili** (uno solo, in quel caso)
- `anelliMancanti` — quante carte **servono davvero** (due)

Confonderli avrebbe fatto generare al motore mazzi con un buco.

---

## 4. Difendersi dai dati altrui

```js
const PROFONDITA_MASSIMA = 10;
```

Non esistono linee più lunghe di tre. Ma il dataset è dato esterno: se per un errore
`A` evolvesse da `B` e `B` da `A`, la risalita girerebbe per sempre e **bloccherebbe
la pagina**, senza messaggio, senza log. Un tetto costa una riga.

Stesso ragionamento per il confronto dei nomi:

```js
export function stessoNome(a, b) {
  const na = normalizzaNome(a);
  return na !== '' && na === normalizzaNome(b);   // due vuoti NON sono uguali
}
```

Senza `na !== ''`, ogni carta Base (che ha `evolveDa` nullo) risulterebbe collegata a
ogni altra carta Base, e le linee evolutive collasserebbero in un unico grumo. È lo
stesso genere di errore di `Number('') === 0` visto nello step 1: **il valore vuoto
che si finge un valore valido.**

---

## 5. Il risultato sulla collezione vera

Provato sulle carte reali finora note:

```
LINEE EVOLUTIVE:
  ✗ Deino (MANCANTE)          | L1: Zweilous x4
  ✓ Glameow                    | L0: Glameow x3
  ✗ Cubone (MANCANTE)          | L1: Marowak x2
  ✓ Duraludon                  | L0: Duraludon x2
  ✗ Naclstack (MANCANTE)       | L2: Garganacl x1
  ✗ Beldum (MANCANTE)          | L1: Metang x1
  ✓ Capoferreo                 | L0: Capoferreo x1
  ✗ Wooloo di Hop (MANCANTE)   | L1: Dubwool di Hop x1
  ✗ Charmeleon (MANCANTE)      | L2: Charizard x1

TIPI: Incolore 4/0en · Metallo 4/0en · Oscurità 4/0en · Lotta 3/6en · Fuoco 1/0en
```

Due fatti che il generatore dovrà affrontare:

1. **Su 9 linee, 3 sono giocabili.** Sei carte su dieci sono evoluzioni orfane.
2. **I tipi più numerosi hanno zero energie.** Un mazzo Metallo o Oscurità, che sarebbe
   la scelta ovvia per numero di carte, oggi non potrebbe attaccare.

Non sono difetti dell'analisi: sono esattamente le carenze che le regole della casa e i
proxy dovranno compensare. L'analisi ha fatto il suo lavoro se il problema si vede
**prima** di generare i mazzi, non dopo.

---

## 6. Esercizi

**1. I fossili.** `analisi.js` tratta un Pokémon che evolve da una carta Allenatore
come un orfano qualsiasi. Ma se possiedi *Helixfossile di Omanyte*, il tuo Omanyte è
giocabile. Come lo riconosceresti? (Suggerimento: la pre-evoluzione va cercata fra
**tutte** le carte, non solo fra i Pokémon.)

**2. Il limite della risalita.** Togli `PROFONDITA_MASSIMA` e fai girare il test "un
ciclo nei dati non manda in loop infinito". Cosa succede? Perché è peggio di
un'eccezione?

**3. Un caso che non abbiamo gestito.** Due carte diverse possono avere lo **stesso
nome** in set diversi (il Charizard del Set Base e quello McDonald's). `perNome()` le
mette insieme. È giusto o è un bug? Argomenta in entrambi i sensi.

**4. Domanda di verifica.** Perché `anelliMancanti` si ricava dallo *stadio* e non
contando `mancanti.length`? Che cosa sa lo stadio che i nomi non sanno?

---

## 7. Cosa manca

Lo **step 5**: generazione e bilanciamento. L'analisi dice cosa c'è; il generatore
dovrà scegliere. E su questa collezione dovrà cavarsela con tre linee giocabili e un
tipo solo che ha energie — cioè esattamente il caso difficile per cui il progetto
esiste.
