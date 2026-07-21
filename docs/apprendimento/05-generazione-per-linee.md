# Sessione 05 — Riscrivere un algoritmo invece di correggerlo

> Come si capisce che un algoritmo non ha un bug ma un modello sbagliato, e cosa
> significa cambiargli l'unità di ragionamento. Tecnologie: poche. Metodo: molto.

---

## 0. I file toccati

| File | Cos'è cambiato |
|---|---|
| [`src/engine/linee.js`](../../src/engine/linee.js) | **nuovo** — le linee evolutive come unità di scelta |
| `src/engine/scelta-linee.js` | **cancellato** — il modello vecchio |
| [`src/engine/generazione.js`](../../src/engine/generazione.js) | sceglie linee, non carte; stampa mentre costruisce |
| [`src/engine/carenze.js`](../../src/engine/carenze.js) | **nuovo** — estratto da `generazione.js`, che superava le 300 righe |
| [`src/engine/proxy.js`](../../src/engine/proxy.js) | ridotto alle sole Energie |
| [`src/engine/pianifica.js`](../../src/engine/pianifica.js) | non aggiunge più proxy a mazzo finito |
| [`src/ui/procedura-guidata/`](../../src/ui/procedura-guidata/procedura-guidata.js) | la domanda sul budget di stampa |
| [`src/engine/riallinea.js`](../../src/engine/riallinea.js) | **nuovo** — ricalcola le stampe dopo una sostituzione a mano |
| [`src/engine/mazzo.js`](../../src/engine/mazzo.js) | **nuovo** — metti/togli una carta, in un posto solo |
| [`tools/genera-indice-evoluzioni.mjs`](../../tools/genera-indice-evoluzioni.mjs) | segnala le pre-evoluzioni che sono fossili |
| [`tests/linee.test.js`](../../tests/linee.test.js) · [`tests/riallinea.test.js`](../../tests/riallinea.test.js) | 14 test del modello nuovo |

---

## 1. Il sintomo

Terza segnalazione sullo stesso difetto: i mazzi generati erano quasi tutti Pokémon
Base, e le carte stampabili — pensate per completare le linee evolutive — venivano
usate per stampare **altre carte Base**.

Le due correzioni precedenti avevano cambiato i pesi di un punteggio. Funzionavano
nei test e non nella realtà. È il segnale classico: se ritocchi i coefficienti e il
comportamento non cambia davvero, il problema non è nei coefficienti.

## 2. Prima misurare, poi decidere

Prima di toccare una riga, un programmino usa e getta ha caricato la collezione vera
e contato:

```
Pokémon posseduti:  38 Base, 14 Livello 1, 12 Livello 2
Evoluzioni la cui pre-evoluzione è in collezione:  0
```

**Zero.** Non "poche": nessuna. Machamp senza Machop, Pawmot senza Pawmi, Luxio senza
Shinx. Tutte e 26 le evoluzioni erano orfane.

Il dato cambia la diagnosi da "il generatore sbaglia a scegliere" a "**con le sole
carte possedute non esiste alcun mazzo che evolve**": il generatore stava dando la
risposta giusta a una domanda mal posta.

> **Lezione trasferibile.** Un algoritmo si giudica sui dati veri, non su fixture
> scritte da chi l'ha progettato. Le fixture contengono sempre il caso che avevi in
> mente; i dati veri contengono il caso che non avevi previsto.

## 3. Il modello sbagliato

Il vecchio `scelta-linee.js` ragionava su **gruppi**: una carta giocabile dalla mano
più le sue evoluzioni *possedute*. In un mondo dove nessuna linea è completa, ogni
gruppo aveva profondità 1, e un'evoluzione orfana partiva penalizzata:

```js
// scelta-linee.js — il modello vecchio
if (gruppo.orfana) {
  p -= 35 * livello + 30 * orfaniGia;   // Machamp parte a -70
}
```

Un Rotom qualsiasi batteva sempre un Machamp. Non per un errore di calcolo: perché
nel modello **una carta si valuta per ciò che possiedi intorno a lei**.

