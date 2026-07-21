/**
 * Accesso ai dati delle carte prodotti da `tools/scarica-set.mjs`.
 *
 * Questo modulo è l'unico punto dell'app che sa dove stanno i JSON e com'è
 * fatto il loro formato: il resto del codice chiede carte, non file.
 *
 * I set vengono caricati **pigramente** (solo quando servono davvero) e poi
 * tenuti in memoria, perché l'indice basta per la maggior parte delle schermate.
 *
 * @module data/dataset
 */

/**
 * Percorso base dei dati, calcolato a partire dall'URL di QUESTO modulo.
 *
 * È il trucco che fa funzionare l'app da una sottocartella di GitHub Pages
 * (`/PokeDeckFamiglia/`) senza configurazione: `import.meta.url` è l'URL assoluto
 * del file corrente, quindi risalendo di due livelli si ottiene la radice del
 * progetto ovunque sia stato pubblicato. Un path assoluto tipo `/data/set/` si
 * romperebbe, perché punterebbe alla radice del dominio.
 *
 * @type {URL}
 */
const BASE_DATI = new URL('../../data/set/', import.meta.url);

/** @type {Map<string, object>} set già caricati, per id */
const cacheSet = new Map();

/** @type {object|null} indice caricato una volta sola */
let cacheIndice = null;

/**
 * Indice delle evoluzioni: nome normalizzato → nome della pre-evoluzione.
 * Prodotto da `tools/genera-indice-evoluzioni.mjs`. Vedi `preEvoluzioneDi()`.
 * @type {Record<string, string>|null}
 */
let cacheEvoluzioni = null;

/** @type {Promise<void>|null} caricamento in corso, per non lanciarne due */
let caricamentoEvoluzioni = null;

/**
 * Nomi normalizzati di pre-evoluzioni che **non sono Pokémon**: i fossili.
 * Omanyte evolve da *Vecchio Helixfossile*, una carta Allenatore. Senza questo
 * elenco il motore la stampa come se fosse un Pokémon Base.
 * @type {Set<string>|null}
 */
let cacheNonPokemon = null;

/**
 * Scarica un JSON dalla cartella dei dati.
 * @param {string} nomeFile
 * @returns {Promise<any>}
 */
async function leggiJson(nomeFile) {
  const risposta = await fetch(new URL(nomeFile, BASE_DATI));
  if (!risposta.ok) {
    throw new Error(`Dati non disponibili: ${nomeFile} (HTTP ${risposta.status})`);
  }
  return risposta.json();
}

/**
 * Elenco dei set disponibili, senza le carte.
 *
 * @returns {Promise<Array<{id: string, nome: string, totale: number, carte: number}>>}
 * @example
 * const set = await elencoSet();
 * // [{ id: 'sv08', nome: 'Scintille Folgoranti', totale: 191, carte: 252 }, ...]
 */
export async function elencoSet() {
  cacheIndice ??= await leggiJson('indice.json');
  return cacheIndice.set;
}

/**
 * Carica un set completo di tutte le sue carte.
 *
 * @param {string} idSet id TCGdex, es. `'sv08'`
 * @returns {Promise<object>} set con array `carte`
 * @throws {Error} se il set non è tra quelli scaricati
 */
export async function caricaSet(idSet) {
  if (cacheSet.has(idSet)) return cacheSet.get(idSet);
  const set = await leggiJson(`${idSet}.json`);
  cacheSet.set(idSet, set);
  return set;
}

/**
 * Confronta due numeri di collezione ignorando gli zeri iniziali.
 *
 * Serve perché TCGdex li scrive con tre cifre (`'084'`) mentre chi digita sulla
 * tastiera scrive `84`, e sulla carta stampata può comparire in entrambi i modi.
 * Alcuni numeri però NON sono numerici (`'TG01'`, `'SV01'`, `'GG12'` delle
 * sottoserie): in quel caso si torna al confronto testuale, senza distinzione
 * di maiuscole.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function stessoNumero(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && a.trim() !== '' && b.trim() !== '') {
    return na === nb;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Carica l'indice delle evoluzioni, una volta sola.
 *
 * È un file piccolo (~22 KB) e sta nel guscio del service worker: a differenza
 * dei set, serve praticamente sempre.
 *
 * @returns {Promise<void>}
 */
