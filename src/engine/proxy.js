/**
 * Decide quali carte proxy servono per rendere giocabili i mazzi.
 *
 * Uso esclusivamente domestico: sono fotocopie per giocare in famiglia con la
 * propria collezione, non sostituti di carte da procurarsi.
 *
 * Il motore decide **cosa** stampare e perché; non sa nulla di immagini né di
 * come verrà disegnato. La ricerca delle illustrazioni la fa il livello
 * applicativo, che ha accesso al dataset.
 *
 * Due principi:
 *
 * 1. **Le carte vere vengono sempre prima.** I proxy colmano un buco preciso,
 *    non sostituiscono ciò che si possiede.
 * 2. **I proxy Pokémon sono limitati**, quelli Energia no. Un mazzo fatto per
 *    metà di fotocopie non è più il tuo mazzo; le Energie base invece sono
 *    intercambiabili e prive di identità, quindi stamparle non toglie nulla.
 *
 * @module engine/proxy
 */

import { classifica, SCALA } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { tipoEnergia, eEnergiaBase } from '../data/energie.js';

/**
 * Quota massima di proxy Pokémon rispetto alla taglia del mazzo.
 * Configurabile, come da specifica.
 */
export const QUOTA_PROXY_POKEMON = 0.15;

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
 * Risale l'intera catena delle pre-evoluzioni mancanti a un orfano.
 *
 * Un Livello 2 orfano non ha bisogno di UNA carta ma di DUE: il Livello 1 e la
 * Base. Stampare solo l'anello immediato lascia il proxy a sua volta orfano —
 * si stampa una carta che resta ingiocabile. Con l'indice delle evoluzioni si
 * risale fino alla Base, o fin dove i nomi sono noti.
 *
 * @param {string} manca nome della pre-evoluzione immediata (dalla carenza)
 * @param {Record<string, string>} indiceEvoluzioni nome normalizzato → da cosa evolve
 * @returns {string[]} i nomi da stampare, dal più evoluto alla Base
 */
function catenaMancante(manca, indiceEvoluzioni) {
  const catena = [];
  let corrente = manca;
  const visti = new Set();
  // Tetto di sicurezza: nessuna linea supera i tre stadi, ma l'indice è un dato
  // esterno e un ciclo (A←B, B←A) manderebbe il loop all'infinito.
  while (corrente && catena.length < 3) {
    const chiave = normalizzaNome(corrente);
    if (visti.has(chiave)) break;
    visti.add(chiave);
    catena.push(corrente);
    corrente = indiceEvoluzioni?.[chiave] ?? null;
  }
  return catena;
}

/**
 * Pre-evoluzioni proxy necessarie a completare le linee evolutive.
 *
 * Alternativa alla regola "le evoluzioni si giocano come Base": invece di
 * cambiare le regole si stampa la carta mancante, e si gioca normalmente. Con
 * l'indice delle evoluzioni si stampa l'INTERA catena fino alla Base, non solo
 * il primo anello, altrimenti il proxy resterebbe a sua volta orfano.
 *
 * @param {object[]} mazzi
 * @param {object[]} carenze
 * @param {number} taglia
 * @param {Record<string, string>} [indiceEvoluzioni] nome→pre-evoluzione, per
 *   risalire la catena oltre l'anello immediato
 * @returns {{proxy: Proxy[], scartati: object[]}} `scartati` sono le carte che
 *   avrebbero avuto bisogno di un proxy ma eccedono la quota
 */