C'era di peggio, ed era architetturale: i proxy si calcolavano **dopo** la
generazione ([`pianifica.js`](../../src/engine/pianifica.js)). Il generatore sceglieva
senza sapere di poter stampare; i proxy rattoppavano quel che trovavano. Due decisioni
che dipendono l'una dall'altra, prese in sequenza e separatamente: è la forma tipica
del difetto che non si risolve con un ritocco.

## 4. Il modello nuovo: la linea come unità di progetto

[`src/engine/linee.js`](../../src/engine/linee.js) rovescia la definizione:

> Una linea non è ciò che possiedi. È **ciò che possiedi più i gradini che ti mancano
> per giocarlo**, col loro costo di stampa.

Machamp non è più una carta orfana da penalizzare: è la cima di una linea
`Machop → Machoke → Machamp` di cui possiedi il pezzo migliore e devi stampare due
gradini bassi. Il buco diventa un **costo di progetto** invece che un difetto che
esclude la carta.

```js
// linee.js — il modello nuovo
p += 70 * (linea.profondita - 1);   // Machamp: +140
p -= 20 * linea.daStampare;         //          -40
                                    //  → +100 contro il +0 di una Base sola
```

Il punteggio è cambiato, ma non è quello il punto: è cambiato **cosa viene
punteggiato**. La stessa carta, gli stessi dati, un'unità di ragionamento diversa.

### Il vincolo che ordina tutto: il budget

Il generatore riceve `budgetProxy`, cioè quante carte si è disposti a stampare per
mazzo, e lo consuma scegliendo. Diventa il vincolo che rende il problema un problema
di ottimizzazione onesto — e la scelta torna a chi gioca, con una domanda nel wizard:

| Budget | Effetto sulla collezione di prova |
|---|---|
| 0 | mazzi di sole Base, più la regola della casa "le evoluzioni si giocano come Base" |
| 4 | una linea completa per mazzo |
| 12 | tre linee complete per mazzo, con Livello 2 veri in cima |

### Un'invariante che vale più di dieci pesi

```js
// richiestaPerLinea(): se anche un solo gradino resta scoperto, non si prende nulla
if (richiesta.some((v) => v.quante === 0)) return [];
```

Prima versione della riscrittura: negli ultimi slot liberi del mazzo entrava un
`Shinx` stampato **senza** il Luxio che doveva farlo evolvere. Una carta fotocopiata
per giocare niente.

L'invariante — *una linea entra intera o non entra* — elimina l'intera classe di
difetti, mentre un peso l'avrebbe solo resa meno probabile. Cerca sempre l'invariante
prima del coefficiente.

## 5. Il codice che si cancella

Effetto collaterale della riscrittura: `proxy.js` è passato da 391 a 171 righe.

Sono sparite `proxyPokemon()`, `catenaMancante()`, `inserisciPokemon()` e con esse la
logica più contorta del progetto — quella che, per far posto a un proxy inserito a
mazzo finito, doveva **togliere una carta vera** scegliendo "la meno preziosa" fra
doppioni di Allenatori, Base non pre-evolutive ed energie in eccesso.

Tutta quella complessità esisteva solo perché la decisione arrivava troppo tardi.
Spostata al punto giusto, non serviva più: se il proxy occupa il suo slot fin
dall'inizio, non c'è niente da sacrificare.

> **Lezione trasferibile.** Quando un modulo è pieno di casi particolari
> ("scegli la carta meno preziosa da sacrificare"), spesso non è complesso: è nel
> posto sbagliato. Il codice difficile è a valle di una decisione presa male a monte.

---

## 6. Le tecnologie toccate

### `Set` come stato di costruzione, e la serializzazione

Durante la generazione ogni mazzo porta con sé `famiglie`, un `Set` delle linee già
prese. Alla fine:

```js
for (const mazzo of mazzi) delete mazzo.famiglie;
```

`JSON.stringify(new Set([1,2]))` produce `{}`: i `Set` **non sono serializzabili**, e
i mazzi finiscono in IndexedDB e nell'export JSON. Chi viene da Java conosce il
problema in altra forma (`transient`, o un campo escluso da Jackson): la differenza è
che qui non c'è né errore né avviso. Il dato sparisce in silenzio.

