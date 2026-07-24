/**
 * Il dialogo "Sostituisci carta": collega una riga del mazzo al motore delle
 * alternative e applica la scelta.
 *
 * Le proposte arrivano da `engine/alternative.js` (puro); qui c'è solo la resa
 * e il giro di aggiornamento: sostituzione → rivalutazione del piano →
 * ridisegno a carico del chiamante.
 *
 * @module app/sostituzione
 */

import { elencoCompleto } from '../data/collezione.js';
import { indiceEvoluzioni, preEvoluzioniNonPokemon, urlImmagine } from '../data/dataset.js';
import { segnaposto, seImmagineRotta } from '../ui/segnaposto.js';
import { arricchisciProxy } from './foglio-proxy.js';
import { disponibilitaResidua, alternativePer, applicaSostituzione } from '../engine/alternative.js';
import { riallineaLinee } from '../engine/riallinea.js';
import { squilibrio } from '../engine/bilancia.js';
import { rivaluta } from '../engine/pianifica.js';
import { normalizzaNome } from '../engine/nomi.js';
import { bloccaScorrimento, sbloccaScorrimento } from './blocca-scroll.js';

/** Quante proposte mostrare al massimo: oltre, la scelta diventa rumore. */
const MASSIMO_PROPOSTE = 24;

/**
 * Apre il dialogo di sostituzione per una voce di un mazzo.
 *
 * @param {object} piano piano corrente (con `opzioni` allegate)
 * @param {object} mazzo il mazzo da modificare
 * @param {number} indice posizione della voce in `mazzo.carte`
 * @param {() => void} alTermine chiamata dopo una sostituzione riuscita
 * @returns {Promise<void>}
 */
export async function apriSostituzione(piano, mazzo, indice, alTermine) {
  const voce = mazzo.carte[indice];
  if (!voce || voce.proxy) return;

  const voci = await collezioneDelPiano(piano);
  const dispensa = disponibilitaResidua(voci, piano.mazzi);
  const proposte = alternativePer(voce, mazzo, dispensa).slice(0, MASSIMO_PROPOSTE);

  // Chi nel mazzo evolve dalla carta in uscita: va detto PRIMA di scegliere,
  // non scoperto dopo dal contrassegno "come Base" comparso in lista.
  const dipendenti = mazzo.carte
    .filter((c) => normalizzaNome(c.carta.evolveDa) === normalizzaNome(voce.carta.nome))
    .map((c) => c.carta.nome);

  const dialogo = document.createElement('dialog');
  dialogo.className = 'dialogo-sostituzione';
  dialogo.innerHTML = `
    <h3>Sostituisci ${voce.quantita}× ${escapeHtml(voce.carta.nome)}</h3>
    <p class="aiuto">
      ${escapeHtml(mazzo.nome)} · si scambiano fino a ${voce.quantita} copie con una
      carta libera della collezione, dello stesso tipo di carta.
    </p>
    ${
      dipendenti.length
        ? `<p class="errore">Attenzione: ${dipendenti.map(escapeHtml).join(', ')} evolve da
             questa carta e resterebbe senza pre-evoluzione.</p>`
        : ''
    }
    ${
      proposte.length
        ? `<ul class="proposte">${proposte.map(rigaProposta).join('')}</ul>`
        : `<p class="stato">Nessuna carta libera della stessa categoria in collezione:
             tutte le copie sono già nei mazzi.</p>`
    }
    <div class="azioni">
      <button type="button" class="secondario" data-annulla>Annulla</button>
    </div>
  `;

  document.body.append(dialogo);
  dialogo.addEventListener('close', () => {
    sbloccaScorrimento();
    dialogo.remove();
  });
  const chiudi = () => {
    dialogo.close();
    // Alcuni ambienti non emettono `close`: la pulizia si fa comunque.
    sbloccaScorrimento();
    dialogo.remove();
  };

  for (const img of dialogo.querySelectorAll('.proposte img')) {
    seImmagineRotta(img, null, 'segnaposto-mini');
  }

  dialogo.querySelector('[data-annulla]').addEventListener('click', chiudi);
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) chiudi();
  });

  for (const bottone of dialogo.querySelectorAll('[data-proposta]')) {
    bottone.addEventListener('click', async () => {
      const scelta = proposte[Number(bottone.dataset.proposta)];
      const scambiate = applicaSostituzione(mazzo, voce, scelta.carta, scelta.disponibili);
      chiudi();
      if (scambiate === 0) return;

      // Le carte stampate esistono per una carta precisa: cambiata quella,
      // vanno ricalcolate. Altrimenti restano nel mazzo le pre-evoluzioni di
      // un Pokémon che non c'è più, e la carta entrata resta senza le sue.
      // La disponibilità si rilegge DOPO lo scambio: la carta appena uscita
      // dal mazzo è di nuovo libera, e può servire a riempire i buchi.
      riallineaLinee(mazzo, {
        dispensa: disponibilitaResidua(await collezioneDelPiano(piano), piano.mazzi),
        indiceEvoluzioni: await indiceEvoluzioni(),
        nonPokemon: await preEvoluzioniNonPokemon(),
        budgetProxy: piano.opzioni?.proxyPokemon ? piano.opzioni.budgetProxy ?? 0 : 0,
        taglia: piano.opzioni?.taglia,
      });
      // Le stampe nuove sono solo nomi: la scansione la cerca il livello
      // applicativo, come alla prima generazione.
      await arricchisciProxy(piano);

      // Anche l'equilibrio va rimisurato: una linea tolta a mano può aver reso
      // i mazzi impari, e chi gioca deve poterlo sapere prima della partita.
      piano.equilibrio = { ...squilibrio(piano.mazzi), scambi: [] };

      // Il foglio regole descrive i mazzi correnti: togliere o aggiungere una
      // carta può cambiare carenze e regole della casa.
      rivaluta(piano);
      alTermine();
    });
  }

  dialogo.showModal();
  bloccaScorrimento();
}

