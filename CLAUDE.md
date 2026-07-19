# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Cos'è

**PokéDeck Famiglia** — PWA statica per catalogare una collezione Pokémon TCG e generare
mazzi equilibrati con regole della casa derivate dalle carenze della collezione.
È anche un **progetto di apprendimento**: vedi "Materiale di studio", non è opzionale.

Lingua di lavoro: italiano (UI, docs, commenti, commit).

## Vincoli tecnici — NON NEGOZIABILI

Questi vincoli hanno la precedenza su qualunque considerazione di comodità.
In caso di dubbio **chiedere**, non introdurre strumenti.

- **Zero build, zero backend, zero npm a runtime.** Niente bundler (webpack/vite/rollup),
  niente framework (React/Angular/Vue), niente preprocessori CSS, niente Tailwind.
  Il progetto deve funzionare servendo `index.html` da un web server statico.
- **JS vanilla moderno**: ES modules nativi (`<script type="module">`), classi ES, `fetch`,
  Web Components per la UI riutilizzabile.
- **CSS moderno a mano**: custom properties, grid/flexbox, container queries dove utili.
- **Persistenza**: IndexedDB con wrapper leggero scritto a mano e documentato.
  Export/import JSON obbligatorio per spostare i dati tra dispositivi.
- **Offline**: service worker con cache di app shell + dataset.
- **Hosting GitHub Pages**: tutti i path devono funzionare da **sottocartella**
  (niente path assoluti `/...`; usare path relativi o base derivata a runtime).
- **Nessuna chiamata a servizi AI. Nessuna dipendenza a pagamento.**

Eccezione: strumenti di sviluppo non runtime (es. un web server statico locale) sono ammessi,
ma non devono diventare requisito per far girare l'app.

## Comandi

Non esiste build. Per sviluppare basta un server statico:

```bash
python3 -m http.server 8000     # poi apri http://localhost:8000
```

Il service worker richiede `http://localhost` o HTTPS: aprire `index.html` con `file://`
**non** funziona.

Aggiornare i dati delle carte (strumento di **sviluppo**, non runtime):

```bash
node tools/scarica-set.mjs           # scarica i set mancanti da TCGdex
node tools/scarica-set.mjs --forza   # riscarica tutto
```

Node è installato via **nvm** e non è nel PATH delle shell non interattive. Anteporre:

```bash
export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
```

Test del motore (da v2, runner `node --test`, nessuna dipendenza):

```bash
node --test tests/                           # tutti
node --test tests/engine/generazione.test.js # un singolo file
```

Dopo aver aggiunto un set, aggiornare **anche l'elenco `GUSCIO` in `sw.js`**: altrimenti
il set nuovo non viene precaricato e offline non esiste.

## Architettura — NIENTE MONOLITI

Separazione netta in moduli ES, **un file per responsabilità**. File corti e coesi:
oltre ~300 righe, valutare uno split.

```
src/data/     caricamento dataset, repository IndexedDB, export/import
src/engine/   analisi, generazione, bilanciamento, motore regole — PURO JS, ZERO DOM
src/ui/       Web Components (una cartella per componente: js + css)
src/app/      routing leggero, stato applicativo, service worker
docs/apprendimento/   materiale di studio
```

Regola chiave: **`src/engine/` non deve mai toccare il DOM né IndexedDB.** Riceve dati in
input, restituisce dati in output. È l'unica parte con unit test obbligatori, ed è testabile
in isolamento proprio perché è pura.

