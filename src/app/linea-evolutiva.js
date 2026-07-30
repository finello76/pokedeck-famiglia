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
 * Le carte si cercano prima in collezione e solo dopo nel catalogo: la stampa
 * che hai in mano è quella che vuoi vedere, non una qualsiasi.
 *
 * @module app/linea-evolutiva
 */

import { catenaEvolutiva } from '../engine/catena.js';
import { normalizzaNome } from '../engine/nomi.js';
import {
  indiceEvoluzioni,
  preEvoluzioniNonPokemon,
  cercaPerNomeGlobale,
} from '../data/dataset.js';

/**
 * Quante carte si vanno a cercare nel catalogo per una sola linea.
 *
 * Ogni nome che non possiedi costa una ricerca, e ogni ricerca può scaricare il
 * file di un set. Tre gradini più il ventaglio delle evoluzioni ci stanno
 * comodamente sotto; il tetto esiste per il caso Eevee, dove il ventaglio è di
 * trentatré.
 */
const MAX_RICERCHE = 12;

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
        const gradini = await risolviLinea(voce, griglia.voci ?? []);
        if (mio === giro) finestra.gradini = gradini;
      } catch {
        // Offline, o un set che non si scarica: la linea che si conosce
        // comunque è meglio di una finestra vuota, ma qui non ne abbiamo
        // nessuna. Si dice, invece di lasciare l'attesa che gira per sempre.
        if (mio === giro) finestra.gradini = [];
      }
    });
  }
}

/**
 * Trasforma una voce di collezione nei gradini pronti da disegnare.
 *
 * @param {object} voce la carta da cui si parte
 * @param {Array<object>} collezione le voci della vista, per sapere cosa hai
 * @returns {Promise<Array<{livello: number, oltre: number, voci: Array<object>}>>}
 */
async function risolviLinea(voce, collezione) {
  const [indice, nonPokemon] = await Promise.all([
    indiceEvoluzioni(),
    preEvoluzioniNonPokemon(),
  ]);
  // La collezione indicizzata per nome: le stampe della stessa specie sono
  // equivalenti per una linea evolutiva, quindi si tiene quella con più copie —
  // è la risposta alla domanda "quante ne ho".
  const mie = new Map();
  for (const v of collezione) {
    if (!v.carta || v.desiderata) continue;
    const chiave = normalizzaNome(v.carta.nome);
    const gia = mie.get(chiave);
    if (!gia || (v.quantita ?? 0) > (gia.quantita ?? 0)) mie.set(chiave, v);
  }

  // I nomi che possiedi servono al motore *prima* di tagliare il ventaglio:
  // un'evoluzione che hai in scatola non deve finire fra le "altre 25 non
  // mostrate".
  const { gradini } = catenaEvolutiva(voce.carta, indice, nonPokemon, {
    possedute: new Set(mie.keys()),
  });

  const corrente = `${voce.idSet}:${voce.numero}`;
  let ricerche = 0;

  return Promise.all(
    gradini.map(async (gradino) => ({
      livello: gradino.livello,
      oltre: gradino.oltre,
      voci: await Promise.all(
        gradino.nomi.map(async (nome) => {
          const mia = mie.get(normalizzaNome(nome));
          if (mia) {
            return {
              nome: mia.carta.nome,
              carta: mia.carta,
              quantita: mia.quantita ?? 0,
              nomeSet: mia.nomeSet,
              linguaSet: mia.linguaSet,
              corrente: `${mia.idSet}:${mia.numero}` === corrente,
            };
          }
          // Non ce l'hai: si va a vedere nel catalogo com'è fatta, così la
          // prossima volta che ti capita in mano la riconosci.
          const trovata = ricerche++ < MAX_RICERCHE ? await dalCatalogo(nome) : null;
          return {
            nome: trovata?.carta?.nome ?? nome,
            carta: trovata?.carta ?? null,
            quantita: 0,
            nomeSet: trovata?.set?.nome ?? '',
            linguaSet: trovata?.set?.lingua ?? null,
            corrente: false,
          };
        }),
      ),
    })),
  );
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
    const { trovate } = await cercaPerNomeGlobale(nome);
    // Si preferisce una stampa con la scansione: mezza schermata di segnaposti
    // non fa vedere niente, e la stessa specie in un altro set l'immagine ce
    // l'ha quasi sempre.
    return trovate.find((t) => t.carta?.immagine) ?? trovate[0] ?? null;
  } catch {
    return null;
  }
}
