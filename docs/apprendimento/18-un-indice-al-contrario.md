# 18 — Un indice al contrario

> **La domanda a cui risponde**: hai una mappa `figlio → genitore` e ti serve
> rispondere a `genitore → figli`. Cosa cambia davvero fra le due direzioni? E
> cosa fai quando la risposta è *trentatré*?
>
> Per contorno: come si decide cosa mettere sotto una card quando la stessa
> griglia serve due viste diverse, e dove finisce il motore e comincia la rete.

## Il fatto

Nei **Preferiti** ogni card aveva sotto i due pulsanti `+` e `−`, ereditati dal
catalogo. Ma i preferiti non sono un inventario da aggiornare: sono le carte che
ti piacciono, quelle che riguardi. Là quei due bersagli da 38 px non li tocca
nessuno — anzi, si toccano per sbaglio scorrendo col pollice.

La domanda che invece viene sempre, guardando un Machoke, è un'altra: **ho anche
il resto della linea?** Da qui il pulsante "Linea evolutiva" e la finestra che
mostra la famiglia intera, con scritto su ogni gradino se ce l'hai.

## Parte 1 — Le due direzioni di un indice

Il progetto ha già `data/evoluzioni.json`, prodotto da
`tools/genera-indice-evoluzioni.mjs`:

```json
{ "da": { "machoke": "Machop", "machamp": "Machoke" }, "nonPokemon": ["Fossile Raro", …] }
```

È una mappa **figlio → genitore**. Risalire è banale: da `machamp` leggi
`Machoke`, normalizzi, leggi ancora, e in tre passi sei al Base. Il modulo
`engine/linee.js` faceva già esattamente questo per capire quali carte stampare.

Scendere è un'altra faccenda, e le differenze sono tre:

1. **Non c'è un accesso diretto.** Per sapere cosa evolve da Pikachu devi
   guardare *tutti* i valori. È una `Map` da costruire apposta:

   ```js
   function rovescia(indice) {
     const giu = new Map();
     for (const [evoluzione, preEvoluzione] of Object.entries(indice)) {
       const chiave = normalizzaNome(preEvoluzione);
       if (!giu.has(chiave)) giu.set(chiave, []);
       giu.get(chiave).push(evoluzione);
     }
     return giu;
   }
   ```

   In Java è la differenza fra una `Map<String, String>` e una
   `Map<String, List<String>>` — o, se hai lavorato con JPA, fra il lato
   `@ManyToOne` (che ha la colonna) e il lato `@OneToMany` (che non ce l'ha, e
   va ricostruito con una query).

2. **La cardinalità cambia.** Verso l'alto ogni Pokémon ha **una sola**
   pre-evoluzione: la catena è una lista. Verso il basso si dirama: sette nomi
   da Pikachu, **trentatré da Eevee**. Il tipo di ritorno non può essere lo
   stesso — infatti `catenaEvolutiva()` restituisce, per ogni livello, un
   *array* di nomi.

3. **Cambia la forma dei nomi.** E questo è il tranello. Nel file, i **valori**
   sono nomi come stanno sulla carta (`Machop`), le **chiavi** sono nomi
   normalizzati (`raichu gx`, minuscolo, senza trattini — vedi
   `engine/nomi.js`). Risalendo raccogli valori: nomi belli. Scendendo raccogli
   chiavi: nomi *tecnici*, che a schermo sarebbero brutti.

   Non si è "sistemato" il file — un indice esiste per essere cercato, e le sue
   chiavi devono restare confrontabili. Si è deciso invece che quei nomi sono
   **buoni da cercare, non da stampare**: `app/linea-evolutiva.js` cerca la
   carta vera e ne usa il nome. Il JSDoc del modulo lo dichiara, perché è un
   contratto che nessun compilatore fa rispettare.

### Il tetto, e perché non è un dettaglio estetico

Trentatré miniature in una finestra aperta per rispondere a "com'è fatta questa
famiglia" non sono una risposta: sono un elenco. Quindi c'è un tetto per
livello (8) e una riga che dichiara quanto resta fuori — *«e altre 25 evoluzioni
non mostrate»*. **Un dato tagliato in silenzio è peggio di un dato assente**: è
la stessa regola per cui la ricerca globale dice "troppi risultati" invece di
mostrarne dieci a caso.

Ma tagliare i primi otto in ordine d'indice dava questo:

```
Dark Espeon · Dark Flareon · Dark Jolteon · Dark Vaporeon · Espeon · Espeon ex · …
```

Le quattro varianti "Dark" si prendevano metà schermo e **Flareon, Jolteon,
Vaporeon restavano fuori**. Il criterio corretto non è alfabetico ma *quanto un
nome merita lo spazio*, e sono due regole in fila:

```js
const mia = Number(possedute.has(normalizzaNome(b))) - Number(possedute.has(normalizzaNome(a)));
if (mia) return mia;
return a.length - b.length || a.localeCompare(b);
```

- **prima le carte che possiedi**: un'evoluzione che hai in scatola non deve mai
  finire fra le tagliate;
- **poi i nomi corti**: le forme normali sono più corte delle varianti, sempre.
  È la stessa euristica che `data/dataset.js` usa da tempo nella ricerca per
  nome ("Pikachu" prima di "Pikachu ex Ultra Rara").

