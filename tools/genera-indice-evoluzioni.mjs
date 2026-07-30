/**
 * Costruisce `data/evoluzioni.json`: da quale Pokémon evolve ciascuna specie.
 *
 * Perché serve. Nel dataset **il 41% delle carte evoluzione non dichiara
 * `evolveDa`** — ma è un'incoerenza fra stampe, non un dato mancante: la stessa
 * specie lo dichiara in un set e lo tace in un altro. Su 2.037 carte senza il
 * campo, 1.839 (il 90%) hanno un'altra stampa che lo compila.
 *
 * Senza questo indice il motore non riesce a collegare l'Ivysaur che possiedi al
 * tuo Bulbasaur: lo tratta da orfano, lo esclude dal mazzo o lo gioca "come
 * Base", e arriva perfino a proporre di stampare una pre-evoluzione che hai già
 * nella scatola. Con l'indice, i collegamenti si recuperano tutti in una volta.
 *
 * Strumento di **sviluppo**: va rieseguito solo quando si scaricano set nuovi.
 * La PWA legge il JSON prodotto, non questo script.
 *
 * Uso:
 *     node tools/genera-indice-evoluzioni.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CARTELLA_SET = 'data/set';
const USCITA = 'data/evoluzioni.json';

/**
 * Normalizza un nome come fa `src/engine/nomi.js`.
 *
 * Duplicato apposta: questo è uno strumento di sviluppo che gira in Node e non
 * deve dipendere dai moduli della PWA. Se la regola cambia là, va allineata qui.
 *
 * @param {string} nome
 * @returns {string}
 */
