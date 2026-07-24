/**
 * Filtro e raggruppamento della collezione: la logica, senza il DOM.
 *
 * Sta fuori dal componente perché è l'unica parte che vale la pena provare da
 * sola — decidere quali carte mostrare e come impilarle non ha niente a che
 * fare con l'HTML che poi le disegna. Funzioni pure: dentro voci, fuori voci.
 *
 * @module ui/griglia-collezione/raggruppa
 */

import { classeRarita, classiPresenti } from '../../data/rarita.js';

/** Filtri vuoti: `''` significa "tutti". */
export const FILTRI_VUOTI = {
  categoria: '',
  tipo: '',
  stadio: '',
  testo: '',
  serie: '',
  set: '',
  rarita: '',
};

/**
 * Applica i filtri correnti a una collezione.
 *
 * @param {object[]} voci voci arricchite da `elencoCompleto()`
 * @param {typeof FILTRI_VUOTI} filtri
 * @returns {object[]}
 */
export function filtra(voci, filtri) {
  const { categoria, tipo, stadio, testo, serie, set, rarita } = { ...FILTRI_VUOTI, ...filtri };
  const ago = testo.trim().toLowerCase();

  return (voci ?? []).filter((voce) => {
    // Serie e set si possono filtrare anche senza i dati della carta: sono
    // scritti sulla riga di collezione, non dentro la carta.
    if (serie && (voce.serie?.id ?? '') !== serie) return false;
    if (set && voce.idSet !== set) return false;

    const { carta } = voce;
    // Carta di un set non più scaricato: si mostra solo quando non c'è nessun
    // filtro sui suoi dati, perché di lei non si sa niente.
    if (!carta) return !categoria && !tipo && !stadio && !ago && !rarita;

    if (rarita && classeRarita(carta)?.codice !== rarita) return false;
    if (categoria && carta.categoria !== categoria) return false;
    if (tipo && !(carta.tipi ?? []).includes(tipo)) return false;
    if (stadio && carta.stadio !== stadio) return false;
    if (ago && !carta.nome.toLowerCase().includes(ago)) return false;
    return true;
  });
}

/**
 * @typedef {object} GruppoSet
 * @property {string} idSet
 * @property {string} nomeSet
 * @property {number|null} totale carte della numerazione ufficiale, se note
 * @property {number|null} ufficiali quante di quelle carte abbiamo nei dati
 * @property {object[]} voci le tue carte di quel set, filtrate
 * @property {number} distinte quante ne mostri
 * @property {number} copie quante copie in tutto
 */

/**
 * @typedef {object} GruppoSerie
 * @property {string} id
 * @property {string} nome
 * @property {GruppoSet[]} set
 * @property {number} distinte
 * @property {number} copie
 */

/**
 * Impila le voci per serie e, dentro ciascuna, per set.
 *
 * **L'ordine di arrivo si rispetta**: `elencoCompleto()` ordina già per serie
 * (dalla più vecchia), set e numero. Riordinare qui vorrebbe dire duplicare
 * quella decisione in due posti, e vederli divergere alla prima modifica.
 *
 * @param {object[]} voci già filtrate
 * @returns {GruppoSerie[]}
 * @example
 * raggruppa(voci);
 * // [{ nome: 'Scarlatto e Violetto', set: [{ nomeSet: 'Scintille Folgoranti', … }] }]
 */
