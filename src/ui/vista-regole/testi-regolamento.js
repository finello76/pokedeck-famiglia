/**
 * Il regolamento del Pokémon TCG, riscritto per essere consultato durante la
 * partita.
 *
 * **Non è una copia del regolamento ufficiale**: le regole di un gioco sono
 * fatti, ma il testo che le descrive appartiene a chi l'ha scritto. Queste
 * spiegazioni sono originali, ordinate secondo le domande che ci si pone
 * davvero al tavolo ("tocca a me, cosa posso fare?") invece che secondo
 * l'indice di un manuale.
 *
 * Sono **dati**, non markup: la vista li disegna, qui non si sa nulla di HTML.
 * Aggiungere una voce significa aggiungere un oggetto, non scrivere una pagina.
 *
 * @module ui/vista-regole/testi-regolamento
 */

/**
 * @typedef {object} Voce
 * @property {string} titolo
 * @property {string} [testo] paragrafo introduttivo
 * @property {string[]} [punti] elenco puntato
 * @property {string} [attenzione] l'errore che si fa più spesso su questo punto
 */

/**
 * @typedef {object} Sezione
 * @property {string} id ancora stabile, per i collegamenti interni
 * @property {string} titolo
 * @property {string} sommario una riga, per l'indice
 * @property {Voce[]} voci
 */

