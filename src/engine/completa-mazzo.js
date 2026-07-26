/**
 * Completare e correggere un mazzo costruito a mano.
 *
 * `mazzo-manuale.js` dice **cosa non va**; questo modulo lo aggiusta. Sono
 * separati perché diagnosticare è sicuro e correggere no: la correzione tocca
 * le scelte di chi sta costruendo, e va chiesta.
 *
 * Le regole di riempimento sono le stesse del generatore, applicate però a un
 * mazzo che esiste già: prima si tappano i buchi che rendono il mazzo
 * ingiocabile (nessun Base, nessuna Energia utile), poi si riempie lo spazio
 * rimasto con ciò che rende il mazzo migliore. Non si tocca mai una carta che
 * c'è già, tranne quando viola il limite delle 4 copie.
 *
 * Modulo puro: riceve il mazzo e le copie disponibili, restituisce **mosse**.
 * Non muta niente — è chi lo chiama a decidere se applicarle, ed è ciò che
 * permette di mostrarle prima all'utente.
 *
 * @module engine/completa-mazzo
 */

import { classifica, eBase } from './stadi.js';
import { normalizzaNome } from './nomi.js';
import { eEnergiaBase, tipoEnergia } from '../data/energie.js';
import { MAX_COPIE } from './formati.js';
import { minimoBasi, composizione } from './proporzioni.js';
import { fabbisogno, tipiRichiesti, tipiPresenti, costoMedioAttacchi } from './fabbisogno.js';
import { copieAncoraDisponibili } from './mazzo-manuale.js';

/**
 * @typedef {object} Mossa
 * @property {'aggiungi'|'togli'} verso
 * @property {object} carta
 * @property {number} quante
 * @property {string} motivo frase leggibile: va mostrata, non solo applicata
 */

/** Chiave di una carta: set più numero, come in tutto il resto dell'app. */
const chiave = (carta) => `${carta?.idSet}/${carta?.numero}`;

/**
 * Quante copie di una carta sono nel mazzo.
 * @param {object} mazzo
 * @param {object} carta
 * @returns {number}
 */
const nelMazzo = (mazzo, carta) =>
  (mazzo?.carte ?? [])
    .filter((v) => chiave(v.carta) === chiave(carta))
    .reduce((s, v) => s + v.quantita, 0);

/**
 * Quanto una carta serve al mazzo, adesso.
 *
 * Non è la forza della carta in astratto: è quanto **manca** al mazzo. Un
 * Pokémon Base vale molto in un mazzo che non ne ha, e poco in uno che ne ha
 * dieci — ed è la ragione per cui questo punteggio si ricalcola a ogni carta
 * aggiunta invece di ordinare una volta sola all'inizio.
 *
 * @param {object} carta
 * @param {object} mazzo lo stato corrente
 * @param {object} bisogni `{ basiMancanti, tipiScoperti, quotaEnergie, quotaAllenatori }`
 * @returns {number}
 */
