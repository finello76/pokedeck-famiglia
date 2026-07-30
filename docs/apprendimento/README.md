# Materiale di studio

Questi documenti spiegano **come funzionano** le cose su cui poggia l'app: le
tre tecnologie del browser (01-03), e poi i meccanismi di programmazione che il
progetto ha incontrato strada facendo (04 in poi). Non raccontano *cosa fa* PokéDeck
(quello lo dicono il codice e i commit): raccontano **il meccanismo** — il ciclo
di vita, le API, il modello di esecuzione, l'algoritmo — usando il codice del
progetto solo come esempio concreto sotto mano.

| # | Documento | La domanda a cui risponde |
|---|---|---|
| 01 | [Progressive Web App](01-pwa.md) | Come fa un sito a installarsi e a funzionare senza rete? Cos'è un *service worker* e come intercetta le richieste? |
| 02 | [IndexedDB](02-indexeddb.md) | Com'è fatto un database dentro il browser? Object store, transazioni, versioni dello schema, e perché tutto è asincrono. |
| 03 | [Web Components](03-web-components.md) | Come si costruisce un componente riutilizzabile senza framework? Custom element, Shadow DOM, ciclo di vita. |
| 04 | [Immagini che non arrivano](04-immagini-che-mancano.md) | Cosa fa il browser quando un `<img>` fallisce, a cosa serve davvero `alt`, e come si disegna un segnaposto che eredita il colore dal CSS. |
| 05 | [Dati che vengono da fuori](05-dati-da-fuori.md) | Come si aggiunge una chiamata di rete a un'app offline-first senza tradirla: `fetch` e i suoi errori silenziosi, cache in IndexedDB, migrazioni di schema. |
| 06 | [Misurare un mazzo](06-misurare-un-mazzo.md) | Come si costruisce un punteggio che significhi qualcosa: normalizzare per taglia, calibrare i tetti sui dati, distinguere «zero» da «non lo so», e l'ipergeometrica senza fattoriali. |
| 08 | [Persistere oggetti](08-persistere-oggetti.md) | Perché un oggetto salvato non torna indietro uguale? Forma su disco e forma in memoria, `null` contro assente, e una `Promise` che aspetta un evento che non arriva. |
| 09 | [La salita di collina](09-salita-di-collina.md) | Come si risolve un problema senza formula? Funzione obiettivo, vicinato, massimi locali — e perché l'algoritmo ottimizza esattamente le stupidaggini che misuri. |
| 10 | [Riunire due rami](10-riunire-due-rami.md) | Cosa succede quando due linee di lavoro costruiscono la stessa cosa due volte? Conflitti che Git non segnala, versioni di schema omonime, e perché un test verde può proteggere un difetto. |
| 11 | [L'oggetto incompleto](11-oggetti-incompleti.md) | Se tre punti del codice costruiscono "un mazzo", chi garantisce che sia la stessa cosa? Invarianti senza classi, campi derivabili e non, e perché i test si fabbricano input troppo gentili. |
| 12 | [Regola o dato?](12-regole-o-dati.md) | Della stessa informazione, quale metà si calcola e quale si scarica? Dati che scadono, liste arbitrarie che non si indovinano, e le otto richieste al posto di ventunomila. |
| 13 | [Stati, rotte e il tasto Indietro](13-stati-e-rotte.md) | Dove si tiene lo stato di una schermata che mostra tre cose diverse? Routing a frammento con parametri, delega degli eventi per elementi che non esistono ancora, `<details>` come fisarmonica nativa — e perché la stampa richiede JavaScript oltre al CSS. |
| 14 | [Una lingua che manca](14-una-lingua-che-manca.md) | La fonte non ha i dati che ti servono, ma li ha in un'altra lingua. Quali campi *sembrano* testo e in realtà sono chiavi, perché tradurli è obbligatorio e tradurre gli altri sarebbe falso — e una carta che ha fermato ottanta set di download. |
| 15 | [Un indice per cercare](15-un-indice-per-cercare.md) | Cercare fra 21.000 carte senza scaricarle tutte. Quando conviene un indice e quanto può pesare, perché un tetto sui risultati non basta se il costo sta altrove, perché scrivere meno lettere trovava meno carte, e un accoppiamento fra due file che nessun compilatore sorveglia. |
| 16 | [Caricare quando serve](16-caricare-quando-serve.md) | Un interruttore che bloccava la pagina, e i tre costi diversi dietro il blocco. `IntersectionObserver` invece di `scroll`, una fila fatta con una promessa, e perché `requestAnimationFrame` era la scelta sbagliata. |
| 17 | [Due simboli, un solo angolo](17-due-simboli-uno-spazio.md) | Due funzioni chiedono lo stesso simbolo e lo stesso angolo della card. Quando due stati vogliono un campo solo e quando ne vogliono due, il campo che sparisce a ogni riscrittura del record, un `<button>` dentro un `<button>`, e una vista che è la stessa griglia con un filtro fisso. Piu': il comando che mentiva — un `+` che aggiungeva alla collezione carte che non hai — e perche' un flag booleano dentro un evento e' spesso un evento mascherato. |
| 18 | [Un indice al contrario](18-un-indice-al-contrario.md) | Hai una mappa figlio → genitore e ti serve genitore → figli. Cosa cambia fra le due direzioni, cosa fai quando la risposta è trentatré, e come si taglia un elenco senza mentire. Più: aprire una finestra prima di sapere cosa metterci, e due piedi diversi per la stessa card. |

## Per chi è scritto

Si dà per scontato che tu conosca **JavaScript e CSS di base**: qui non si
spiegano `const`, le classi, il box model. Si dà per scontata anche esperienza
di **Java** e **Angular**, e si usa proprio quel bagaglio come pietra di
paragone — perché il punto più interessante di queste tecnologie è quasi sempre
*in cosa differiscono* da come le stesse cose si fanno lì:

- il service worker è un proxy che gira nel browser — più vicino a un *filtro
  servlet* che a qualunque cosa di Angular;
- IndexedDB è transazionale come JDBC, ma **asincrono** e **auto-committante**,
  e questo ribalta abitudini radicate;
- un Web Component ha un ciclo di vita simile a un componente Angular, ma
  **senza change detection**: se non ti ridisegni a mano, non si ridisegna
  nessuno.

## Come leggerli

Ogni documento è una **sessione di studio**: prima il meccanismo in astratto,
poi lo stesso meccanismo nel codice del progetto (`sw.js`, `src/data/deposito.js`,
`src/ui/…`), infine qualche domanda di verifica. Si possono leggere in
qualunque ordine, ma 01 → 02 → 03 è la progressione pensata.
