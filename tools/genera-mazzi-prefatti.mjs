/**
 * Costruisce `data/mazzi-prefatti.json` dagli elenchi scritti a mano in
 * `tools/prefatti/`.
 *
 * A cosa serve. I mazzi prefatti — i Kit Allenatore, i mazzi da negozio — sono
 * il metro con cui si misura un mazzo generato: se in casa si gioca contro il
 * Kit di Alola, un mazzo generato deve valergli quanto basta a fare una partita
 * e non un'esecuzione. Per misurarli servono le loro carte con i dati di gioco,
 * e nessuna delle due cose si legge direttamente dal dataset.
 *
 * Due problemi, che questo strumento risolve una volta sola:
 *
 * 1. **Le quantità non ci sono.** Un set TCGdex è un catalogo di carte, non un
 *    mazzo: dice che il Kit Lycanroc esiste, non che contiene 13 Energia Lotta.
 *    Le quantità stanno negli elenchi scritti a mano, con la fonte citata.
 *
 * 2. **I dati di gioco mancano.** I set dei Kit sono ristampe, e TCGdex non vi
 *    replica attacchi e PS: `tk-sm-l` ha gli attacchi sul 17% dei Pokémon,
 *    `tk-xy-b` su nessuno. Ma quelle carte esistono con i dati completi nei set
 *    normali della stessa epoca, e si ritrovano **per nome**.
 *
 * Il file che ne esce è autoconsistente — dentro ci sono i dati delle carte,
 * non dei riferimenti — così la PWA carica un file solo, e offline funziona.
 *
 * Strumento di SVILUPPO: si rilancia solo quando si aggiunge un mazzo o si
 * corregge un elenco. Nessuna dipendenza, nessuna rete.
 *
 * Uso:
 *     node tools/genera-mazzi-prefatti.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { misurabile, ritrovaDati, setDoveCercare } from './lib/ristampe.mjs';

const RADICE = process.cwd();
const CARTELLA_ELENCHI = join(RADICE, 'tools', 'prefatti');
const CARTELLA_SET = join(RADICE, 'data', 'set');
const USCITA = join(RADICE, 'data', 'mazzi-prefatti.json');

const leggi = (percorso) => JSON.parse(readFileSync(percorso, 'utf8'));

const indice = leggi(join(CARTELLA_SET, 'indice.json'));
const cacheSet = new Map();

/** @param {string} id @returns {object[]} le carte di un set, con `idSet` iniettato */
function carteDi(id) {
  if (!cacheSet.has(id)) {
    cacheSet.set(
      id,
      leggi(join(CARTELLA_SET, `${id}.json`)).carte.map((c) => ({ ...c, idSet: id })),
    );
  }
  return cacheSet.get(id);
}

/**
 * Ritrova una carta con i dati completi, cercandola per nome altrove.
 *
 * Si conserva il nome, il numero e il set **originali** del Kit: chi ha la
 * carta in mano legge quelli, e ritrovarla nel mazzetto è tutto lo scopo
 * dell'app. Dal set di provenienza si prendono solo i dati di gioco.
 *
 * @param {object} carta carta del Kit, senza attacchi
 * @param {string} idKit
 * @returns {{carta: object, presa: string|null}}
 */
function completa(carta, idKit) {
  if (misurabile(carta)) return { carta, presa: null };

  // La ricerca vera sta in `lib/ristampe.mjs`, condivisa con
  // `completa-ristampe.mjs`. Due implementazioni della stessa ricerca
  // divergono alla prima correzione, e questa ne ha già avuta una importante:
  // la preferenza per l'omonima con gli **stessi PS**, senza la quale il
  // Lycanroc del Kit (110 PS) prendeva gli attacchi del promo SM105 (120 PS).
  const candidate = setDoveCercare(idKit, indice).flatMap((idSet) =>
    carteDi(idSet).map((c) => ({ carta: c, idSet })),
  );
  const dati = ritrovaDati(carta, candidate);
  if (!dati) return { carta, presa: null };

  const { approssimati, ...campi } = dati;
  return {
    carta: { ...carta, ...campi, ...(approssimati ? { attacchiApprossimati: true } : {}) },
    presa: dati.datiDa.split('/')[0],
  };
}

/**
 * Un'Energia base generica, identica a quelle che l'app crea in
 * `src/data/collezione.js`: stesso `idSet` fittizio, stesso `tipoEnergia`.
 * Devono essere indistinguibili, o `eEnergiaBase()` non le riconoscerebbe e
 * il motore misurerebbe zero energie in un mazzo che ne ha tredici.
 *
 * @param {string} tipo
 * @returns {object}
 */