function utilita(carta, mazzo, bisogni) {
  const { basiMancanti, tipiScoperti, spazioEnergie, spazioAllenatori, sbloccano } = bisogni;
  let p = 0;

  // Carta che rende giocabile un'evoluzione già scelta: vale più di qualunque
  // altra cosa, perché non aggiunge una carta buona — ne **resuscita una
  // morta**. Senza questa regola, mettere un Livello 2 nel mazzo e premere
  // "Completa" riempiva il mazzo di Base più forti e lasciava il Livello 2
  // orfano: due carte che restano in mano tutta la partita.
  if (sbloccano?.has(normalizzaNome(carta.nome))) p += 260;

  if (carta.categoria === 'Energia') {
    if (spazioEnergie <= 0) return -100;
    const tipo = tipoEnergia(carta);
    // Un'Energia di un tipo che nessuna carta chiede è una carta morta: vale
    // meno di niente, perché occupa uno slot che serviva ad altro.
    if (eEnergiaBase(carta)) p += tipiScoperti.has(tipo) ? 120 : tipo ? 40 : 5;
    else p += 10;
    return p;
  }

  if (carta.categoria === 'Allenatore') {
    return spazioAllenatori > 0 ? 45 : -50;
  }

  // --- Pokémon ---
  const livello = classifica(carta).livello;
  if (livello === null) return -100; // stadio esotico: fuori dai mazzi di casa

  // Senza Base non si comincia la partita: finché ne mancano, valgono più di
  // qualunque altra cosa.
  if (eBase(carta) && basiMancanti > 0) p += 200;

  // Un'evoluzione senza la sua pre-evoluzione nel mazzo è una carta che resta
  // in mano: si prende solo se non c'è altro.
  const copieDi = (nome) =>
    (mazzo.carte ?? [])
      .filter((v) => normalizzaNome(v.carta.nome) === normalizzaNome(nome))
      .reduce((s, v) => s + v.quantita, 0);

  if (livello > 0) {
    const sotto = copieDi(carta.evolveDa);
    if (!sotto) p -= 80;
    else {
      p += 90 * livello;
      // Una piramide, non una torre rovesciata: le copie di un'evoluzione non
      // devono superare quelle della carta da cui evolve. Senza questo freno il
      // completamento produceva 4 Machoke e 1 Machop — tre Machoke che non
      // entrano mai in gioco, cioè tre carte morte comprate con lo sconto di
      // sembrare forti.
      if (sotto <= copieDi(carta.nome)) p -= 150;
    }
  }

  // Alimentabile con le Energie che il mazzo ha o avrà.
  const richiesti = tipiRichiesti(carta);
  if (richiesti.length && !richiesti.some((t) => tipiScoperti.has(t) || tipiScoperti.size === 0)) {
    p -= 40;
  }

  p += Math.min(25, (carta.ps ?? 0) / 8);
  const resa = Math.max(
    0,
    ...(carta.attacchi ?? [])
      .filter((a) => (a.costo ?? []).length)
      .map((a) => (Number(String(a.danno).match(/\d+/)?.[0]) || 0) / a.costo.length),
  );
  p += Math.min(30, resa / 2);
  return p;
}

/**
 * I nomi delle carte che servono a rendere giocabile un'evoluzione già scelta.
 *
 * Sono le pre-evoluzioni **immediate** delle carte orfane del mazzo, non
 * l'intera catena: chiamandola a ogni giro la catena si percorre da sola, un
 * gradino per volta, e non serve conoscerla in anticipo. È anche l'unico modo
 * corretto quando la stessa carta compare in linee diverse.
 *
 * @param {object} mazzo
 * @returns {Set<string>} nomi normalizzati
 */
function daSbloccare(mazzo) {
  const copie = new Map();
  for (const voce of mazzo.carte ?? []) {
    const k = normalizzaNome(voce.carta.nome);
    copie.set(k, (copie.get(k) ?? 0) + voce.quantita);
  }

  const mancano = new Set();
  for (const voce of mazzo.carte ?? []) {
    if ((classifica(voce.carta).livello ?? 0) === 0) continue;
    const serve = normalizzaNome(voce.carta.evolveDa);
    if (!serve) continue;
    // Non basta che la pre-evoluzione ci sia: dev'essercene **almeno quante**
    // sono le copie che ci stanno sopra. Due Machamp su un solo Machoke sono
    // un Machamp che non entra mai in gioco, ed è lo stesso difetto della
    // carta orfana, solo più difficile da vedere.
    if ((copie.get(serve) ?? 0) < voce.quantita) mancano.add(serve);
  }
  return mancano;
}

/**
 * Le carte che si possono ancora prendere, con quante copie.
 *
 * @param {object} mazzo
 * @param {Array<{carta: object, quantita: number}>} disponibili collezione
 * @returns {Array<{carta: object, ancora: number}>}
 */
function scorte(mazzo, disponibili) {
  return (disponibili ?? [])
    .map(({ carta, quantita }) => ({
      carta,
      ancora: copieAncoraDisponibili(carta, quantita, nelMazzo(mazzo, carta)),
    }))
    .filter((s) => s.ancora > 0);
}

