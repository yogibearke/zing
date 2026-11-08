/**
 * Zing! - Audio Engine
 * Echte gesamplede akoestische vleugelpiano (Yamaha C5 Salamander Grand Piano)
 * met fysisch gemodelleerde akoestische piano-fallback, klavier, metronoom & chimes.
 */

const AudioEngine = (() => {
  let ctx = null;
  let reverbNode = null;
  let masterCompressor = null;

  // Note frequency calculation table (A4 = 440 Hz standard)
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  // Salamander Grand Piano anker-samples (3 samples per octaaf voor natuurlijke klankkleur)
  const SALAMANDER_BASE_URL = 'https://tonejs.github.io/audio/salamander/';
  const PIANO_SAMPLE_MAP = {
    33: 'A1.mp3',
    36: 'C2.mp3',
    39: 'Ds2.mp3',
    42: 'Fs2.mp3',
    45: 'A2.mp3',
    48: 'C3.mp3',
    51: 'Ds3.mp3',
    54: 'Fs3.mp3',
    57: 'A3.mp3',
    60: 'C4.mp3',
    63: 'Ds4.mp3',
    66: 'Fs4.mp3',
    69: 'A4.mp3',
    72: 'C5.mp3',
    75: 'Ds5.mp3',
    78: 'Fs5.mp3',
    81: 'A5.mp3',
    84: 'C6.mp3'
  };

  const sampleBuffers = {}; // midi -> AudioBuffer
  let samplesLoadingStarted = false;

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function freqToMidi(freq) {
    return 69 + 12 * Math.log2(freq / 440);
  }

  function getContext() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      setupMasterChain(ctx);
      preloadPianoSamples();
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  // Subtiele akoestische ruimte-resonantie (zanglokalen-akoestiek) en compressor
  function setupMasterChain(audioCtx) {
    try {
      masterCompressor = audioCtx.createDynamicsCompressor();
      masterCompressor.threshold.setValueAtTime(-14, audioCtx.currentTime);
      masterCompressor.knee.setValueAtTime(18, audioCtx.currentTime);
      masterCompressor.ratio.setValueAtTime(3, audioCtx.currentTime);
      masterCompressor.attack.setValueAtTime(0.005, audioCtx.currentTime);
      masterCompressor.release.setValueAtTime(0.2, audioCtx.currentTime);
      masterCompressor.connect(audioCtx.destination);

      // Genereer een warme, korte klankkast/kamer-impulsrespons (1.1s)
      const sampleRate = audioCtx.sampleRate;
      const length = Math.floor(sampleRate * 1.1);
      const impulse = audioCtx.createBuffer(2, length, sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = impulse.getChannelData(ch);
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const decay = Math.exp(-t * 5.2);
          data[i] = (Math.random() * 2 - 1) * decay * 0.18;
        }
      }
      reverbNode = audioCtx.createConvolver();
      reverbNode.buffer = impulse;

      const reverbGain = audioCtx.createGain();
      reverbGain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      reverbNode.connect(reverbGain);
      reverbGain.connect(masterCompressor);
    } catch (e) {
      masterCompressor = null;
      reverbNode = null;
    }
  }

  // Laad de echte vleugelpiano-samples op de achtergrond in
  function preloadPianoSamples() {
    if (samplesLoadingStarted) return;
    samplesLoadingStarted = true;

    const sampleMidis = Object.keys(PIANO_SAMPLE_MAP).map(Number);
    // Laad eerst het middenregister (C3 - C5) voor direct gebruik, daarna de rest
    const priorityOrder = sampleMidis.sort((a, b) => Math.abs(a - 60) - Math.abs(b - 60));

    priorityOrder.forEach(async (midi) => {
      const file = PIANO_SAMPLE_MAP[midi];
      try {
        const res = await fetch(SALAMANDER_BASE_URL + file);
        if (!res.ok) return;
        const arrayBuf = await res.arrayBuffer();
        const audioCtx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (!ctx) {
          ctx = audioCtx;
          setupMasterChain(ctx);
        }
        const decoded = await audioCtx.decodeAudioData(arrayBuf);
        sampleBuffers[midi] = decoded;
      } catch (err) {
        // Offline of geen toegang tot CDN: de warme akoestische piano-synthese neemt automatisch over
      }
    });
  }

  // Vind de dichtstbijzijnde geladen piano-sample voor een gegeven frequentie
  function findClosestSample(freq) {
    const loadedMidis = Object.keys(sampleBuffers).map(Number);
    if (loadedMidis.length === 0) return null;

    const targetMidi = freqToMidi(freq);
    let closestMidi = loadedMidis[0];
    let minDiff = Math.abs(targetMidi - closestMidi);

    for (let i = 1; i < loadedMidis.length; i++) {
      const diff = Math.abs(targetMidi - loadedMidis[i]);
      if (diff < minDiff) {
        minDiff = diff;
        closestMidi = loadedMidis[i];
      }
    }

    // Alleen gebruiken als de sample binnen een redelijke afstand ligt (max 7 halve tonen)
    if (minDiff > 7) return null;
    return {
      midi: closestMidi,
      buffer: sampleBuffers[closestMidi],
      baseFreq: midiToFreq(closestMidi)
    };
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
    const midi = (octave + 1) * 12 + semitone;
    return midiToFreq(midi);
  }

  // Speel een echte gesamplede vleugelnoot of (als offline fallback) een warme akoestische vleugelsimulatie
  function playTone(freq, duration = 1.0) {
    const audioCtx = getContext();
    const now = audioCtx.currentTime;
    const dest = masterCompressor || audioCtx.destination;

    // 1. Gebruik echte Yamaha C5 vleugelpiano-sample indien geladen
    const sampleMatch = findClosestSample(freq);
    if (sampleMatch && sampleMatch.buffer) {
      const source = audioCtx.createBufferSource();
      source.buffer = sampleMatch.buffer;
      source.playbackRate.setValueAtTime(freq / sampleMatch.baseFreq, now);

      const envGain = audioCtx.createGain();
      const sustainTime = Math.max(0.25, duration);
      const releaseTime = 0.32;

      envGain.gain.setValueAtTime(0.001, now);
      envGain.gain.linearRampToValueAtTime(0.75, now + 0.006);
      envGain.gain.setValueAtTime(0.72, now + sustainTime * 0.85);
      envGain.gain.exponentialRampToValueAtTime(0.0001, now + sustainTime + releaseTime);

      source.connect(envGain);
      envGain.connect(dest);
      if (reverbNode) {
        envGain.connect(reverbNode);
      }

      source.start(now);
      source.stop(now + sustainTime + releaseTime + 0.05);
      return;
    }

    // 2. Offline Fallback: Fysisch gemodelleerde warme akoestische vleugelpiano
    const noteGain = audioCtx.createGain();
    noteGain.connect(dest);
    if (reverbNode) {
      noteGain.connect(reverbNode);
    }

    // Dynamisch lowpass filter dat bij de aanslag warm opent en daarna zachtjes rond wordt (zoals echt vilt op snaren)
    const bodyFilter = audioCtx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    const maxCutoff = Math.min(12000, freq * 9);
    const warmCutoff = Math.max(600, freq * 3.2);
    bodyFilter.frequency.setValueAtTime(maxCutoff, now);
    bodyFilter.frequency.exponentialRampToValueAtTime(warmCutoff, now + Math.max(0.35, duration * 0.65));
    bodyFilter.Q.setValueAtTime(0.7, now);
    bodyFilter.connect(noteGain);

    // Natuurlijk boventoonspectrum van een pianosnaar (met lichte koor-ontstemming op de dubbele snaren)
    const partials = [
      { mult: 1.0, amp: 0.42, decayMult: 1.3, detuneCents: -1.5, type: 'triangle' },
      { mult: 1.0, amp: 0.42, decayMult: 1.3, detuneCents: 1.5, type: 'sine' },
      { mult: 2.0005, amp: 0.22, decayMult: 0.95, detuneCents: 0.8, type: 'sine' },
      { mult: 3.0018, amp: 0.11, decayMult: 0.70, detuneCents: -1.0, type: 'sine' },
      { mult: 4.004, amp: 0.055, decayMult: 0.50, detuneCents: 1.2, type: 'sine' },
      { mult: 5.008, amp: 0.025, decayMult: 0.35, detuneCents: 0, type: 'sine' }
    ];

    const totalDur = Math.max(0.4, duration + 0.28);

    partials.forEach((p) => {
      const pFreq = freq * p.mult;
      if (pFreq > audioCtx.sampleRate * 0.45) return;

      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      osc.type = p.type;
      osc.frequency.setValueAtTime(pFreq, now);
      if (p.detuneCents) {
        osc.detune.setValueAtTime(p.detuneCents, now);
      }

      const pDur = Math.max(0.18, totalDur * p.decayMult);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(p.amp, now + 0.008);
      // Tweetraps pianosnaar-uitsterving (snelle initiële val naar klankbord-sustain)
      g.gain.exponentialRampToValueAtTime(p.amp * 0.48, now + Math.min(0.18, pDur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, now + pDur);

      osc.connect(g);
      g.connect(bodyFilter);

      osc.start(now);
      osc.stop(now + pDur + 0.04);
    });
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

    const totalWhiteKeys = whiteKeys.length;
    blackKeys.forEach((k) => {
      const el = document.createElement('div');
      el.className = 'black-key';
      el.dataset.note = k.fullNote;
      el.id = `${idPrefix}${k.fullNote.replace('#', 's')}`;
      el.innerHTML = `<span>${k.fullNote}</span>`;

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
    preloadPianoSamples,
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
