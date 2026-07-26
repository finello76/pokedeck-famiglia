/**
 * Ritrovare i dati di gioco delle ristampe.
 *
 * TCGdex tratta alcune stampe come ristampe e non vi replica PS e attacchi:
 * 204 Pokémon su 12.877 (1,6%), quasi tutti nei set Kit Allenatore — `tk-xy-b`
 * non ne ha nemmeno uno completo. Sono proprio le carte con cui si gioca in
 * casa, quindi il buco non è marginale: senza attacchi il motore non sa
 * misurare quelle carte e il costruttore di mazzi mostra "offesa 0".
 *
 * Quelle carte però esistono complete altrove nel dataset, e si ritrovano per
 * nome. Questo modulo è la logica condivisa fra i due strumenti che ne hanno
 * bisogno — `completa-ristampe.mjs` e `genera-mazzi-prefatti.mjs` — perché due
 * implementazioni della stessa ricerca divergono alla prima correzione.
 *
 * Modulo di SVILUPPO: non finisce mai nella PWA.
 *
 * @module tools/lib/ristampe
 */

/** Toglie accenti e maiuscole, per confrontare "Raichu di Alola" con "raichu di alola". */
export const normalizza = (testo) =>
  String(testo ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/**
 * Se una carta ha abbastanza dati per essere misurata da `engine/forza.js`.
 *
 * Il costo dell'attacco conta quanto il danno: `forza()` misura il danno **per
 * Energia spesa**, e un attacco senza costo non è misurabile — trattarlo come
 * costo 1 gonfierebbe la resa di due o tre volte proprio sulle carte di cui non
 * sappiamo nulla.
 *
 * @param {object} carta
 * @returns {boolean}
 */
export const misurabile = (carta) =>
  carta.categoria !== 'Pokémon' ||
  Boolean(carta.ps && (carta.attacchi ?? []).some((a) => (a.costo ?? []).length));

/**
 * Trova i dati di gioco di una carta cercandone un'omonima completa.
 *
 * Due accortezze che non sono dettagli:
 *
 * 1. si raccolgono **tutte** le omonime e si preferisce quella con gli stessi
 *    PS. Fermarsi alla prima sbagliava: il Lycanroc del Kit ha 110 PS, il promo
 *    `smp/SM105` trovato per primo ne ha 120 — stesso nome, stampa diversa, e
 *    quindi anche attacchi diversi;
 * 2. i dati della carta originale hanno la **precedenza**: si riempie solo ciò
 *    che manca. Sovrascrivere i PS faceva risultare il Lycanroc del Kit più
 *    robusto di quanto è stampato sulla carta che hai in mano.
 *
 * Le candidate vanno passate **tutte insieme**, non un set per volta. Non è un
 * dettaglio di comodità: la preferenza per i PS uguali deve valere sull'intero
 * dataset. Cercando set per set e fermandosi al primo che contiene un omonimo,
 * il Lycanroc del Kit ricadeva di nuovo sul promo `smp/SM105` da 120 PS solo
 * perché quel set viene prima di `sm3`, dove sta la stampa giusta da 110.
 *
 * @param {object} carta la carta incompleta
 * @param {Array<{carta: object, idSet: string}>} candidate tutte le carte in cui
 *   cercare, nell'ordine di preferenza (stessa serie prima, poi il resto)
 * @returns {{ps: number, attacchi: object[], ritirata?: number, stadio?: string,
 *   evolveDa?: string, tipi?: string[], datiDa: string, approssimati?: boolean}|null}
 *   `null` se non si è trovato niente
 */
export function ritrovaDati(carta, candidate) {
  const nome = normalizza(carta.nome);
  const omonime = candidate.filter((c) => normalizza(c.carta.nome) === nome && misurabile(c.carta));
  if (!omonime.length) return null;

  const stessiPs = omonime.find((o) => carta.ps && o.carta.ps === carta.ps);
  const scelta = stessiPs ?? omonime[0];
  const g = scelta.carta;

  return {
    ps: carta.ps ?? g.ps,
    attacchi: g.attacchi,
    ...(carta.ritirata == null && g.ritirata != null ? { ritirata: g.ritirata } : {}),
    ...(carta.stadio == null && g.stadio != null ? { stadio: g.stadio } : {}),
    ...(carta.evolveDa == null && g.evolveDa != null ? { evolveDa: g.evolveDa } : {}),
    ...(!carta.tipi?.length && g.tipi?.length ? { tipi: g.tipi } : {}),
    // Da dove vengono i dati: senza, fra un anno nessuno saprebbe dire se
    // questo Golbat è quello giusto.
    datiDa: `${scelta.idSet}/${g.numero}`,
    // Quando nemmeno i PS coincidono, gli attacchi sono un'approssimazione
    // presa da un'altra stampa. Va dichiarato nel dato, non lasciato intuire.
    ...(stessiPs ? {} : { approssimati: true }),
  };
}

/**
 * L'ordine in cui cercare i set: prima quelli della stessa serie della carta,
 * dal più vicino nel tempo, poi tutti gli altri.
 *
 * Un Kit di Sole e Luna ristampa carte di Sole e Luna, e cercare lì per primo
 * evita di pescare un omonimo di vent'anni prima con un altro attacco.
 *
 * @param {string} idSet set della carta incompleta
 * @param {object} indice contenuto di `data/set/indice.json`
 * @returns {string[]} id dei set, in ordine di preferenza
 */
export function setDoveCercare(idSet, indice) {
  // I Kit stanno in una serie tutta loro (`tk`), quindi la serie di
  // riferimento si deduce dal prefisso dell'id: `tk-sm-l` → `sm`.
  const suo = indice.set.find((s) => s.id === idSet);
  const serie = idSet.startsWith('tk-') ? idSet.split('-')[1] : suo?.serie?.id;
  const perData = (a, b) => String(a.uscita).localeCompare(String(b.uscita));

  const stessaEpoca = indice.set.filter((s) => s.serie?.id === serie && s.id !== idSet);
  const resto = indice.set.filter(
    (s) => s.serie?.id !== serie && s.serie?.id !== 'tk' && s.id !== idSet,
  );
  return [...stessaEpoca.sort(perData), ...resto.sort(perData)].map((s) => s.id);
}
