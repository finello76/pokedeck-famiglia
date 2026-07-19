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

## Aggiornare i dati delle carte

Il repository contiene già tutti i set (190 set, oltre 21.000 carte): non c'è niente da
configurare per catalogare una carta qualsiasi. Serve solo quando escono set nuovi:

```bash
node tools/scarica-set.mjs     # scarica solo quello che manca
```

Lo script è uno strumento di sviluppo: gira e il risultato viene committato.
**La PWA non ha bisogno di Node né di rete per funzionare.**

L'app non carica tutti i 6,4 MB: tiene in cache solo i set che apri davvero.

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
