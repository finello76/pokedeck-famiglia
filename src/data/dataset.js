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
  return set.carte.find((c) => stessoNumero(c.numero, cercato)) ?? null;
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
        trovate.push({ set: info.get(id) ?? { id, nome: set.nome }, carta });
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
