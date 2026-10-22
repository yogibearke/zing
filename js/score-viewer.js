/**
 * Zing! - Score Viewer & Audio Companion with Spotify Integration
 * PDF Partituren Viewer, vertragende audiobegeleiding én Spotify Player voor het wijsje!
 */

const ScoreViewer = (() => {
  let isPlayingCompanion = false;
  let companionInterval = null;
  let currentTempo = 1.0;
  let currentStep = 0;
  let customPdfBlobUrl = null;

  // Sample Repertoire with musical notes for accompaniment & Spotify links for the tune ('het wijsje')
  const SCORES = {
    'vader-jacob': {
      title: 'Vader Jacob (Koor Canon - 4 stemmig)',
      subtitle: 'Toonsoort: F-groot | 4/4 maat | Eenvoudige canon',
      spotifyUri: 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=generator&theme=0',
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
            🎵 <strong>Oefentip:</strong> Beluister het originele liedje hieronder via Spotify om de melodie in je hoofd te krijgen. Gebruik daarna de pianobegeleiding om rustig mee te zingen!
          </div>
        </div>
      `
    },
    'dona-nobis': {
      title: 'Dona Nobis Pacem',
      subtitle: 'Toonsoort: F-groot | 3/4 maat | Klassieke Latijnse canon',
      spotifyUri: 'https://open.spotify.com/embed/track/306L3B24Kk8oK50R6b3jSg?utm_source=generator&theme=0',
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
      spotifyUri: 'https://open.spotify.com/embed/track/5uCaxftuw0YFR4Agv5K7LK?utm_source=generator&theme=0',
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

  let activeScoreKey = 'vader-jacob';

  function displayScore(key) {
    const frame = document.getElementById('pdf-viewer-frame');
    const titleEl = document.getElementById('track-title');
    const subtitleEl = document.getElementById('track-subtitle');
    const spotifyFrame = document.getElementById('spotify-embed-frame');
    if (!frame) return;

    activeScoreKey = key;
    stopCompanion();

    if (key === 'custom' && customPdfBlobUrl) {
      frame.src = customPdfBlobUrl;
      if (titleEl) titleEl.textContent = 'Eigen Geüploade PDF Partituur';
      if (subtitleEl) subtitleEl.textContent = 'Gebruik de audiospeler of vul een Spotify link in voor het wijsje';
      return;
    }

    const scoreData = SCORES[key];
    if (scoreData) {
      if (titleEl) titleEl.textContent = scoreData.title;
      if (subtitleEl) subtitleEl.textContent = scoreData.subtitle;

      // Update Spotify embed player
      if (spotifyFrame && scoreData.spotifyUri) {
        spotifyFrame.src = scoreData.spotifyUri;
      }

      // Render crisp HTML/SVG score into iframe
      frame.srcdoc = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
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

  // Update Spotify embed from user-entered URL or track ID
  function setCustomSpotify(urlOrId) {
    const spotifyFrame = document.getElementById('spotify-embed-frame');
    if (!spotifyFrame || !urlOrId) return;

    let embedUrl = urlOrId.trim();
    if (embedUrl.includes('open.spotify.com/track/')) {
      const trackId = embedUrl.split('/track/')[1].split('?')[0];
      embedUrl = `https://open.spotify.com/embed/track/${trackId}?utm_source=generator&theme=0`;
    } else if (embedUrl.includes('open.spotify.com/embed/')) {
      // Already an embed URL
    } else if (!embedUrl.startsWith('http')) {
      // Presume track ID
      embedUrl = `https://open.spotify.com/embed/track/${embedUrl}?utm_source=generator&theme=0`;
    }

    spotifyFrame.src = embedUrl;
  }

  // Play synthesized companion track
  function playNextCompanionNote() {
    if (!isPlayingCompanion) return;

    const scoreData = SCORES[activeScoreKey];
    if (!scoreData || !scoreData.notes || scoreData.notes.length === 0) return;

    const noteObj = scoreData.notes[currentStep];
    const duration = (noteObj.dur * 0.45) / currentTempo;

    AudioEngine.playNote(noteObj.note, duration);
    AudioEngine.highlightSungKey(noteObj.note);

    currentStep = (currentStep + 1) % scoreData.notes.length;

    companionInterval = setTimeout(playNextCompanionNote, duration * 1000);
  }

  function startCompanion() {
    isPlayingCompanion = true;
    currentStep = 0;
    playNextCompanionNote();

    const btn = document.getElementById('btn-play-companion');
    const text = document.getElementById('play-companion-text');
    if (btn && text) {
      btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      text.textContent = 'Pauzeer Begeleiding';
    }
  }

  function stopCompanion() {
    isPlayingCompanion = false;
    if (companionInterval) {
      clearTimeout(companionInterval);
      companionInterval = null;
    }
    AudioEngine.highlightSungKey(null);

    const btn = document.getElementById('btn-play-companion');
    const text = document.getElementById('play-companion-text');
    if (btn && text) {
      btn.style.background = '';
      text.textContent = 'Speel Begeleiding';
    }
  }

  function toggleCompanion() {
    if (isPlayingCompanion) {
      stopCompanion();
    } else {
      startCompanion();
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
    const select = document.getElementById('score-select');
    if (select) {
      select.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
          document.getElementById('pdf-file-input').click();
        } else {
          displayScore(e.target.value);
        }
      });
    }

    const uploadBtn = document.getElementById('btn-upload-pdf');
    const fileInput = document.getElementById('pdf-file-input');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
          customPdfBlobUrl = URL.createObjectURL(file);
          if (select) select.value = 'custom';
          displayScore('custom');
        } else if (file) {
          alert('Gelieve een geldig PDF-bestand te selecteren.');
        }
      });
    }

    const playBtn = document.getElementById('btn-play-companion');
    if (playBtn) {
      playBtn.addEventListener('click', toggleCompanion);
    }

    document.querySelectorAll('.tempo-btn').forEach(btn => {
      btn.addEventListener('click', () => setTempo(btn.dataset.tempo));
    });

    const fullscreenBtn = document.getElementById('btn-fullscreen-pdf');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        const container = document.getElementById('score-container');
        if (container.requestFullscreen) {
          container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
          container.webkitRequestFullscreen();
        }
      });
    }

    // Spotify custom link handler
    const spotifyInput = document.getElementById('spotify-custom-url');
    const spotifySetBtn = document.getElementById('btn-set-spotify');
    if (spotifySetBtn && spotifyInput) {
      spotifySetBtn.addEventListener('click', () => {
        if (spotifyInput.value) {
          setCustomSpotify(spotifyInput.value);
        }
      });
    }
  }

  function init() {
    setupEventListeners();
    displayScore('vader-jacob');
  }

  return {
    init,
    displayScore,
    toggleCompanion,
    setTempo,
    setCustomSpotify
  };
})();