Regola pratica: lo stato *di costruzione* non deve sopravvivere alla costruzione.

### Chiavi di identità, e perché due voci con lo stesso nome vanno tenute separate

```js
const chiave = (c, proxy) =>
  `${proxy ? 'proxy' : c.idSet ?? '?'}:${c.numero ?? normalizzaNome(c.nome)}`;
```

Se possiedi un Houndstone e ne serve un secondo, la lista deve dire
`1× Houndstone` **e** `1× Houndstone da stampare`, non `2× Houndstone`: chi ritaglia
deve sapere quante fotocopie fare. Due voci con lo stesso nome sono due cose diverse,
e la chiave di identità lo deve riflettere.

(In pratica quel caso ora non si presenta: il generatore non ristampa mai una carta di
cui possiede almeno una copia — quel budget rende molto di più speso su un'altra
linea. Ma la chiave resta corretta a prescindere.)

### Test unitari come specifica del modello

I test in [`tests/linee.test.js`](../../tests/linee.test.js) non verificano numeri,
verificano **affermazioni sul modello**:

- *una linea profonda batte una Base isolata, anche dovendo stampare*
- *senza budget la linea da stampare sparisce, la Base resta*
- *se la linea non ci sta tutta non si prende niente*

Scritti così, sopravvivono al prossimo ritocco dei pesi — e se un giorno falliscono,
ti stanno dicendo che è cambiato il modello, non l'aritmetica.

---

## 7. Esercizi

**1. Il verso della stampa.** Il motore stampa solo *pre-evoluzioni* (dal tuo Machamp
in giù). Potrebbe fare il contrario: dal tuo Riolu stampare Lucario. Sono 21 delle 38
Basi possedute. Perché la scelta è caduta sulle pre-evoluzioni? Che cosa cambierebbe
nel significato dell'app? (Non c'è una risposta tecnica: argomenta.)