export function proxyPokemon(mazzi, carenze, taglia, indiceEvoluzioni = {}) {
  const proxy = [];
  const scartati = [];
  const tetto = Math.max(1, Math.floor(taglia * QUOTA_PROXY_POKEMON));

  for (const mazzo of mazzi) {
    const orfani = carenze
      .filter((c) => c.codice === 'orfani-nel-mazzo' && c.mazzo === mazzo.nome)
      .flatMap((c) => c.dati.orfani);

    // Nomi già nel mazzo: se una pre-evoluzione della catena è già lì, non la si
    // ristampa. Cresce man mano, così due orfani della stessa linea non
    // producono doppioni.
    const presenti = new Set(mazzo.carte.map((c) => normalizzaNome(c.carta.nome)));
    let usati = 0;

    for (const orfano of orfani) {
      // Senza il nome della pre-evoluzione non si può stampare nulla.
      if (!orfano.manca) {
        scartati.push({ ...orfano, mazzo: mazzo.nome, ragione: 'pre-evoluzione sconosciuta' });
        continue;
      }

      const catena = catenaMancante(orfano.manca, indiceEvoluzioni).filter(
        (nome) => !presenti.has(normalizzaNome(nome)),
      );
      if (!catena.length) continue; // tutto già presente o già stampato

      // La catena si stampa intera o niente: mezzo proxy non rende giocabile
      // l'orfano, occuperebbe solo la quota.
      if (usati + catena.length > tetto) {
        scartati.push({ ...orfano, mazzo: mazzo.nome, ragione: 'quota proxy superata' });
        continue;
      }

      catena.forEach((nome, i) => {
        const perChi = i === 0 ? orfano.nome : catena[i - 1];
        proxy.push({
          genere: 'pokemon',
          nome,
          // La pre-evoluzione del proxy stesso, presa dall'indice: serve a
          // inserisciPokemon per costruire una carta con `evolveDa`, così la
          // lista non la contrassegna come "come Base" quando la sua Base è
          // anch'essa nel mazzo (magari come proxy).
          evolveDa: indiceEvoluzioni?.[normalizzaNome(nome)] ?? null,
          mazzo: mazzo.nome,
          quantita: 1,
          motivo: `Serve per giocare ${perChi}${i === 0 && orfano.stadio ? ` (${orfano.stadio})` : ''}.`,
        });
        presenti.add(normalizzaNome(nome));
        usati += 1;
      });
    }
  }

  return { proxy, scartati };
}

/**
 * Tutti i proxy richiesti dalle opzioni scelte.
 *
 * @param {object} piano risultato di `pianifica()`
 * @param {object} opzioni `{taglia, proxyEnergia, proxyPokemon, indiceEvoluzioni}`
 * @returns {{proxy: Proxy[], scartati: object[]}}
 * @example
 * const { proxy } = calcolaProxy(piano, { taglia: 15, proxyEnergia: true });
 */
export function calcolaProxy(piano, opzioni) {
  const proxy = [];
  let scartati = [];

  if (opzioni.proxyEnergia) {
    proxy.push(...proxyEnergia(piano.mazzi, opzioni.taglia));
  }
  if (opzioni.proxyPokemon) {
    const esito = proxyPokemon(
      piano.mazzi,
      piano.carenze,
      opzioni.taglia,
      opzioni.indiceEvoluzioni,
    );
    proxy.push(...esito.proxy);
    scartati = esito.scartati;
  }

  return { proxy, scartati };
}

/**
 * Inserisce i proxy calcolati nelle liste dei mazzi.
 *
 * Ogni proxy diventa una voce `{carta, quantita, proxy: true, motivo}` accanto
 * alle carte vere: la lista stampata deve mostrare il mazzo COMPLETO, con i
 * proxy riconoscibili dal contrassegno, non due elenchi separati da fondere a
 * mente.
 *
 * La taglia resta quella scelta: per ogni copia proxy inserita se ne toglie
 * una vera, scegliendo la meno preziosa (energie del tipo sbagliato per i
 * proxy Energia; doppioni di Allenatori o di Base per i proxy Pokémon). Se non
 * c'è niente di sacrificabile il mazzo resta corto com'era, e il proxy riempie
 * il buco.
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
    if (!mazzo) continue;
    if (p.genere === 'energia') inserisciEnergia(mazzo, p, taglia);
    else inserisciPokemon(mazzo, p, taglia);
  }
}

/**
 * Toglie una copia da una voce del mazzo, eliminando la voce se si svuota.
 * @param {object} mazzo
 * @param {object} voce
 * @param {'pokemon'|'energie'|'allenatori'} categoria
 */
function togliCopia(mazzo, voce, categoria) {
  voce.quantita -= 1;
  mazzo.totale -= 1;
  mazzo.composizione[categoria] -= 1;
  if (voce.quantita <= 0) {
    mazzo.carte.splice(mazzo.carte.indexOf(voce), 1);
  }
}

/**
 * Energia proxy: entra al posto delle energie del tipo sbagliato.
 * @param {object} mazzo
 * @param {Proxy} p
 * @param {number} taglia
 */
