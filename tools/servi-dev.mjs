/**
 * Server statico di SVILUPPO con cache disattivata — versione Node.
 *
 * Fa esattamente ciò che fa `tools/servi-dev.py`, ed esiste per una ragione
 * banale: su Windows Python spesso non c'è (il comando `python` è solo l'alias
 * che apre il Microsoft Store), mentre Node c'è di sicuro, perché serve già
 * agli strumenti di scarico dei set e ai test.
 *
 * Come il gemello Python: ogni risposta esce con `Cache-Control: no-store`,
 * altrimenti durante lo sviluppo il browser riusa moduli ES e CSS vecchi dalla
 * cache HTTP e si finisce per rincorrere modifiche già fatte.
 *
 * Strumento di sviluppo, non runtime: la PWA pubblicata non ne ha bisogno, e
 * non introduce nessuna dipendenza — usa solo moduli interni di Node.
 *
 * Uso:
 *     node tools/servi-dev.mjs [porta]     # default 8000
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';

const RADICE = process.cwd();
const PORTA = Number(process.argv[2]) || 8000;

/**
 * Tipo MIME per estensione.
 *
 * L'elenco è corto apposta: bastano i tipi che il progetto serve davvero. Il
 * `charset=utf-8` su HTML, CSS e JS non è ornamentale — senza, i nomi italiani
 * delle carte arrivano al browser con gli accenti rotti.
 */
const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = createServer(async (richiesta, risposta) => {
  const percorso = decodeURIComponent(new URL(richiesta.url, 'http://localhost').pathname);
  // `normalize` più il controllo del prefisso: senza, un `../../` nell'URL
  // servirebbe qualunque file del disco. È un server di sviluppo, ma resta in
  // ascolto su una rete.
  const file = normalize(join(RADICE, percorso.endsWith('/') ? percorso + 'index.html' : percorso));
  if (!file.startsWith(RADICE)) {
    risposta.writeHead(403).end('403');
    return;
  }

  try {
    const informazioni = await stat(file);
    const finale = informazioni.isDirectory() ? join(file, 'index.html') : file;
    risposta.writeHead(200, {
      'Content-Type': TIPI[extname(finale).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(finale).pipe(risposta);
  } catch {
    risposta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
});

server.listen(PORTA, () => console.log(`http://localhost:${PORTA}`));