**2. Budget e profondità.** Con budget 4 il motore compra **una** linea da 3 gradini
(2 stampe) invece di **due** linee da 2 gradini (1 stampa l'una). Modifica i pesi in
`punteggioLinea()` perché preferisca la seconda strategia. Poi guarda i mazzi: quale
ti sembra più divertente da giocare? È una decisione di design, non di codice.

**3. La quota che dipende dal budget.**

```js
fetta.pokemon += budgetPerMazzo;
```

Togli questa riga e fai girare `tests/proxy.test.js`. Due test falliscono. Perché? Che
cosa dice questo sul rapporto fra "quante carte possiedo" e "quante carte posso
mettere nel mazzo"?

**4. Domanda di verifica.** `ordinaLinee()` scarta le linee che non può completare
*oppure* le collassa sulla sola cima, se una regola della casa lo permette. Perché il
collasso avviene lì e non dentro `enumeraLinee()`? (Suggerimento: quante volte viene
chiamata ciascuna, e cosa sa ciascuna delle due del mazzo che si sta costruendo?)

---

## 8. Cosa resta aperto

Il bilanciamento vero e proprio — punteggio per mazzo e scambi iterativi fra mazzi
(punto 3 della specifica del motore) — non è ancora stato scritto. Ora che l'unità di
ragionamento è la linea, uno scambio fra mazzi dovrà spostare **linee intere**, non
carte singole: altrimenti si torna al punto di partenza, con mazzi che si rompono
un gradino per volta.

---

## 9. Poscritto: tre difetti che solo l'uso vero fa uscire

I test passavano tutti. Poi il mazzo è finito davanti a chi ci gioca, e in
mezz'ora sono usciti tre difetti che nessuna fixture aveva mostrato.

### «Dragapult c'è sempre»

Vero, e la causa non era dove sembrava. Il generatore sceglieva il *tipo* del
mazzo in modo deterministico — i due migliori — e Dragapult era l'unico Livello 2
Psico della collezione: fissato il tipo, la carta era obbligata.

I punteggi dei tipi però erano vicinissimi:

```
Lampo 4,6 · Psico 4,2 · Lotta 3,9 · Acqua 3,7 · Erba 3,7 · Fuoco 3,0
```

Prendere sempre il massimo di una classifica così stretta è arbitrario quanto
tirare a caso, ma senza il vantaggio della varietà. Ora si estrae fra i tipi
entro il 75% del migliore, e "Rigenera diversi" restituisce davvero mazzi
diversi: Quaquaval, Machamp, Krookodile, Corviknight, Garganacl.

> **Lezione trasferibile.** Quando l'output è sempre uguale, guarda a monte:
> spesso la varietà è già stata uccisa da una decisione precedente, e aggiungere
> caso a valle non serve a niente.

### «Se cambio la carta, le stampe non si aggiornano»

Anche questo vero, ed era un'omissione di progetto: le carte da stampare esistono
**per** una carta precisa, ma niente teneva insieme le due cose dopo una modifica
a mano. Tolto Dragapult, i suoi Dreepy e Drakloak restavano nel mazzo: fotocopie
per giocare una carta che non c'era più.

[`src/engine/riallinea.js`](../../src/engine/riallinea.js) ricalcola: toglie le
stampe rimaste senza padrone, stampa quelle che servono alla carta entrata, e
riporta il mazzo alla sua taglia pescando dalle carte vere ancora libere.

Nota di riuso: non ricostruisce niente da capo, chiama `enumeraLinee()` passando
come "posseduti" **le carte del mazzo**. Un gradino senza carta è, per
definizione, un gradino da stampare. Lo stesso codice risponde a due domande
diverse a seconda di cosa gli dai in pasto — ed è il segno che l'astrazione era
quella giusta.

### «3× Vecchio Helixfossile da stampare»

Il difetto più istruttivo, perché nasce dai dati e non dal codice. Omanyte
dichiara `evolveDa: "Vecchio Helixfossile"` — che **non è un Pokémon**: è una
carta Allenatore, il fossile da cui Omanyte si mette in gioco. Il motore, che
ragiona per catene di nomi, l'ha trattato come un gradino qualsiasi e ha stampato
tre copie di una carta che nel gioco non esiste in quella forma. Peggio: quelle
tre copie hanno consumato il budget destinato alle linee vere.

Nessuna regola interna al motore poteva accorgersene: dal suo punto di vista
"Vecchio Helixfossile" è una stringa come "Machop". La conoscenza sta nel
dataset, quindi la risposta è stata prodotta lì — `tools/genera-indice-evoluzioni.mjs`
ora confronta ogni pre-evoluzione con l'elenco di tutti i nomi di Pokémon visti,
e scrive a parte quelle che non lo sono:

```json
{"da": {"omanyte": "Vecchio Helixfossile", …},
 "nonPokemon": ["Vecchio Helixfossile", "Vecchia Ambra Antica", …]}
```

Sono dieci in tutto il dataset. Il motore riceve l'elenco e ferma lì la catena:
Omanyte torna a essere una carta che si gioca solo con la regola della casa.

**Il formato del file è cambiato**, e questo in una PWA ha una conseguenza: il
service worker può servire ancora la versione vecchia dalla cache. Per questo
`dataset.js` accetta entrambe le forme:

```js
const nuovo = indice && typeof indice.da === 'object';
cacheEvoluzioni = nuovo ? indice.da : indice ?? {};
```

Chi viene da un backend è abituato a poter cambiare formato e schema insieme.
Con una PWA no: il vecchio file è già sul dispositivo dell'utente, e il codice
nuovo deve saperci convivere almeno per un giro. È lo stesso problema delle
migrazioni di database, con la differenza che qui **non controlli quando** la
migrazione avviene.

### Esercizio

**5. Il fossile come proxy giusto.** Oggi Omanyte si gioca solo grazie alla
regola della casa. In teoria il motore potrebbe stampare il *Vecchio
Helixfossile* — che è una carta come le altre, solo di categoria Allenatore — e
far giocare Omanyte con le regole vere. Cosa dovrebbe cambiare in `linee.js` e in
`richiestaPerLinea()`? E il gradino "Allenatore" conterebbe nella piramide?