/**
 * Riempie un mazzo fino alla taglia scelta, con le carte che hai.
 *
 * Non muta il mazzo: restituisce le mosse. Chi le riceve può mostrarle,
 * applicarle in blocco o scartarle.
 *
 * @param {object} mazzo con `carte: [{carta, quantita}]`
 * @param {Array<{carta: object, quantita: number}>} disponibili la collezione,
 *   con le quantità **totali** possedute: le copie già nel mazzo si scalano qui
 * @param {object} opzioni
 * @param {number} opzioni.taglia
 * @returns {{mosse: Mossa[], mancanti: number}} `mancanti` è quanto resta
 *   scoperto quando la collezione non basta
 * @example
 * const { mosse } = completa(mazzo, collezione, { taglia: 30 });
 */
export function completa(mazzo, disponibili, { taglia }) {
  const mosse = [];
  // Si lavora su una copia: il mazzo di chi chiama non si tocca finché non
  // decide lui.
  const lavoro = {
    ...mazzo,
    carte: (mazzo?.carte ?? []).map((v) => ({ ...v })),
  };
  const totale = () => lavoro.carte.reduce((s, v) => s + v.quantita, 0);

  // Stesso criterio del generatore: quante Energie servono lo decide il costo
  // degli attacchi delle carte con cui si sta costruendo, non una quota fissa.
  const conta = (categoria) =>
    (disponibili ?? [])
      .filter((v) => v.carta?.categoria === categoria)
      .reduce((s, v) => s + v.quantita, 0);
  const quota = composizione(
    taglia,
    {
      pokemon: conta('Pokémon'),
      energie: conta('Energia'),
      allenatori: conta('Allenatore'),
    },
    { costoMedio: costoMedioAttacchi(disponibili) },
  );

  // Fino a `taglia` giri: ogni giro aggiunge una carta, quindi non può servirne
  // di più. Il tetto è una rete di sicurezza contro un bug, non un limite atteso.
  for (let giro = 0; giro < taglia && totale() < taglia; giro++) {
    const dentro = {
      pokemon: lavoro.carte
        .filter((v) => v.carta.categoria === 'Pokémon')
        .reduce((s, v) => s + v.quantita, 0),
      energie: lavoro.carte
        .filter((v) => v.carta.categoria === 'Energia')
        .reduce((s, v) => s + v.quantita, 0),
      allenatori: lavoro.carte
        .filter((v) => v.carta.categoria === 'Allenatore')
        .reduce((s, v) => s + v.quantita, 0),
    };
    const bisogni = {
      basiMancanti:
        minimoBasi(taglia) -
        lavoro.carte.filter((v) => eBase(v.carta)).reduce((s, v) => s + v.quantita, 0),
      // I tipi che le carte già scelte chiedono: le Energie si aggiungono per
      // quelli, non per il tipo dichiarato del mazzo.
      tipiScoperti: new Set(Object.keys(fabbisogno(lavoro))),
      // I nomi che mancano per rendere giocabili le evoluzioni già nel mazzo.
      // Si ricalcola a ogni giro, e questo lo fa **scendere lungo la catena**:
      // messo Machamp serve Machoke; aggiunto Machoke serve Machop.
      sbloccano: daSbloccare(lavoro),
      spazioEnergie: quota.energie - dentro.energie,
      spazioAllenatori: quota.allenatori - dentro.allenatori,
    };

    let migliore = null;
    for (const { carta, ancora } of scorte(lavoro, disponibili)) {
      const punteggio = utilita(carta, lavoro, bisogni);
      if (punteggio <= 0) continue;
      if (!migliore || punteggio > migliore.punteggio) migliore = { carta, ancora, punteggio };
    }
    // Niente di utile fra ciò che resta: meglio un mazzo corto, che l'avviso
    // segnala, che un mazzo pieno di carte inservibili.
    if (!migliore) break;

    const voce = lavoro.carte.find((v) => chiave(v.carta) === chiave(migliore.carta));
    if (voce) voce.quantita += 1;
    else lavoro.carte.push({ carta: migliore.carta, quantita: 1 });

    const gia = mosse.find((m) => chiave(m.carta) === chiave(migliore.carta));
    if (gia) gia.quante += 1;
    else {
      mosse.push({
        verso: 'aggiungi',
        carta: migliore.carta,
        quante: 1,
        motivo: motivoPer(migliore.carta, bisogni),
      });
    }
  }

  return { mosse, mancanti: Math.max(0, taglia - totale()) };
}

