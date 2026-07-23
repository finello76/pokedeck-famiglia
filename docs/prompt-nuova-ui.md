# Prompt per una nuova UI — da dare a Claude (design)

> Copia tutto ciò che sta **sotto la riga** in una nuova conversazione con Claude,
> chiedendogli di produrre uno o più mockup HTML/CSS come artifact. È scritto per
> ottenere un redesign *usabile e bello* che resti dentro i vincoli tecnici del
> progetto — così quello che disegna si può poi tradurre in codice reale senza
> buttare via nulla.

---

Sei un designer di prodotto e front-end. Voglio ridisegnare l'interfaccia di
**PokéDeck Famiglia**, una PWA che uso in famiglia per catalogare una collezione
di carte Pokémon e generare mazzi equilibrati con regole «della casa». Funziona,
ma l'aspetto è spartano e in alcuni punti poco usabile. Voglio una UI **più
usabile e più bella**, moderna e con un tocco di carattere «Pokémon» (senza usare
asset ufficiali protetti da copyright).

## Cosa deve fare l'app (le schermate)

Tre sezioni principali, oggi raggiunte da una barra in alto (Catalogo / Crea
mazzi / Regole):

1. **Catalogo** — il cuore d'uso quotidiano, si usa **col telefono in mano
   mentre si sfogliano le carte fisiche**. Contiene:
   - *Aggiungi una carta*: si digita numero + totale stampati sulla carta (es.
     `118/191`), l'app cerca e mostra la/e carta/e candidate con un pulsante per
     aggiungerne N copie. A volte i candidati sono più d'uno (numero ambiguo) e
     bisogna far scegliere.
   - *Energie base*: un semplice contatore per tipo (Erba, Fuoco, Acqua…).
   - *La collezione*: griglia di carte divise per **serie** e per **set**, con
     filtri (nome, serie, set, tipo di carta, tipo elementale, stadio) e
     un'opzione «mostra anche le carte che mi mancano». Ogni carta ha una
     miniatura, nome, set, quantità posseduta, e pulsanti +/−. Toccando una carta
     si apre a **schermo intero** (con navigazione avanti/indietro tra le carte:
     frecce e swipe).
   - *Salvataggio e trasferimento*: esporta/importa JSON (i dati vivono solo nel
     browser).

2. **Crea mazzi** — un **wizard a domande, una per schermata** (quanto semplice
   la partita, taglia del mazzo 15/20/30/60, opzioni proxy…), che poi mostra i
   mazzi generati come «carosello» di miniature, un foglio di **regole della
   casa** attivate con la relativa motivazione, e i mazzi salvati.

3. **Regole** — un regolamento consultabile durante la partita.

Elementi trasversali: intestazione con titolo, una **barra «è disponibile una
versione nuova» ** in basso, un numero di build discreto nel footer.

## Vincoli tecnici NON NEGOZIABILI (il design deve rispettarli)

Questi vincoli vengono prima dell'estetica: un mockup che li viola non è
utilizzabile.

- **Zero build, zero framework, zero dipendenze.** Niente React/Vue/Angular,
  niente Tailwind, niente preprocessori, niente CDN. Solo **HTML, CSS moderno
  scritto a mano e JavaScript vanilla**. Il CSS può usare custom properties,
  grid/flexbox, container queries, `@media (prefers-color-scheme)`.
- **La UI è fatta di Web Components** riutilizzabili (una scheda-carta, una
  griglia, un visore a schermo intero, ecc.): pensa in termini di **componenti**
  con stile incapsulato, non di una pagina monolitica.
- **Mobile-first davvero**: si usa in piedi, con una mano, mentre l'altra tiene
  le carte. Bersagli tattili generosi (≥ 44px), niente hover come unico segnale,
  attenzione alle *safe area* dei telefoni con la tacca.
- **Deve funzionare da una sottocartella** (GitHub Pages): nessun path assoluto.
- **Tema chiaro e scuro** entrambi supportati (`prefers-color-scheme`).
- **Niente immagini/font/asset esterni o protetti**: palette e forme *ispirate*
  al mondo Pokémon, non copiate. Le uniche immagini reali sono le scansioni delle
  carte, che arrivano dal dataset.
- Lingua dell'interfaccia: **italiano**.

## Sistema visivo attuale (punto di partenza, da migliorare)

Riusa e rinnova questi elementi — non ripartire da zero se un'idea già funziona:

- Palette a variabili CSS: fondo chiaro `#f4f6fb`, superficie `#ffffff`, testo
  `#1c2333`, primario blu `#2a5fd6`; versione scura coordinata. Raggi arrotondati
  (~14px), ombre morbide.
- **Colori per tipo elementale** (già definiti): Erba `#4a9d52`, Fuoco `#d8482b`,
  Acqua `#2b7fd8`, Lampo `#d6a800`, Psico `#9b4bc4`, Lotta `#b4552b`, Oscurità
  `#3d4354`, Metallo `#6b7a8d`, Fata `#d4488f`, Drago `#94812c`, Incolore
  `#8b93a7`. Ogni tipo ha una tinta piena e una tenue per lo sfondo. **Usali**:
  sono il modo naturale per rendere l'app «Pokémon» e insieme per far riconoscere
  le carte a colpo d'occhio.
- Tipografia di sistema (`system-ui`), niente web font.

## Cosa voglio da te

1. **Migliora l'usabilità concreta**, con particolare cura per:
   - la navigazione tra le tre sezioni (oggi una fila di pulsanti in alto: valuta
     una **tab bar in basso**, più comoda col pollice sul telefono);
   - il flusso «aggiungi una carta», che è l'azione più ripetuta;
   - la densità e la leggibilità della griglia della collezione;
   - il wizard di creazione mazzi.
2. **Alza il livello estetico**: un'identità visiva con carattere (che richiami
   il mondo Pokémon senza copiarlo), micro-dettagli curati (stati, vuoti,
   caricamenti), coerenza fra i componenti.
3. Consegna come **artifact HTML/CSS autoconsistente** (inline, senza risorse
   esterne), mostrando almeno: la schermata Catalogo (con la griglia e il modulo
   «aggiungi»), una carta aperta a schermo intero, e un passo del wizard. Fai
   vedere sia tema chiaro sia scuro se puoi.
4. Accanto ai mockup, elenca in breve le **decisioni di design** (perché una tab
   bar in basso, perché quella gerarchia, ecc.) così posso valutarle prima di
   tradurle in codice.

Prima di tuffarti, se qualcosa è ambiguo **fammi 2–3 domande** mirate (per es.
sul tono — giocoso per bambini vs. pulito e adulto — o su quanto spingere sulle
illustrazioni delle carte). Poi procedi.
