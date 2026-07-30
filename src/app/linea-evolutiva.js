/**
 * Il collegamento fra il pulsante "Linea evolutiva" dei Preferiti, il motore
 * che ricostruisce la famiglia e la finestra che la mostra.
 *
 * Sta qui e non dentro il componente perché il componente non deve conoscere il
 * dataset, e non dentro `engine/` perché qui si va in rete: ricostruire la linea
 * di un Machoke vuol dire cercare Machop e Machamp **in tutto il catalogo**, e
 * quindi scaricare il file di qualche set. È lo stesso confine di
 * `caricaMancanti` in `app.js`.
 *
 * ## Prima la struttura, poi le carte
 *
 * La prima versione aspettava che tutte le carte fossero risolte e poi
 * riempiva la finestra in un colpo solo. Sulla linea di Eevee, che di
 * evoluzioni ne ha trentatré, voleva dire **nove secondi** di attesa — e
 * durante quei nove secondi i tocchi non venivano raccolti: le ricerche
 * partivano tutte insieme e ogni file di set che arriva è un `JSON.parse` da
 * qualche megabyte, cioè il thread principale fermo a tratti. Sembrava che
 * l'app si bloccasse e poi si riprendesse.
 *
 * Ora la finestra riceve **subito** la struttura — i gradini, i nomi, e le
 * carte che possiedi, che sono già in memoria — e le carte da cercare arrivano
 * **una per volta**, ognuna che rimpiazza il suo segnaposto. Il costo totale è
 * lo stesso, ma è spalmato: fra una ricerca e l'altra la pagina respira.
 *
 * @module app/linea-evolutiva
 */

import { catenaEvolutiva } from '../engine/catena.js';
import { normalizzaNome } from '../engine/nomi.js';
import {
  indiceEvoluzioni,
  indiceStadi,
  preEvoluzioniNonPokemon,
  cercaPerNomeGlobale,
} from '../data/dataset.js';

/**
 * Quante carte si vanno a cercare nel catalogo per una sola linea.
 *
 * Ogni nome che non possiedi costa una ricerca. Tre gradini più il ventaglio
 * delle evoluzioni ci stanno comodamente sotto; il tetto esiste per il caso
 * Eevee, dove il ventaglio è di trentatré.
 */
const MAX_RICERCHE = 12;

/**
 * Quanti file di set può aprire la ricerca di **una** carta della linea.
 *
 * La ricerca per nome normalmente ne apre fino a dodici, perché serve a
 * identificare una carta fisica e vuole mostrare tutte le stampe possibili. Qui
 * la domanda è un'altra — *che faccia ha questo Pokémon* — e una stampa vale
 * l'altra: aprire dodici file per scegliere la prima è tempo buttato, ed è il
 * tempo in cui la pagina non risponde.
 */
const SET_PER_CARTA = 2;

/**
 * Quanti file aprire al **secondo** tentativo, quando la prima passata non ha
 * trovato nessuna stampa con la scansione.
 *
 * Si paga solo per le specie sfortunate, e si paga una volta: la maggior parte
 * delle carte si risolve al primo colpo con due file. Sei è il numero oltre il
 * quale, sui set che non hanno scansioni per niente, si continuerebbe a pagare
 * senza trovare nulla.
 */
const SET_PER_CARTA_ALLARGATO = 6;

/**
 * Quante stampe **possedute** della stessa specie si mostrano.
 *
 * Non una sola: Lycanroc Forma Giorno e Lycanroc Forma Notte sono due carte
 * diverse che nei dati di TCGdex si chiamano tutte e due "Lycanroc" — la forma
 * non è scritta da nessuna parte. Mostrandone una, chi le possiede entrambe
 * vede sparire la sua. Il tetto serve a chi di Pikachu ha dieci stampe.
 *
 * Sono le *tue* carte: le versioni speciali della specie (`Lycanroc-ex`,
 * `Lycanroc GX`) qui non entrano — le ha già accorpate `engine/catena.js`,
 * perché una linea evolutiva è fatta di specie, non di stampe.
 */
const MAX_STAMPE_MIE = 3;

