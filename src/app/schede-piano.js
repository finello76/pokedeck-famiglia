/**
 * I blocchi di testo che raccontano un piano di mazzi: equilibrio, forza,
 * bersaglio, linee evolutive, regole della casa.
 *
 * Stavano dentro `vista-mazzi.js`, che aveva superato le 800 righe facendo due
 * mestieri: orchestrare la generazione e scrivere la prosa che la spiega.
 * Questi sono `piano → HTML` e basta — non toccano il DOM della pagina, non
 * leggono IndexedDB, non navigano — quindi stanno bene da soli.
 *
 * Nel dettaglio del mazzo quasi tutti finiscono dentro un `<details>` chiuso:
 * erano sette blocchi da attraversare **prima** di vedere una carta, e chi
 * riapre un mazzo salvato vuole l'elenco delle carte, non la relazione su come
 * è stato costruito. La relazione resta, a un tocco di distanza.
 *
 * @module app/schede-piano
 */

import { forza, confronta } from '../engine/forza.js';
import { squilibrati as mazziSquilibrati } from '../engine/bilancia.js';

/**
 * I mazzi si sono allontanati abbastanza da valere un avviso?
 * @param {object} piano
 * @returns {boolean}
 */
export function squilibrati(piano) {
  return mazziSquilibrati(piano.equilibrio);
}

/**
 * Una sezione richiudibile del dettaglio.
 *
 * `<details>`/`<summary>` nativi invece della fisarmonica a mano di
 * `vista-regole.js`: lì serviva tenerne aperta una sola per volta, qui no, e
 * l'elemento nativo porta con sé apertura, chiusura e accessibilità senza una
 * riga di JavaScript.
 *
 * Il titolo dice **quanto** c'è dentro (`Regole della casa (3)`): un titolo che
 * non conta le cose costringe ad aprire per sapere se valeva la pena.
 *
 * @param {string} titolo
 * @param {string} contenuto HTML
 * @param {object} [opzioni]
 * @param {boolean} [opzioni.aperta=false]
 * @returns {string} HTML, vuoto se il contenuto è vuoto
 */
export function sezioneRichiudibile(titolo, contenuto, { aperta = false } = {}) {
  if (!contenuto?.trim()) return '';
  return `
    <details class="sezione-piano"${aperta ? ' open' : ''}>
      <summary>${titolo}</summary>
      <div class="sezione-piano-corpo">${contenuto}</div>
    </details>`;
}

/**
 * La riga di dati sintetici in cima al dettaglio.
 *
 * Prende il posto di tre paragrafi di prosa: quanti mazzi, quante carte, che
 * forza, quante regole della casa, quante carte da stampare. Sono le cinque
 * cose che si guardano riaprendo un mazzo, e stanno in una riga sola.
 *
 * @param {object} piano
 * @param {object} opzioni
 * @returns {string} HTML
 */
export function riassunto(piano, opzioni) {
  const carte = piano.mazzi.reduce(
    (somma, m) => somma + (m.carte ?? []).reduce((s, v) => s + (v.quantita ?? 0), 0),
    0,
  );
  const proxy = piano.mazzi.reduce(
    (somma, m) => somma + (m.carte ?? []).filter((v) => v.proxy).reduce((s, v) => s + v.quantita, 0),
    0,
  );
  // Stessa cascata dell'elenco dei salvati: `equilibrio` misura i mazzi uno
  // rispetto all'altro ed esiste solo nei piani del wizard, mentre `forza` sta
  // su ogni mazzo. Senza il primo ramo il riassunto di un piano riaperto
  // mostrava "forza 0 · 0 · 0", perché le carte salvate non conservano gli
  // attacchi e ricalcolare dà zero.
  const forze =
    piano.equilibrio?.punteggi?.map((p) => p.totale) ??
    piano.mazzi.map((m) => (m.forza?.attendibile ? m.forza.totale : null)).filter((n) => n != null);

  const voci = [
    piano.mazzi.length === 1 ? 'un mazzo' : `${piano.mazzi.length} mazzi`,
    `${carte} carte`,
    opzioni.taglia ? `da ${opzioni.taglia}` : '',
    forze.length ? `forza ${forze.join(' · ')}` : '',
    piano.regole?.length ? `${piano.regole.length} regole della casa` : '',
    proxy ? `${proxy} da stampare` : '',
  ].filter(Boolean);

  return `<p class="riassunto-piano no-stampa">${voci
    .map((v) => `<span class="riassunto-voce">${v}</span>`)
    .join('')}</p>`;
}