/**
 * La collezione come la vede questo piano: senza i set esclusi nel wizard.
 *
 * Serve perché l'esclusione non è un filtro di generazione ma una verità sulle
 * carte disponibili: se il Kit Allenatore è in mano a qualcun altro, non può
 * comparire nemmeno fra le sostituzioni proposte dopo.
 *
 * @param {object} piano
 * @returns {Promise<object[]>}
 */
async function collezioneDelPiano(piano) {
  const voci = await elencoCompleto();
  const esclusi = new Set(piano.opzioni?.setEsclusi ?? []);
  return esclusi.size ? voci.filter((v) => !esclusi.has(v.idSet)) : voci;
}

/**
 * Una proposta di sostituzione: scansione grande più i dati che fanno decidere.
 *
 * Prima c'erano solo nome e stadio su una riga di testo, e la scelta si faceva
 * al buio: fra due Pokémon dello stesso tipo la differenza sta nei PS e in
 * quanto costa attaccare, non nel nome. Con la foto si riconosce anche la carta
 * fisica da pescare dalla scatola, che è il gesto successivo.
 *
 * @param {import('../engine/alternative.js').Alternativa} p
 * @param {number} i posizione nell'elenco, per ritrovare la scelta al click
 * @returns {string} HTML
 */
function rigaProposta(p, i) {
  const c = p.carta;
  const tipo = c.tipi?.[0] ?? 'Incolore';
  const src = urlImmagine(c, 'griglia');

  return `
    <li>
      <button type="button" data-proposta="${i}" data-tipo="${escapeHtml(tipo)}"
              title="Metti ${escapeHtml(c.nome)} nel mazzo">
        <span class="foto-proposta">
          ${src ? `<img src="${src}" alt="" loading="lazy" />` : segnaposto(c, 'segnaposto-mini')}
          <span class="libere-proposta">${p.disponibili} liber${p.disponibili === 1 ? 'a' : 'e'}</span>
        </span>
        <span class="testo-proposta">
          <span class="nome-proposta">${escapeHtml(c.nome)}</span>
          <span class="dettagli-proposta">${dettagliCarta(c)}</span>
          ${attacchiCarta(c)}
          ${p.note.length ? `<span class="note-proposta">${escapeHtml(p.note.join(' · '))}</span>` : ''}
        </span>
      </button>
    </li>`;
}

/**
 * La riga di identità della carta: cosa è, di che tipo, quanto è resistente.
 * @param {object} c
 * @returns {string} HTML
 */
function dettagliCarta(c) {
  if (c.categoria !== 'Pokémon') {
    return `<span class="chip chip-evo">${escapeHtml(c.categoria ?? '')}</span>`;
  }
  const tipi = (c.tipi ?? [])
    .map((t) => `<span class="chip chip-tipo-carta" data-tipo="${escapeHtml(t)}">${escapeHtml(t)}</span>`)
    .join('');
  const evo = c.evolveDa ? ` · da ${escapeHtml(c.evolveDa)}` : '';
  return `${tipi} <span class="ps-proposta">${c.ps ?? '?'} PS</span> · ${escapeHtml(c.stadio ?? 'Base')}${evo}`;
}

/**
 * Gli attacchi, con quante Energie costano e quanto fanno.
 *
 * Il costo si mostra come numero e non come pastiglie colorate: qui lo spazio è
 * quello di un dialogo, e "3 Energie → 60" è la sola cosa che si confronta fra
 * due carte candidate allo stesso posto.
 *
 * @param {object} c
 * @returns {string} HTML
 */
function attacchiCarta(c) {
  if (!c.attacchi?.length) return '';
  const righe = c.attacchi
    .slice(0, 2)
    .map((a) => {
      const costo = a.costo?.length ?? 0;
      return `<span class="attacco-proposta">
        <span class="costo-proposta">${costo || '—'}⚡</span>
        ${escapeHtml(a.nome)}
        ${a.danno ? `<span class="danno-proposta">${escapeHtml(String(a.danno))}</span>` : ''}
      </span>`;
    })
    .join('');
  return `<span class="attacchi-proposta">${righe}</span>`;
}

/**
 * @param {string} testo
 * @returns {string}
 */
function escapeHtml(testo) {
  return String(testo ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}