function normalizza(nome) {
  return String(nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const file = readdirSync(CARTELLA_SET)
  .filter((f) => f.endsWith('.json') && f !== 'indice.json')
  .sort();

/** @type {Map<string, string>} nome normalizzato → nome della pre-evoluzione */
const evoluzioni = new Map();
/**
 * Quante stampe di ogni specie dichiarano ciascuno stadio.
 *
 * Serve perché **l'indice, da solo, mente**: la carta *Dark Crobat* (neo4 #2) è
 * un Livello 2 e dichiara `evolveDa: Zubat`, che è il Base. Chi ricostruisce
 * una linea leggendo solo `da` mette Dark Crobat al gradino di Golbat — un
 * Livello 2 in mezzo ai Livello 1. Lo stadio è l'unico dato che permette di
 * accorgersene, ed è scritto sulla carta.
 *
 * Si conta invece di tenere il primo perché le stampe si contraddicono fra loro
 * (`Crobat ex` sta senza stadio in un set e come Livello 2 in un altro): vince
 * la maggioranza, che è la lettura più difendibile senza guardare le carte a
 * una a una.
 *
 * @type {Map<string, Map<string, number>>} nome normalizzato → stadio → quante
 */
const stadiVisti = new Map();
/** Tutti i nomi di Pokémon visti, normalizzati: serve a riconoscere i fossili. */
const speciePokemon = new Set();
/** Nome normalizzato → nome come sta scritto sulla carta, per riscriverlo bene. */
const comeScritto = new Map();
/** Conflitti: la stessa specie con due pre-evoluzioni diverse. */
const conflitti = [];
let carteLette = 0;

for (const nomeFile of file) {
  const set = JSON.parse(readFileSync(join(CARTELLA_SET, nomeFile), 'utf8'));
  for (const carta of set.carte ?? []) {
    if (carta.categoria === 'Pokémon') {
      speciePokemon.add(normalizza(carta.nome));
      if (!comeScritto.has(normalizza(carta.nome))) comeScritto.set(normalizza(carta.nome), carta.nome);
      if (carta.stadio) {
        const chiave = normalizza(carta.nome);
        if (!stadiVisti.has(chiave)) stadiVisti.set(chiave, new Map());
        const conta = stadiVisti.get(chiave);
        conta.set(carta.stadio, (conta.get(carta.stadio) ?? 0) + 1);
      }
    }
    if (carta.categoria !== 'Pokémon' || !carta.evolveDa) continue;
    carteLette++;

    const chiave = normalizza(carta.nome);
    const gia = evoluzioni.get(chiave);
    if (gia && normalizza(gia) !== normalizza(carta.evolveDa)) {
      // Succede con le forme regionali che condividono il nome: si tiene la
      // prima e si segnala, invece di sovrascrivere in silenzio.
      conflitti.push(`${carta.nome}: ${gia} / ${carta.evolveDa}`);
      continue;
    }
    if (!gia) evoluzioni.set(chiave, carta.evolveDa);
  }
}

// Ordinato per nome: così il file è stabile fra due esecuzioni e il diff in
// git mostra solo le specie davvero cambiate.
const da = Object.fromEntries([...evoluzioni.entries()].sort(([a], [b]) => a.localeCompare(b)));

// I fossili: Omanyte "evolve" da *Vecchio Helixfossile*, che è una carta
// Allenatore, non un Pokémon. Chi legge l'indice deve poterlo sapere, o finisce
// per stampare un fossile come se fosse un Pokémon Base — è successo davvero.
// Il nome si riconosce solo qui, dove si vedono tutte le categorie del dataset.
const nonPokemon = [
  ...new Set(
    [...evoluzioni.values()].filter((nome) => !speciePokemon.has(normalizza(nome))),
  ),
].sort((a, b) => a.localeCompare(b));

/**
 * Lo stadio di ogni specie, come numero: 0 Base, 1 Livello 1, 2 Livello 2.
 *
 * Solo i tre stadi canonici. VMAX, TURBO, MEGA e compagnia non sono gradini di
 * una linea: sono modi di stampare una carta, e messi in scala falserebbero il
 * livello della specie.
 */
const SCALA = ['Base', 'Livello 1', 'Livello 2'];
const stadi = {};
for (const [nome, conta] of [...stadiVisti].sort(([a], [b]) => a.localeCompare(b))) {
  const [vincitore] = [...conta].sort((x, y) => y[1] - x[1]);
  const livello = SCALA.indexOf(vincitore[0]);
  if (livello >= 0) stadi[nome] = livello;
}

/**
 * Deduce i collegamenti che **nessuna stampa dichiara**.
 *
 * Il caso che ha fatto scoprire il buco: la linea di *Exeggcute del Team
 * Rocket* si fermava al Base. Non per un errore del motore — nel dataset
 * *Exeggutor del Team Rocket* semplicemente non dice da cosa evolve, e non lo
 * dice **nessuna** delle sue stampe. L'indice recupera i collegamenti taciuti
 * confrontando stampe diverse della stessa carta, ma qui non c'è niente da
 * confrontare.
 *
 * C'è però una regolarità nei nomi: le carte "a tema" portano tutte lo stesso
 * qualificatore — *del Team Rocket*, *di Alola*, *di Erika*, *Team Aqua's* — e
 * la linea vale dentro il tema. Se *Exeggutor* evolve da *Exeggcute*, allora
 * *Exeggutor del Team Rocket* evolve da *Exeggcute del Team Rocket*, **a patto
 * che quella carta esista davvero**.
 *
 * Due guardie, perché una deduzione sbagliata è peggio di un collegamento
 * mancante — quello si vede, questa no:
 *
 * 1. la pre-evoluzione dedotta deve **esistere** fra le carte lette;
 * 2. gli stadi devono essere consecutivi. Senza, *Espeon V* risulterebbe
 *    evoluzione di *Eevee V*: sono due carte **Base** entrambe, e la linea
 *    sarebbe inventata.
 *
 * @param {Record<string, string>} da collegamenti dichiarati
 * @param {Record<string, number>} stadi stadio di ogni specie
 * @returns {Record<string, string>} solo i collegamenti nuovi
 */
function deduciCollegamenti(da, stadi) {
  const dedotti = {};
  const dichiarati = Object.keys(da);

  for (const nome of [...speciePokemon].sort()) {
    if (da[nome]) continue;

    // La specie dentro il nome: il pezzo più lungo che è già una carta con una
    // linea nota. "Exeggutor del Team Rocket" contiene "exeggutor", che evolve.
    const basi = dichiarati.filter((b) => b !== nome && ` ${nome} `.includes(` ${b} `));
    if (!basi.length) continue;
    const base = basi.reduce((a, b) => (b.length > a.length ? b : a));

    const preBase = normalizza(da[base]);
    const qualificatore = nome.replace(base, '').trim();
    // Il qualificatore può stare davanti o dietro: "Alolan Dugtrio" ma anche
    // "Muk di Alola". Si provano le due posizioni e si tiene quella che
    // corrisponde a una carta vera.
    const candidati = [`${preBase} ${qualificatore}`.trim(), `${qualificatore} ${preBase}`.trim()];
    const trovato = candidati.find((c) => c !== nome && speciePokemon.has(c));
    if (!trovato) continue;

    const suo = stadi[nome];
    const sopra = stadi[trovato];
    if (!Number.isInteger(suo) || !Number.isInteger(sopra) || suo !== sopra + 1) continue;

    dedotti[nome] = comeScritto.get(trovato) ?? trovato;
  }
  return dedotti;
}

const dedotti = deduciCollegamenti(da, stadi);
for (const [nome, pre] of Object.entries(dedotti)) da[nome] = pre;

const indice = { da, nonPokemon, stadi };
writeFileSync(USCITA, `${JSON.stringify(indice, null, 0)}\n`);

const peso = (JSON.stringify(indice).length / 1024).toFixed(1);
console.log(`Letti ${file.length} set, ${carteLette} carte con evolveDa dichiarato.`);
console.log(`Scritte ${Object.keys(da).length} specie in ${USCITA} (${peso} KB).`);
console.log(`Stadio noto per ${Object.keys(stadi).length} specie.`);
console.log(`Collegamenti dedotti dai nomi a tema: ${Object.keys(dedotti).length}`);
for (const [nome, pre] of Object.entries(dedotti)) console.log(`   ${nome} ← ${pre}`);
console.log(`Pre-evoluzioni che non sono Pokémon (fossili e simili): ${nonPokemon.length}`);
for (const n of nonPokemon) console.log('  ', n);
if (conflitti.length) {
  console.log(`\n${conflitti.length} nomi con pre-evoluzioni discordanti (tenuta la prima):`);
  for (const c of conflitti.slice(0, 10)) console.log('  ', c);
  if (conflitti.length > 10) console.log(`   …e altri ${conflitti.length - 10}`);
}
