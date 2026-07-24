# Materiale di studio — le tre tecnologie del browser

Questi documenti spiegano **come funzionano**, a livello di piattaforma, le tre
tecnologie su cui poggia l'app. Non raccontano *cosa fa* PokéDeck (quello lo
dicono il codice e i commit): raccontano **il meccanismo** — il ciclo di vita, le
API, il modello di esecuzione — usando il codice del progetto solo come esempio
concreto sotto mano.

| # | Documento | La domanda a cui risponde |
|---|---|---|
| 01 | [Progressive Web App](01-pwa.md) | Come fa un sito a installarsi e a funzionare senza rete? Cos'è un *service worker* e come intercetta le richieste? |
| 02 | [IndexedDB](02-indexeddb.md) | Com'è fatto un database dentro il browser? Object store, transazioni, versioni dello schema, e perché tutto è asincrono. |
| 03 | [Web Components](03-web-components.md) | Come si costruisce un componente riutilizzabile senza framework? Custom element, Shadow DOM, ciclo di vita. |
| 04 | [Immagini che non arrivano](04-immagini-che-mancano.md) | Cosa fa il browser quando un `<img>` fallisce, a cosa serve davvero `alt`, e come si disegna un segnaposto che eredita il colore dal CSS. |
| 05 | [Dati che vengono da fuori](05-dati-da-fuori.md) | Come si aggiunge una chiamata di rete a un'app offline-first senza tradirla: `fetch` e i suoi errori silenziosi, cache in IndexedDB, migrazioni di schema. |
| 06 | [Misurare un mazzo](06-misurare-un-mazzo.md) | Come si costruisce un punteggio che significhi qualcosa: normalizzare per taglia, calibrare i tetti sui dati, distinguere «zero» da «non lo so», e l'ipergeometrica senza fattoriali. |

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
