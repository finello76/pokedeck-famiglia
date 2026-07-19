# PokéDeck Famiglia

PWA per catalogare una collezione Pokémon TCG e generare mazzi equilibrati con regole
della casa, pensata per giocare in famiglia con carte spaiate.

**Stato: v1 in costruzione** — al momento c'è il guscio della PWA e la ricerca di una
carta per numero stampato.

## Provarla

Serve un web server: con `file://` il service worker non parte.

```bash
python3 -m http.server 8000
# poi apri http://localhost:8000
```

## Aggiungere un set alla collezione

1. Trova l'id del set su <https://api.tcgdex.net/v2/it/sets> (sono in italiano).
2. Aggiungilo a `tools/set-posseduti.json`.
3. Rilancia lo scaricamento e aggiorna l'elenco in `sw.js`:

```bash
node tools/scarica-set.mjs
```

Lo script è uno strumento di sviluppo: gira una volta e il risultato viene committato.
**La PWA non ha bisogno di Node né di rete per funzionare.**

## Scelte di fondo

- Nessun build, nessun bundler, nessuna dipendenza a runtime: solo moduli ES nativi,
  Web Components e CSS moderno.
- Dati delle carte da [TCGdex](https://tcgdex.dev) **in italiano**, perché la collezione
  fisica è italiana e i nomi inglesi rendono impossibile ritrovare le carte.
- Tutti i percorsi sono relativi: l'app funziona anche da una sottocartella di GitHub Pages.

Il dettaglio è in [CLAUDE.md](CLAUDE.md); le spiegazioni passo passo in
[`docs/apprendimento/`](docs/apprendimento/).

## Licenza e uso

Progetto personale a uso domestico. Le immagini delle carte provengono da TCGdex e
restano dei rispettivi titolari; nessun asset ufficiale è incluso nel repository.