/**
 * La riga che dice quanto i mazzi si somigliano.
 *
 * Va detto **prima** della partita: uno squilibrio scoperto giocando è una
 * partita rovinata, e chi legge non ha modo di sapere che il motore ci ha
 * provato.
 *
 * @param {object} piano
 * @returns {string} HTML
 */
export function statoEquilibrio(piano) {
  const eq = piano.equilibrio;
  if (!eq?.punteggi?.length) return '';
  // Con un mazzo solo non c'è niente da equilibrare: l'avversario ha il suo, e
  // dirgli "mazzi equilibrati" mostrando un punteggio solo sarebbe una risposta
  // a una domanda che nessuno ha fatto.
  if (piano.mazzi.length < 2) return '';

  const punteggi = eq.punteggi.map((p, i) => `${piano.mazzi[i]?.nome ?? i + 1}: ${p.totale}`);
  const spostate = eq.scambi?.length
    ? ` Il motore ha già spostato ${eq.scambi.length === 1 ? 'una linea evolutiva' : `${eq.scambi.length} linee evolutive`} per avvicinarli.`
    : '';

  if (!squilibrati(piano)) {
    return `<p class="aiuto">Mazzi equilibrati fra loro (${punteggi.join(' · ')}).${spostate}</p>`;
  }
  return `<p class="errore">I mazzi non sono del tutto pari: ${punteggi.join(' · ')}.
    ${piano.mazzi[eq.migliore]?.nome} è più forte, soprattutto per le linee evolutive.${spostate}
    Con questa collezione può non esserci di meglio: prova a rigenerare, o passa una carta
    da un mazzo all'altro col pulsante ⇄.</p>`;
}

/**
 * La riga che dice com'è andata la rifinitura verso la forza chiesta.
 *
 * È il secondo stadio della cascata: `cercaPiano()` ha già scelto il piano più
 * vicino al bersaglio, `avvicinaAForza()` ha poi scambiato qualche carta per
 * chiudere la distanza rimasta. Qui si racconta **solo quel secondo passo** —
 * quanto valgono i mazzi lo dice `schedaForza()` qui sotto.
 *
 * Va detto sempre, anche — soprattutto — quando l'obiettivo non si è
 * raggiunto: chi ha chiesto mazzi da 45 e se ne ritrova due da 70 deve sapere
 * che non è stato ignorato, ma che la collezione non contiene carte più deboli
 * da metterci dentro.
 *
 * @param {object} piano
 * @returns {string} HTML, vuoto se non era stata chiesta nessuna forza
 */
export function statoForza(piano) {
  const esito = piano.forza;
  if (!esito?.obiettivo || !esito.esiti?.length) return '';

  const arrivi = esito.esiti.map((e) => `${e.mazzo}: ${e.arrivo}`).join(' · ');
  const scambiate = esito.esiti.reduce((somma, e) => somma + e.scambi.length, 0);

  if (esito.esiti.every((e) => e.raggiunto)) {
    return `<p class="aiuto">Forza richiesta ${esito.obiettivo}, ottenuta (${arrivi})${
      scambiate ? `, cambiando ${scambiate} ${scambiate === 1 ? 'carta' : 'carte'}` : ''
    }.</p>`;
  }

  // Un mazzo di cui il dataset non conosce gli attacchi non è stato toccato: il
  // suo punteggio non è una misura, e scambiare carte per spostarlo sarebbe
  // stato rimescolare inseguendo rumore. Dirlo evita che sembri un rifiuto.
  if (esito.esiti.some((e) => e.motivo === 'nonMisurabile')) {
    return `<p class="aiuto">Forza richiesta ${esito.obiettivo}: di alcune carte il
      dataset non ha i dati degli attacchi, quindi quei mazzi non sono stati
      ritoccati — il loro punteggio non sarebbe affidabile.</p>`;
  }

  // Fermarsi perché la collezione non offre di meglio e fermarsi perché sono
  // finiti i tentativi sono due cose diverse: nel secondo caso rigenerare o
  // scambiare a mano può ancora servire, e dirlo cambia cosa si fa dopo.
  const perTentativi = esito.esiti.some((e) => !e.raggiunto && e.motivo === 'passi');

  return `<p class="aiuto">Forza richiesta ${esito.obiettivo}: il più vicino che si è
    riusciti a fare è ${arrivi}.
    ${
      perTentativi
        ? 'Il motore si è fermato dopo un certo numero di scambi per non stravolgere i mazzi: prova a rigenerare, o cambia qualche carta col pulsante ⇄.'
        : 'Con le carte che hai non si va oltre — per scendere servirebbero Pokémon più deboli da mettere al posto di quelli forti, per salire ne servirebbero di più forti.'
    }</p>`;
}

