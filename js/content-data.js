/**
 * Zing! - Content Data
 * 5 Kernpijlers in beproefde didactische volgorde:
 * 1. Ademhaling & Lichaam
 * 2. Opwarmen & Stemregisters (eerst soepel maken!)
 * 3. Gehoor & Zuiverheid (Pitch matching, A3)
 * 4. Ritme & Notenleer
 * 5. Koor, Partituren & Repertoire (met Spotify)
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
      id: 'zuiverheid',
      num: 3,
      badge: '03 • INTONATIE',
      themeClass: 'theme-green',
      icon: '🎯',
      title: 'Gehoor & Zuiverheid (Pitch)',
      shortExplanation: 'Train je gehoor op pitch matching. De realtime stemtrainer toont exact of je zuiver op A3 of C4 zit.',
      description: 'Luister eerst in stilte, stel je de noot voor in gedachten en zing na. De stemtrainer controleert direct of je op toonhoogte zit.',
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
          id: 'ext-pitchcraft',
          title: 'PitchCraft Live Pianorol',
          type: 'external',
          externalUrl: 'https://pitchcraft.thapps.dev',
          badge: 'Webapp',
          badgeClass: 'badge-purple',
          desc: 'Tekent je gezongen lijn realtime op een pianorol. Zie je vibrato en zuiverheidscurve.'
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
        }
      ]
    },
    {
      id: 'ritme',
      num: 4,
      badge: '04 • MAAT & NOTEN',
      themeClass: 'theme-purple',
      icon: '⏱️',
      title: 'Ritme & Notenleer',
      shortExplanation: 'Oefen het maathouden met de metronoom, solfège (Do-Re-Mi) en het herkennen van intervallen.',
      description: 'Muziek leeft van ritme en melodieafstand. Leer maat houden en herken de afstanden tussen noten (tertzen, kwinten).',
      tools: [
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
        }
      ]
    },
    {
      id: 'partituren',
      num: 5,
      badge: '05 • REPERTOIRE',
      themeClass: 'theme-pink',
      icon: '🎼',
      title: 'Koor, Partituren & Repertoire',
      shortExplanation: 'Instuderen van partijen (PDF), audiospeler met tempo-regeling én Spotify om het wijsje te leren.',
      description: 'Zing meerstemmig in een koor of ensemble. Lees je partituur en luister naar het originele nummer via Spotify om het wijsje te leren.',
      tools: [
        {
          id: 'builtin-scores',
          title: 'Partituren Viewer met Spotify & Audio-oefenspeler',
          type: 'builtin',
          targetScreen: 'screen-scores',
          badge: 'Ingebouwd',
          badgeClass: 'badge-green',
          desc: 'Lees PDF bladmuziek, luister naar het wijsje via Spotify en vertraag de oefentrack.'
        },
        {
          id: 'ext-vocalremover',
          title: 'VocalRemover.org AI Splitter',
          type: 'external',
          externalUrl: 'https://vocalremover.org',
          badge: 'Webapp',
          badgeClass: 'badge-purple',
          desc: '100% gratis in browser. Splitst elk liedje in instrumentale karaoke en zangpartij.'
        },
        {
          id: 'ext-moises',
          title: 'Moises.ai Repetitie Station',
          type: 'external',
          externalUrl: 'https://moises.ai',
          badge: 'Webapp',
          badgeClass: 'badge-gold',
          desc: 'Oefen koorpartijen: vertraag moeilijke passages en zet specifieke stemmen harder.'
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
          badge: 'Webapp',
          badgeClass: 'badge-purple',
          desc: 'Speel partituren interactief af en laat jouw eigen stempartij op de voorgrond treden.'
        }
      ]
    }
  ]
};