/**
 * Perché una carta è stata scelta, in una frase.
 *
 * Serve a rendere la funzione **verificabile**: un pulsante che riempie il
 * mazzo senza dire cosa ha fatto e perché è magia, e la magia non insegna
 * niente a chi sta imparando a costruire mazzi.
 *
 * @param {object} carta
 * @param {object} bisogni
 * @returns {string}
 */
function motivoPer(carta, bisogni) {
  if (carta.categoria === 'Energia') {
    const tipo = tipoEnergia(carta);
    return bisogni.tipiScoperti.has(tipo)
      ? `Serve Energia ${tipo}: ci sono carte che attaccano solo con quella.`
      : 'Completa le Energie del mazzo.';
  }
  if (carta.categoria === 'Allenatore') return 'Riempie la quota di carte Allenatore.';
  if (eBase(carta) && bisogni.basiMancanti > 0) {
    return 'Pokémon Base: senza abbastanza Base la partita non parte.';
  }
  if (classifica(carta).livello > 0) return `Completa la linea evolutiva di ${carta.evolveDa}.`;
  return 'Fra le carte rimaste è quella che rende di più.';
}

/**
 * Corregge i difetti **bloccanti** di un mazzo: quelli che lo rendono
 * ingiocabile secondo il regolamento.
 *
 * Non tocca gli avvisi minori (poche Base, evoluzioni orfane): quelli sono
 * scelte discutibili ma legittime, e correggerle d'ufficio vorrebbe dire
 * riscrivere il mazzo di qualcun altro.
 *
 * @param {object} mazzo
 * @param {Array<{carta: object, quantita: number}>} disponibili
 * @param {object} opzioni
 * @param {number} opzioni.taglia
 * @returns {{mosse: Mossa[]}}
 */
export function correggi(mazzo, disponibili, { taglia }) {
  const mosse = [];
  const lavoro = { ...mazzo, carte: (mazzo?.carte ?? []).map((v) => ({ ...v })) };

  // 1. Copie oltre il limite: si tagliano a 4. Le Energie base sono esenti.
  for (const voce of lavoro.carte) {
    if (eEnergiaBase(voce.carta) || voce.quantita <= MAX_COPIE) continue;
    const troppe = voce.quantita - MAX_COPIE;
    voce.quantita = MAX_COPIE;
    mosse.push({
      verso: 'togli',
      carta: voce.carta,
      quante: troppe,
      motivo: `Il regolamento consente al massimo ${MAX_COPIE} copie della stessa carta.`,
    });
  }

  // 2. Carte di troppo rispetto alla taglia: si tolgono partendo da quelle che
  //    servono meno — Energie che nessuno usa, poi Allenatori in eccesso.
  //    Mai i Pokémon Base, che sono ciò che fa partire la partita.
  let eccesso = lavoro.carte.reduce((s, v) => s + v.quantita, 0) - taglia;
  if (eccesso > 0) {
    const presenti = tipiPresenti(lavoro);
    const chiesti = new Set(Object.keys(fabbisogno(lavoro)));
    const sacrificabili = lavoro.carte
      .filter((v) => !eBase(v.carta))
      .sort((a, b) => valoreDaTogliere(a, chiesti) - valoreDaTogliere(b, chiesti));

    for (const voce of sacrificabili) {
      if (eccesso <= 0) break;
      const quante = Math.min(voce.quantita, eccesso);
      voce.quantita -= quante;
      eccesso -= quante;
      mosse.push({
        verso: 'togli',
        carta: voce.carta,
        quante,
        motivo: `Il mazzo deve avere ${taglia} carte: questa è fra quelle che servono meno.`,
      });
    }
    void presenti;
  }

  // 3. Quel che manca — Base, Energie utili, carte per arrivare alla taglia —
  //    lo mette `completa()`, che sa già farlo e con gli stessi criteri.
  lavoro.carte = lavoro.carte.filter((v) => v.quantita > 0);
  const { mosse: aggiunte } = completa(lavoro, disponibili, { taglia });

  return { mosse: [...mosse, ...aggiunte] };
}

/**
 * Quanto vale tenere una carta, quando bisogna toglierne. Più basso = si toglie
 * prima.
 *
 * @param {{carta: object, quantita: number}} voce
 * @param {Set<string>} chiesti tipi di Energia che le carte del mazzo chiedono
 * @returns {number}
 */