Risultato: Espeon, Flareon, Glaceon, Jolteon, Leafeon, Sylveon, Umbreon.

## Parte 2 — Dove passa il confine

Tre file nuovi, e nessuno dei tre potrebbe fare il lavoro di un altro:

| File | Cosa sa | Cosa non può fare |
|---|---|---|
| `src/engine/catena.js` | l'algoritmo: risalire, rovesciare, tagliare | toccare la rete o il DOM |
| `src/app/linea-evolutiva.js` | dove si trovano le carte (collezione, catalogo) | disegnare |
| `src/ui/linea-evolutiva/` | come si disegna un gradino | sapere cos'è un indice |

Il confine è quello di sempre in questo progetto (`src/engine/` è puro), ma qui
si vede *perché* conviene: la parte difficile — cicli nell'indice, cardinalità,
tetti, ordinamento — è verificabile in `tests/catena.test.js` con sette righe di
finto indice, senza browser, senza rete, senza IndexedDB. Il caso "il ventaglio
si taglia a 3 e ne dichiara 9" è un test da mezzo secondo; a mano, sarebbe
aprire l'app e contare le miniature di Eevee.

Nota il verso della dipendenza: `linee.js` — che esisteva già — ora **importa**
da `catena.js` la risalita, invece di tenerne una copia. Due camminate sullo
stesso indice che divergono col tempo darebbero due linee diverse per la stessa
carta, e nessun test lo direbbe.

## Parte 3 — Aprire prima di sapere

Ricostruire la linea di un Machoke vuol dire cercare Machop e Machamp in tutto
il catalogo, cioè **scaricare il file di qualche set**. Sul telefono di casa
sono secondi.

Se la finestra si aprisse solo a dati pronti, il tocco sembrerebbe non aver
fatto nulla — e il secondo tocco arriverebbe subito dopo. Quindi il componente ha
due momenti distinti:

```js
finestra.apri(voce.carta.nome);           // subito: titolo e "ricostruisco…"
finestra.gradini = await risolviLinea(…); // dopo: il contenuto
```

È lo stesso schema del *resolver* di Angular ribaltato: là la rotta aspetta i
dati, qui la vista si apre e li accoglie. E come ogni cosa asincrona che
l'utente può ripetere, ha bisogno di un guardiano contro le risposte
sorpassate:

```js
const mio = ++giro;
…
if (mio === giro) finestra.gradini = gradini;
```

Chiudi la linea di Machoke, apri quella di Eevee, e la risposta lenta della
prima arriva dopo: senza il contatore, la finestra si riempirebbe della famiglia
sbagliata. Lo stesso `#giroRicerca` c'è nella griglia per la ricerca per nome —
quando un pattern compare due volte, è un pattern.

## Parte 4 — Una griglia, due piedi

La vista Preferiti **è** la griglia del catalogo con `{preferito: 'solo'}` fisso
(vedi il documento 17). Cambiare il piede della card senza duplicare il
componente è una riga di decisione:

```js
#piede(voce, mancante) {
  if (!this.#fissi.preferito) return this.#stepper(voce, mancante);
  if (voce.carta?.categoria !== 'Pokémon') return '';   // un'Energia non ha linea
  return `<div class="piede-preferito">…</div>`;
}
```

Due cose valgono più della riga in sé:

- **la funzionalità non si perde**: le copie restano modificabili aprendo la
  carta nel visore. Togliere un comando è legittimo solo se esiste ancora una
  strada;
- **il pulsante non compare dove non ha senso**: su un Allenatore o su
  un'Energia aprirebbe una finestra con dentro una carta sola. Un comando che
  non fa niente insegna a diffidare di tutti gli altri.

## Domande di verifica

1. **La direzione mancante.** `rovescia()` ricostruisce la mappa a ogni apertura
   della finestra invece di tenerla in una variabile di modulo. Il commento dice
   che una cache renderebbe il modulo "non più puro": cosa vuol dire in pratica?
   Scrivi un test che fallirebbe se la cache ci fosse.

2. **Il ciclo.** L'indice è un dato esterno, ricostruito da uno strumento. Se
   contenesse `alfa → Beta` e `beta → Alfa`, cosa succederebbe alla risalita
   senza il `Set` dei nomi già visti? E alla discesa? (Ce n'è un test.)

3. **Il tetto giusto.** Il tetto è 8 per livello. Sul livello 1 di Eevee ne
   restano fuori 25. Proponi un'alternativa al taglio — mostrare tutto con lo
   scorrimento? un pulsante "mostra le altre"? raggruppare le varianti sotto la
   forma normale? — e argomenta cosa costa ciascuna *in richieste di rete*,
   ricordando che ogni nome non posseduto costa una ricerca nel catalogo.

4. **Il tetto delle ricerche.** `MAX_RICERCHE = 12` in `app/linea-evolutiva.js`
   limita quante carte si vanno a cercare. Cosa vede l'utente per una carta
   oltre il dodicesimo posto? Guarda il ramo `trovata = null` e di' se ti sembra
   una degradazione onesta.

5. **Il verso dell'import.** `linee.js` importa da `catena.js`. Prova a
   immaginare il contrario — `catena.js` che importa da `linee.js` — e spiega
   perché sarebbe sbagliato guardando cosa altro si porterebbe dietro
   (`fabbisogno.js`, `stadi.js`, i punteggi dei mazzi).