/**
 * Collega le griglie alla finestra: al `linea-richiesta` di una card risponde
 * aprendo la linea di quella carta.
 *
 * @param {Array<HTMLElement>} griglie le viste che possono chiederla
 * @param {import('../ui/linea-evolutiva/linea-evolutiva.js').LineaEvolutiva} finestra
 * @returns {void}
 */
export function avviaLineaEvolutiva(griglie, finestra) {
  // Un giro per richiesta: se si chiude e si riapre su un'altra carta mentre la
  // prima sta ancora cercando, i risultati vecchi non devono arrivare dopo e
  // riempire la finestra con la linea sbagliata.
  let giro = 0;

  for (const griglia of griglie) {
    griglia.addEventListener('linea-richiesta', async (evento) => {
      const { voce } = evento.detail;
      if (!voce?.carta) return;

      const mio = ++giro;
      finestra.apri(voce.carta.nome);
      try {
        const { gradini, daCercare } = await struttura(voce, griglia.voci ?? []);
        if (mio !== giro) return;
        finestra.gradini = gradini;

        // Una ricerca per volta, non tutte insieme: vedi l'intestazione del
        // modulo. L'ordine è quello di lettura, così la linea si riempie
        // dall'alto come ci si aspetta guardandola.
        for (const { livello, posizione, nome } of daCercare) {
          const trovata = await dalCatalogo(nome);
          if (mio !== giro) return;
          finestra.completa(livello, posizione, {
            nome: trovata?.carta?.nome ?? nome,
            carta: trovata?.carta ?? null,
            quantita: 0,
            nomeSet: trovata?.set?.nome ?? '',
            linguaSet: trovata?.set?.lingua ?? null,
            corrente: false,
          });
        }
      } catch {
        // Offline, o l'indice delle evoluzioni che non si carica: si dice,
        // invece di lasciare l'attesa che gira per sempre.
        if (mio === giro) finestra.gradini = [];
      }
    });
  }
}

/**
 * La struttura della linea, con dentro le carte che si conoscono già.
 *
 * Non va in rete: l'indice delle evoluzioni è in cache dopo il primo uso e la
 * collezione è in memoria. Quello che manca esce in `daCercare`, con la sua
 * posizione a schermo, e lo risolve il chiamante una carta per volta.
 *
 * @param {object} voce la carta da cui si parte
 * @param {Array<object>} collezione le voci della vista, per sapere cosa hai
 * @returns {Promise<{gradini: Array<object>, daCercare: Array<{livello: number, posizione: number, nome: string}>}>}
 */
async function struttura(voce, collezione) {
  const [indice, nonPokemon, stadi] = await Promise.all([
    indiceEvoluzioni(),
    preEvoluzioniNonPokemon(),
    indiceStadi(),
  ]);

  // La collezione indicizzata per nome. Le stampe dello stesso nome si tengono
  // **tutte** — sono carte diverse, anche quando il nome è lo stesso: Lycanroc
  // Forma Giorno e Forma Notte si chiamano uguale — ordinate dalla più
  // posseduta, che è la risposta più utile a "quante ne ho".
  const mie = new Map();
  for (const v of collezione) {
    if (!v.carta || v.desiderata || !(v.quantita > 0)) continue;
    const chiave = normalizzaNome(v.carta.nome);
    if (!mie.has(chiave)) mie.set(chiave, []);
    mie.get(chiave).push(v);
  }
  for (const stampe of mie.values()) stampe.sort((a, b) => b.quantita - a.quantita);

  // I nomi che possiedi servono al motore *prima* di tagliare il ventaglio:
  // un'evoluzione che hai in scatola non deve finire fra le "altre 25 non
  // mostrate".
  const { gradini } = catenaEvolutiva(voce.carta, indice, nonPokemon, {
    possedute: new Set(mie.keys()),
    // Senza, un Livello 2 che dichiara di evolvere da un Base — succede, vedi
    // Dark Crobat — comparirebbe al gradino sbagliato.
    stadi,
  });

  const corrente = `${voce.idSet}:${voce.numero}`;
  const daCercare = [];

  const pronti = gradini.map((gradino) => {
    const voci = [];
    for (const { nome, varianti } of gradino.specie) {
      const stampe = stampeMie(mie, nome, varianti).slice(0, MAX_STAMPE_MIE);
      if (stampe.length) {
        for (const mia of stampe) {
          voci.push({
            nome: mia.carta.nome,
            carta: mia.carta,
            quantita: mia.quantita ?? 0,
            nomeSet: mia.nomeSet,
            linguaSet: mia.linguaSet,
            corrente: `${mia.idSet}:${mia.numero}` === corrente,
          });
        }
        continue;
      }
      // Non ce l'hai: la si va a vedere nel catalogo, ma dopo. Per ora è un
      // posto vuoto con sopra il nome — che è già l'informazione principale.
      if (daCercare.length < MAX_RICERCHE) {
        daCercare.push({ livello: gradino.livello, posizione: voci.length, nome });
        voci.push({ nome, carta: null, quantita: 0, inCorso: true, corrente: false });
      } else {
        voci.push({ nome, carta: null, quantita: 0, corrente: false });
      }
    }
    return { livello: gradino.livello, oltre: gradino.oltre, voci };
  });

  return { gradini: pronti, daCercare };
}

