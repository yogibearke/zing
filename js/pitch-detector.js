/**
 * ZingStart - Pitch Detector
 * Real-time microphone capture with Autocorrelation pitch extraction
 * Detects exact Note + Octave (e.g. A3, C4), Solfege, Hz, and cents deviation
 */

const PitchDetector = (() => {
  let isListening = false;
  let audioStream = null;
  let analyser = null;
  let sourceNode = null;
  let animationFrameId = null;
  let buffer = null;

  let lastDetectedNote = null;
  let lastFrequency = 0;

  // Solfege translation relative to standard chromatic scale
  const SOLFEGE_MAP = {
    'C': 'Do',
    'C#': 'Do# / Reb',
    'D': 'Re',
    'D#': 'Re# / Mib',
    'E': 'Mi',
    'F': 'Fa',
    'F#': 'Fa# / Solb',
    'G': 'Sol',
    'G#': 'Sol# / Lab',
    'A': 'La',
    'A#': 'La# / Sib',
    'B': 'Si'
  };

  // High precision autocorrelation algorithm
  function autoCorrelate(buf, sampleRate) {
    const SIZE = buf.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      const val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);

    // Filter out ambient noise (minimum singing threshold)
    if (rms < 0.015) {
      return -1;
    }

    // Clip buffer bounds to ignore low-level noise
    let r1 = 0;
    let r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buf[i]) < thres) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buf[SIZE - i]) < thres) {
        r2 = SIZE - i;
        break;
      }
    }

    const trimmedBuf = buf.slice(r1, r2);
    const c = new Array(trimmedBuf.length).fill(0);
    for (let i = 0; i < trimmedBuf.length; i++) {
      for (let j = 0; j < trimmedBuf.length - i; j++) {
        c[i] = c[i] + trimmedBuf[j] * trimmedBuf[j + i];
      }
    }

    // Find the first dip
    let d = 0;
    while (c[d] > c[d + 1]) {
      d++;
    }

    // Find the peak after the dip
    let maxval = -1;
    let maxpos = -1;
    for (let i = d; i < trimmedBuf.length; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    let T0 = maxpos;

    // Parabolic interpolation around the peak for fractional accuracy
    const x1 = c[T0 - 1] || 0;
    const x2 = c[T0];
    const x3 = c[T0 + 1] || 0;
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) {
      T0 = T0 - b / (2 * a);
    }

    // Filter out frequencies outside human vocal ranges (~60 Hz to ~1400 Hz)
    const freq = sampleRate / T0;
    if (freq < 60 || freq > 1400) {
      return -1;
    }

    return freq;
  }

  // Convert Hz to MIDI note and cents deviation
  function frequencyToPitch(freq) {
    // 69 is MIDI for A4 (440 Hz)
    const noteNum = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
    const roundedNote = Math.round(noteNum);
    const cents = Math.round((noteNum - roundedNote) * 100);

    const noteIndex = (roundedNote % 12 + 12) % 12;
    const octave = Math.floor(roundedNote / 12) - 1;
    const noteName = AudioEngine.NOTE_NAMES[noteIndex];
    const fullNote = `${noteName}${octave}`;
    const solfege = `${SOLFEGE_MAP[noteName]} ${octave}`;

    return {
      noteName,
      octave,
      fullNote,
      solfege,
      cents,
      freq: Math.round(freq * 10) / 10
    };
  }

  // Animation and detection loop
  function updatePitch() {
    if (!isListening) return;

    analyser.getFloatTimeDomainData(buffer);
    const audioCtx = AudioEngine.getContext();
    const freq = autoCorrelate(buffer, audioCtx.sampleRate);

    const noteBox = document.getElementById('tuner-note-box');
    const noteNameEl = document.getElementById('tuner-note-name');
    const solfegeEl = document.getElementById('tuner-solfege');
    const freqEl = document.getElementById('tuner-freq');
    const centsEl = document.getElementById('tuner-cents');
    const statusEl = document.getElementById('tuner-status');
    const needleEl = document.getElementById('gauge-needle');

    if (freq !== -1) {
      const pitch = frequencyToPitch(freq);
      lastDetectedNote = pitch.fullNote;
      lastFrequency = pitch.freq;

      noteNameEl.innerHTML = `${pitch.noteName}<span class="note-octave">${pitch.octave}</span>`;
      solfegeEl.textContent = pitch.solfege;
      freqEl.textContent = `${pitch.freq} Hz`;
      centsEl.textContent = `${pitch.cents > 0 ? '+' : ''}${pitch.cents} ¢`;

      // Visual needle mapping (-50 cents is 5%, 0 cents is 50%, +50 cents is 95%)
      const clampedCents = Math.max(-50, Math.min(50, pitch.cents));
      const needlePercent = 50 + (clampedCents / 50) * 45;
      needleEl.style.left = `${needlePercent}%`;

      // Remove previous tune classes
      noteBox.classList.remove('in-tune', 'off-pitch');
      needleEl.classList.remove('in-tune', 'flat', 'sharp');

      if (Math.abs(pitch.cents) <= 12) {
        // In tune (green)
        noteBox.classList.add('in-tune');
        needleEl.classList.add('in-tune');
        statusEl.textContent = 'Zuiver! 🎯';
        statusEl.style.color = 'var(--green-glow)';
      } else if (pitch.cents < -12) {
        // Flat (too low)
        noteBox.classList.add('off-pitch');
        needleEl.classList.add('flat');
        statusEl.textContent = 'Iets te laag';
        statusEl.style.color = '#f59e0b';
      } else {
        // Sharp (too high)
        noteBox.classList.add('off-pitch');
        needleEl.classList.add('sharp');
        statusEl.textContent = 'Iets te hoog';
        statusEl.style.color = '#f43f5e';
      }

      // Highlight the corresponding key on the virtual piano!
      AudioEngine.highlightSungKey(pitch.fullNote);

    } else {
      // Silence or below threshold
      statusEl.textContent = 'Luisteren...';
      statusEl.style.color = 'var(--text-muted)';
    }

    animationFrameId = requestAnimationFrame(updatePitch);
  }

  // Start microphone
  async function start() {
    try {
      const audioCtx = AudioEngine.getContext();
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false
        }
      });

      sourceNode = audioCtx.createMediaStreamSource(audioStream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      buffer = new Float32Array(analyser.fftSize);

      sourceNode.connect(analyser);
      isListening = true;

      // Update UI button state
      const btn = document.getElementById('btn-toggle-mic');
      const label = document.getElementById('mic-btn-label');
      if (btn && label) {
        btn.classList.add('active');
        btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        label.textContent = 'Microfoon Actief (Klik om te stoppen)';
      }

      updatePitch();
      return true;
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      alert('Kon de microfoon niet openen. Controleer of je browser toegang geeft tot de microfoon.');
      return false;
    }
  }

  // Stop microphone
  function stop() {
    isListening = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      audioStream = null;
    }
    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }

    AudioEngine.highlightSungKey(null);

    // Reset UI button state
    const btn = document.getElementById('btn-toggle-mic');
    const label = document.getElementById('mic-btn-label');
    if (btn && label) {
      btn.classList.remove('active');
      btn.style.background = '';
      label.textContent = 'Start Microfoon';
    }

    const statusEl = document.getElementById('tuner-status');
    if (statusEl) {
      statusEl.textContent = 'Gepauzeerd';
      statusEl.style.color = 'var(--text-muted)';
    }
  }

  function toggle() {
    if (isListening) {
      stop();
    } else {
      start();
    }
  }

  function playLastNote() {
    if (lastDetectedNote) {
      AudioEngine.playNote(lastDetectedNote, 1.5);
    } else {
      AudioEngine.playNote('A3', 1.5);
    }
  }

  return {
    start,
    stop,
    toggle,
    isListening: () => isListening,
    playLastNote,
    getLastDetectedNote: () => lastDetectedNote
  };
})();