/**
 * La forza di ogni mazzo sulla scala 0–100.
 *
 * È un'informazione diversa dall'equilibrio qui sopra, e va detta a parte:
 * quella dice se i mazzi si somigliano **fra loro**, questa quanto valgono in
 * assoluto. Due mazzi possono essere perfettamente pari e insieme troppo forti
 * per il Kit Allenatore con cui gioca il terzo.
 *
 * @param {object} piano
 * @param {object} opzioni
 * @returns {string} HTML
 */
export function schedaForza(piano, opzioni) {
  // Un piano riaperto dal salvataggio porta la forza già calcolata: le sue
  // carte non conservano gli attacchi, quindi ricalcolarla darebbe zero.
  const forze = piano.mazzi.map((m) => m.forza ?? forza(m, { taglia: opzioni.taglia }));
  if (!forze.length) return '';

  const riferimento = opzioni.riferimentoForza ?? null;
  // La tacca sulla barra: si legge a colpo d'occhio se un mazzo sta sopra o
  // sotto il metro, che è più immediato di due numeri da confrontare a mente.
  const tacca =
    riferimento == null
      ? ''
      : `<span class="tacca-riferimento" style="inset-inline-start:${riferimento}%"></span>`;

  const barre = forze
    .map((f, i) => {
      const nome = piano.mazzi[i]?.nome ?? `Mazzo ${i + 1}`;
      const dettaglio = [
        `offesa ${Math.round(f.offesa * 100)}`,
        `resistenza ${Math.round(f.resistenza * 100)}`,
        `evoluzioni ${Math.round(f.struttura * 100)}`,
        `energie ${Math.round(f.motore * 100)}`,
        `avvio ${Math.round(f.costanza * 100)}`,
      ].join(' · ');
      return `
        <li>
          <span class="forza-nome">${nome}</span>
          <span class="forza-barra"><span class="forza-riempimento" style="inline-size:${f.totale}%"></span>${tacca}</span>
          <span class="forza-valore">${f.totale}</span>
          <span class="forza-dettaglio">${dettaglio}</span>
        </li>`;
    })
    .join('');

  // Se il dataset non ha i dati di attacco di abbastanza carte, il numero non
  // va presentato come una misura: dirlo è meno grave che farlo credere.
  const dubbio = forze.some((f) => !f.attendibile)
    ? `<p class="aiuto">Di alcune carte il dataset non ha i dati degli attacchi:
         la forza è approssimata per difetto.</p>`
    : '';

  return `
    <div class="forza-mazzi no-stampa">
      <p class="aiuto">Scala 0–100, confrontabile fra mazzi di taglia diversa:
        un mazzo da 15 e uno da 60 si leggono sullo stesso metro.</p>
      <ul class="elenco-forza">${barre}</ul>
      ${esitoBersaglio(piano, opzioni, forze)}
      ${dubbio}
    </div>`;
}

/**
 * Com'è andata la ricerca del bersaglio, detta prima di giocare.
 *
 * Quando non si è centrato il bersaglio va detto **esplicitamente**: la
 * collezione può semplicemente non contenere carte abbastanza deboli o
 * abbastanza forti, e scoprirlo perdendo una partita è il fallimento che
 * questa funzione doveva evitare.
 *
 * @param {object} piano
 * @param {object} opzioni
 * @param {object[]} forze
 * @returns {string} HTML
 */
