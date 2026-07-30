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
 * Le serie (Sole e Luna, Scarlatto e Violetto…), dalla più vecchia alla più
 * recente.
 *
 * L'elenco lo scrive `tools/aggiorna-serie.mjs` dentro l'indice. Se manca —
 * indice vecchio ancora in cache dopo un aggiornamento — si torna un elenco
 * vuoto: chi legge deve cavarsela lo stesso, non rompersi.
 *
 * @returns {Promise<Array<{id: string, nome: string}>>}
 */
export async function elencoSerie() {
  cacheIndice ??= await leggiJson('indice.json');
  return cacheIndice.serie ?? [];
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
  set.carte = await completaRistampe(idSet, set.carte ?? []);
  set.carte = await applicaLegalita(idSet, set.carte);
  cacheSet.set(idSet, set);
  return set;
}

/** @type {Promise<{marchi: object, espansi: object}>|null} caricamento unico */
let caricamentoLegalita = null;

/**
 * Legge un valore da una mappa "dominante più eccezioni" di `legalita.json`.
 *
 * Il file comprime i set omogenei in un valore solo (`"sv09": "I"`) e scrive
 * per esteso solo le deroghe (`"sv08": { "_": "H", "252": "G" }`), dove `_` è
 * il valore di tutte le altre carte. Sono 11 KB invece di 300.
 *
 * @param {string|object|undefined} voce
 * @param {string} numero
 * @returns {any} `undefined` se il set non è nel file
 */
function valorePerCarta(voce, numero) {
  if (voce === undefined) return undefined;
  if (typeof voce !== 'object') return voce;
  return voce[numero] ?? voce._;
}

/**
 * Timbra su ogni carta il marchio di regolamentazione e l'ammissibilità in
 * Expanded, i due dati da cui `data/legalita.js` ricava il formato da torneo.
 *
 * Si fa qui e non nel modulo che li interpreta per lo stesso motivo delle
 * ristampe: al caricamento del set, una volta sola, così griglia, scheda e
 * motore vedono tutti le stesse carte senza doversi ricordare di chiamare
 * qualcosa. E si tiene fuori dai file dei set perché sono due dati che
 * cambiano — la lista dei banditi si allunga, i marchi di un set nuovo
 * arrivano dopo — mentre i 6,4 MB di `data/set/` si riscaricano una volta e
 * poi restano lì.
 *
 * `espansa` viene messo **sempre**, anche a `false`: è il campo da cui
 * `formatoDi()` capisce che la carta è passata di qui e che il silenzio sul
 * marchio significa "non ne ha", non "non lo so".
 *
 * Se il file manca (installazione a metà, cache incompleta) le carte restano
 * come sono e il filtro per formato non mostrerà niente: è un'informazione in
 * più, non un requisito per catalogare.
 *
 * @param {string} idSet
 * @param {object[]} carte
 * @returns {Promise<object[]>}
 */
async function applicaLegalita(idSet, carte) {
  caricamentoLegalita ??= leggiJson('../legalita.json').catch(() => ({}));
  const { marchi = {}, espansi = {} } = await caricamentoLegalita;
  if (!Object.keys(espansi).length) return carte;

  const marchiSet = marchi[idSet];
  const espansiSet = espansi[idSet];

  return carte.map((carta) => {
    const numero = String(carta.numero);
    return {
      ...carta,
      marchio: valorePerCarta(marchiSet, numero) ?? null,
      espansa: valorePerCarta(espansiSet, numero) === true,
    };
  });
}

/** @type {Promise<Record<string, object>>|null} caricamento unico di ristampe.json */
let caricamentoRistampe = null;

/**
 * Rimette i dati di gioco alle carte che TCGdex lascia incomplete.
 *
 * TCGdex tratta alcune stampe come ristampe e non vi replica PS e attacchi:
 * 204 Pokémon su 12.877, quasi tutti nei set Kit Allenatore — cioè proprio i
 * mazzi con cui si gioca in casa. Senza questo passaggio il costruttore mostra
 * "offesa 0" su un mazzo di Lycanroc e Raichu, e `forza()` dichiara il
 * punteggio inattendibile.
 *
 * I dati vengono da `data/ristampe.json`, prodotto da
 * `tools/completa-ristampe.mjs`. La ricerca dell'omonima si fa **lì**, una
 * volta sola: cercarla qui significherebbe scorrere tutti i set, e la PWA ne
 * carica uno per volta apposta — scaricare 6,4 MB per leggere gli attacchi di
 * una carta sarebbe l'esatto contrario di ciò per cui il dataset è diviso.
 *
 * Si applica al **caricamento del set**, non alla singola lettura: così ogni
 * consumatore — griglia, motore, costruttore — vede le stesse carte, senza
 * doversi ricordare di chiamare qualcosa.
 *
 * Se il file manca (installazione a metà, cache incompleta) le carte restano
 * come sono: è un miglioramento, non un requisito.
 *
 * @param {string} idSet
 * @param {object[]} carte
 * @returns {Promise<object[]>}
 */
