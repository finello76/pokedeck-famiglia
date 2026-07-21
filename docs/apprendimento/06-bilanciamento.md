# Sessione 06 — Pareggiare due mazzi: misurare, poi correggere

> Il punto 3 della specifica del motore ("i mazzi si generano insieme… finché la
> differenza di punteggio scende sotto soglia") era rimasto sulla carta. Questa
> sessione lo implementa, e mostra perché *quando* si corregge conta più di
> *come*.

---

## 0. I file toccati

| File | Cos'è cambiato |
|---|---|
| [`src/engine/bilancia.js`](../../src/engine/bilancia.js) | **nuovo** — punteggio di un mazzo e riequilibrio per linee |
| [`src/engine/generazione.js`](../../src/engine/generazione.js) | sceglie tipi che sanno evolvere; a ogni giro sceglie per primo il mazzo più debole |
| [`src/app/vista-mazzi.js`](../../src/app/vista-mazzi.js) | mostra la forza dei mazzi e il pulsante "Riequilibra" |
| [`tests/bilancia.test.js`](../../tests/bilancia.test.js) | 8 test |

---

## 1. Il sintomo, e la causa che non era dove sembrava

Uno screenshot dall'uso vero: **Mazzo 1** con due linee complete fino al Livello 2
(Nacli → Naclstack → Garganacl, Mankey → Primeape → Annihilape), **Mazzo 2** con
nove Pokémon Base sciolti. Non una partita: un'esecuzione.

Contando le linee costruibili per tipo, la causa salta fuori subito:

```
Lotta 7 · Lampo 4 · Psico 3 · Oscurità 3 · Acqua 2 · Metallo 1 · Fuoco 1 · Erba 0
```

**Erba ha zero linee**: sette Pokémon e nessuna evoluzione. Un mazzo Erba non è
sfortunato, è condannato prima di cominciare — e la correzione della sessione
precedente, che aveva reso *casuale* la scelta del tipo per dare varietà, aveva
reso possibile pescare proprio quel tipo.

> **Lezione trasferibile.** Ogni grado di libertà che aggiungi va vincolato dove
> il dominio lo richiede. "Scegli a caso fra opzioni quasi equivalenti" presuppone
> che siano davvero equivalenti: qui non lo erano, e nessuno l'aveva verificato.

## 2. Tre correzioni, in ordine di quanto hanno risolto

### a) Non assegnare a un mazzo un tipo che non può evolvere

```js
const evolvono = (c) => !lineePerTipo || (lineePerTipo.get(c.tipo) ?? 0) > 0;
const primaScelta = utilizzabili.filter(evolvono);
const ripiego = utilizzabili.filter((c) => !evolvono(c));
```

I tipi senza linee restano un ripiego, usato solo se i primi sono finiti. Da solo,
questo elimina il caso peggiore.

### b) Sceglie per primo il mazzo messo peggio

Il draft alternava i mazzi a ogni giro. Sembra equo, e non lo è: una linea da tre
gradini vale molto più di una da due, quindi alternare le *scelte* non alterna il
*valore*. La versione che funziona rimisura a ogni giro:

```js
const ordine = [...mazzi].sort(
  (a, b) => punteggioMazzo(a).totale - punteggioMazzo(b).totale,
);
```

È il cambiamento che ha spostato di più: su dieci generazioni di prova la
differenza media è passata da ~25 punti a ~8 nei mazzi da 20 carte.

### c) Solo alla fine, spostare linee intere

Il riequilibrio vero e proprio ([`bilancia()`](../../src/engine/bilancia.js)) è
l'ultima risorsa, non la prima. Ed è così che deve essere: **correggere durante la
costruzione costa una riga, correggere dopo costa un modulo.**

---

## 3. Il punteggio

Segue la specifica: PS totali, danno **per energia** (non assoluto: 120 danni che
ne costano quattro valgono meno di 40 che ne costa una), profondità evolutiva,
coerenza energetica.

Un dettaglio che vale più dei pesi:

```js
const haLaSua = c.carta.evolveDa && presenti.has(normalizzaNome(c.carta.evolveDa));
return somma + (haLaSua ? livello * c.quantita : 0);
```

Un Livello 2 **senza la sua linea nel mazzo** non conta come evoluzione: è una
carta morta in mano, non una carta forte. Senza questa condizione il
bilanciamento avrebbe inseguito un valore inesistente, considerando forte un
mazzo pieno di evoluzioni ingiocabili.

## 4. Tre bug istruttivi, tutti sulla stessa idea sbagliata

Il riequilibrio prova uno spostamento, misura, e se non migliora **annulla**. Il
codice per annullare ha prodotto tre difetti in fila.

### L'annullamento che distruggeva l'identità

```js
// sbagliato
function copiaMazzo(mazzo) { return mazzo.carte.map((c) => ({ ...c })); }
```

Ripristinando con dei *cloni*, le linee candidate — calcolate prima e contenenti
riferimenti alle voci originali — puntavano a oggetti non più nel mazzo. Alla
prova successiva `carte.indexOf(voce)` tornava `-1`, e `splice(-1, 1)` toglie
allegramente **l'ultima carta**. Un annullamento che corrompe lo stato è peggio
di nessun annullamento.

```js
// giusto: si annotano i riferimenti, si ripristinano le quantità
return mazzo.carte.map((voce) => ({ voce, quantita: voce.quantita }));
```

### I tronconi di linea

`enumeraLinee()` produce una linea per ogni carta posseduta: con Machop, Machoke e
Machamp nel mazzo escono anche i tronconi (Machop→Machoke). Spostare un troncone
**spezza la linea**: Machamp resta di qua senza più nulla sotto. Si tiene solo la
linea più profonda per famiglia, più una difesa: una linea contenuta in un'altra
non è una linea.

### Le energie a senso unico

Con la linea devono viaggiare le Energie del suo tipo, o il mazzo che la riceve
non la alimenta. Ma spostarle e basta cambiava la **taglia** dei mazzi (12 contro
5, in un test). Si scambiano a coppie: una di là, una di qua.

> **Lezione trasferibile.** "Prova e annulla" sembra semplice e non lo è: è uno
> snapshot, e uno snapshot sbagliato è una fonte di corruzione silenziosa. Se il
> tuo undo copia oggetti che qualcun altro sta ancora referenziando, non hai un
> undo.

## 5. La soglia relativa

Prima: `differenza > 25`. Ma un mazzo da 60 carte vale il triplo di uno da 15, e
25 punti pesano in modo del tutto diverso nei due casi — i mazzi grandi
risultavano sempre squilibrati, i piccoli mai.

```js
return Math.max(SOGLIA_SQUILIBRIO, Math.round(media * QUOTA_TOLLERATA));
```

Percentuale del punteggio medio, con un pavimento assoluto perché su numeri
piccoli una percentuale segnalerebbe qualche punto di PS.

## 6. Il test che è cambiato quando è cambiata la policy

Il primo test diceva: *"cede la linea meno profonda"*. Poi la policy è passata a
"prova tutte le linee e tieni quella che pareggia di più", e il test è fallito —
pur essendo il comportamento nuovo migliore di quello vecchio.

La riscrittura non ha cambiato il numero atteso: ha cambiato **cosa si verifica**.

```js
for (const voce of m.carte) {
  if (!voce.carta.evolveDa) continue;
  assert.ok(presenti.has(voce.carta.evolveDa),
    `${m.nome}: ${voce.carta.nome} è rimasto senza ${voce.carta.evolveDa}`);
}
```

Non "quale linea si sposta" — decisione che può cambiare ancora — ma
**l'invariante che vale sempre**: nessuna linea esce spezzata. I test che
fissano decisioni si rompono a ogni miglioria; quelli che fissano invarianti
sopravvivono.

## 7. Perché il riequilibrio a mano è un pulsante e non un automatismo

Dopo una sostituzione manuale l'app rimisura l'equilibrio e, se serve, **offre**
il pulsante "Riequilibra i mazzi". Non lo fa da sola: se hai appena scelto tu una
carta, il motore non deve spostartela altrove senza chiedere. L'automatismo è
giusto quando le decisioni sono sue, non quando sono tue.

---

## 8. Esercizi

**1. La misura dopo l'arricchimento.** Le carte da stampare arrivano dal motore
col solo nome: PS e attacchi glieli dà il livello applicativo cercandole nel
dataset. Perché allora `vista-mazzi.js` ricalcola `equilibrio` **dopo**
`arricchisciProxy()`? Cosa misurava, prima? (Suggerimento: un mazzo per metà
stampato.)

**2. Lo scambio che il motore rifiuta.** Con una sola linea evolutiva in tutto il
piano, `bilancia()` non fa nulla — e il test lo verifica. Perché spostarla
sarebbe inutile? Scrivi la disuguaglianza fra i punteggi che lo dimostra.

**3. Il tetto agli scambi.** `passiMassimi = 4` e `giaSpostate` impediscono a una
linea di andare e tornare. Prova a togliere `giaSpostate` e fai girare la
generazione su una collezione vera: quante volte si muove la stessa linea? Perché
ogni viaggio *migliorava* leggermente il punteggio pur non migliorando i mazzi?

**4. Domanda di verifica.** `punteggioMazzo()` restituisce le voci separate
(`ps`, `danno`, `evoluzione`, `coerenza`) e non solo il totale. A cosa serve, se
il confronto usa solo `totale`?
