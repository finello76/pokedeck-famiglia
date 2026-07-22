# Sessione 08 — La collezione rispetto al riferimento

> Aggiungere una dimensione ai dati che già hai, e la differenza fra mostrare
> quello che possiedi e mostrare quello che ti manca. Tecnologie: dipendenze
> iniettate nei Web Components, `<progress>`, container query.

---

## 0. I file toccati

| File | Cos'è cambiato |
|---|---|
| [`tools/aggiorna-serie.mjs`](../../tools/aggiorna-serie.mjs) | **nuovo** — scrive la serie di ogni set nell'indice |
| [`src/data/completamento.js`](../../src/data/completamento.js) | **nuovo** — quante ne hai su quante ne esistono |
| [`src/ui/griglia-collezione/raggruppa.js`](../../src/ui/griglia-collezione/raggruppa.js) | **nuovo** — filtro e raggruppamento, senza DOM |
| [`src/ui/griglia-collezione/griglia-collezione.js`](../../src/ui/griglia-collezione/griglia-collezione.js) | serie → set, completamento, carte mancanti |
| [`src/data/collezione.js`](../../src/data/collezione.js) | ogni voce porta con sé la sua serie |
| [`tests/raggruppa.test.js`](../../tests/raggruppa.test.js) | 8 test |

---

## 1. Il dato che non c'era

La richiesta — *«voglio la collezione divisa per Sole e Luna, Scarlatto e
Violetto…»* — sembra una questione di presentazione. Non lo era: **la serie non
esisteva nei dati**.

```js
{"id":"sv08","nome":"Scintille Folgoranti","totale":191,"carte":252}
```

Prima di scrivere una riga di interfaccia, tre strade:

1. **Dedurla dagli id** (`sv08` → `sv`). Funziona quasi sempre, e "quasi" è il
   problema: `me01`, `swsh12.5`, `2024sv` non seguono la regola.
2. **Dedurla dall'URL delle immagini** (`.../it/sv/sv08/001`). Preciso, ma 16
   set su 110 non hanno immagini — e i nomi italiani nell'URL non ci sono.
3. **Chiederlo all'API**, una volta sola, e scriverlo nell'indice.

La terza, perché il progetto ha già questa forma: gli strumenti di sviluppo
producono i dati, la PWA li legge e non chiama mai la rete. Diciotto richieste
in fase di build contro zero a runtime.

> **Lezione trasferibile.** Quando manca un dato, la domanda giusta non è "come
> lo indovino?" ma "dove sta davvero, e quando posso permettermi di chiederlo?".
> Un'euristica al 95% costa più della richiesta che la eviterebbe.

## 2. Il denominatore giusto

"Ho 12 carte di Scintille Folgoranti" non dice niente. "12 su 191" dice tutto.
Ma **quale** 191?

```
totaleUfficiale: 191   ← quello stampato sulla carta: 118/191
totaleConSegrete: 252  ← quello che il set contiene davvero
```

Col secondo, il completamento non arriverebbe al 100% nemmeno comprando il set
intero in negozio: le segrete sono per definizione fuori dalla numerazione. Il
riferimento è quello ufficiale, e le carte oltre il totale si mostrano se le hai
ma non si contano fra le mancanti.

```js
export function eNumerazioneUfficiale(carta, totaleUfficiale) {
  const n = Number(carta?.numero);
  return Number.isFinite(n) && n >= 1 && n <= totaleUfficiale;
}
```

`Number.isFinite` non è pignoleria: i numeri di collezione non sono tutti numeri
(`TG01`, `SV01`, `GG12` delle sottoserie). `Number('TG01')` è `NaN`, e senza
quel controllo `NaN <= 191` sarebbe `false` per caso, non per scelta.

## 3. La dipendenza iniettata in un Web Component

La griglia deve poter mostrare le carte che **non** hai. Quelle non sono nella
collezione: stanno nel dataset. Ma il componente non conosce il dataset — è
l'unico motivo per cui si può provare senza rete né database.

