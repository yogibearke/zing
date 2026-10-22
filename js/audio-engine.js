/**
 * ZingStart - Audio Engine
 * Web Audio API Synthesizer, Virtual Piano, Metronome & Chimes
 */

const AudioEngine = (() => {
  let ctx = null;
  let activeOscillators = {};

  // Note frequency calculation table (A4 = 440 Hz standard)
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  
  function getContext() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  // Convert note name (e.g. "A3", "C#4", "Bb4") to frequency
  function noteToFrequency(noteStr) {
    const flatMap = { 'DB': 'C#', 'EB': 'D#', 'GB': 'F#', 'AB': 'G#', 'BB': 'A#' };
    const match = noteStr.match(/^([A-G][#b]?)(-?\d+)$/i);
    if (!match) return 440;
    let note = match[1].toUpperCase();
    if (flatMap[note]) note = flatMap[note];
    const octave = parseInt(match[2], 10);
    const semitone = NOTE_NAMES.indexOf(note);
    if (semitone === -1) return 440;
    // MIDI number: C4 = 60, A4 = 69
    const midi = (octave + 1) * 12 + semitone;
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Play a natural, warm piano-like tone
  function playTone(freq, duration = 1.0, type = 'piano') {
    const audioCtx = getContext();
    const now = audioCtx.currentTime;

    const masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);

    // Fundamental oscillator (Warm triangle/sine mix)
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);

    // Subtle 2nd harmonic for brightness
    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, now);

    const gain1 = audioCtx.createGain();
    const gain2 = audioCtx.createGain();

    // Natural attack and exponential decay envelope
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.5, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + (duration * 0.7));

    osc1.connect(gain1);
    gain1.connect(masterGain);

    osc2.connect(gain2);
    gain2.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.05);
    osc2.stop(now + duration + 0.05);
  }

  // Play note by name (e.g. "A3")
  function playNote(noteStr, duration = 1.2) {
    const freq = noteToFrequency(noteStr);
    playTone(freq, duration);
  }

  // Gentle chime sound for breathing trainer
  function playChime(isStart = true) {
    const audioCtx = getContext();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isStart ? 587.33 : 440, now); // D5 or A4
    if (isStart) {
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.2); // Upward chime
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 1.25);
  }

  // Metronome click (Woodblock / percussion style)
  function playClick(isAccent = false) {
    const audioCtx = getContext();
    const now = audioCtx.currentTime;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isAccent ? 1200 : 800, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.05);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isAccent ? 0.6 : 0.35, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Render Virtual Piano keyboard from C3 (MIDI 48) to C5 (MIDI 72)
  function setupPianoKeyboard(containerId, idPrefix = 'key-') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const startMidi = 48; // C3
    const endMidi = 72;   // C5
    const keys = [];

    // First collect all white keys
    const whiteKeys = [];
    const blackKeys = [];

    for (let midi = startMidi; midi <= endMidi; midi++) {
      const noteName = NOTE_NAMES[midi % 12];
      const octave = Math.floor(midi / 12) - 1;
      const fullNote = `${noteName}${octave}`;
      const isBlack = noteName.includes('#');

      if (!isBlack) {
        whiteKeys.push({ midi, noteName, octave, fullNote });
      } else {
        blackKeys.push({ midi, noteName, octave, fullNote, prevWhiteIndex: whiteKeys.length - 1 });
      }
    }

    // Render white keys first
    const keyElements = {};

    whiteKeys.forEach((k) => {
      const el = document.createElement('div');
      el.className = 'white-key';
      el.dataset.note = k.fullNote;
      el.id = `${idPrefix}${k.fullNote.replace('#', 's')}`;
      el.innerHTML = `<span>${k.fullNote}</span>`;

      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        playNote(k.fullNote, 1.2);
        el.classList.add('active');
      });

      const removeActive = () => el.classList.remove('active');
      el.addEventListener('pointerup', removeActive);
      el.addEventListener('pointerleave', removeActive);

      container.appendChild(el);
      keyElements[k.fullNote] = el;
    });

    // Render black keys with accurate relative positioning
    const totalWhiteKeys = whiteKeys.length;
    blackKeys.forEach((k) => {
      const el = document.createElement('div');
      el.className = 'black-key';
      el.dataset.note = k.fullNote;
      el.id = `${idPrefix}${k.fullNote.replace('#', 's')}`;
      el.innerHTML = `<span>${k.fullNote}</span>`;

      // Position between the preceding white key and following white key
      const percentLeft = ((k.prevWhiteIndex + 1) / totalWhiteKeys) * 100 - 3;
      el.style.left = `${percentLeft}%`;

      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        playNote(k.fullNote, 1.2);
        el.classList.add('active');
      });

      const removeActive = () => el.classList.remove('active');
      el.addEventListener('pointerup', removeActive);
      el.addEventListener('pointerleave', removeActive);

      container.appendChild(el);
      keyElements[k.fullNote] = el;
    });

    return keyElements;
  }

  // Highlight a key when sung (e.g. "A3")
  let currentSungKeyEl = null;

  function highlightSungKey(noteWithOctave) {
    if (currentSungKeyEl) {
      currentSungKeyEl.classList.remove('sung-match');
      currentSungKeyEl = null;
    }
    if (!noteWithOctave) return;

    let norm = noteWithOctave;
    const flatMap = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
    for (const [flat, sharp] of Object.entries(flatMap)) {
      if (norm.startsWith(flat)) {
        norm = norm.replace(flat, sharp);
        break;
      }
    }
    const id = `key-${norm.replace('#', 's')}`;
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('sung-match');
      currentSungKeyEl = el;
    }
  }

  return {
    getContext,
    noteToFrequency,
    playTone,
    playNote,
    playChime,
    playClick,
    setupPianoKeyboard,
    highlightSungKey,
    NOTE_NAMES
  };
})();