async function assicuraEvoluzioni() {
  if (cacheEvoluzioni) return;
  // Due chiamate ravvicinate devono condividere la stessa fetch, non farne due.
  caricamentoEvoluzioni ??= fetch(new URL('../../data/evoluzioni.json', import.meta.url))
    .then((r) => (r.ok ? r.json() : {}))
    // Senza l'indice l'app funziona lo stesso, solo con più orfani: è un
    // miglioramento dei dati, non un requisito.
    .catch(() => ({}))
    .then((indice) => {
      // Il file ha due forme: quella nuova `{da, nonPokemon}` e quella vecchia,
      // una mappa piatta. La vecchia può ancora arrivare dalla cache del
      // service worker dopo un aggiornamento, e non deve rompere l'app.
      const nuovo = indice && typeof indice.da === 'object';
      cacheEvoluzioni = nuovo ? indice.da : indice ?? {};
      cacheNonPokemon = new Set((nuovo ? indice.nonPokemon ?? [] : []).map(normalizza));
    });
  await caricamentoEvoluzioni;
}

/**
 * Riduce un nome alla forma con cui si confronta.
 * Stessa regola di `engine/nomi.js`, ripetuta qui perché `src/data/` non deve
 * dipendere dal motore: il flusso dei dati va da data verso engine, non indietro.
 *
 * @param {string} nome
 * @returns {string}
 */