/** @type {Sezione[]} */
export const REGOLAMENTO = [
  {
    id: 'scopo',
    titolo: 'Come si vince',
    sommario: 'Tre modi di chiudere la partita, non uno solo.',
    voci: [
      {
        titolo: 'Le tre vittorie',
        testo:
          'La partita finisce appena si verifica una di queste tre cose. Vale la prima ' +
          'che capita, non c\'è un ordine di importanza.',
        punti: [
          'Hai preso tutte le tue carte Premio.',
          'Il tuo avversario non ha più Pokémon in gioco (né attivo né in panchina).',
          'Il tuo avversario deve pescare all\'inizio del turno ma il suo mazzo è finito.',
        ],
        attenzione:
          'Il mazzo che finisce fa perdere solo quando si dovrebbe pescare, non nel ' +
          'momento in cui si esaurisce. Chi resta a zero carte può ancora giocare il ' +
          'proprio turno per intero.',
      },
      {
        titolo: 'Le carte Premio',
        testo:
          'Ogni volta che metti KO un Pokémon avversario prendi una carta Premio e la ' +
          'aggiungi alla mano. Sono carte del tuo mazzo, messe da parte coperte a inizio ' +
          'partita: non sai quali siano finché non le prendi.',
        attenzione:
          'Alcuni Pokémon con regole proprie (V, ex, GX) fanno prendere due Premi invece ' +
          'di uno quando vanno KO. I mazzi generati da questa app li escludono.',
      },
    ],
  },

  {
    id: 'preparazione',
    titolo: 'Preparare la partita',
    sommario: 'Dal mescolare al primo turno, nell\'ordine giusto.',
    voci: [
      {
        titolo: 'I passi, in ordine',
        punti: [
          'Stringetevi la mano e decidete a sorte chi inizia (moneta, dado, quello che avete).',
          'Mescolate il mazzo e pescate la mano iniziale.',
          'Mettete un Pokémon Base coperto come Pokémon attivo, davanti a voi.',
          'Potete aggiungere altri Pokémon Base in panchina, sempre coperti.',
          'Mettete da parte le carte Premio, coperte, dal vostro mazzo.',
          'Scoprite tutti insieme i Pokémon: la partita comincia.',
        ],
      },
      {
        titolo: 'Se la mano non ha Pokémon Base',
        testo:
          'Senza un Pokémon Base non puoi cominciare. Mostra la mano all\'avversario, ' +
          'rimescolala nel mazzo e pescane una nuova. Per ogni volta che ti succede, ' +
          'l\'avversario può pescare una carta in più.',
        attenzione:
          'Quante carte pescare e quanti Premi mettere da parte dipendono dal formato: ' +
          'guarda la scheda del tuo formato qui sopra. I mazzi ridotti usano numeri più piccoli.',
      },
    ],
  },

  {
    id: 'campo',
    titolo: 'Il campo di gioco',
    sommario: 'Dove sta ogni cosa e a cosa serve.',
    voci: [
      {
        titolo: 'Le zone',
        punti: [
          'Pokémon attivo: quello che combatte. Ce n\'è sempre esattamente uno.',
          'Panchina: i Pokémon di riserva, pronti a entrare. Possono ricevere Energie ma non attaccare.',
          'Mazzo: le carte da pescare, coperte.',
          'Carte Premio: il tuo bottino, coperte di lato.',
          'Pila degli scarti: carte usate, Pokémon KO ed Energie perse. Sempre scoperta e consultabile da entrambi.',
        ],
        attenzione:
          'La pila degli scarti si può guardare in qualsiasi momento, anche quella ' +
          'dell\'avversario. Non è un segreto e non serve chiedere il permesso.',
      },
    ],
  },

  {
    id: 'turno',
    titolo: 'Il tuo turno',
    sommario: 'Cosa puoi fare, quante volte, e in che ordine.',
    voci: [
      {
        titolo: 'Si comincia sempre pescando',
        testo:
          'Peschi una carta. Non è facoltativo: se il mazzo è vuoto e non puoi pescare, ' +
          'hai perso.',
      },
      {
        titolo: 'Poi, quante volte vuoi',
        punti: [
          'Mettere Pokémon Base in panchina, finché c\'è posto.',
          'Far evolvere i tuoi Pokémon.',
          'Giocare carte Strumento attaccandole ai Pokémon (una per Pokémon).',
          'Giocare carte Aiuto (le vecchie "Oggetto").',
          'Usare le abilità che dicono di poter essere usate.',
        ],
      },
      {
        titolo: 'Una volta per turno soltanto',
        punti: [
          'Attaccare una carta Energia a un tuo Pokémon, attivo o in panchina.',
          'Giocare una carta Aiuto Speciale (Supporter).',
          'Giocare una carta Stadio.',
          'Ritirare il Pokémon attivo, pagandone il costo in Energie.',
        ],
        attenzione:
          'Il limite di un\'Energia per turno è la regola che detta il ritmo di tutta la ' +
          'partita. È anche quella che si dimentica più spesso.',
      },
      {
        titolo: 'Si finisce attaccando',
        testo:
          'L\'attacco chiude il turno: dopo aver attaccato non puoi fare altro. Puoi anche ' +
          'scegliere di non attaccare e passare.',
        attenzione:
          'Chi gioca per primo nel primissimo turno della partita non può attaccare. ' +
          'Nelle regole attuali non pesca nemmeno un vantaggio: comincia e basta.',
      },
    ],
  },

  {
    id: 'pokemon',
    titolo: 'Pokémon ed evoluzioni',
    sommario: 'Quando si può evolvere e cosa resta attaccato.',
    voci: [
      {
        titolo: 'Evolvere',
        testo:
          'Metti la carta evoluzione sopra il Pokémon da cui evolve. Il Pokémon conserva ' +
          'i danni già subiti, le Energie attaccate e gli Strumenti: cambia solo la carta ' +
          'in cima, con i suoi PS e i suoi attacchi.',
        punti: [
          'Non puoi evolvere un Pokémon nel turno in cui l\'hai messo in gioco.',
          'Non puoi evolvere nel tuo primo turno di partita.',
          'Puoi evolvere sia il Pokémon attivo sia quelli in panchina.',
          'Evolvere fa guarire dai problemi di stato (Addormentato, Confuso, Paralizzato).',
        ],
        attenzione:
          'I danni NON si curano evolvendo. Un Pokémon con 30 danni resta con 30 danni ' +
          'anche dopo l\'evoluzione, semplicemente ha più PS totali.',
      },
      {
        titolo: 'Ritirarsi',
        testo:
          'Scarta dal Pokémon attivo tante Energie quanto indica il costo di ritirata, poi ' +
          'scambialo con uno della panchina. Una volta per turno.',
        attenzione:
          'Ritirarsi fa guarire dai problemi di stato: a volte conviene ritirarsi solo ' +
          'per togliersi di dosso il Sonno o la Paralisi.',
      },
      {
        titolo: 'Quando un Pokémon va KO',
        testo:
          'Quando i danni raggiungono o superano i PS, il Pokémon va KO. Scarta la carta ' +
          'con tutto ciò che aveva attaccato, l\'avversario prende una carta Premio, e tu ' +
          'scegli un Pokémon della panchina come nuovo attivo.',
        attenzione:
          'Se non hai Pokémon in panchina da far entrare, hai perso la partita.',
      },
    ],
  },

  {
    id: 'attacchi',
    titolo: 'Attacchi e danni',
    sommario: 'Come si calcola quanto fa male.',
    voci: [
      {
        titolo: 'Pagare l\'attacco',
        testo:
          'A sinistra di ogni attacco ci sono i simboli delle Energie che servono. Un ' +
          'simbolo incolore (la stella bianca) si paga con un\'Energia di qualsiasi tipo; ' +
          'un simbolo colorato vuole quel tipo preciso.',
        attenzione:
          'Le Energie non si consumano attaccando: restano sul Pokémon e servono anche ' +
          'per il turno dopo. Si perdono solo ritirandosi, per effetto di una carta, o ' +
          'quando il Pokémon va KO.',
      },
      {
        titolo: 'Debolezza e resistenza',
        punti: [
          'Debolezza: il danno raddoppia (o aumenta del valore indicato).',
          'Resistenza: il danno cala di 30 (o del valore indicato).',
          'Si applicano solo al Pokémon attivo colpito, mai a quelli in panchina.',
        ],
        attenzione:
          'Debolezza e resistenza si calcolano sul danno base dell\'attacco, dopo ' +
          'eventuali bonus e prima delle riduzioni scritte sulle carte.',
      },
      {
        titolo: 'Segnare i danni',
        testo:
          'Usa segnalini, monetine o quello che avete: l\'importante è che siano visibili ' +
          'a entrambi. I danni si accumulano turno dopo turno e non spariscono da soli.',
      },
    ],
  },

  {
    id: 'stato',
    titolo: 'Problemi di stato',
    sommario: 'Sonno, Confusione, Paralisi, Veleno, Bruciatura.',
    voci: [
      {
        titolo: 'I cinque stati',
        punti: [
          'Addormentato: non attacca e non si ritira. A fine turno lancia la moneta: testa e si sveglia. Gira la carta di lato.',
          'Confuso: per attaccare lancia la moneta; se esce croce l\'attacco fallisce e il Pokémon si fa 30 danni da solo. Gira la carta a testa in giù.',
          'Paralizzato: non attacca e non si ritira, ma guarisce da solo alla fine del tuo turno successivo.',
          'Avvelenato: prende 10 danni alla fine di ogni turno, di chiunque sia.',
          'Bruciato: alla fine di ogni turno lancia la moneta; croce e prende 20 danni.',
        ],
        attenzione:
          'Solo il Pokémon ATTIVO può avere un problema di stato. Appena va in panchina, ' +
          'per ritirata o per scambio, guarisce da tutto.',
      },
      {
        titolo: 'Quali si sommano',
        testo:
          'Veleno e Bruciatura possono stare insieme, e possono accompagnare uno degli ' +
          'altri tre. Sonno, Confusione e Paralisi invece si escludono a vicenda: il nuovo ' +
          'sostituisce il vecchio.',
      },
    ],
  },

  {
    id: 'allenatore',
    titolo: 'Carte Allenatore',
    sommario: 'I quattro tipi e i limiti di ciascuno.',
    voci: [
      {
        titolo: 'I quattro tipi',
        punti: [
          'Aiuto (Item): quante ne vuoi per turno. Si giocano e si scartano subito.',
          'Aiuto Speciale (Supporter): una sola per turno. Sono le più forti.',
          'Strumento (Tool): resta attaccata a un Pokémon, uno per Pokémon.',
          'Stadio (Stadium): resta in campo per entrambi i giocatori, uno solo alla volta.',
        ],
      },
      {
        titolo: 'Come funziona lo Stadio',
        testo:
          'Giocare uno Stadio quando ce n\'è già uno in campo scarta quello vecchio, anche ' +
          'se era dell\'avversario. Il suo effetto vale per tutti e due.',
        attenzione:
          'Non puoi giocare uno Stadio con lo stesso nome di quello già in campo solo ' +
          'per scartarlo.',
      },
    ],
  },

  {
    id: 'mazzo',
    titolo: 'Costruire un mazzo',
    sommario: 'Le regole ufficiali, e come le adatta questa app.',
    voci: [
      {
        titolo: 'Le regole ufficiali',
        punti: [
          'Esattamente 60 carte, né una di più né una di meno.',
          'Al massimo 4 copie di ogni carta, contate per nome.',
          'Le Energie base non hanno limite: puoi metterne quante vuoi.',
          'Almeno un Pokémon Base, altrimenti non puoi cominciare.',
        ],
      },
      {
        titolo: 'Cosa cambia qui',
        testo:
          'I formati ridotti (15, 20, 30) non sono ufficiali: sono adattamenti di casa per ' +
          'giocare con una collezione incompleta e in meno tempo. Il limite di 4 copie e ' +
          'l\'esenzione delle Energie base restano validi in tutti i formati.',
        attenzione:
          'Un mazzo generato da questa app non è legale in torneo, e le regole della casa ' +
          'stampate sul foglio valgono solo per la vostra partita.',
      },
    ],
  },
];
