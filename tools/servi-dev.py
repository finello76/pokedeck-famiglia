"""Server statico di SVILUPPO con cache disattivata.

Identico a `python3 -m http.server`, ma ogni risposta esce con
`Cache-Control: no-store`: durante lo sviluppo il browser deve rileggere i
file modificati, non riusare moduli ES e CSS dalla cache HTTP.

Strumento di sviluppo, non runtime: la PWA pubblicata non ne ha bisogno.

Uso:
    python3 tools/servi-dev.py [porta]     # default 8000
"""

import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class SenzaCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'Server di sviluppo su http://localhost:{porta} (cache disattivata)')
    HTTPServer(('', porta), SenzaCache).serve_forever()