const energiaBase = (tipo) => ({
  nome: `Energia ${tipo}`,
  numero: tipo,
  idSet: '@base',
  categoria: 'Energia',
  tipoEnergia: 'Base',
  generica: true,
});

const problemi = [];

/**
 * Trasforma un elenco scritto a mano in un mazzo con le carte dentro.
 * @param {object} elenco
 * @returns {object}
 */
function costruisci(elenco) {
  const carte = [];
  let ripescate = 0;

  for (const riga of elenco.carte ?? []) {
    if (riga.energia) {
      carte.push({ carta: energiaBase(riga.energia), quantita: riga.quantita });
      continue;
    }
    const originale = carteDi(elenco.id).find((c) => c.numero === riga.numero);
    if (!originale) {
      problemi.push(`${elenco.id}: il numero ${riga.numero} non esiste nel set`);
      continue;
    }
    const { carta, presa } = completa(originale, elenco.id);
    if (presa) ripescate += riga.quantita;
    carte.push({ carta, quantita: riga.quantita });
  }

  return { ...elenco, carte, ripescate };
}

// --- Costruzione -----------------------------------------------------------

const elenchi = readdirSync(CARTELLA_ELENCHI)
  .filter((f) => f.endsWith('.json'))
  .map((f) => leggi(join(CARTELLA_ELENCHI, f)));

const costruiti = new Map();
// Prima i mazzi veri, poi le unioni: un'unione ha bisogno che i suoi pezzi
// esistano già.
for (const elenco of elenchi.filter((e) => !e.unione)) {
  costruiti.set(elenco.id, costruisci(elenco));
}
for (const elenco of elenchi.filter((e) => e.unione)) {
  const pezzi = elenco.unione.map((id) => costruiti.get(id));
  if (pezzi.some((p) => !p)) {
    problemi.push(`${elenco.id}: unisce mazzi che non esistono (${elenco.unione.join(', ')})`);
    continue;
  }
  // Le voci si fondono per carta: due Hau da un mazzo e due dall'altro fanno
  // quattro Hau, non due righe da due.
  const per = new Map();
  for (const voce of pezzi.flatMap((p) => p.carte)) {
    const chiave = `${voce.carta.idSet}/${voce.carta.numero}`;
    const gia = per.get(chiave);
    if (gia) gia.quantita += voce.quantita;
    else per.set(chiave, { carta: voce.carta, quantita: voce.quantita });
  }
  costruiti.set(elenco.id, {
    ...elenco,
    carte: [...per.values()],
    ripescate: pezzi.reduce((s, p) => s + p.ripescate, 0),
  });
}

// --- Controlli -------------------------------------------------------------
// Rumorosi apposta: un mazzo di riferimento sbagliato è peggio di nessun mazzo
// di riferimento, perché non si vede — dà un numero plausibile e falso.

const mazzi = [...costruiti.values()];
for (const mazzo of mazzi) {
  const effettive = mazzo.carte.reduce((s, v) => s + v.quantita, 0);
  if (effettive !== mazzo.taglia) {
    problemi.push(`${mazzo.id}: dichiara ${mazzo.taglia} carte, l'elenco ne fa ${effettive}`);
  }
  const ciechi = mazzo.carte.filter((v) => !misurabile(v.carta));
  if (ciechi.length) {
    console.warn(
      `  ! ${mazzo.id}: ${ciechi.length} carte restano senza dati di gioco ` +
        `(${ciechi.map((v) => v.carta.nome).join(', ')})`,
    );
  }
  const incerte = mazzo.carte.filter((v) => v.carta.attacchiApprossimati);
  if (incerte.length && !mazzo.unione) {
    console.warn(
      `  ~ ${mazzo.id}: attacchi presi da una stampa con PS diversi, da verificare ` +
        `sulla carta vera — ` +
        incerte.map((v) => `${v.carta.nome} (${v.carta.ps} PS, presi da ${v.carta.datiDa})`).join(', '),
    );
  }
}

if (problemi.length) {
  console.error('Errori negli elenchi:');
  for (const p of problemi) console.error('  - ' + p);
  process.exit(1);
}

const uscita = {
  generatoIl: new Date().toISOString().slice(0, 10),
  mazzi: mazzi.map(({ ripescate, fonte, note, ...mazzo }) => ({ ...mazzo, fonte })),
};
writeFileSync(USCITA, JSON.stringify(uscita, null, 2) + '\n', 'utf8');

console.log(`Scritto data/mazzi-prefatti.json — ${mazzi.length} mazzi:`);
for (const m of mazzi) {
  console.log(
    `  ${m.id.padEnd(12)} ${String(m.taglia).padStart(2)} carte, ` +
      `${m.ripescate} con i dati di gioco ripescati altrove`,
  );
}
