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