```js
/** @type {(idSet: string) => Promise<object[]>} */
caricaMancanti = async () => [];
```

Chi lo usa gliela passa:

```js
griglia.caricaMancanti = (idSet) => carteMancanti(idSet, voci);
```

Chi viene da Angular riconosce il `provide` di un servizio, senza contenitore:
il componente dichiara *cosa* gli serve, non *chi* glielo dà. Il valore di
default (`async () => []`) fa sì che senza iniezione il componente funzioni lo
stesso, mostrando solo le carte possedute.

E il caricamento non blocca niente:

```js
this.caricaMancanti(set.idSet).then((mancanti) => {
  if (!griglia.isConnected) return;   // filtro cambiato: il risultato non serve più
  griglia.append(...);
});
```

Quel controllo su `isConnected` è la versione manuale di ciò che in Angular fa
`takeUntilDestroyed`: una risposta che arriva per una schermata che non esiste
più va buttata, non applicata.

## 4. La logica fuori dal componente

`raggruppa.js` contiene tre funzioni pure — `filtra`, `raggruppa`,
`valoriDisponibili` — e nessun riferimento al DOM. Non è simmetria estetica:
sono le uniche decisioni del componente che valga la pena provare, e provarle
richiederebbe un browser se stessero dentro la classe.

Una regola che vale la pena aver scritto:

```js
// I menu si riempiono dalle voci NON filtrate: un menu che perde le sue voci
// mano a mano che filtri è un menu da cui non si torna indietro.
```

E un'altra, sull'ordine:

```js
// L'ordine di arrivo si rispetta: `elencoCompleto()` ordina già per serie
// (dalla più vecchia). Riordinare qui duplicherebbe quella decisione in due
// posti, e li vedresti divergere alla prima modifica.
```

Ordinare le serie per nome metterebbe "Sole e Luna" prima di "Spada e Scudo":
alfabeticamente giusto, storicamente assurdo.

## 5. Mostrare un'assenza

Le carte mancanti sono nella stessa griglia delle tue, distinte solo dallo
stile:

```css
.cella.mancante-in-set scheda-carta {
  opacity: 0.4;
  filter: grayscale(0.85);
}
```

Due scelte deliberate:

- **niente `×0`** sulla scheda. Zero copie non è una quantità: è una carta che
  non hai, e "×0" accanto al nome sembra un errore invece di un'informazione;
- **solo il pulsante `+`** sulle mancanti. Il `−` toglierebbe copie da una carta
  che non possiedi: un comando che non può funzionare non va mostrato disattivo,
  va tolto.

Il ciclo si chiude da sé: tocchi `+` su una carta grigia, quella entra in
collezione, il contatore passa da 3/94 a 4/94 e la carta smette di essere
grigia. Catalogare guardando cosa manca è molto più veloce che cercare il numero
sul retro di ogni bustina.

---

## 6. Esercizi

**1. Il set che non hai mai aperto.** Oggi compaiono solo i set di cui possiedi
almeno una carta. Come mostreresti anche gli altri senza sommergere la pagina di
110 sezioni vuote? (Suggerimento: cosa vuole vedere chi ha appena comprato una
bustina di un set nuovo?)

**2. Il costo del confronto.** Attivando "mostra le carte che mi mancano" con
tutti i filtri azzerati, quanti file di set vengono scaricati? Guarda la scheda
Rete degli strumenti per sviluppatori e stima quanti megabyte. Come lo
limiteresti — e a quale prezzo per chi lo usa?

**3. Domanda di verifica.** `conteggiaPerSet()` normalizza i numeri con
`String(Number(v.numero) || v.numero)`. Cosa succede a `'001'`? E a `'TG01'`?
Perché serve quel `|| v.numero`?

**4. Una scelta da rifare.** Il completamento usa il totale ufficiale, quindi
possedere una segreta non fa mai salire la percentuale. Un collezionista
protesterebbe. Come mostreresti entrambe le cose — completamento del set e carte
extra — senza confondere?