export function raggruppa(voci) {
  /** @type {Map<string, GruppoSerie>} */
  const serie = new Map();

  for (const voce of voci ?? []) {
    const suaSerie = voce.serie ?? { id: 'altre', nome: 'Altre serie' };
    if (!serie.has(suaSerie.id)) {
      serie.set(suaSerie.id, { ...suaSerie, set: [], distinte: 0, copie: 0 });
    }
    const gruppoSerie = serie.get(suaSerie.id);

    let gruppoSet = gruppoSerie.set.find((s) => s.idSet === voce.idSet);
    if (!gruppoSet) {
      gruppoSet = {
        idSet: voce.idSet,
        nomeSet: voce.nomeSet ?? voce.idSet,
        totale: voce.totaleSet ?? null,
        ufficiali: voce.ufficialiSet ?? null,
        voci: [],
        distinte: 0,
        copie: 0,
      };
      gruppoSerie.set.push(gruppoSet);
    }

    gruppoSet.voci.push(voce);
    gruppoSet.distinte += 1;
    gruppoSet.copie += voce.quantita;
    gruppoSerie.distinte += 1;
    gruppoSerie.copie += voce.quantita;
  }

  return [...serie.values()];
}

/**
 * I valori distinti presenti nella collezione, per riempire i menu a tendina.
 *
 * Si leggono dalle voci **non filtrate**: un menu che perde le sue voci mano a
 * mano che filtri è un menu da cui non si torna indietro.
 *
 * @param {object[]} voci
 * @returns {{categorie: string[], tipi: string[], stadi: string[],
 *   rarita: import('../../data/rarita.js').ClasseRarita[],
 *   serie: Array<{id: string, nome: string}>,
 *   set: Array<{id: string, nome: string, anno: number|null}>}}
 */
export function valoriDisponibili(voci) {
  const categorie = new Set();
  const tipi = new Set();
  const stadi = new Set();
  const serie = new Map();
  const set = new Map();

  for (const voce of voci ?? []) {
    if (voce.serie) serie.set(voce.serie.id, voce.serie.nome);
    set.set(voce.idSet, {
      nome: voce.nomeSet ?? voce.idSet,
      uscita: voce.uscitaSet ?? null,
    });
    const { carta } = voce;
    if (!carta) continue;
    categorie.add(carta.categoria);
    for (const t of carta.tipi ?? []) tipi.add(t);
    if (carta.stadio) stadi.add(carta.stadio);
  }

  return {
    categorie: [...categorie].sort(),
    tipi: [...tipi].sort(),
    // Le rarità arrivano già ordinate dal comune al più raro: è l'ordine con
    // cui si guarda una collezione, e non è alfabetico né deducibile dal testo
    // grezzo del dataset (vedi data/rarita.js).
    rarita: classiPresenti((voci ?? []).map((v) => v.carta)),
    // Alfabetico va bene: "Base" < "Livello 1" < "Livello 2" coincide con
    // l'ordine di gioco. Se comparissero altri stadi (MEGA, VMAX) servirebbe
    // un ordinamento esplicito.
    stadi: [...stadi].sort(),
    // Le serie NON si riordinano: arrivano già in ordine di uscita.
    serie: [...serie].map(([id, nome]) => ({ id, nome })),
    // I set invece sì: nell'elenco delle voci arrivano raggruppati per serie e
    // poi in ordine alfabetico, che dentro il menu non vuol dire niente. Un
    // set si riconosce dall'epoca — "quello del 2016" — quindi si ordinano per
    // data di uscita, dal più vecchio, come i raccoglitori.
    set: [...set]
      .map(([id, { nome, uscita }]) => ({
        id,
        nome,
        anno: uscita ? Number(String(uscita).slice(0, 4)) : null,
        uscita,
      }))
      .sort(ordinePerUscita),
  };
}

/**
 * Ordina i set dal più vecchio. Quelli senza data (Energie base, dati vecchi)
 * finiscono in fondo invece che all'inizio, dove sembrerebbero antichissimi.
 *
 * @param {{nome: string, uscita: string|null}} a
 * @param {{nome: string, uscita: string|null}} b
 * @returns {number}
 */
function ordinePerUscita(a, b) {
  if (!a.uscita && !b.uscita) return a.nome.localeCompare(b.nome, 'it');
  if (!a.uscita) return 1;
  if (!b.uscita) return -1;
  return a.uscita.localeCompare(b.uscita) || a.nome.localeCompare(b.nome, 'it');
}