function inserisciEnergia(mazzo, p, taglia) {
  const voce = {
    carta: { nome: p.nome, categoria: 'Energia', tipoEnergia: 'Base', tipi: [p.tipo] },
    quantita: p.quantita,
    proxy: true,
    motivo: p.motivo,
  };
  mazzo.carte.push(voce);
  mazzo.totale += p.quantita;
  mazzo.composizione.energie += p.quantita;

  while (mazzo.totale > taglia) {
    const fuoriTipo = mazzo.carte.find(
      (c) => !c.proxy && eEnergiaBase(c.carta) && tipoEnergia(c.carta) !== p.tipo,
    );
    if (fuoriTipo) {
      togliCopia(mazzo, fuoriTipo, 'energie');
      continue;
    }
    // Niente più da togliere: si riduce il proxy stesso, mai le altre carte.
    // Le Energie erano un RIMPIAZZO, non un'aggiunta oltre la taglia.
    togliCopia(mazzo, voce, 'energie');
    if (voce.quantita <= 0) break;
  }
}

/**
 * Pre-evoluzione proxy: entra al posto del doppione meno prezioso.
 * @param {object} mazzo
 * @param {Proxy} p
 * @param {number} taglia
 */
function inserisciPokemon(mazzo, p, taglia) {
  // L'evoluzione che il proxy serve: da lei si copiano tipo e stadio
  // precedente, che il motore altrimenti non conoscerebbe (del proxy si sa
  // solo il nome, letto da `evolveDa`).
  const evoluzione = mazzo.carte.find(
    (c) => normalizzaNome(c.carta.evolveDa) === normalizzaNome(p.nome),
  )?.carta;
  const livelloPre = Math.max(0, (classifica(evoluzione ?? {}).livello ?? 1) - 1);

  mazzo.carte.push({
    carta: {
      nome: p.nome,
      categoria: 'Pokémon',
      stadio: SCALA[livelloPre],
      tipi: evoluzione?.tipi ?? [],
      // Se noto (proxy di catena), così la carta non risulta a sua volta
      // orfana quando la sua pre-evoluzione è anch'essa nel mazzo.
      evolveDa: p.evolveDa ?? null,
    },
    quantita: p.quantita,
    proxy: true,
    motivo: p.motivo,
  });
  mazzo.totale += p.quantita;
  mazzo.composizione.pokemon += p.quantita;

  // I nomi da cui evolve qualcosa nel mazzo: le loro copie non si toccano,
  // toglierle spezzerebbe una linea per ripararne un'altra.
  const preEvoluzioni = new Set(
    mazzo.carte.map((c) => normalizzaNome(c.carta.evolveDa)).filter(Boolean),
  );

  while (mazzo.totale > taglia) {
    const doppioneAllenatore = mazzo.carte
      .filter((c) => !c.proxy && c.carta.categoria === 'Allenatore' && c.quantita >= 2)
      .sort((a, b) => b.quantita - a.quantita)[0];
    if (doppioneAllenatore) {
      togliCopia(mazzo, doppioneAllenatore, 'allenatori');
      continue;
    }
    const doppioneBase = mazzo.carte
      .filter(
        (c) =>
          !c.proxy &&
          classifica(c.carta).livello === 0 &&
          c.quantita >= 2 &&
          !preEvoluzioni.has(normalizzaNome(c.carta.nome)),
      )
      .sort((a, b) => b.quantita - a.quantita)[0];
    if (doppioneBase) {
      togliCopia(mazzo, doppioneBase, 'pokemon');
      continue;
    }
    const energiaInEccesso =
      mazzo.composizione.energie > Math.round(taglia / 4)
        ? mazzo.carte.find((c) => !c.proxy && c.carta.categoria === 'Energia')
        : null;
    if (energiaInEccesso) {
      togliCopia(mazzo, energiaInEccesso, 'energie');
      continue;
    }
    // Nessun doppione sacrificabile: meglio un mazzo di una carta più lungo
    // che una linea evolutiva rotta.
    break;
  }
}

/**
 * Se una carta del mazzo sarebbe resa superflua da un proxy già previsto.
 * Usata per non contrassegnare come "deroga" ciò che il proxy ha risolto.
 *
 * @param {object} carta
 * @param {Proxy[]} proxy
 * @returns {boolean}
 */
export function risoltaDaProxy(carta, proxy) {
  if (!carta?.evolveDa) return false;
  const cercato = normalizzaNome(carta.evolveDa);
  return proxy.some((p) => p.genere === 'pokemon' && normalizzaNome(p.nome) === cercato);
}

/**
 * Se una carta ha bisogno di proxy per essere giocata.
 * @param {object} carta
 * @returns {boolean}
 */
export function eEvoluzione(carta) {
  return (classifica(carta).livello ?? 0) > 0;
}