Ogni modulo pubblico documentato con **JSDoc** (parametri, ritorni, esempi d'uso).

## Dati delle carte

**Fonte: [TCGdex](https://tcgdex.dev) in italiano** (`https://api.tcgdex.net/v2/it/...`).

Scelta deliberata al posto di `PokemonTCG/pokemon-tcg-data`, che è **solo in inglese**: la
collezione fisica è in italiano, e un'app che mostra "Iron Crown" con la scansione della carta
inglese non permette di ritrovare la carta nel mazzetto — cioè fallisce proprio nel suo scopo.
TCGdex fornisce nomi, tipi, stadi, attacchi ed **effetti in italiano**, più le scansioni delle
carte italiane.

- **Includere solo i set posseduti**, da lista configurabile in `tools/set-posseduti.json` —
  non l'intero dataset, per tenere leggera la PWA.
- Identificazione carta = **codice set + numero di collezione** (es. `sv08` + `118`).
  Sono i due dati leggibili sulla carta fisica: il numero è stampato come `118/191`, dove 191
  è il totale del set. **Il totale non identifica il set**: più set condividono lo stesso totale
  (165 → sia `151` che Expedition; 189 → sia Fiamme Oscure che Lucentezza Siderale). Quando
  l'inserimento per numero+totale è ambiguo, l'app deve mostrare i candidati e far scegliere.
- Campi rilevanti TCGdex: `name`, `category` (Pokémon/Allenatore/Energia), `stage`
  (Base/Livello 1/Livello 2), `evolveFrom`, `types`, `hp`, `attacks[].cost/damage`, `retreat`,
  `image` (URL **senza estensione**: aggiungere `/low.webp` per la griglia ~14 KB,
  `/high.png` ~830 KB per la stampa dei proxy a 63×88 mm).
- **I prezzi Cardmarket in EUR sono già nella risposta TCGdex** (`pricing.cardmarket`): la v1.1
  non ha bisogno di una seconda API.

Attenzione: gli id dei set TCGdex differiscono da quelli di pokemon-tcg-data
(`sv8`→`sv08`, `me1`→`me01`, `swsh12pt5`→`swsh12.5`, `sv3pt5`→`sv03.5`).

## Roadmap

- **v1 — Catalogo** (minimale, da chiudere in fretta): inserimento per set+numero con quantità,
  vista collezione filtrabile (supertipo/tipo/fase) e ricerca per nome, **contatore energie per
  tipo** (dato critico per il motore), IndexedDB + export/import JSON, PWA installabile e responsive.
- **v1.1 — Valore economico**: prezzi via API esterna (Cardmarket EUR via pokemontcg.io, o
  alternativa gratuita). Refresh manuale, cache locale con data, **degrado con grazia** se l'API tace.
- **v2 — Wizard mazzi + regole della casa**: il cuore del progetto (vedi sotto).
- **v3 — Mini partita esplicativa**: simulazione guidata passo-passo di alcuni turni.

I prezzi NON fanno parte della v1.

## Il motore (v2) — specifica

**1. Analisi.** Per ogni carta: supertipo, fase, tipo, PS, costi degli attacchi (numero ed
elementi), danno. Ricostruzione delle linee evolutive via `evolvesFrom` (Base → Fase 1 → Fase 2).
Individuazione dei **Pokémon orfani** (evoluzioni senza pre-evoluzione in collezione).
Statistiche: energie per tipo, allenatori disponibili, tipi con più Pokémon giocabili.

**2. Generazione.** Taglia scelta dal wizard (15/20/30/60). Proporzioni TCG scalate come punto
di partenza (~⅓ Pokémon, ~⅓ energie, ~⅓ allenatori) **adattate a ciò che c'è**. Preferenza per
mazzi monotipo (max bitipo), linee evolutive complete con conteggi a piramide (es. 3 Base /
2 Fase 1 / 1 Fase 2, scalati), coerenza tra tipi dei Pokémon ed energie disponibili.
Vincoli standard: max 4 copie della stessa carta (escluse energie base), almeno un Pokémon Base
per mazzo (idealmente abbastanza da garantirlo in mano iniziale).

**3. Bilanciamento.** I mazzi si generano **insieme, non uno alla volta**. Punteggio per mazzo:
PS totali, danno medio per energia, profondità evolutiva, coerenza energetica. Ottimizzazione
iterativa (scambi di carte tra mazzi, hill-climbing) finché la differenza di punteggio scende
sotto soglia.

**4. Regole della casa.** Motore a regole = lista di coppie (condizione su collezione/mazzi →
regola con testo stampabile + motivazione). Esempi da implementare:

- Poche energie → "ogni Energia conta come Energia di qualsiasi tipo" e/o "costi degli attacchi
  ridotti di 1 (minimo 1)".
- Fase 1/2 orfane necessarie → "le Fase 1 selezionate si giocano come Pokémon Base".
- Mazzo piccolo (15/20) → mano iniziale da 5 carte, 2–3 Premi invece di 6.
- Difficoltà facile → si ignorano poteri/abilità, niente Allenatore complessi.

Il foglio stampato elenca **solo le regole attivate**, ciascuna con il perché
(es. "questa regola esiste perché la collezione ha solo 8 energie").

**5. Carte proxy stampabili — OPZIONALE, disattivata di default.** Attivabile dal wizard: se
mancano carte fondamentali (energie di un tipo, o la Base di una linea altrimenti orfana), il
motore può includerle come proxy. Preferisce **sempre** le carte reali, ricorre ai proxy solo per
lacune specifiche, con tetto configurabile (es. max 15% del mazzo).
I **proxy Energia** sono un'opzione separata e indipendente: essendo energie base non contano nel
tetto percentuale e non hanno il limite delle 4 copie; con questa opzione attiva il motore può
**evitare** di attivare le regole della casa compensative sulle energie, preferendo il gioco standard.
Output: foglio di stampa dedicato (`@media print`) con carte a **dimensione reale 63×88 mm**, in
griglia con linee di ritaglio, usando le immagini del dataset. I proxy sono chiaramente segnalati
nella lista del mazzo. Uso esclusivamente domestico/familiare.

## UI

- Stile ispirato al mondo Pokémon: colori per tipo (fuoco/acqua/erba…), card con bordi
  arrotondati, chiara e semplice.
- **Niente asset ufficiali protetti da copyright**: palette e forme *ispirate*; immagini delle
  carte solo dal dataset.
- **Mobile-first**: deve essere comoda da telefono mentre si sfogliano le carte fisiche.
- Il wizard "Crea nuovi mazzi" è una sequenza di domande, **una per schermata**.

## Materiale di studio — OBBLIGATORIO

Dopo **ogni funzionalità completata**, creare/aggiornare documenti in `docs/apprendimento/`:

- COSA è stato fatto e **PERCHÉ quella soluzione**, con riferimenti ai file del progetto.
- Approfondimento sulle tecnologie toccate man mano: classi ES e moduli, Web Components,
  IndexedDB, service worker e ciclo di vita PWA, CSS moderno (custom properties, grid,
  container queries, `@media print`).
- Formato "sessione di studio": breve teoria + il codice del progetto come esempio +
  2-3 esercizi o domande di verifica.

**Calibrazione**: lo studente conosce già JS e CSS di base e ha esperienza **Java e Angular**.
Spiegare evidenziando le differenze rispetto a quel background (es. Web Components vs componenti
Angular, moduli ES vs package Java, IndexedDB asincrono vs JDBC bloccante).

## Come lavorare

- Procedere per **step piccoli** seguendo la roadmap; **fermarsi a fine step** per revisione.
- **Prima di ogni step, proporre brevemente il piano** dello step.
- Commit piccoli e descrittivi, uno per funzionalità/step.
- Non introdurre dipendenze o strumenti di build "per comodità". In caso di dubbio, chiedere.
