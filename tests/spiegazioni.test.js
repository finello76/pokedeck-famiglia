/**
 * Test delle spiegazioni che compaiono in partita.
 *
 * La regola qui non è "quale testo esce" ma **quando** esce: una spiegazione
 * arriva nel momento in cui la regola entra in gioco, perché è l'unico istante
 * in cui chi guarda ha già in testa la domanda giusta. Sbagliare quel momento
 * la rende rumore.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quanteRegole, spiegazionePer } from '../src/engine/spiegazioni.js';

test('un attacco che sfrutta la debolezza spiega la debolezza', () => {
  const s = spiegazionePer({ tipo: 'attacco', debolezza: true, danno: 40 });
  assert.equal(s.chiave, 'debolezza');
  assert.match(s.testo, /doppio dei danni/);
});

test('la debolezza ha la precedenza sulla resistenza', () => {
  // Se un attacco tocca entrambe, si spiega quella che cambia di più il numero.
  const s = spiegazionePer({ tipo: 'attacco', debolezza: true, resistenza: true });
  assert.equal(s.chiave, 'debolezza');
});

test('ogni stato speciale ha la sua spiegazione', () => {
  for (const stato of ['Avvelenato', 'Bruciato', 'Addormentato', 'Paralizzato', 'Confuso']) {
    const s = spiegazionePer({ tipo: 'stato', stato });
    assert.equal(s?.chiave, stato, `manca la spiegazione di ${stato}`);
    assert.ok(s.testo.length > 30, 'una spiegazione di tre parole non spiega');
  }
});

test('un attacco che addormenta spiega il sonno, non la moneta', () => {
  const s = spiegazionePer({ tipo: 'attacco', stati: ['Addormentato'], moneta: true });
  assert.equal(s.chiave, 'Addormentato');
});

test('un attacco normale non spiega niente', () => {
  assert.equal(spiegazionePer({ tipo: 'attacco', danno: 20 }), null);
});

test('gli eventi di servizio non interrompono la partita', () => {
  for (const tipo of ['pesca', 'turno', 'schiera', 'energia', 'ko', 'promosso']) {
    assert.equal(spiegazionePer({ tipo }), null, `${tipo} non deve fermare il gioco`);
  }
});

test('un Allenatore da applicare a mano si spiega, uno riconosciuto no', () => {
  assert.equal(spiegazionePer({ tipo: 'allenatore', daApplicareAMano: true }).chiave, 'a-mano');
  assert.equal(spiegazionePer({ tipo: 'allenatore', daApplicareAMano: false }), null);
});

test('il primo Premio spiega perché si gioca', () => {
  assert.match(spiegazionePer({ tipo: 'premio', restano: 2 }).testo, /Chi le prende\s+tutte vince/);
});

test('un evento sconosciuto non fa esplodere niente', () => {
  assert.equal(spiegazionePer({ tipo: 'roba-nuova' }), null);
  assert.equal(spiegazionePer(null), null);
});

test('tutte le spiegazioni hanno titolo e testo', () => {
  const eventi = [
    { tipo: 'attacco', debolezza: true },
    { tipo: 'attacco', resistenza: true },
    { tipo: 'ritirata' },
    { tipo: 'premio' },
    { tipo: 'evoluzione' },
    { tipo: 'mulligan' },
    { tipo: 'moneta' },
    { tipo: 'confusione' },
    { tipo: 'allenatore', daApplicareAMano: true },
  ];
  for (const e of eventi) {
    const s = spiegazionePer(e);
    assert.ok(s?.titolo && s.testo, `${e.tipo} senza spiegazione completa`);
  }
  assert.ok(quanteRegole() >= 12);
});