export function esitoBersaglio(piano, opzioni, forze) {
  const nome = opzioni.riferimentoNome;
  const suo = opzioni.riferimentoForza;
  if (!nome || suo == null) return '';

  const media = Math.round(forze.reduce((s, f) => s + f.totale, 0) / forze.length);
  const { verso, testo } = confronta(media, suo);
  const chiesto = { pari: 'alla pari', sotto: 'un po\' più debole', sopra: 'un po\' più forte' }[
    opzioni.versoBersaglio ?? 'pari'
  ];
  const tentativi = piano.ricerca?.tentativi;
  const quante = tentativi > 1 ? ` Provate ${tentativi} combinazioni.` : '';

  // Ciò che si è chiesto e ciò che si è ottenuto coincidono?
  const atteso = { pari: 'pari', sotto: 'sotto', sopra: 'sopra' }[opzioni.versoBersaglio ?? 'pari'];
  if (verso === atteso) {
    return `<p class="aiuto"><strong>${nome}</strong> vale ${suo}, i tuoi mazzi ${media}:
      ${testo}, come hai chiesto.${quante}</p>`;
  }
  return `<p class="errore"><strong>${nome}</strong> vale ${suo}, i tuoi mazzi ${media}:
    ${testo}. Avevi chiesto ${chiesto}, ma con questa collezione non si è riusciti
    ad avvicinarsi di più.${quante} Prova a rigenerare, o cambia la taglia dei mazzi.</p>`;
}

/**
 * Spiega perché nei mazzi compaiono evoluzioni giocate come Base invece di
 * vere catene evolutive.
 *
 * Serve perché il risultato è controintuitivo: chi ha chiesto mazzi con le
 * evoluzioni si aspetta Base + evoluzione, e trovarsi un Livello 2 giocato
 * dalla mano sembra un errore del programma. Non lo è: è l'unica cosa
 * possibile con questa collezione, e va detto.
 *
 * @param {object} piano
 * @returns {string} HTML, vuoto se non c'è niente da spiegare
 */
export function spiegazioneLineeEvolutive(piano) {
  const linee = piano.analisi?.linee ?? [];
  const complete = linee.filter(
    (l) => l.giocabile && l.livelli.filter((liv) => liv.length).length > 1,
  ).length;
  const derogate = piano.carenze
    .filter((c) => c.codice === 'orfani-nel-mazzo')
    .flatMap((c) => c.dati.orfani);

  if (!derogate.length) return '';

  const dettaglio =
    complete === 0
      ? 'Nella tua collezione <strong>non c\'è nessuna linea evolutiva completa</strong>: ' +
        'per ogni evoluzione che possiedi manca la carta da cui evolve.'
      : `Nella tua collezione ci sono solo ${complete} linee evolutive complete, ` +
        'non abbastanza per riempire i mazzi.';

  return `
    <div class="nota-spiegazione">
      <p>
        ${dettaglio}
        Le carte contrassegnate
        (${derogate.map((o) => o.nome).join(', ')})
        si possono usare solo grazie alla regola della casa: senza, resterebbero fuori dai mazzi.
      </p>
      <p class="aiuto">
        Per avere vere catene evolutive servirebbero le pre-evoluzioni mancanti
        (${[...new Set(derogate.map((o) => o.manca).filter(Boolean))].join(', ') || 'non identificabili dai dati'}),
        oppure i proxy stampabili.
      </p>
    </div>`;
}

/**
 * Il foglio regole: solo le regole attivate, ciascuna con la motivazione.
 *
 * @param {object[]} regole
 * @returns {string} HTML
 */
export function fogliaRegole(regole) {
  if (!regole.length) {
    return `<div class="foglio-regole">
      <p>Nessuna regola speciale: la collezione basta per giocare con le regole ufficiali.</p>
    </div>`;
  }

  // La cornice `.foglio-regole` resta anche ora che la sezione è un `<details>`:
  // il foglio di stampa la usa per cominciare su pagina nuova, perché le regole
  // si consegnano a chi gioca, staccate dalle liste delle carte.
  return `
    <div class="foglio-regole">
    <p class="aiuto no-stampa">
      Queste regole valgono solo per questa partita. Ognuna esiste per un motivo
      preciso, scritto sotto: leggetele insieme prima di cominciare.
    </p>
    ${regole
      .map(
        (r) => `
      <div class="regola">
        <h3>${r.titolo}</h3>
        <p class="testo">${r.testo}</p>
        <p class="motivazione">Perché: ${r.motivazione}</p>
      </div>`,
      )
      .join('')}
    </div>`;
}