/**
 * Le tue stampe di una specie.
 *
 * Prima quelle che si chiamano **esattamente** come la specie: sono le carte
 * normali, quelle che la linea vuole mostrare. Solo se non ne hai nessuna si
 * ripiega sulle versioni speciali — se di Lycanroc possiedi soltanto il GX, il
 * gradino deve dire "ce l'hai", non "non ce l'hai": la carta è tua e in una
 * linea evolutiva quel posto lo occupa lei.
 *
 * @param {Map<string, object[]>} mie collezione per nome normalizzato
 * @param {string} nome la specie
 * @param {string[]} varianti le sue versioni speciali
 * @returns {object[]}
 */
function stampeMie(mie, nome, varianti) {
  const normali = mie.get(normalizzaNome(nome)) ?? [];
  if (normali.length) return normali;
  return varianti.flatMap((variante) => mie.get(normalizzaNome(variante)) ?? []);
}

/**
 * La prima stampa del catalogo con quel nome, o `null`.
 *
 * `precedenzaEsatta` è acceso: cercando "Raichu" si vuole Raichu, non il primo
 * dei suoi omonimi lunghi (Raichu-GX, Raichu ex). I nomi che salgono dall'alto
 * arrivano normalizzati dall'indice ("raichu gx") e vanno benissimo — la
 * ricerca normalizza a sua volta prima di confrontare.
 *
 * @param {string} nome
 * @returns {Promise<{set: object, carta: object}|null>}
 */
async function dalCatalogo(nome) {
  try {
    const stretta = await conScansione(nome, SET_PER_CARTA);
    if (stretta?.carta?.immagine) return stretta;

    // Nessuna delle poche stampe guardate ha la scansione. Capita: 1.374 carte
    // su 21.264 (il 6,5%) non ce l'hanno nei dati di TCGdex, e set interi ne
    // sono privi — McDonald's, Set Base, le Gallerie Allenatori. Con un tetto
    // di due file di set si finisce dritti là dentro: la linea di Quaquaval
    // pescava il Quaxly di McDonald's 2023, che di scansioni non ne ha nemmeno
    // una. Allora si allarga, una volta sola.
    const larga = await conScansione(nome, SET_PER_CARTA_ALLARGATO);
    // Se la seconda passata non trova niente di meglio si tiene la prima: il
    // nome e il set sono comunque l'informazione principale, e il segnaposto
    // tinto dice "questa carta la foto non ce l'ha", non "errore".
    return larga?.carta?.immagine ? larga : (larga ?? stretta);
  } catch {
    return null;
  }
}

/**
 * Cerca il nome aprendo al più `maxSet` file, e restituisce la prima stampa che
 * ha una scansione — o la prima qualsiasi, se nessuna ce l'ha.
 *
 * @param {string} nome
 * @param {number} maxSet
 * @returns {Promise<{set: object, carta: object}|null>}
 */
async function conScansione(nome, maxSet) {
  const { trovate } = await cercaPerNomeGlobale(nome, null, { maxSet, maxCandidate: maxSet * 2 });
  return trovate.find((t) => t.carta?.immagine) ?? trovate[0] ?? null;
}