function valoreDaTogliere(voce, chiesti) {
  const { carta } = voce;
  if (carta.categoria === 'Energia') {
    // Un'Energia di un tipo che nessuno usa è la prima a uscire: è già una
    // carta morta dentro il mazzo.
    return eEnergiaBase(carta) && chiesti.has(tipoEnergia(carta)) ? 30 : 0;
  }
  if (carta.categoria === 'Allenatore') return 20;
  return 50;
}

/**
 * Le mosse che portano da un mazzo a un altro.
 *
 * È l'inversa di `applica()`, e serve quando il mazzo proposto non nasce da un
 * solo passaggio: "Completa il mazzo" con una forza obiettivo prima riempie con
 * `completa()` e poi scambia carte con `avvicinaAForza()`, che muta il mazzo e
 * restituisce solo i nomi scambiati. Rifare il conto sul risultato finale è
 * l'unico modo di mostrare a chi guarda **una** lista di mosse che corrisponda
 * davvero a ciò che succederà premendo Applica: sommare due elenchi parziali
 * mostrerebbe carte aggiunte e poi tolte, cioè il lavoro del motore invece del
 * suo esito.
 *
 * @param {object} prima
 * @param {object} dopo
 * @param {object} [opzioni]
 * @param {Mossa[]} [opzioni.motivi] mosse già spiegate: dove la carta coincide
 *   si riusa la frase, così le spiegazioni di `completa()` non si perdono
 * @param {string} [opzioni.altrimenti=''] motivo per le mosse che quelle non
 *   spiegano — tipicamente gli scambi fatti per la forza
 * @returns {Mossa[]}
 * @example
 * const mosse = differenza(mazzo, dopoGliScambi, {
 *   motivi: esito.mosse,
 *   altrimenti: 'Scambiata per avvicinare la forza a 45.',
 * });
 */
export function differenza(prima, dopo, { motivi = [], altrimenti = '' } = {}) {
  const conta = (mazzo) => {
    const per = new Map();
    for (const voce of mazzo?.carte ?? []) {
      const k = chiave(voce.carta);
      const gia = per.get(k);
      if (gia) gia.quantita += voce.quantita;
      else per.set(k, { carta: voce.carta, quantita: voce.quantita });
    }
    return per;
  };

  const a = conta(prima);
  const b = conta(dopo);
  const spiegate = new Map(motivi.map((m) => [chiave(m.carta), m.motivo]));
  const mosse = [];

  for (const [k, voce] of b) {
    const delta = voce.quantita - (a.get(k)?.quantita ?? 0);
    if (delta > 0) {
      mosse.push({
        verso: 'aggiungi',
        carta: voce.carta,
        quante: delta,
        motivo: spiegate.get(k) ?? altrimenti,
      });
    }
  }
  for (const [k, voce] of a) {
    const delta = voce.quantita - (b.get(k)?.quantita ?? 0);
    if (delta > 0) {
      mosse.push({
        verso: 'togli',
        carta: voce.carta,
        quante: delta,
        motivo: spiegate.get(k) ?? altrimenti,
      });
    }
  }
  return mosse;
}

/**
 * Applica le mosse a un mazzo, restituendone uno nuovo.
 *
 * Separata da `completa()` e `correggi()` apposta: quelle **propongono**,
 * questa **esegue**. È ciò che permette di mostrare all'utente cosa succederà
 * prima che succeda.
 *
 * @param {object} mazzo
 * @param {Mossa[]} mosse
 * @returns {object} mazzo nuovo
 */
export function applica(mazzo, mosse) {
  const carte = (mazzo?.carte ?? []).map((v) => ({ ...v }));
  for (const mossa of mosse ?? []) {
    const voce = carte.find((v) => chiave(v.carta) === chiave(mossa.carta));
    const delta = mossa.verso === 'togli' ? -mossa.quante : mossa.quante;
    if (voce) voce.quantita += delta;
    else if (delta > 0) carte.push({ carta: mossa.carta, quantita: delta });
  }
  const rimaste = carte.filter((v) => v.quantita > 0);
  return {
    ...mazzo,
    carte: rimaste,
    totale: rimaste.reduce((s, v) => s + v.quantita, 0),
  };
}
