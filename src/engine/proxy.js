/**
 * Le Energie proxy: le carte stampabili che colmano i buchi energetici.
 *
 * Uso esclusivamente domestico: sono fotocopie per giocare in famiglia con la
 * propria collezione, non sostituti di carte da procurarsi.
 *
 * **Qui ci sono le sole Energie.** Le carte Pokémon da stampare nascono nel
 * generatore, dove si scelgono le linee evolutive: quelle decisioni non si
 * possono prendere a mazzo già fatto. Le Energie sì, perché non dipendono da
 * quali Pokémon sono entrati ma solo dal tipo del mazzo.
 *
 * Le Energie base sono inoltre l'unico proxy senza tetto: sono intercambiabili
 * e prive di identità, quindi stamparle non toglie niente al "tuo" mazzo,
 * mentre un mazzo per metà di Pokémon fotocopiati non sarebbe più tuo.
 *
 * @module engine/proxy
 */

import { tipoEnergia, eEnergiaBase } from '../data/energie.js';
import { aggiungiAlMazzo, togliDalMazzo } from './mazzo.js';

/**
 * @typedef {object} Proxy
 * @property {'energia'|'pokemon'} genere
 * @property {string} nome cosa stampare
 * @property {string} [tipo] tipo elementale, per le Energie
 * @property {string} mazzo a quale mazzo appartiene
 * @property {number} quantita quante copie stampare
 * @property {string} motivo perché serve, da mostrare accanto alla carta
 */

/**
 * Energie proxy necessarie a completare i mazzi.
 *
 * Si stampano quando le Energie vere non bastano o sono del tipo sbagliato.
 * Con questa opzione attiva il motore **evita** la regola della casa
 * sull'energia universale: meglio giocare con le regole vere e qualche
 * fotocopia, che con regole alterate.
 *
 * @param {object[]} mazzi
 * @param {number} taglia
 * @returns {Proxy[]}
 */
export function proxyEnergia(mazzi, taglia) {
  const proxy = [];

  for (const mazzo of mazzi) {
    const tipo = mazzo.tipi?.[0];
    if (!tipo) continue;

    // Il tipo si riconosce con tipoEnergia(), non guardando il nome: "Energia
    // Combattimento" è di tipo Lotta, e il confronto sul nome la perderebbe.
    const energieDelTipo = mazzo.carte
      .filter((c) => eEnergiaBase(c.carta) && tipoEnergia(c.carta) === tipo)
      .reduce((s, c) => s + c.quantita, 0);

    // Un quarto del mazzo in Energie del tipo giusto è il minimo per riuscire
    // a pagare gli attacchi con regolarità.
    const necessarie = Math.round((mazzo.totale || taglia) / 4);
    const mancanti = necessarie - energieDelTipo;
    if (mancanti <= 0) continue;

    proxy.push({
      genere: 'energia',
      nome: `Energia ${tipo}`,
      tipo,
      mazzo: mazzo.nome,
      quantita: mancanti,
      motivo:
        `Il mazzo è di tipo ${tipo} ma ha solo ${energieDelTipo} Energie di quel tipo ` +
        `su ${necessarie} necessarie.`,
    });
  }

  return proxy;
}

/**
 * Tutti i proxy richiesti dalle opzioni scelte.
 *
 * Riguarda le sole Energie. **Le carte Pokémon da stampare le decide il
 * generatore**, non questo modulo: sceglie le linee evolutive sapendo già
 * quanto può stampare, e le carte mancanti entrano nel mazzo insieme a quelle
 * vere. Calcolate qui, come si faceva prima, arrivavano a mazzo ormai pieno e
 * potevano soltanto rattoppare le evoluzioni finiteci dentro per caso — che
 * era il motivo per cui i mazzi non evolvevano. Vedi `engine/linee.js`.
 *
 * @param {object} piano risultato di `pianifica()`
 * @param {object} opzioni `{taglia, proxyEnergia}`
 * @returns {{proxy: Proxy[], scartati: object[]}}
 * @example
 * const { proxy } = calcolaProxy(piano, { taglia: 15, proxyEnergia: true });
 */
export function calcolaProxy(piano, opzioni) {
  const proxy = opzioni.proxyEnergia ? proxyEnergia(piano.mazzi, opzioni.taglia) : [];
  return { proxy, scartati: [] };
}

/**
 * Inserisce i proxy calcolati nelle liste dei mazzi.
 *
 * Ogni proxy diventa una voce `{carta, quantita, proxy: true, motivo}` accanto
 * alle carte vere: la lista stampata deve mostrare il mazzo COMPLETO, con i
 * proxy riconoscibili dal contrassegno, non due elenchi separati da fondere a
 * mente.
 *
 * La taglia resta quella scelta: per ogni Energia proxy inserita se ne toglie
 * una vera del tipo sbagliato, che è la carta meno preziosa del mazzo. Se non
 * c'è niente di sacrificabile si riduce il proxy stesso: era un rimpiazzo, non
 * un'aggiunta.
 *
 * Muta i mazzi ricevuti: è l'ultimo passo della pianificazione.
 *
 * @param {object[]} mazzi
 * @param {Proxy[]} proxy risultato di `calcolaProxy()`
 * @param {number} taglia
 * @returns {void}
 */
export function integraProxy(mazzi, proxy, taglia) {
  for (const p of proxy) {
    const mazzo = mazzi.find((m) => m.nome === p.mazzo);
    if (mazzo && p.genere === 'energia') inserisciEnergia(mazzo, p, taglia);
  }
}

/**
 * Energia proxy: entra al posto delle energie del tipo sbagliato.
 * @param {object} mazzo
 * @param {Proxy} p
 * @param {number} taglia
 */
function inserisciEnergia(mazzo, p, taglia) {
  const carta = { nome: p.nome, categoria: 'Energia', tipoEnergia: 'Base', tipi: [p.tipo] };
  aggiungiAlMazzo(mazzo, carta, p.quantita, { proxy: true, motivo: p.motivo });
  const voce = mazzo.carte.find((c) => c.proxy && c.carta === carta);

  while (mazzo.totale > taglia) {
    const fuoriTipo = mazzo.carte.find(
      (c) => !c.proxy && eEnergiaBase(c.carta) && tipoEnergia(c.carta) !== p.tipo,
    );
    if (fuoriTipo) {
      togliDalMazzo(mazzo, fuoriTipo);
      continue;
    }
    // Niente più da togliere: si riduce il proxy stesso, mai le altre carte.
    // Le Energie erano un RIMPIAZZO, non un'aggiunta oltre la taglia.
    togliDalMazzo(mazzo, voce);
    if (voce.quantita <= 0) break;
  }
}

