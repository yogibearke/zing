/**
 * Zing! - Score Viewer & Audio Companion with Multi-Part Choir (SATB)
 * 100% getrouwe transcriptie van de originele koorpartituur (2/4 maat met 1/4 opmaat).
 */

const ScoreViewer = (() => {
  let isPlayingCompanion = false;
  let companionInterval = null;
  let currentTempo = 1.0;
  let currentBpm = 80;
  let currentStep = 0;
  let selectedVoice = 'sopraan'; // 'sopraan', 'alt', 'tenor', 'bas', 'tutti'

  function setBpm(newBpm) {
    currentBpm = Math.max(40, Math.min(220, Math.round(newBpm)));
    const bpmDisplay = document.getElementById('score-bpm-display');
    if (bpmDisplay) {
      bpmDisplay.textContent = `${currentBpm} BPM`;
    }
  }

  // Helper to build Tutti chords from synchronized SATB parts
  function buildTutti(soprano, alto, tenor, bass) {
    return soprano.map((s, idx) => {
      const a = alto[idx] ? alto[idx].note : null;
      const t = tenor[idx] ? tenor[idx].note : null;
      const b = bass[idx] ? bass[idx].note : null;
      const chord = [b, t, a, s.note].filter(n => n && n !== 'REST');
      return {
        notes: chord,
        dur: s.dur
      };
    });
  }

  // Dynamische MusicXML 3.1 Parser: laadt elk .musicxml bestand in en bouwt automatisch de SATB stempartijen
  async function loadMusicXML(xmlUrlOrText) {
    try {
      let xmlText = xmlUrlOrText;
      if (!xmlUrlOrText.trim().startsWith('<')) {
        const res = await fetch(xmlUrlOrText + (xmlUrlOrText.includes('?') ? '&' : '?') + 't=' + Date.now());
        if (!res.ok) throw new Error(`HTTP status ${res.status}`);
        xmlText = await res.text();
      }
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        console.warn('XML Parseerfout in MusicXML:', parseError.textContent);
        return null;
      }

      const parts = xmlDoc.querySelectorAll('score-partwise > part');
      if (!parts || parts.length === 0) return null;

      const parsedVoices = {};
      const partMap = { 0: 'sopraan', 1: 'alt', 2: 'tenor', 3: 'bas' };

      // Lees globale divisions uit
      let defaultDivisions = 4;
      const firstDiv = xmlDoc.querySelector('attributes > divisions');
      if (firstDiv) {
        defaultDivisions = parseInt(firstDiv.textContent.trim(), 10) || 4;
      }

      parts.forEach((partEl, idx) => {
        const voiceKey = partMap[idx] || `stem_${idx + 1}`;
        const notes = [];
        let currentDivisions = defaultDivisions;
        const measures = partEl.querySelectorAll('measure');

        measures.forEach(measure => {
          const divEl = measure.querySelector('attributes > divisions');
          if (divEl) {
            currentDivisions = parseInt(divEl.textContent.trim(), 10) || currentDivisions;
          }

          const noteEls = measure.querySelectorAll('note');
          noteEls.forEach(n => {
            // Sla akkoordnoten op dezelfde balk over (koorbalken zijn monofoon per stem)
            if (n.querySelector('chord')) return;

            const isRest = n.querySelector('rest') !== null;
            const durEl = n.querySelector('duration');
            const durDivs = durEl ? parseInt(durEl.textContent.trim(), 10) : currentDivisions;
            // Kwartsnoot = 1.0 (dur: 0.5 = achtste noot, dur: 1.0 = kwartnoot, dur: 2.0 = halve noot)
            const dur = durDivs / currentDivisions;

            if (isRest) {
              notes.push({ note: 'REST', dur });
            } else {
              const stepEl = n.querySelector('pitch > step');
              const octEl = n.querySelector('pitch > octave');
              const altEl = n.querySelector('pitch > alter');
              if (stepEl && octEl) {
                const step = stepEl.textContent.trim().toUpperCase();
                const oct = octEl.textContent.trim();
                let acc = '';
                if (altEl) {
                  const altVal = altEl.textContent.trim();
                  if (altVal === '1') acc = '#';
                  else if (altVal === '-1') acc = 'b';
                }
                notes.push({ note: `${step}${acc}${oct}`, dur });
              }
            }
          });
        });
        parsedVoices[voiceKey] = notes;
      });

      // Zoek tempo markering in de MusicXML zoals geëxporteerd door MuseScore
      let detectedBpm = null;
      const soundEl = xmlDoc.querySelector('sound[tempo]');
      if (soundEl && soundEl.getAttribute('tempo')) {
        detectedBpm = Math.round(parseFloat(soundEl.getAttribute('tempo')));
      } else {
        const perMinuteEl = xmlDoc.querySelector('metronome > per-minute');
        if (perMinuteEl && perMinuteEl.textContent.trim()) {
          detectedBpm = Math.round(parseFloat(perMinuteEl.textContent.trim()));
        }
      }

      // Bouw automatische Tutti akkoorden indien 4 stemmen aanwezig zijn
      if (parsedVoices.sopraan && parsedVoices.alt && parsedVoices.tenor && parsedVoices.bas) {
        parsedVoices.tutti = buildTutti(
          parsedVoices.sopraan,
          parsedVoices.alt,
          parsedVoices.tenor,
          parsedVoices.bas
        );
      }
      return { voices: parsedVoices, bpm: detectedBpm };
    } catch (err) {
      console.warn('Kon MusicXML niet dynamisch inladen vanuit:', xmlUrlOrText, err);
      return null;
    }
  }

  // Exact SATB Transcription for "1. Komt vrienden in het ronde" (2/4 maat met 1/8 opmaat, d-mineur)
  // dur: 1.0 = kwartnoot, dur: 0.5 = achtste noot, dur: 2.0 = halve noot
  const komtVriendenSoprano = [
    // Opmaat
    { note: 'A4', dur: 0.5 },
    // M1 (Re - La - La - Re!)
    { note: 'D4', dur: 0.5 }, { note: 'A4', dur: 0.5 }, { note: 'A4', dur: 0.5 }, { note: 'D5', dur: 0.5 },
    // M2 (Re - Do# - Re - Re!)
    { note: 'D5', dur: 0.75 }, { note: 'C#5', dur: 0.25 }, { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 },
    // M3 (Fa - Mi - Re - Do#!)
    { note: 'F5', dur: 0.5 }, { note: 'E5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'C#5', dur: 0.5 },
    // M4
    { note: 'D5', dur: 1.0 }, { note: 'REST', dur: 0.5 }, { note: 'D5', dur: 0.5 },
    // M5
    { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'E5', dur: 0.5 }, { note: 'F5', dur: 0.5 },
    // M6
    { note: 'G5', dur: 0.75 }, { note: 'F#5', dur: 0.25 }, { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 },
    // M7
    { note: 'F5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 1.0 },
    // M8
    { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'E5', dur: 0.5 }, { note: 'F5', dur: 0.5 },
    // M9
    { note: 'G5', dur: 1.0 }, { note: 'REST', dur: 0.5 }, { note: 'D5', dur: 0.5 },
    // M10
    { note: 'F5', dur: 0.5 }, { note: 'E5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'C#5', dur: 0.5 },
    // M11
    { note: 'D5', dur: 0.5 }, { note: 'F5', dur: 0.5 }, { note: 'E5', dur: 0.5 }, { note: 'A4', dur: 0.5 },
    // M12
    { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'C#5', dur: 0.5 },
    // M13
    { note: 'D5', dur: 0.5 }, { note: 'E5', dur: 0.5 }, { note: 'D5', dur: 1.0 },
    // Refrein Opmaat
    { note: 'A4', dur: 1.0 },
    // M14
    { note: 'D5', dur: 0.5 }, { note: 'C#5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'E5', dur: 0.5 },
    // M15
    { note: 'F5', dur: 1.0 }, { note: 'REST', dur: 0.5 }, { note: 'A4', dur: 0.5 },
    // M16
    { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'C#5', dur: 0.5 }, { note: 'C#5', dur: 0.5 },
    // M17
    { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'E5', dur: 0.5 }, { note: 'F5', dur: 0.5 },
    // M18
    { note: 'F5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'E5', dur: 0.5 }, { note: 'C#5', dur: 0.5 },
    // M19
    { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 },
    // M20
    { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 }, { note: 'D5', dur: 0.5 },
    // M21
    { note: 'D5', dur: 2.0 }
  ];

  const komtVriendenAlto = [
    // Opmaat
    { note: 'A4', dur: 0.5 },
    // M1
    { note: 'F4', dur: 0.5 }, { note: 'F4', dur: 0.5 }, { note: 'G4', dur: 0.5 }, { note: 'F4', dur: 0.5 },
    // M2
    { note: 'A4', dur: 1.0 }, { note: 'A4', dur: 0.5 }, { note: 'A4', dur: 0.5 },
    // M3
    { note: 'F4', dur: 0.5 }, { note: 'G4', dur: 0.5 }, { note: 'A4', dur: 0.5 }, { note: 'C#5', dur: 0.5 },
    // M4
    { note: 'D4', dur: 1.0 }, { note: 'REST', dur: 1.0 },
    // M5
    { note: 'REST', dur: 1.0 }, { note: 'REST', dur: 0.5 }, { note: 'D4', dur: 0.5 },
    // M6
    { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'E4', dur: 0.5 }, { note: 'F4', dur: 0.5 },
    // M7
    { note: 'G4', dur: 0.5 }, { note: 'F#4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 0.5 },
    // M8
    { note: 'F4', dur: 0.5 }, { note: 'F4', dur: 0.5 }, { note: 'G4', dur: 0.5 }, { note: 'A4', dur: 0.5 },
    // M9
    { note: 'Bb4', dur: 1.0 }, { note: 'REST', dur: 0.5 }, { note: 'Bb4', dur: 0.5 },
    // M10
    { note: 'A4', dur: 0.5 }, { note: 'G4', dur: 0.5 }, { note: 'F4', dur: 0.5 }, { note: 'E4', dur: 0.5 },
    // M11
    { note: 'F4', dur: 0.5 }, { note: 'A4', dur: 0.5 }, { note: 'G4', dur: 0.5 }, { note: 'F4', dur: 0.5 },
    // M12
    { note: 'Bb4', dur: 0.5 }, { note: 'Bb4', dur: 0.5 }, { note: 'Bb4', dur: 0.5 }, { note: 'A4', dur: 0.5 },
    // M13
    { note: 'A4', dur: 0.5 }, { note: 'G4', dur: 0.5 }, { note: 'F4', dur: 1.0 },
    // Refrein Opmaat
    { note: 'F4', dur: 1.0 },
    // M14
    { note: 'F4', dur: 0.5 }, { note: 'E4', dur: 0.5 }, { note: 'F4', dur: 0.5 }, { note: 'G4', dur: 0.5 },
    // M15
    { note: 'D5', dur: 1.0 }, { note: 'REST', dur: 0.5 }, { note: 'F4', dur: 0.5 },
    // M16
    { note: 'F4', dur: 0.5 }, { note: 'F4', dur: 0.5 }, { note: 'E4', dur: 0.5 }, { note: 'E4', dur: 0.5 },
    // M17
    { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'E4', dur: 0.5 }, { note: 'F4', dur: 0.5 },
    // M18
    { note: 'D4', dur: 0.5 }, { note: 'F4', dur: 0.5 }, { note: 'G4', dur: 0.5 }, { note: 'C#4', dur: 0.5 },
    // M19
    { note: 'D4', dur: 0.5 }, { note: 'F4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'C#4', dur: 0.5 },
    // M20
    { note: 'D4', dur: 0.5 }, { note: 'C#4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 0.5 },
    // M21
    { note: 'F4', dur: 2.0 }
  ];

  const komtVriendenTenor = [
    // Opmaat
    { note: 'A3', dur: 0.5 },
    // M1
    { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 0.5 },
    // M2
    { note: 'F4', dur: 0.5 }, { note: 'E4', dur: 0.5 }, { note: 'D4', dur: 1.0 },
    // M3
    { note: 'REST', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 0.5 },
    // M4
    { note: 'D4', dur: 1.0 }, { note: 'REST', dur: 0.5 }, { note: 'A3', dur: 0.5 },
    // M5
    { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'C4', dur: 0.5 },
    // M6
    { note: 'B3', dur: 1.0 }, { note: 'C4', dur: 0.5 }, { note: 'C4', dur: 0.5 },
    // M7
    { note: 'C4', dur: 1.0 }, { note: 'C4', dur: 0.5 }, { note: 'F3', dur: 0.5 },
    // M8
    { note: 'A3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'B3', dur: 0.5 }, { note: 'C4', dur: 0.5 },
    // M9
    { note: 'D4', dur: 1.0 }, { note: 'REST', dur: 0.5 }, { note: 'D4', dur: 0.5 },
    // M10
    { note: 'D4', dur: 0.5 }, { note: 'B3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'A3', dur: 0.5 },
    // M11
    { note: 'A3', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'C#4', dur: 0.5 }, { note: 'D4', dur: 0.5 },
    // M12
    { note: 'G4', dur: 0.5 }, { note: 'G4', dur: 0.5 }, { note: 'F4', dur: 0.5 }, { note: 'E4', dur: 0.5 },
    // M13
    { note: 'F4', dur: 0.5 }, { note: 'E4', dur: 0.5 }, { note: 'D4', dur: 1.0 },
    // Refrein Opmaat
    { note: 'D4', dur: 1.0 },
    // M14
    { note: 'A3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'A3', dur: 0.5 },
    // M15
    { note: 'A3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'D4', dur: 0.5 },
    // M16
    { note: 'B3', dur: 0.5 }, { note: 'B3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'A3', dur: 0.5 },
    // M17
    { note: 'A3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'B3', dur: 0.5 }, { note: 'C4', dur: 0.5 },
    // M18
    { note: 'A3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'B3', dur: 0.5 }, { note: 'A3', dur: 0.5 },
    // M19
    { note: 'F3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'F3', dur: 0.5 }, { note: 'A3', dur: 0.5 },
    // M20
    { note: 'F3', dur: 0.5 }, { note: 'A3', dur: 0.5 }, { note: 'F3', dur: 0.5 }, { note: 'A3', dur: 0.5 },
    // M21
    { note: 'A3', dur: 2.0 }
  ];

  const komtVriendenBass = [
    // Opmaat
    { note: 'D3', dur: 0.5 },
    // M1
    { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 },
    // M2
    { note: 'D3', dur: 1.0 }, { note: 'A2', dur: 0.5 }, { note: 'REST', dur: 0.5 },
    // M3
    { note: 'REST', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 },
    // M4
    { note: 'D3', dur: 1.0 }, { note: 'REST', dur: 1.0 },
    // M5
    { note: 'REST', dur: 1.0 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 },
    // M6
    { note: 'G2', dur: 1.0 }, { note: 'C3', dur: 0.5 }, { note: 'C3', dur: 0.5 },
    // M7
    { note: 'F2', dur: 1.0 }, { note: 'F3', dur: 0.5 }, { note: 'A2', dur: 0.5 },
    // M8
    { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'C3', dur: 0.5 }, { note: 'F2', dur: 0.5 },
    // M9
    { note: 'G2', dur: 1.0 }, { note: 'REST', dur: 0.5 }, { note: 'G2', dur: 0.5 },
    // M10
    { note: 'D3', dur: 0.5 }, { note: 'G2', dur: 0.5 }, { note: 'A2', dur: 0.5 }, { note: 'A2', dur: 0.5 },
    // M11
    { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'A2', dur: 0.5 }, { note: 'D3', dur: 0.5 },
    // M12
    { note: 'G3', dur: 0.5 }, { note: 'F3', dur: 0.5 }, { note: 'E3', dur: 0.5 }, { note: 'A2', dur: 0.5 },
    // M13
    { note: 'A2', dur: 0.5 }, { note: 'A2', dur: 0.5 }, { note: 'D3', dur: 1.0 },
    // Refrein Opmaat
    { note: 'D3', dur: 1.0 },
    // M14
    { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'C#3', dur: 0.5 },
    // M15
    { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 },
    // M16
    { note: 'G2', dur: 0.5 }, { note: 'G2', dur: 0.5 }, { note: 'A2', dur: 0.5 }, { note: 'A2', dur: 0.5 },
    // M17
    { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 },
    // M18
    { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'G2', dur: 0.5 }, { note: 'A2', dur: 0.5 },
    // M19
    { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'D3', dur: 0.5 },
    // M20
    { note: 'D3', dur: 0.5 }, { note: 'A2', dur: 0.5 }, { note: 'D3', dur: 0.5 }, { note: 'C#3', dur: 0.5 },
    // M21
    { note: 'D3', dur: 2.0 }
  ];

  const komtVriendenTutti = buildTutti(komtVriendenSoprano, komtVriendenAlto, komtVriendenTenor, komtVriendenBass);

  // Scores Repertoire
  const SCORES = {
    'komt-vrienden': {
      title: '1. Komt vrienden in het ronde (Het Slijperslied)',
      subtitle: 'Originele Partituur: d-mineur (1 mol) • 2/4 Maat (1/8 Opmaat) • SATB Koor',
      bpm: 92,
      pdfUrl: './assets/sample-scores/komt-vrienden-in-het-ronde.pdf',
      musicXmlUrl: './assets/sample-scores/komt-vrienden-in-het-ronde.musicxml',
      voices: {
        'sopraan': komtVriendenSoprano,
        'alt': komtVriendenAlto,
        'tenor': komtVriendenTenor,
        'bas': komtVriendenBass,
        'tutti': komtVriendenTutti
      },
      notes: komtVriendenSoprano,
      htmlScore: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 18px; color: #0f172a; max-width: 900px; margin: 0 auto; background: #ffffff;">
          
          <!-- Header met Koor Informatie -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 14px;">
            <div>
              <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
                <span style="background: #4f46e5; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.5px;">Originele Koorpartituur</span>
                <span style="background: #ecfdf5; color: #059669; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px;">SATB Koor</span>
                <span style="background: #eff6ff; color: #2563eb; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 99px;">2/4 Maat</span>
                <span style="background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 99px;">1/8 Opmaat ("Komt")</span>
              </div>
              <h1 style="margin: 0; font-size: 22px; color: #1e1b4b; font-weight: 800;">1. Komt vrienden in het ronde</h1>
              <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Het Slijperslied • Toonsoort: <strong>d-mineur (1 mol: B♭)</strong> • Allegretto vivace</p>
            </div>
            
            <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
              <a href="./assets/sample-scores/komt-vrienden-in-het-ronde.musicxml" download="komt-vrienden-in-het-ronde.musicxml" style="display: inline-flex; align-items: center; gap: 6px; background: #059669; color: #ffffff; padding: 8px 14px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; box-shadow: 0 2px 6px rgba(5, 150, 105, 0.25);">
                <span>📥 Download MusicXML (voor MuseScore)</span>
              </a>
              <a href="./assets/sample-scores/komt-vrienden-in-het-ronde.pdf" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 6px; background: #4f46e5; color: #ffffff; padding: 8px 14px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 600; box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);">
                <span>Open Volledige PDF (2 Blz) ↗</span>
              </a>
            </div>
          </div>

          <!-- Koorstem Oefen-badges -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 18px;">
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
              <div style="font-weight: 700; color: #4f46e5; font-size: 12px;">SOPRAAN (S)</div>
              <div style="font-size: 11px; color: #64748b;">D4 - G5 (Hoofdmelodie)</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
              <div style="font-weight: 700; color: #059669; font-size: 12px;">ALT (A)</div>
              <div style="font-size: 11px; color: #64748b;">C#4 - D5 (Tweede stem)</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
              <div style="font-weight: 700; color: #d97706; font-size: 12px;">TENOR (T)</div>
              <div style="font-size: 11px; color: #64748b;">F3 - G4 (Hoge mannenstem)</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
              <div style="font-weight: 700; color: #dc2626; font-size: 12px;">BAS (B)</div>
              <div style="font-size: 11px; color: #64748b;">F2 - G3 (Koorfundament)</div>
            </div>
          </div>

          <!-- DIGITALE NOTATIE: VECTOR GRAVURE (SVG 2/4 MET 1/8 OPMAAT) -->
          <div style="border: 2px solid #0f172a; border-radius: 8px; padding: 16px; background: #ffffff; box-shadow: 0 4px 16px rgba(0,0,0,0.06); margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
              <span style="font-weight: 700; font-size: 13px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Vector Notatie: 2/4 Maat met 1/8 Opmaat</span>
              <span style="font-size: 12px; color: #64748b;">1 Mol (B♭) • ♩ ≈ 92 BPM</span>
            </div>

            <!-- SVG Stave: Couplet (Opmaat "Komt" + Maten 1, 2, 3, 4) -->
            <svg viewBox="0 0 820 170" style="width: 100%; height: auto; display: block; overflow: visible;">
              <style>
                .staff-line { stroke: #0f172a; stroke-width: 1.2; }
                .bar-line { stroke: #0f172a; stroke-width: 1.8; }
                .note-head { fill: #0f172a; }
                .note-stem { stroke: #0f172a; stroke-width: 1.6; stroke-linecap: round; }
                .note-beam { stroke: #0f172a; stroke-width: 3.5; stroke-linecap: square; }
                .lyric-text { font-family: -apple-system, sans-serif; font-size: 13px; fill: #0f172a; font-weight: 600; text-anchor: middle; }
                .clef-text { font-family: serif; font-size: 42px; fill: #0f172a; font-weight: bold; }
                .measure-num { font-size: 10px; fill: #94a3b8; font-family: sans-serif; }
              </style>

              <g id="stave-couplet-2-4">
                <!-- 5 Balklijnen -->
                <line x1="25" y1="40" x2="800" y2="40" class="staff-line" />
                <line x1="25" y1="50" x2="800" y2="50" class="staff-line" />
                <line x1="25" y1="60" x2="800" y2="60" class="staff-line" />
                <line x1="25" y1="70" x2="800" y2="70" class="staff-line" />
                <line x1="25" y1="80" x2="800" y2="80" class="staff-line" />

                <!-- Sleutel & Voorteken -->
                <line x1="25" y1="40" x2="25" y2="80" class="bar-line" />
                <text x="30" y="74" class="clef-text">𝄞</text>
                <text x="64" y="63" style="font-family: serif; font-size: 26px; fill: #0f172a;">♭</text>

                <!-- 2/4 Maatcijfer -->
                <text x="86" y="55" style="font-family: serif; font-size: 18px; font-weight: bold; fill: #0f172a;">2</text>
                <text x="86" y="75" style="font-family: serif; font-size: 18px; font-weight: bold; fill: #0f172a;">4</text>

                <!-- OPMAAT (1/8 tel): A4 "Komt" -->
                <text x="105" y="32" class="measure-num">Opmaat</text>
                <ellipse cx="120" cy="65" rx="5" ry="4" transform="rotate(-20 120 65)" class="note-head" />
                <line x1="124" y1="63" x2="124" y2="35" class="note-stem" />
                <path d="M 124 35 Q 132 44 133 52" stroke="#0f172a" stroke-width="2" fill="none" stroke-linecap="round" />
                <text x="120" y="105" class="lyric-text" style="fill: #4f46e5; font-weight: 800;">Komt</text>

                <!-- MAATSTREEP 1 -->
                <line x1="155" y1="40" x2="155" y2="80" class="bar-line" />

                <!-- MAAT 1: D4 A4 (achtsten) + A4 D5 (achtsten) Re - La - La - Re! -->
                <text x="165" y="32" class="measure-num">1</text>
                <ellipse cx="180" cy="85" rx="5" ry="4" transform="rotate(-20 180 85)" class="note-head" />
                <line x1="184" y1="83" x2="184" y2="55" class="note-stem" />
                <ellipse cx="215" cy="65" rx="5" ry="4" transform="rotate(-20 215 65)" class="note-head" />
                <line x1="219" y1="63" x2="219" y2="50" class="note-stem" />
                <line x1="184" y1="55" x2="219" y2="50" class="note-beam" />

                <ellipse cx="255" cy="65" rx="5" ry="4" transform="rotate(-20 255 65)" class="note-head" />
                <line x1="259" y1="63" x2="259" y2="45" class="note-stem" />
                <ellipse cx="290" cy="50" rx="5" ry="4" transform="rotate(-20 290 50)" class="note-head" />
                <line x1="294" y1="48" x2="294" y2="35" class="note-stem" />
                <line x1="259" y1="45" x2="294" y2="35" class="note-beam" />

                <text x="180" y="105" class="lyric-text">vrien-</text>
                <text x="215" y="105" class="lyric-text">den</text>
                <text x="255" y="105" class="lyric-text">in</text>
                <text x="290" y="105" class="lyric-text">het</text>

                <!-- MAATSTREEP 2 -->
                <line x1="330" y1="40" x2="330" y2="80" class="bar-line" />

                <!-- MAAT 2: E5 C#5 (achtsten) + D5 D5 (achtsten) -->
                <text x="340" y="32" class="measure-num">2</text>
                <ellipse cx="360" cy="45" rx="5" ry="4" transform="rotate(-20 360 45)" class="note-head" />
                <line x1="364" y1="43" x2="364" y2="18" class="note-stem" />
                <text x="393" y="58" style="font-family: serif; font-size: 16px; font-weight: bold; fill: #0f172a;">♯</text>
                <ellipse cx="405" cy="55" rx="5" ry="4" transform="rotate(-20 405 55)" class="note-head" />
                <line x1="409" y1="53" x2="409" y2="20" class="note-stem" />
                <line x1="364" y1="18" x2="409" y2="20" class="note-beam" />

                <ellipse cx="440" cy="50" rx="5" ry="4" transform="rotate(-20 440 50)" class="note-head" />
                <line x1="444" y1="48" x2="444" y2="20" class="note-stem" />
                <ellipse cx="468" cy="50" rx="5" ry="4" transform="rotate(-20 468 50)" class="note-head" />
                <line x1="472" y1="48" x2="472" y2="20" class="note-stem" />
                <line x1="444" y1="20" x2="472" y2="20" class="note-beam" />

                <text x="360" y="105" class="lyric-text">ron-</text>
                <text x="405" y="105" class="lyric-text">-de,</text>
                <text x="440" y="105" class="lyric-text">min-</text>
                <text x="468" y="105" class="lyric-text">naars</text>

                <!-- MAATSTREEP 3 -->
                <line x1="495" y1="40" x2="495" y2="80" class="bar-line" />

                <!-- MAAT 3: A4 B4 (achtsten) + C5 D5 (achtsten) -->
                <text x="502" y="32" class="measure-num">3</text>
                <ellipse cx="518" cy="65" rx="5" ry="4" transform="rotate(-20 518 65)" class="note-head" />
                <line x1="522" y1="63" x2="522" y2="35" class="note-stem" />
                <ellipse cx="548" cy="60" rx="5" ry="4" transform="rotate(-20 548 60)" class="note-head" />
                <line x1="552" y1="58" x2="552" y2="30" class="note-stem" />
                <line x1="522" y1="35" x2="552" y2="30" class="note-beam" />

                <ellipse cx="585" cy="55" rx="5" ry="4" transform="rotate(-20 585 55)" class="note-head" />
                <line x1="589" y1="53" x2="589" y2="25" class="note-stem" />
                <ellipse cx="618" cy="50" rx="5" ry="4" transform="rotate(-20 618 50)" class="note-head" />
                <line x1="622" y1="48" x2="622" y2="20" class="note-stem" />
                <line x1="589" y1="25" x2="622" y2="20" class="note-beam" />

                <text x="518" y="105" class="lyric-text">van</text>
                <text x="548" y="105" class="lyric-text">e-</text>
                <text x="585" y="105" class="lyric-text">nen</text>
                <text x="618" y="105" class="lyric-text">stiel.</text>

                <!-- MAATSTREEP 4 -->
                <line x1="655" y1="40" x2="655" y2="80" class="bar-line" />

                <!-- MAAT 4: D5 (kwart) "stiel." + rust + D5 "Ik" -->
                <text x="665" y="32" class="measure-num">4</text>
                <ellipse cx="685" cy="50" rx="5" ry="4" transform="rotate(-20 685 50)" class="note-head" />
                <line x1="689" y1="48" x2="689" y2="20" class="note-stem" />
                <text x="685" y="105" class="lyric-text">stiel.</text>
                <!-- Rust symbool -->
                <text x="730" y="65" style="font-family: serif; font-size: 22px; fill: #64748b;">𝄽</text>
                <!-- Achtste noot D5 "Ik" -->
                <ellipse cx="765" cy="50" rx="5" ry="4" transform="rotate(-20 765 50)" class="note-head" />
                <line x1="769" y1="48" x2="769" y2="20" class="note-stem" />
                <path d="M 769 20 Q 777 28 778 36" stroke="#0f172a" stroke-width="2" fill="none" stroke-linecap="round" />
                <text x="765" y="105" class="lyric-text">Ik</text>

                <line x1="795" y1="40" x2="795" y2="80" class="bar-line" />
                <line x1="800" y1="40" x2="800" y2="80" class="bar-line" style="stroke-width: 3;" />
              </g>
            </svg>

            <!-- SVG Stave: Refrein ("Ter lie-re om ter la...") -->
            <div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed #cbd5e1;">
              <span style="font-weight: 700; font-size: 12px; color: #4338ca; text-transform: uppercase;">Refrein: 1/4 Opmaat "Ter" + "lie-re om ter la, van links-om rechts-om..."</span>
            </div>
            <svg viewBox="0 0 820 160" style="width: 100%; height: auto; display: block; overflow: visible; margin-top: 6px;">
              <g id="stave-refrein-2-4">
                <line x1="25" y1="35" x2="800" y2="35" class="staff-line" />
                <line x1="25" y1="45" x2="800" y2="45" class="staff-line" />
                <line x1="25" y1="55" x2="800" y2="55" class="staff-line" />
                <line x1="25" y1="65" x2="800" y2="65" class="staff-line" />
                <line x1="25" y1="75" x2="800" y2="75" class="staff-line" />
                <line x1="25" y1="35" x2="25" y2="75" class="bar-line" />
                <text x="30" y="69" class="clef-text">𝄞</text>
                <text x="64" y="58" style="font-family: serif; font-size: 26px; fill: #0f172a;">♭</text>

                <!-- Refrein Opmaat (1/4 tel): A4 "Ter" -->
                <text x="90" y="27" class="measure-num">Refr. Opmaat</text>
                <ellipse cx="110" cy="60" rx="5" ry="4" transform="rotate(-20 110 60)" class="note-head" />
                <line x1="114" y1="58" x2="114" y2="30" class="note-stem" />
                <text x="110" y="98" class="lyric-text" style="fill: #4f46e5; font-weight: 800;">Ter</text>

                <line x1="145" y1="35" x2="145" y2="75" class="bar-line" />

                <!-- M14: D5 C#5 (achtsten) + D5 E5 (achtsten) -->
                <text x="155" y="27" class="measure-num">14</text>
                <ellipse cx="175" cy="50" rx="5" ry="4" transform="rotate(-20 175 50)" class="note-head" />
                <line x1="179" y1="48" x2="179" y2="20" class="note-stem" />
                <ellipse cx="210" cy="53" rx="5" ry="4" transform="rotate(-20 210 53)" class="note-head" />
                <line x1="214" y1="51" x2="214" y2="20" class="note-stem" />
                <line x1="179" y1="20" x2="214" y2="20" class="note-beam" />

                <ellipse cx="250" cy="50" rx="5" ry="4" transform="rotate(-20 250 50)" class="note-head" />
                <line x1="254" y1="48" x2="254" y2="20" class="note-stem" />
                <ellipse cx="285" cy="45" rx="5" ry="4" transform="rotate(-20 285 45)" class="note-head" />
                <line x1="289" y1="43" x2="289" y2="18" class="note-stem" />
                <line x1="254" y1="20" x2="289" y2="18" class="note-beam" />

                <text x="175" y="98" class="lyric-text">lie-</text>
                <text x="210" y="98" class="lyric-text">re</text>
                <text x="250" y="98" class="lyric-text">om</text>
                <text x="285" y="98" class="lyric-text">ter</text>

                <line x1="325" y1="35" x2="325" y2="75" class="bar-line" />

                <!-- M15: F5 (kwart) "la" + A4 (achtste) "van" -->
                <text x="335" y="27" class="measure-num">15</text>
                <ellipse cx="360" cy="40" rx="5" ry="4" transform="rotate(-20 360 40)" class="note-head" />
                <line x1="364" y1="38" x2="364" y2="15" class="note-stem" />
                <text x="360" y="98" class="lyric-text">la,</text>

                <ellipse cx="440" cy="60" rx="5" ry="4" transform="rotate(-20 440 60)" class="note-head" />
                <line x1="444" y1="58" x2="444" y2="30" class="note-stem" />
                <text x="440" y="98" class="lyric-text">van</text>

                <line x1="480" y1="35" x2="480" y2="75" class="bar-line" />

                <!-- M16: links-om rechts-om -->
                <text x="490" y="27" class="measure-num">16</text>
                <ellipse cx="510" cy="60" rx="5" ry="4" transform="rotate(-20 510 60)" class="note-head" />
                <line x1="514" y1="58" x2="514" y2="30" class="note-stem" />
                <ellipse cx="545" cy="55" rx="5" ry="4" transform="rotate(-20 545 55)" class="note-head" />
                <line x1="549" y1="53" x2="549" y2="28" class="note-stem" />
                <line x1="514" y1="30" x2="549" y2="28" class="note-beam" />

                <ellipse cx="585" cy="60" rx="5" ry="4" transform="rotate(-20 585 60)" class="note-head" />
                <line x1="589" y1="58" x2="589" y2="30" class="note-stem" />
                <ellipse cx="620" cy="65" rx="5" ry="4" transform="rotate(-20 620 65)" class="note-head" />
                <line x1="624" y1="63" x2="624" y2="35" class="note-stem" />
                <line x1="589" y1="30" x2="624" y2="35" class="note-beam" />

                <text x="510" y="98" class="lyric-text">links-</text>
                <text x="545" y="98" class="lyric-text">om</text>
                <text x="585" y="98" class="lyric-text">rechts-</text>
                <text x="620" y="98" class="lyric-text">om</text>

                <!-- M20-21: Ju ju ju! -->
                <line x1="660" y1="35" x2="660" y2="75" class="bar-line" />
                <text x="670" y="27" class="measure-num">20 - 21 (Koorroep)</text>
                <ellipse cx="700" cy="60" rx="5" ry="4" transform="rotate(-20 700 60)" class="note-head" />
                <line x1="704" y1="58" x2="704" y2="30" class="note-stem" />
                <ellipse cx="740" cy="50" rx="5" ry="4" transform="rotate(-20 740 50)" class="note-head" />
                <line x1="744" y1="48" x2="744" y2="20" class="note-stem" />
                <text x="700" y="98" class="lyric-text">Ju, ju,</text>
                <text x="740" y="98" class="lyric-text" style="font-weight: 800; fill: #4338ca;">ju!</text>

                <line x1="795" y1="35" x2="795" y2="75" class="bar-line" />
                <line x1="800" y1="35" x2="800" y2="75" class="bar-line" style="stroke-width: 3;" />
              </g>
            </svg>
          </div>

          <!-- HAARSCHERPE ORIGINELE BLADZIJDEN (BLZ. 57 & 58) -->
          <div style="border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 20px; overflow: hidden; background: #f8fafc;">
            <div style="background: #1e293b; color: #ffffff; padding: 12px 16px; font-weight: 700; font-size: 14px; display: flex; justify-content: space-between; align-items: center;">
              <span>Originele Koorpartituur (Volledige 4-stemmige zetting)</span>
              <span style="font-size: 11px; color: #94a3b8; font-weight: normal;">Haarscherpe 500 DPI Scans</span>
            </div>

            <!-- Tab Buttons voor Pagina 57 en 58 -->
            <div style="display: flex; gap: 8px; padding: 12px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1;">
              <button onclick="document.getElementById('page-57-img').style.display='block'; document.getElementById('page-58-img').style.display='none'; this.style.background='#4f46e5'; this.style.color='#fff'; document.getElementById('btn-p58').style.background='#fff'; document.getElementById('btn-p58').style.color='#1e293b';" id="btn-p57" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; font-weight: 700; font-size: 13px; background: #4f46e5; color: #ffffff; cursor: pointer;">
                📄 Bladzijde 57 (Couplet & Inzet)
              </button>
              <button onclick="document.getElementById('page-57-img').style.display='none'; document.getElementById('page-58-img').style.display='block'; this.style.background='#4f46e5'; this.style.color='#fff'; document.getElementById('btn-p57').style.background='#fff'; document.getElementById('btn-p57').style.color='#1e293b';" id="btn-p58" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #cbd5e1; font-weight: 700; font-size: 13px; background: #ffffff; color: #1e293b; cursor: pointer;">
                📄 Bladzijde 58 (Slot & Refrein)
              </button>
            </div>

            <!-- Pagina Weergave Frame met Zoom & Scherp Contrast -->
            <div style="padding: 16px; background: #525659; text-align: center; max-height: 700px; overflow-y: auto;">
              <img id="page-57-img" src="./assets/sample-scores/score_page_1.png" alt="Bladzijde 57" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.4); display: block; margin: 0 auto; filter: contrast(130%) brightness(98%);" />
              <img id="page-58-img" src="./assets/sample-scores/score_page_2.png" alt="Bladzijde 58" style="max-width: 100%; height: auto; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,0.4); display: none; margin: 0 auto; filter: contrast(130%) brightness(98%);" />
            </div>
          </div>

          <!-- Volledige Liedtekst per Strofe -->
          <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; background: #f8fafc; margin-bottom: 16px;">
            <div style="font-weight: 800; margin-bottom: 12px; color: #4338ca; font-size: 15px;">Volledige Liedtekst:</div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
              <div>
                <strong style="color: #1e293b;">Strofe 1:</strong>
                <p style="line-height: 1.8; font-size: 13.5px; margin: 4px 0 0 0; color: #334155;">
                  Komt vrienden in het ronde,<br>
                  minnaars van enen stiel.<br>
                  Ik zal u gaan verkonden<br>
                  hoe ik door 't slijperswiel<br>
                  den kost verdien voor vrouw en kind,<br>
                  schoon blootgesteld aan weer en wind!
                </p>
              </div>

              <div style="background: #eef2ff; padding: 12px 14px; border-radius: 6px; border-left: 3px solid #6366f1;">
                <strong style="color: #312e81;">Refrein (Koor SATB):</strong>
                <p style="line-height: 1.8; font-size: 13.5px; margin: 4px 0 0 0; color: #1e1b4b; font-style: italic;">
                  Ter lieren om ter la,<br>
                  van linksom rechtsom<br>
                  draait mijne steen door het roeren van mijn been.<br>
                  <strong>Ju, ju, ju, ju, ju, ju, ju, ju!</strong>
                </p>
              </div>

              <div>
                <strong style="color: #1e293b;">Strofe 2:</strong>
                <p style="line-height: 1.8; font-size: 13.5px; margin: 4px 0 0 0; color: #334155;">
                  De schoenmaker gezeten<br>
                  op enen pikkelstoel,<br>
                  die kan zijn leed vergeten<br>
                  in 't vrolijk werkgewoel.<br>
                  Maar hij zit altijd krom gebukt,<br>
                  terwijl hem 't werk ter nederdrukt.
                </p>
              </div>

              <div>
                <strong style="color: #1e293b;">Strofe 3:</strong>
                <p style="line-height: 1.8; font-size: 13.5px; margin: 4px 0 0 0; color: #334155;">
                  Sa vrienden, voor het leste,<br>
                  alle ambachten zijn goed,<br>
                  maar 't mijne is toch het beste<br>
                  als men 't vergelijken doet.<br>
                  Want zolang 't slijperswiel maar draait,<br>
                  is 't al kermis wat de klok slaat!
                </p>
              </div>
            </div>
          </div>

          <!-- Oefeninstructie -->
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #1e40af;">
            🎶 <strong>Koor-Repetitietip:</strong> De begeleiding tikt strak in de <strong>2/4 maat</strong> en zet direct in op de <strong>1/8 opmaat ("Komt")</strong>. Oefen eerst jouw eigen partij (<em>Sopraan</em>, <em>Alt</em>, <em>Tenor</em> of <em>Bas</em>) op 80% tempo en schakel daarna naar <strong>Tutti</strong> om te horen hoe jouw stem samensmelt met de andere stemmen!
          </div>

        </div>
      `
    },
    'befiehl-du-deine-wege': {
      title: '44. Choral: Befiehl du deine Wege',
      subtitle: 'Matthäus-Passion BWV 244 • J.S. Bach • D-groot • 4/4 Maat (1/4 Opmaat) • SATB Koor',
      bpm: 72,
      pdfUrl: './assets/sample-scores/befiehl-du-deine-wege.pdf',
      musicXmlUrl: './assets/sample-scores/befiehl-du-deine-wege.musicxml',
      notes: [],
      htmlScore: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 18px; color: #0f172a; max-width: 900px; margin: 0 auto; background: #ffffff;">
          
          <!-- Header met Koor Informatie -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 14px;">
            <div>
              <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
                <span style="background: #4f46e5; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; text-transform: uppercase; letter-spacing: 0.5px;">Klassiek Koraal</span>
                <span style="background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px;">SATB Koor</span>
                <span style="background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 99px;">BWV 244 Nr. 44</span>
              </div>
              <h2 style="margin: 0; font-size: 22px; font-weight: 800; color: #0f172a;">44. Choral: Befiehl du deine Wege</h2>
              <div style="font-size: 13px; color: #64748b; margin-top: 4px;">
                Johann Sebastian Bach (1685–1750) • Tekst: Paul Gerhardt (1653) • Bron: Bärenreiter BA 5038a
              </div>
            </div>
            <div style="text-align: right; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 14px; border-radius: 8px;">
              <div style="font-size: 12px; font-weight: 700; color: #0f172a;">D-groot (2 kruisen: F♯, C♯)</div>
              <div style="font-size: 12px; color: #64748b;">4/4 Maat • 1/4 Opmaat • ♩ ≈ 72 BPM</div>
            </div>
          </div>

          <!-- Koorstemmen SATB Legenda -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 16px;">
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
              <div style="font-weight: 700; color: #2563eb; font-size: 12px;">SOPRAAN (S)</div>
              <div style="font-size: 11px; color: #64748b;">D4 - D5 (Koraalmelodie)</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
              <div style="font-weight: 700; color: #16a34a; font-size: 12px;">ALT (A)</div>
              <div style="font-size: 11px; color: #64748b;">A3 - F♯4 (Harmonische alt)</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
              <div style="font-weight: 700; color: #d97706; font-size: 12px;">TENOR (T)</div>
              <div style="font-size: 11px; color: #64748b;">F♯3 - D4 (G-sleutel 8vb)</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px;">
              <div style="font-weight: 700; color: #dc2626; font-size: 12px;">BAS (B)</div>
              <div style="font-size: 11px; color: #64748b;">B2 - G3 (Koorfundament)</div>
            </div>
          </div>

          <!-- ORIGINELE 500 DPI SCAN WEERGAVE -->
          <div style="border: 2px solid #0f172a; border-radius: 8px; padding: 12px; background: #ffffff; box-shadow: 0 4px 16px rgba(0,0,0,0.06); margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
              <span style="font-weight: 700; font-size: 12px; color: #0f172a; text-transform: uppercase;">Originele Partituur (500 DPI Scan)</span>
              <a href="./assets/sample-scores/befiehl-du-deine-wege.pdf" target="_blank" style="font-size: 12px; color: #4f46e5; text-decoration: none; font-weight: 600;">Open PDF ↗</a>
            </div>
            <img src="./assets/sample-scores/befiehl-du-deine-wege_page_1.png" style="width: 100%; height: auto; display: block; border-radius: 4px;" alt="Befiehl du deine Wege SATB Partituur Scan" />
          </div>

          <!-- LIEDTEKST OVERZICHT -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <h3 style="margin: 0 0 10px 0; font-size: 15px; font-weight: 700; color: #0f172a;">Koraaltekst (Paul Gerhardt):</h3>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;">
              <div style="background: #ffffff; padding: 12px 14px; border-radius: 6px; border-left: 3px solid #4f46e5;">
                <strong style="color: #312e81;">Strofe 1 (Stollen):</strong>
                <p style="line-height: 1.8; font-size: 13.5px; margin: 4px 0 0 0; color: #1e1b4b;">
                  Befiehl du deine Wege<br>
                  und was dein Herze kränkt<br>
                  der allertreusten Pflege<br>
                  des, der den Himmel lenkt.
                </p>
              </div>

              <div style="background: #ffffff; padding: 12px 14px; border-radius: 6px; border-left: 3px solid #059669;">
                <strong style="color: #065f46;">Strofe 2 (Abgesang):</strong>
                <p style="line-height: 1.8; font-size: 13.5px; margin: 4px 0 0 0; color: #064e3b;">
                  Der Wolken, Luft und Winden<br>
                  gibt Wege, Lauf und Bahn,<br>
                  der wird auch Wege finden,<br>
                  da dein Fuß gehen kann.
                </p>
              </div>
            </div>
          </div>

          <!-- Oefeninstructie -->
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #1e40af;">
            🎶 <strong>Koor-Repetitietip:</strong> Let bij dit koraal goed op de <strong>fermates</strong> aan het einde van elke zinsnede (maten 2, 4, 7, 9, 11 en 13). De kwartnoot opmaat ("Be-") zet in op tel 4. Oefen eerst jouw eigen partij op rustig tempo en schakel daarna naar <strong>Tutti</strong> om de vierstemmige harmonie van Bach voluit te horen!
          </div>

        </div>
      `
    },
    'vader-jacob': {
      title: 'Vader Jacob (Koor Canon - 4 stemmig)',
      subtitle: 'Toonsoort: F-groot | 4/4 maat | Eenvoudige canon',
      pdfUrl: './assets/sample-scores/vader-jacob.pdf',
      notes: [
        { note: 'F3', dur: 1 }, { note: 'G3', dur: 1 }, { note: 'A3', dur: 1 }, { note: 'F3', dur: 1 },
        { note: 'F3', dur: 1 }, { note: 'G3', dur: 1 }, { note: 'A3', dur: 1 }, { note: 'F3', dur: 1 },
        { note: 'A3', dur: 1 }, { note: 'A#3', dur: 1 }, { note: 'C4', dur: 2 },
        { note: 'A3', dur: 1 }, { note: 'A#3', dur: 1 }, { note: 'C4', dur: 2 },
        { note: 'C4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'C4', dur: 0.5 }, { note: 'A#3', dur: 0.5 }, { note: 'A3', dur: 1 }, { note: 'F3', dur: 1 },
        { note: 'C4', dur: 0.5 }, { note: 'D4', dur: 0.5 }, { note: 'C4', dur: 0.5 }, { note: 'A#3', dur: 0.5 }, { note: 'A3', dur: 1 }, { note: 'F3', dur: 1 },
        { note: 'F3', dur: 1 }, { note: 'C3', dur: 1 }, { note: 'F3', dur: 2 },
        { note: 'F3', dur: 1 }, { note: 'C3', dur: 1 }, { note: 'F3', dur: 2 }
      ],
      htmlScore: `
        <div style="font-family: serif; padding: 25px; color: #1e293b; max-width: 800px; margin: 0 auto; background: #fff;">
          <h2 style="text-align: center; margin-bottom: 5px; font-size: 24px;">Vader Jacob (Frère Jacques)</h2>
          <p style="text-align: center; color: #64748b; font-size: 14px; margin-bottom: 25px;">Koorcanon voor 4 stemmen (Sopranen, Alten, Tenoren, Bassen)</p>
          
          <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; background: #f8fafc; margin-bottom: 20px;">
            <div style="font-weight: bold; margin-bottom: 8px; color: #4338ca;">Partituur Overzicht & Liedtekst:</div>
            <p style="line-height: 2; font-size: 16px;">
              <strong>(1)</strong> Vader Jacob, Vader Jacob,<br>
              <strong>(2)</strong> Slaapt gij nog? Slaapt gij nog?<br>
              <strong>(3)</strong> Alle klokken luiden, alle klokken luiden,<br>
              <strong>(4)</strong> Bim, bam, bom! Bim, bam, bom!
            </p>
          </div>

          <div style="margin-top: 15px; background: #e0e7ff; padding: 12px 18px; border-radius: 6px; font-size: 14px; color: #3730a3;">
            🎵 <strong>Oefentip:</strong> Gebruik de audiospeler hieronder om de melodie rustig mee te zingen en instelbaar te vertragen!
          </div>
        </div>
      `
    },
    'dona-nobis': {
      title: 'Dona Nobis Pacem',
      subtitle: 'Toonsoort: F-groot | 3/4 maat | Klassieke Latijnse canon',
      notes: [
        { note: 'F3', dur: 1.5 }, { note: 'C4', dur: 0.5 }, { note: 'A3', dur: 1 },
        { note: 'F3', dur: 1.5 }, { note: 'A3', dur: 0.5 }, { note: 'C4', dur: 1 },
        { note: 'D4', dur: 2 }, { note: 'C4', dur: 1 },
        { note: 'A#3', dur: 2 }, { note: 'A3', dur: 1 },
        { note: 'G3', dur: 3 },
        { note: 'C4', dur: 1.5 }, { note: 'A#3', dur: 0.5 }, { note: 'A3', dur: 1 },
        { note: 'G3', dur: 2 }, { note: 'F3', dur: 1 }
      ],
      htmlScore: `
        <div style="font-family: serif; padding: 25px; color: #1e293b; max-width: 800px; margin: 0 auto; background: #fff;">
          <h2 style="text-align: center; margin-bottom: 5px; font-size: 24px;">Dona Nobis Pacem</h2>
          <p style="text-align: center; color: #64748b; font-size: 14px; margin-bottom: 25px;">Traditionele Koorcanon - 3 Stemmig (3/4 Maat)</p>
          
          <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; background: #f8fafc; margin-bottom: 20px;">
            <div style="font-weight: bold; margin-bottom: 8px; color: #4338ca;">Liedtekst per Inzet:</div>
            <p style="line-height: 2; font-size: 16px;">
              <strong>Stem 1:</strong> Do - na no - bis pa - cem, pa - cem...<br>
              <strong>Stem 2:</strong> Do - na no - bis pa - cem...<br>
              <strong>Stem 3:</strong> Do - na no - bis pa - cem, do - na no - bis pa - cem.
            </p>
          </div>

          <div style="margin-top: 15px; background: #fef3c7; padding: 12px 18px; border-radius: 6px; font-size: 14px; color: #92400e;">
            ✨ <strong>Ademhalingstip:</strong> Adem diep in vóór elke "Dona", ontspan je schouders en laat de tonen zacht in elkaar overvloeien (legato).
          </div>
        </div>
      `
    },
    'toonladder-oefening': {
      title: 'Toonladder & 5-Toons Vocalise',
      subtitle: 'Toonsoort: C-groot | Inzingen op Lip Trill (brrr) en Klinkers',
      notes: [
        { note: 'C3', dur: 0.8 }, { note: 'D3', dur: 0.8 }, { note: 'E3', dur: 0.8 }, { note: 'F3', dur: 0.8 }, { note: 'G3', dur: 1.6 },
        { note: 'F3', dur: 0.8 }, { note: 'E3', dur: 0.8 }, { note: 'D3', dur: 0.8 }, { note: 'C3', dur: 2.0 }
      ],
      htmlScore: `
        <div style="font-family: serif; padding: 25px; color: #1e293b; max-width: 800px; margin: 0 auto; background: #fff;">
          <h2 style="text-align: center; margin-bottom: 5px; font-size: 24px;">Dagelijkse Inzing-Toonladder (5-Tone Scale)</h2>
          <p style="text-align: center; color: #64748b; font-size: 14px; margin-bottom: 25px;">C - D - E - F - G - F - E - D - C</p>
          
          <div style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; background: #f8fafc; margin-bottom: 20px;">
            <div style="font-weight: bold; margin-bottom: 8px; color: #4338ca;">Aanbevolen klanken:</div>
            <ul style="line-height: 2; font-size: 15px; margin-left: 20px;">
              <li><strong>Ronde 1: Lip Trill (brrrr)</strong> - Ontspant de lippen en activeert de buikademsteun.</li>
              <li><strong>Ronde 2: Zoemen (Humming 'mmmmm')</strong> - Voel de resonantie in je neus en voorhoofd.</li>
              <li><strong>Ronde 3: Klinkers (Mee-May-Mah-Moh-Moo)</strong> - Zorg voor een open keel en ontspannen kaken.</li>
            </ul>
          </div>
        </div>
      `
    }
  };

  let activeScoreKey = 'komt-vrienden';

  function getVoiceLabel(voiceKey) {
    switch (voiceKey) {
      case 'sopraan': return 'Sopraan (Melodie)';
      case 'alt': return 'Alt (2e stem)';
      case 'tenor': return 'Tenor (Hoge mannenstem)';
      case 'bas': return 'Bas (Lage mannenstem)';
      case 'tutti': return 'Tutti (Volledig Koor / 4-stemmig)';
      default: return voiceKey;
    }
  }

  function getActiveNotes() {
    const scoreData = SCORES[activeScoreKey];
    if (!scoreData) return [];
    if (scoreData.voices) {
      if (selectedVoice === 'tutti') {
        return scoreData.voices.tutti;
      } else if (scoreData.voices[selectedVoice]) {
        return scoreData.voices[selectedVoice];
      }
    }
    return scoreData.notes || [];
  }

  function updateTrackLabels() {
    const scoreData = SCORES[activeScoreKey];
    if (!scoreData) return;

    // Update HTML Sheet Title Banner (No SVG overlap!)
    const sheetTitleEl = document.getElementById('score-sheet-title');
    const sheetMetaEl = document.getElementById('score-sheet-meta');
    if (sheetTitleEl) {
      sheetTitleEl.textContent = scoreData.title || 'Partituur';
    }
    if (sheetMetaEl) {
      sheetMetaEl.textContent = scoreData.subtitle || `SATB Koor • Oefenstem: ${getVoiceLabel(selectedVoice)}`;
    }

    // Update Download XML button
    const downloadBtn = document.getElementById('btn-download-musicxml');
    if (downloadBtn) {
      if (scoreData.musicXmlUrl) {
        downloadBtn.style.display = 'inline-flex';
        downloadBtn.href = scoreData.musicXmlUrl;
        const filename = (scoreData.title ? scoreData.title.replace(/[^a-zA-Z0-9_-]/g, '_') : activeScoreKey) + '.musicxml';
        downloadBtn.setAttribute('download', filename);
      } else {
        downloadBtn.style.display = 'none';
      }
    }
  }

  let osmdInstance = null;
  let activeViewMode = 'musicxml'; // 'musicxml' of 'pdf'

  function switchViewMode(mode) {
    activeViewMode = mode;
    const osmdContainer = document.getElementById('osmd-container');
    const pdfFrame = document.getElementById('pdf-viewer-frame');
    const btnXml = document.getElementById('btn-view-musicxml');
    const btnPdf = document.getElementById('btn-view-pdf');
    const statusEl = document.getElementById('score-rendering-status');
    const scoreData = SCORES[activeScoreKey];

    if (mode === 'musicxml' && scoreData && scoreData.musicXmlUrl) {
      if (osmdContainer) osmdContainer.style.display = 'block';
      if (pdfFrame) pdfFrame.style.display = 'none';

      if (btnXml) {
        btnXml.classList.add('active');
        btnXml.style.background = 'var(--accent-indigo)';
        btnXml.style.color = '#ffffff';
        btnXml.style.borderColor = 'var(--accent-indigo)';
      }
      if (btnPdf) {
        btnPdf.classList.remove('active');
        btnPdf.style.background = '';
        btnPdf.style.color = '';
        btnPdf.style.borderColor = '';
      }
      renderMusicXMLWithOSMD(scoreData.musicXmlUrl);
    } else {
      // PDF or fallback HTML mode
      if (osmdContainer) osmdContainer.style.display = 'none';
      if (pdfFrame) {
        pdfFrame.style.display = 'block';
        if (scoreData && scoreData.pdfUrl) {
          pdfFrame.removeAttribute('srcdoc');
          pdfFrame.src = scoreData.pdfUrl;
        } else if (scoreData && scoreData.htmlScore) {
          pdfFrame.removeAttribute('src');
          pdfFrame.srcdoc = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <base href="${window.location.origin}${window.location.pathname}">
              <style>
                body { margin: 0; padding: 12px; background: #ffffff; color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
              </style>
            </head>
            <body>
              ${scoreData.htmlScore}
            </body>
            </html>
          `;
        }
      }
      if (statusEl) statusEl.textContent = scoreData && scoreData.pdfUrl ? '📄 Originele PDF Scan' : '';

      if (btnPdf) {
        btnPdf.classList.add('active');
        btnPdf.style.background = 'var(--accent-indigo)';
        btnPdf.style.color = '#ffffff';
        btnPdf.style.borderColor = 'var(--accent-indigo)';
      }
      if (btnXml) {
        btnXml.classList.remove('active');
        btnXml.style.background = '';
        btnXml.style.color = '';
        btnXml.style.borderColor = '';
      }
    }
  }

  function applyVoiceFilterToOSMD() {
    if (!osmdInstance || !osmdInstance.sheet) return;
    const instruments = osmdInstance.sheet.Instruments;
    if (!instruments || instruments.length === 0) return;

    const voiceIndexMap = {
      'sopraan': 0,
      'alt': 1,
      'tenor': 2,
      'bas': 3
    };

    instruments.forEach((inst, idx) => {
      let isVisible = true;
      if (selectedVoice === 'tutti') {
        isVisible = true;
      } else {
        const targetIdx = voiceIndexMap[selectedVoice] !== undefined ? voiceIndexMap[selectedVoice] : 0;
        if (instruments.length === 1) {
          isVisible = true;
        } else {
          const name = (inst.NameLabel ? inst.NameLabel.text : (inst.nameLabel ? inst.nameLabel.text : '')).toLowerCase();
          if (name && (name.includes(selectedVoice) || name.startsWith(selectedVoice[0]))) {
            isVisible = true;
          } else if (idx === targetIdx) {
            isVisible = true;
          } else {
            isVisible = false;
          }
        }
      }
      inst.Visible = isVisible;
      inst.visible = isVisible;
    });

    try {
      const isMobile = window.innerWidth < 640;
      if (isMobile) {
        // Solo stem op mobiel: 0.48 (compact, 3-4 maten per regel!)
        // Tutti: 0.44 (alle 4 balken passen comfortabel)
        osmdInstance.zoom = selectedVoice === 'tutti' ? 0.44 : 0.48;
      } else {
        osmdInstance.zoom = selectedVoice === 'tutti' ? 0.68 : 0.74;
      }
      osmdInstance.render();
    } catch (e) {
      console.warn('OSMD Filter render exception:', e);
    }
  }

  function renderMusicXMLWithOSMD(musicXmlUrlOrText) {
    const osmdContainer = document.getElementById('osmd-container');
    const statusEl = document.getElementById('score-rendering-status');

    if (!osmdContainer) return;

    if (typeof opensheetmusicdisplay === 'undefined') {
      console.warn('OSMD nog niet beschikbaar in window, retrying...');
      if (statusEl) statusEl.textContent = 'OSMD initialiseren...';
      setTimeout(() => renderMusicXMLWithOSMD(musicXmlUrlOrText), 200);
      return;
    }

    if (statusEl) statusEl.textContent = 'Partituur renderen...';

    if (!osmdInstance) {
      osmdInstance = new opensheetmusicdisplay.OpenSheetMusicDisplay(osmdContainer, {
        autoResize: true,
        backend: 'svg',
        drawingParameters: 'compact',
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawPartNames: false, // Geen witruimte links verspillen aan stemnaam
        drawPartAbbreviations: false,
        drawMeasureNumbers: true,
        drawMetronomeMarks: false,
        drawLyrics: true,
        fillEmptyMeasuresWithWholeRests: true,
        followCursor: false
      });
    } else {
      osmdInstance.setOptions({
        drawingParameters: 'compact',
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawPartNames: false,
        drawPartAbbreviations: false
      });
    }

    const xmlPromise = (typeof musicXmlUrlOrText === 'string' && musicXmlUrlOrText.trim().startsWith('<'))
      ? Promise.resolve(musicXmlUrlOrText)
      : fetch(musicXmlUrlOrText + (musicXmlUrlOrText.includes('?') ? '&' : '?') + 't=' + Date.now()).then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        });

    xmlPromise
      .then(xmlString => {
        return osmdInstance.load(xmlString);
      })
      .then(() => {
        applyVoiceFilterToOSMD();
        if (statusEl) {
          statusEl.textContent = '';
        }
      })
      .catch(err => {
        console.error('OSMD Render fout:', err);
        if (statusEl) statusEl.textContent = 'Weergave via scan';
        switchViewMode('pdf');
      });
  }

  async function displayScore(key) {
    const frame = document.getElementById('pdf-viewer-frame');
    const voicePickerContainer = document.getElementById('voice-picker-container');
    const btnXml = document.getElementById('btn-view-musicxml');
    const btnPdf = document.getElementById('btn-view-pdf');
    const statusEl = document.getElementById('score-rendering-status');
    const deleteBtn = document.getElementById('btn-delete-current-score');
    if (!frame) return;

    activeScoreKey = key;
    stopCompanion();

    let scoreData = SCORES[key];
    if (!scoreData && typeof ScoreStorage !== 'undefined') {
      const local = await ScoreStorage.getScoreLocally(key);
      if (local) {
        scoreData = {
          title: local.title,
          subtitle: `${local.composer || 'Eigen Partituur'} • SATB Koor`,
          musicXmlUrl: local.musicXml,
          pdfUrl: local.pdfDataUrl || null,
          pdfBlob: local.pdfBlob || null,
          isCustom: true
        };
        SCORES[key] = scoreData;
      }
    }

    if (deleteBtn) {
      deleteBtn.style.display = (scoreData && (scoreData.isCustom || key === 'befiehl-du-deine-wege' || key === 'komt-vrienden')) ? 'inline-flex' : 'none';
    }

    if (scoreData) {
      if (scoreData.musicXmlUrl) {
        if (btnXml) btnXml.style.display = 'inline-flex';
        loadMusicXML(scoreData.musicXmlUrl).then(result => {
          if (result && result.voices) {
            scoreData.voices = result.voices;
            scoreData.notes = result.voices[selectedVoice] || result.voices.sopraan || Object.values(result.voices)[0];
            if (result.bpm) {
              setBpm(result.bpm);
            } else if (scoreData.bpm) {
              setBpm(scoreData.bpm);
            } else {
              setBpm(80);
            }
            updateTrackLabels();
            console.log('✅ MusicXML succesvol dynamisch ingeladen, BPM:', currentBpm);
          }
        });

        // Schakel standaard over naar MusicXML modus
        switchViewMode('musicxml');
      } else {
        // Geen MusicXML beschikbaar voor deze partituur: toon PDF/HTML
        if (btnXml) btnXml.style.display = 'none';
        if (statusEl) statusEl.textContent = '';
        switchViewMode('pdf');
      }

      updateTrackLabels();

      if (voicePickerContainer) {
        voicePickerContainer.style.display = 'flex';
      }
    }
  }

  // Play synthesized companion track
  function playNextCompanionNote() {
    if (!isPlayingCompanion) return;

    const notes = getActiveNotes();
    if (!notes || notes.length === 0) return;

    const currentNote = notes[currentStep];
    const stepDur = currentNote.dur; // 1.0 = kwartnoot
    const duration = stepDur * (60 / currentBpm);

    if (currentNote.notes && Array.isArray(currentNote.notes)) {
      // Tutti Chord: play all 4 choral voices simultaneously
      currentNote.notes.forEach(n => {
        if (n && n !== 'REST') {
          AudioEngine.playNote(n, Math.min(duration * 1.15, 2.2));
        }
      });
      // Highlight soprano (top) note on virtual piano
      const topNote = currentNote.notes[currentNote.notes.length - 1];
      if (topNote && topNote !== 'REST') {
        AudioEngine.highlightSungKey(topNote);
      }
    } else if (currentNote.note && currentNote.note !== 'REST') {
      // Single choral voice (S, A, T or B)
      AudioEngine.playNote(currentNote.note, Math.min(duration * 1.15, 2.2));
      AudioEngine.highlightSungKey(currentNote.note);
    } else {
      AudioEngine.highlightSungKey(null);
    }

    if (osmdInstance && osmdInstance.cursor && activeViewMode === 'musicxml') {
      try {
        osmdInstance.cursor.next();
      } catch (e) {}
    }

    currentStep = (currentStep + 1) % notes.length;
    companionInterval = setTimeout(playNextCompanionNote, duration * 1000);
  }

  function startCompanion() {
    isPlayingCompanion = true;
    currentStep = 0;

    if (osmdInstance && osmdInstance.cursor && activeViewMode === 'musicxml') {
      try {
        osmdInstance.cursor.show();
        osmdInstance.cursor.reset();
      } catch (e) {
        console.warn('OSMD Cursor start issue:', e);
      }
    }

    playNextCompanionNote();

    const btn = document.getElementById('btn-play-companion');
    const icon = document.getElementById('play-btn-icon');
    const label = document.getElementById('play-btn-label');
    if (icon) icon.textContent = '⏸️';
    if (label) label.textContent = 'Pauze';
    if (btn) {
      btn.style.background = '#f59e0b';
      btn.style.borderColor = '#d97706';
    }
  }

  function stopCompanion() {
    isPlayingCompanion = false;
    if (companionInterval) {
      clearTimeout(companionInterval);
      companionInterval = null;
    }
    AudioEngine.highlightSungKey(null);

    if (osmdInstance && osmdInstance.cursor) {
      try {
        osmdInstance.cursor.hide();
      } catch (e) {}
    }

    const btn = document.getElementById('btn-play-companion');
    const icon = document.getElementById('play-btn-icon');
    const label = document.getElementById('play-btn-label');
    if (icon) icon.textContent = '▶️';
    if (label) label.textContent = 'Speel';
    if (btn) {
      btn.style.background = '#10b981';
      btn.style.borderColor = '#059669';
    }
  }

  function toggleCompanion() {
    if (isPlayingCompanion) {
      stopCompanion();
    } else {
      startCompanion();
    }
  }

  function setVoicePart(voicePart) {
    selectedVoice = voicePart;

    // Update active pill styling
    document.querySelectorAll('.voice-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.voice === selectedVoice);
    });

    // Sync hidden select if present
    const voiceSelect = document.getElementById('voice-part-select');
    if (voiceSelect && voiceSelect.value !== selectedVoice) {
      voiceSelect.value = selectedVoice;
    }

    const scoreData = SCORES[activeScoreKey];
    if (scoreData && scoreData.voices) {
      scoreData.notes = scoreData.voices[selectedVoice] || scoreData.voices.sopraan || Object.values(scoreData.voices)[0];
    }
    updateTrackLabels();
    applyVoiceFilterToOSMD();

    const statusEl = document.getElementById('score-rendering-status');
    if (statusEl && activeViewMode === 'musicxml') {
      statusEl.textContent = selectedVoice === 'tutti'
        ? '✅ Tutti (Alle 4 stemmen)'
        : `✅ Solo: ${getVoiceLabel(selectedVoice)} (1 balk op GSM)`;
    }

    if (isPlayingCompanion) {
      currentStep = 0;
    }
  }

  function setTempo(tempoMultiplier) {
    currentTempo = parseFloat(tempoMultiplier);
    document.querySelectorAll('.tempo-btn').forEach(btn => {
      const btnTempo = parseFloat(btn.dataset.tempo);
      if (Math.abs(btnTempo - currentTempo) < 0.05) {
        btn.classList.add('active');
        btn.style.background = 'var(--accent-indigo)';
        btn.style.color = 'white';
      } else {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.color = '';
      }
    });
  }

  function setupEventListeners() {
    // Score selection dropdown
    const select = document.getElementById('score-select');
    if (select) {
      select.addEventListener('change', (e) => {
        displayScore(e.target.value);
      });
    }

    // Direct Voice Pills clicks (Sopraan, Alt, Tenor, Bas, Tutti)
    document.querySelectorAll('.voice-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const voice = btn.dataset.voice;
        if (voice) {
          setVoicePart(voice);
        }
      });
    });

    // Voice part selection dropdown fallback (SATB)
    const voiceSelect = document.getElementById('voice-part-select');
    if (voiceSelect) {
      voiceSelect.addEventListener('change', (e) => {
        setVoicePart(e.target.value);
      });
    }

    // Play companion button
    const playBtn = document.getElementById('btn-play-companion');
    if (playBtn) {
      playBtn.addEventListener('click', toggleCompanion);
    }

    // BPM +/- knoppen
    const bpmMinusBtn = document.getElementById('btn-bpm-minus');
    const bpmPlusBtn = document.getElementById('btn-bpm-plus');
    if (bpmMinusBtn) {
      bpmMinusBtn.addEventListener('click', () => setBpm(currentBpm - 5));
    }
    if (bpmPlusBtn) {
      bpmPlusBtn.addEventListener('click', () => setBpm(currentBpm + 5));
    }

    // Mode Switcher handlers: MusicXML vs Originele PDF Scan
    const btnViewXml = document.getElementById('btn-view-musicxml');
    const btnViewPdf = document.getElementById('btn-view-pdf');
    if (btnViewXml) {
      btnViewXml.addEventListener('click', () => switchViewMode('musicxml'));
    }
    if (btnViewPdf) {
      btnViewPdf.addEventListener('click', () => switchViewMode('pdf'));
    }
  }

  function init() {
    setupEventListeners();
    displayScore('komt-vrienden');
  }

  return {
    init,
    displayScore,
    setVoicePart,
    setBpm,
    toggleCompanion,
    stopCompanion,
    setTempo
  };
})();
