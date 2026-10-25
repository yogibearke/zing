/**
 * Zing! - Content Data
 * 4 Kernpijlers:
 * 1. Ademhaling & Lichaamshouding (Fundament)
 * 2. Opwarmen & Stemregisters (Inzingen)
 * 3. Partituren & Repertoire (Koor, SATB)
 * 4. Tools & Zanghulpmiddelen (Stemtrainer, Metronoom, AI Tools, Solfège)
 */

const ContentData = {
  pillars: [
    {
      id: 'ademhaling',
      num: 1,
      badge: '01 • FUNDAMENT',
      themeClass: 'theme-cyan',
      icon: '🌬️',
      title: 'Ademhaling & Lichaamshouding',
      shortExplanation: 'Leer de lage buikademhaling en ademsteun om je keel te ontspannen en moeiteloos te zingen.',
      description: 'Zonder goede ademsteun raakt de keel snel vermoeid. Leer de beproefde buikademhaling en ontspan je schouders en kaken.',
      tools: [
        {
          id: 'builtin-breathing',
          title: '4-4-8 S-Klank Ademcirkel',
          type: 'builtin',
          targetScreen: 'screen-breathing',
          badge: 'Ingebouwd',
          badgeClass: 'badge-green',
          desc: 'Geanimeerde ademhalingstrainer met zachte chimes voor optimale ademsteun.'
        },
        {
          id: 'ext-breathing-francis',
          title: 'Buikademhaling Zangles – Francis van Broekhuizen',
          type: 'external',
          externalUrl: 'https://www.youtube.com/watch?v=TgBrmjx5ieA',
          embedUrl: 'https://www.youtube-nocookie.com/embed/TgBrmjx5ieA',
          badge: 'Videoles',
          badgeClass: 'badge-purple',
          desc: 'Operazangeres Francis van Broekhuizen legt helder uit hoe je buikademhaling inzet en uitademt op klank.'
        }
      ]
    },
    {
      id: 'opwarmen',
      num: 2,
      badge: '02 • INZINGEN',
      themeClass: 'theme-orange',
      icon: '🔥',
      title: 'Opwarmen & Stemregisters',
      shortExplanation: 'Zachte vocalises, lip trills ("brrr") en sirenes om de stembanden soepel en warm te maken.',
      description: 'Warm je stembanden altijd zachtjes op vóórdat je tonen gaat zingen. Dit voorkomt heesheid en brengt je stem naar voren in het masker.',
      tools: [
        {
          id: 'ext-maggie-dag1',
          title: 'Dag 1: Zang Opwarming – Start Hier (Maggie)',
          type: 'external',
          externalUrl: 'https://www.youtube.com/watch?v=FPUeABBzqCE&t=20s',
          embedUrl: 'https://www.youtube-nocookie.com/embed/FPUeABBzqCE?start=20',
          badge: 'Dag 1',
          badgeClass: 'badge-purple',
          desc: 'Start van de 7-daagse opwarmreeks: lip trills ("brrr") en stembanden zachtjes soepel maken.'
        },
        {
          id: 'ext-maggie-dag2',
          title: 'Dag 2: Zang Opwarming – Laat Spanning Los (Maggie)',
          type: 'external',
          externalUrl: 'https://www.youtube.com/watch?v=xgmENuJVgvQ',
          embedUrl: 'https://www.youtube-nocookie.com/embed/xgmENuJVgvQ',
          badge: 'Dag 2',
          badgeClass: 'badge-purple',
          desc: 'Keel, schouders en kaken ontspannen om moeiteloos en vrijer te kunnen zingen.'
        },
        {
          id: 'ext-maggie-dag3',
          title: 'Dag 3: Zang Opwarming – Leer Zuiver Zingen (Maggie)',
          type: 'external',
          externalUrl: 'https://www.youtube.com/watch?v=IcOXiD9-ako',
          embedUrl: 'https://www.youtube-nocookie.com/embed/IcOXiD9-ako',
          badge: 'Dag 3',
          badgeClass: 'badge-purple',
          desc: 'Train je intonatie: de toon eerst innerlijk horen en direct zuiver aanslaan.'
        },
        {
          id: 'ext-maggie-dag4',
          title: 'Dag 4: Zang Opwarming – Hoger & Lager Zingen (Maggie)',
          type: 'external',
          externalUrl: 'https://www.youtube.com/watch?v=xgmENuJVgvQ',
          embedUrl: 'https://www.youtube-nocookie.com/embed/xgmENuJVgvQ',
          badge: 'Dag 4',
          badgeClass: 'badge-purple',
          desc: 'Stap voor stap je stembereik naar boven en beneden voorzichtig uitbreiden.'
        },
        {
          id: 'ext-maggie-playlist',
          title: 'Volledige Reeks: Alle Zanglessen (Afspeellijst)',
          type: 'external',
          externalUrl: 'https://www.youtube.com/watch?v=9W9wA5UfUwU&list=PLk-WCbtGhaXsrJgxjuYOvuq1Q4fsd7VxG',
          embedUrl: 'https://www.youtube-nocookie.com/embed/9W9wA5UfUwU?list=PLk-WCbtGhaXsrJgxjuYOvuq1Q4fsd7VxG',
          badge: 'Afspeellijst',
          badgeClass: 'badge-purple',
          desc: 'De complete playlist van Zangles met Maggie met alle opeenvolgende opwarmers.'
        },
        {
          id: 'builtin-warmup',
          title: 'Automatische Piano Vocalises',
          type: 'builtin',
          targetScreen: 'screen-warmup',
          badge: 'Ingebouwd',
          badgeClass: 'badge-green',
          desc: 'Kies Bas/Alt, Bariton/Mezzo of Tenor/Sopraan. De piano speelt 5-toonsladder opwarmers omhoog en omlaag.'
        },
        {
          id: 'builtin-piano',
          title: 'Virtueel Referentieklavier (C3 - C5)',
          type: 'builtin',
          targetScreen: 'screen-piano',
          badge: 'Ingebouwd',
          badgeClass: 'badge-green',
          desc: 'Bespeelbaar klavier om toonladders en losse referentietonen aan te slaan.'
        },
        {
          id: 'score-toonladder',
          title: 'Dagelijkse Inzing-Toonladder & 5-Toons Vocalise',
          type: 'builtin',
          targetScreen: 'screen-scores',
          scoreKey: 'toonladder-oefening',
          badge: 'Inzingen',
          badgeClass: 'badge-gold',
          desc: '5-toonsladder in C-groot om de stembanden rustig soepel te maken op klinkers.'
        },
        {
          id: 'ext-pitchhighway',
          title: 'PitchHighway Guided Warm-up',
          type: 'external',
          openInNewTab: true,
          externalUrl: 'https://pitchhighway.com',
          badge: 'Extern ↗',
          badgeClass: 'badge-purple',
          desc: 'Gratis online opwarmer met pianobegeleiding (opent direct in nieuw tabblad).'
        }
      ]
    },
    {
      id: 'partituren',
      num: 3,
      badge: '03 • REPERTOIRE',
      themeClass: 'theme-pink',
      icon: '🎼',
      title: 'Partituren & Repertoire',
      shortExplanation: 'Instuderen van koorpartijen (SATB), interactieve MusicXML bladmuziek en oefenspeler.',
      description: 'Zing meerstemmig in een koor of ensemble. Oefen jouw stempartij (S/A/T/B) met instelbaar tempo, dynamische partituren en uploadmogelijkheid.',
      tools: [
        {
          id: 'score-komt-vrienden',
          title: '1. Komt vrienden in het ronde (Het Slijperslied)',
          type: 'builtin',
          targetScreen: 'screen-scores',
          scoreKey: 'komt-vrienden',
          badge: 'SATB Koor',
          badgeClass: 'badge-green',
          desc: 'Originele partituur in d-mineur (2/4 maat met 1/8 opmaat). Oefen Sopraan, Alt, Tenor, Bas of Tutti.'
        },
        {
          id: 'score-befiehl-du-deine-wege',
          title: '44. Befiehl du deine Wege (J.S. Bach - Matthäus-Passion)',
          type: 'builtin',
          targetScreen: 'screen-scores',
          scoreKey: 'befiehl-du-deine-wege',
          badge: 'SATB Koraal',
          badgeClass: 'badge-gold',
          desc: 'Klassiek 4-stemmig koraal BWV 244 in D-groot (4/4 maat met 1/4 opmaat). Oefen Sopraan, Alt, Tenor, Bas of Tutti.'
        },
        {
          id: 'score-calypso',
          title: 'Calypso (Jan Holstock)',
          type: 'builtin',
          targetScreen: 'screen-scores',
          scoreKey: 'calypso',
          badge: 'Koorlied',
          badgeClass: 'badge-purple',
          desc: 'Vrolijk 4/4 koorlied van Jan Holstock. Oefen melodie, tempo en zangbegeleiding.'
        }
      ]
    },
    {
      id: 'tools',
      num: 4,
      badge: '04 • TOOLS',
      themeClass: 'theme-purple',
      icon: '🛠️',
      title: 'Tools & Zanghulpmiddelen',
      shortExplanation: 'Stemtrainer, metronoom, AI stem-splitters, gehoortraining en solfège.',
      description: 'Handige hulpmiddelen voor elke zanger: controleer zuiverheid, houd de maat, splits zang uit opnames of train solfège.',
      tools: [
        {
          id: 'builtin-tuner',
          title: 'Live Stemtrainer & A3 Toondetector',
          type: 'builtin',
          targetScreen: 'screen-tuner',
          badge: 'Ingebouwd',
          badgeClass: 'badge-green',
          desc: 'Zing in de microfoon. Toont direct de noot (bijv. A3, C4), de Hz en naaldindicator.'
        },
        {
          id: 'builtin-metronome',
          title: 'Interactieve Visuele Metronoom',
          type: 'builtin',
          targetScreen: 'screen-metronome',
          badge: 'Ingebouwd',
          badgeClass: 'badge-green',
          desc: 'Instelbaar van 40 tot 200 BPM met visuele puls en audio-klak.'
        },
        {
          id: 'ext-pitchcraft',
          title: 'PitchCraft Live Pianorol',
          type: 'external',
          externalUrl: 'https://pitchcraft.thapps.dev',
          badge: 'Webapp',
          badgeClass: 'badge-purple',
          desc: 'Tekent je gezongen lijn realtime op een pianorol. Zie je vibrato en zuiverheidscurve.'
        },
        {
          id: 'ext-vocalremover',
          title: 'VocalRemover.org AI Stem-Splitter',
          type: 'external',
          externalUrl: 'https://vocalremover.org',
          badge: 'AI Tool',
          badgeClass: 'badge-purple',
          desc: '100% gratis in de browser. Splitst elk liedje in instrumentale begeleiding en zangstem.'
        },
        {
          id: 'ext-moises',
          title: 'Moises.ai Repetitie Station',
          type: 'external',
          externalUrl: 'https://moises.ai',
          badge: 'Repetitie',
          badgeClass: 'badge-gold',
          desc: 'Oefen koorpartijen: vertraag moeilijke passages en zet specifieke stemmen harder.'
        },
        {
          id: 'ext-singingcarrots',
          title: 'Singing Carrots Pitch Monitor',
          type: 'external',
          externalUrl: 'https://singingcarrots.com/pitch-monitor',
          badge: 'Webapp',
          badgeClass: 'badge-purple',
          desc: 'Browser-gebaseerde pitch tracker om lange tonen stabiel te leren aanhouden.'
        },
        {
          id: 'ext-rangetest',
          title: 'Singing Range Test',
          type: 'external',
          externalUrl: 'https://singingrangetest.com',
          badge: 'Webapp',
          badgeClass: 'badge-gold',
          desc: 'Vind binnen 60 seconden je stembereik (laagste tot hoogste comfortabele noot).'
        },
        {
          id: 'ext-muted',
          title: 'Muted.io Voice Tuner',
          type: 'external',
          externalUrl: 'https://muted.io',
          badge: 'Webapp',
          badgeClass: 'badge-purple',
          desc: 'Minimalistische, razendsnelle stem-stemmer met toetsenbord.'
        },
        {
          id: 'ext-teoria',
          title: 'Teoria.com Solfège & Gehoor',
          type: 'external',
          externalUrl: 'https://www.teoria.com',
          badge: 'Gouden Standaard',
          badgeClass: 'badge-gold',
          desc: 'De meest complete gratis site voor intervallen horen, Do-Re-Mi en solfège.'
        },
        {
          id: 'ext-musictheory',
          title: 'Musictheory.net Oefeningen',
          type: 'external',
          externalUrl: 'https://www.musictheory.net',
          badge: 'Webapp',
          badgeClass: 'badge-purple',
          desc: 'Heldere interactieve trainers voor noten lezen, toonsoorten en akkoorden.'
        },
        {
          id: 'ext-tonegym',
          title: 'ToneGym Luisterspelletjes',
          type: 'external',
          externalUrl: 'https://www.tonegym.co',
          badge: 'Speels Leren',
          badgeClass: 'badge-purple',
          desc: 'Gamified gehoortraining met dagelijkse luisteroefeningen en melodiedictees.'
        },
        {
          id: 'ext-cpdl',
          title: 'CPDL Koorbladmuziek Database',
          type: 'external',
          externalUrl: 'https://www.cpdl.org',
          badge: 'Bibliotheek',
          badgeClass: 'badge-purple',
          desc: 'Duizenden gratis koorpartituren (PDF) en MIDI-oefenbestanden per stemsoort (S/A/T/B).'
        },
        {
          id: 'ext-musescore',
          title: 'MuseScore Open Scores',
          type: 'external',
          externalUrl: 'https://musescore.org',
          badge: 'Bibliotheek',
          badgeClass: 'badge-purple',
          desc: 'Speel partituren interactief af en laat jouw eigen stempartij op de voorgrond treden.'
        }
      ]
    }
  ]
};