function normalizza(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Da quale Pokémon evolve una specie, secondo l'indice.
 *
 * @param {string} nome nome della carta
 * @returns {Promise<string|null>}
 * @example
 * await preEvoluzioneDi('Ivysaur'); // 'Bulbasaur'
 */
export async function preEvoluzioneDi(nome) {
  await assicuraEvoluzioni();
  return cacheEvoluzioni[normalizza(nome)] ?? null;
}

/**
 * L'indice completo delle evoluzioni (nome normalizzato → pre-evoluzione).
 *
 * Lo usa il motore dei proxy per risalire l'intera catena mancante. Si passa
 * al motore invece di lasciarglielo leggere: `src/engine/` non tocca la rete.
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function indiceEvoluzioni() {
  await assicuraEvoluzioni();
  return cacheEvoluzioni;
}

/**
 * I nomi di pre-evoluzione che non sono Pokémon ma carte Allenatore: i fossili.
 *
 * Il motore li usa per **non** trattarli come gradini di una linea evolutiva.
 * Omanyte non ha una Base da stampare: ha bisogno del suo fossile, che è una
 * carta di tipo diverso e un'altra meccanica di gioco.
 *
 * @returns {Promise<Set<string>>} nomi normalizzati
 */
export async function preEvoluzioniNonPokemon() {
  await assicuraEvoluzioni();
  return cacheNonPokemon ?? new Set();
}

/**
 * Completa il campo `evolveDa` di una carta usando l'indice.
 *
 * **Il 41% delle carte evoluzione non dichiara da cosa evolve**, ma è
 * un'incoerenza fra stampe: la stessa specie lo dichiara in un set e lo tace in
 * un altro. Su quelle mancanti, il 90% si recupera guardando un'altra stampa.
 *
 * Senza questo completamento il motore non collega l'Ivysaur che possiedi al
 * tuo Bulbasaur: lo tratta da orfano, lo esclude dal mazzo o lo gioca "come
 * Base", e propone di stampare una pre-evoluzione che hai già nella scatola.
 *
 * Non modifica la carta ricevuta: la cache dei set deve restare fedele al file.
 *
 * @param {object|null} carta
 * @returns {Promise<object|null>} la carta, con `evolveDa` valorizzato se si è
 *   trovato; la stessa identica carta se non c'era niente da aggiungere
 */
export async function completaEvoluzione(carta) {
  if (!carta || carta.categoria !== 'Pokémon' || carta.evolveDa) return carta;
  const preEvoluzione = await preEvoluzioneDi(carta.nome);
  return preEvoluzione ? { ...carta, evolveDa: preEvoluzione } : carta;
}

/**
 * Trova una carta da set + numero di collezione: la coppia stampata sulla carta.
 *
 * Il numero può essere scritto con o senza zeri iniziali: `84`, `'84'` e `'084'`
 * trovano tutti la stessa carta.
 *
 * @param {string} idSet es. `'sv08'`
 * @param {string|number} numero es. `118`, `'084'`, `'TG01'`
 * @returns {Promise<object|null>} la carta, o `null` se non esiste in quel set
 * @example
 * await trovaCarta('sv08', 118);  // → { nome: 'Zweilous', stadio: 'Livello 1', ... }
 * await trovaCarta('me01', 84);   // → { nome: 'Garganacl', ... }  (in JSON è '084')
 */
export async function trovaCarta(idSet, numero) {
  const set = await caricaSet(idSet);
  const cercato = String(numero);
  const trovata = set.carte.find((c) => stessoNumero(c.numero, cercato)) ?? null;
  // Il collegamento evolutivo si completa qui, all'unico punto da cui tutte le
  // carte entrano nell'app: così motore, catalogo e proxy vedono tutti lo
  // stesso dato, senza doversene ricordare ciascuno per conto proprio.
  return completaEvoluzione(trovata);
}

/**
 * Cerca una carta partendo da come è stampata sulla carta fisica: `numero/totale`
 * (es. `118/191`).
 *
 * **Il totale da solo non identifica il set**: più set hanno lo stesso numero di
 * carte (165 → sia `151` che Expedition; 189 → sia Fiamme Oscure che Lucentezza
 * Siderale). Per questo la funzione restituisce sempre un ARRAY di candidati: se
 * ne torna più di uno, tocca all'utente scegliere guardando l'illustrazione.
 *
 * @param {string|number} numero numero di collezione, es. `118`
 * @param {number} totale totale stampato dopo la barra, es. `191`
 * @returns {Promise<{trovate: Array<{set: object, carta: object}>, nonLetti: string[]}>}
 *   `trovate` sono i candidati; `nonLetti` i set che non è stato possibile
 *   leggere (tipicamente offline), da segnalare all'utente.
 * @example
 * const { trovate } = await cercaPerNumeroStampato(105, 165);
 * // trovate → [{ set: {id:'sv03.5'...}, carta: {nome:'Marowak'...} }]
 */
export async function cercaPerNumeroStampato(numero, totale) {
  const candidati = (await elencoSet()).filter((s) => s.totale === Number(totale));

  // I set si scaricano su richiesta: se manca la rete, alcuni file potrebbero
  // non essere raggiungibili. Un set irraggiungibile non deve far fallire
  // l'intera ricerca — le altre carte si trovano lo stesso — ma va segnalato,
  // altrimenti l'utente crede di non possedere una carta che invece esiste.
  const trovate = [];
  const nonLetti = [];

  const esiti = await Promise.allSettled(
    candidati.map(async (infoSet) => ({ infoSet, carta: await trovaCarta(infoSet.id, numero) })),
  );

  esiti.forEach((esito, i) => {
    if (esito.status === 'rejected') {
      nonLetti.push(candidati[i].nome);
      return;
    }
    if (esito.value.carta) trovate.push({ set: esito.value.infoSet, carta: esito.value.carta });
  });

  return { trovate, nonLetti };
}

/**
 * Cerca carte per nome.
 *
 * **Cerca solo nei set già caricati in memoria**, non in tutti i 190. Non è una
 * limitazione pigra: caricarli tutti significherebbe scaricare 6,4 MB a ogni
 * ricerca, e la ricerca per nome serve come comodità su ciò che si sta già
 * usando, non come censimento del catalogo mondiale. Per identificare una carta
 * fisica si usa `cercaPerNumeroStampato()`, che carica solo i set giusti.
 *
 * @param {string} testo anche parziale, senza distinzione di maiuscole
 * @param {string[]} [idSet] set aggiuntivi da caricare prima di cercare
 * @returns {Promise<Array<{set: object, carta: object}>>}
 */
export async function cercaPerNome(testo, idSet = []) {
  const ago = testo.trim().toLowerCase();
  if (!ago) return [];

  await Promise.all(idSet.map((id) => caricaSet(id).catch(() => null)));

  const info = new Map((await elencoSet()).map((s) => [s.id, s]));
  const trovate = [];
  for (const [id, set] of cacheSet) {
    for (const carta of set.carte) {
      if (carta.nome.toLowerCase().includes(ago)) {
        trovate.push({
          set: info.get(id) ?? { id, nome: set.nome },
          carta: await completaEvoluzione(carta),
        });
      }
    }
  }
  return trovate;
}

/**
 * Costruisce l'URL dell'immagine. TCGdex fornisce l'URL **senza estensione**:
 * la qualità la sceglie chi la mostra.
 *
 * @param {object} carta
 * @param {'griglia'|'stampa'} [uso='griglia'] `griglia` ≈ 14 KB, `stampa` ≈ 830 KB
 * @returns {string|null}
 */
export function urlImmagine(carta, uso = 'griglia') {
  if (!carta?.immagine) return null;
  return `${carta.immagine}/${uso === 'stampa' ? 'high.png' : 'low.webp'}`;
}