async function completaRistampe(idSet, carte) {
  caricamentoRistampe ??= leggiJson('../ristampe.json')
    .then((d) => d.ristampe ?? {})
    .catch(() => ({}));
  const ristampe = await caricamentoRistampe;
  if (!Object.keys(ristampe).length) return carte;

  return carte.map((carta) => {
    const dati = ristampe[`${idSet}/${carta.numero}`];
    if (!dati) return carta;
    // I dati della carta hanno la precedenza su quelli ritrovati: lo strumento
    // riempie solo ciò che manca, e qui si rispetta lo stesso ordine.
    //
    // Gli attacchi si trattano a parte, e il criterio non è "la carta ne ha"
    // ma "ne ha di **utilizzabili**". Nei set Kit Allenatore la carta ha spesso
    // un array di attacchi pieno di voci senza nome e senza costo: presenti,
    // quindi lo spread li avrebbe tenuti, e inservibili — `forza()` misura il
    // danno per Energia spesa, e senza costo non c'è niente da misurare.
    const suoiUsabili = (carta.attacchi ?? []).some((a) => (a.costo ?? []).length);
    return {
      ...dati,
      ...carta,
      ps: carta.ps ?? dati.ps,
      attacchi: suoiUsabili ? carta.attacchi : dati.attacchi,
    };
  });
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
 * Indice dei nomi: nome normalizzato → `'idSet:numero idSet:numero …'`.
 * Prodotto da `tools/genera-indice-nomi.mjs`. Vedi `cercaPerNomeGlobale()`.
 * @type {Record<string, string>|null}
 */
let cacheNomi = null;

/** @type {Promise<void>|null} caricamento in corso, per non lanciarne due */
let caricamentoNomi = null;

/**
 * Carica l'indice dei nomi, una volta sola.
 *
 * Sta nel guscio del service worker come `evoluzioni.json`: ~250 KB, che è
 * tanto per un file solo ma è **l'alternativa a scaricare 8,6 MB di set** per
 * poter cercare un nome. Se manca, la ricerca globale non trova nulla e chi
 * chiama ripiega sul numero stampato: è un di più, non un requisito.
 *
 * @returns {Promise<void>}
 */
async function assicuraNomi() {
  if (cacheNomi) return;
  caricamentoNomi ??= fetch(new URL('../../data/nomi.json', import.meta.url))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((indice) => {
      cacheNomi = indice ?? {};
    });
  await caricamentoNomi;
}

/**
 * Quante voci dell'indice può espandere una ricerca parziale.
 *
 * Digitando "a" corrisponderebbero migliaia di nomi, e ognuno costringerebbe a
 * scaricare il file di un set: il tetto tiene la ricerca istantanea invece di
 * far scaricare mezzo catalogo a chi ha solo sfiorato la tastiera.
 */
const MAX_NOMI = 40;

/**
 * Quanti set può aprire una ricerca. È il tetto che conta davvero: ogni set è
 * un file da scaricare, e sono i megabyte, non le righe, a far aspettare.
 */
const MAX_SET = 12;

/** Quante carte può proporre una ricerca: oltre, la lista non si scorre più. */
const MAX_CANDIDATE = 60;

/**
 * Cerca una carta per **nome**, in tutti i set, non solo in quelli caricati.
 *
 * È la strada per identificare una carta fisica quando il numero stampato non
 * basta — le promo, che il totale non ce l'hanno proprio. Il nome da solo è
 * ambiguo (*Pikachu* esiste in 107 stampe), ma **nome + numero individua una
 * carta sola nel 97% dei casi**: molto meglio di numero + totale, dove i
 * candidati arrivano per pura coincidenza aritmetica fra set diversi.
 *
 * Scarica **solo** i file dei set che compaiono nell'indice per quel nome.
 *
 * @param {string} testo nome anche parziale, accenti e maiuscole indifferenti
 * @param {string|number|null} [numero] il numero di collezione, se leggibile
 * @param {object} [opzioni]
 * @param {boolean} [opzioni.precedenzaEsatta=true] se un nome che corrisponde
 *   in pieno esclude i suoi omonimi più lunghi. Va bene per **identificare**
 *   una carta in mano (chi scrive tutto "Articuno" non vuole annegare fra
 *   "Articuno ex" e "Articuno V"), va male per **cercare**: chi digita
 *   "pikachu" nella collezione vuole vedere anche i Pikachu ex.
 * @returns {Promise<{trovate: Array<{set: object, carta: object}>, nonLetti: string[], troppi: boolean}>}
 * @example
 * await cercaPerNomeGlobale('articuno ex', 32);
 * // → { trovate: [{ set: {id:'np', …}, carta: {nome:'Articuno ex', …} }], … }
 */
export async function cercaPerNomeGlobale(testo, numero = null, { precedenzaEsatta = true } = {}) {
  const ago = normalizza(testo);
  if (!ago) return { trovate: [], nonLetti: [], troppi: false };

  await assicuraNomi();

  // La corrispondenza esatta ha la precedenza: chi scrive tutto il nome non
  // deve vedersi annegare "Articuno" dentro "Articuno ex" e "Articuno V".
  const chiavi =
    precedenzaEsatta && cacheNomi[ago]
      ? [ago]
      : Object.keys(cacheNomi)
          .filter((k) => k.includes(ago))
          // Dal più corto: "Pikachu" prima di "Pikachu ex Ultra Rara", perché
          // quando i tetti tagliano è il nome pulito che serve di più.
          .sort((a, b) => a.length - b.length);

  let troppi = chiavi.length > MAX_NOMI;
  const scelte = chiavi.slice(0, MAX_NOMI);

  /** @type {Map<string, string[]>} idSet → numeri da cercarci dentro */
  const perSet = new Map();
  const cercato = numero == null || numero === '' ? null : String(numero).trim();
  let candidate = 0;

  /**
   * Se si è raccolto abbastanza e conviene fermarsi.
   *
   * Il tetto sui *nomi* da solo non basta, e la differenza si vede solo
   * provando: cercare "ar" corrisponde a 40 nomi, ma quei 40 nomi sono
   * ristampati in **147 set diversi** — cioè praticamente l'intero catalogo,
   * 8 MB, scaricati per una ricerca a due lettere. È esattamente ciò che
   * questa funzione esisteva per evitare.
   *
   * Quindi si contano anche i **set** (ogni set è un file da scaricare, il
   * costo vero) e le **carte** (ogni carta è una riga da disegnare). Chi ha
   * digitato troppo poco riceve i primi risultati e l'invito a scrivere di
   * più, invece di un'attesa di dieci secondi.
   */
  const troncare = () => {
    if (perSet.size < MAX_SET && candidate < MAX_CANDIDATE) return false;
    troppi = true;
    return true;
  };

  for (const chiave of scelte) {
    if (troncare()) break;
    for (const posizione of cacheNomi[chiave].split(' ')) {
      if (troncare()) break;
      // Si taglia sul **primo** `:` e tutto il resto è il numero: gli id dei
      // set non lo contengono mai, i numeri di collezione sì (le promo hanno
      // sigle come `SWSH033`, e non si può escludere niente a priori).
      const taglio = posizione.indexOf(':');
      const idSet = posizione.slice(0, taglio);
      const num = posizione.slice(taglio + 1);
      if (cercato !== null && !stessoNumero(num, cercato)) continue;
      if (!perSet.has(idSet)) perSet.set(idSet, []);
      perSet.get(idSet).push(num);
      candidate += 1;
    }
  }

  const info = new Map((await elencoSet()).map((s) => [s.id, s]));
  const trovate = [];
  const nonLetti = [];

  // Un set irraggiungibile — offline, mai aperto prima — non deve far fallire
  // tutta la ricerca: le altre carte si trovano lo stesso. Ma va detto, o si
  // crede di non possedere una carta che invece c'è. Il nome del set si tiene
  // qui perché l'errore di `caricaSet` non lo porta con sé.
  const esiti = await Promise.all(
    [...perSet].map(async ([idSet, numeri]) => {
      try {
        return { idSet, set: await caricaSet(idSet), numeri };
      } catch {
        return { idSet, set: null, numeri };
      }
    }),
  );

  for (const { idSet, set, numeri } of esiti) {
    if (!set) {
      nonLetti.push(info.get(idSet)?.nome ?? idSet);
      continue;
    }
    for (const numeroCarta of numeri) {
      const carta = set.carte.find((c) => String(c.numero) === numeroCarta);
      if (!carta) continue;
      trovate.push({
        set: info.get(idSet) ?? { id: idSet, nome: set.nome },
        carta: await completaEvoluzione(carta),
      });
    }
  }

  return { trovate, nonLetti, troppi };
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
