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

  const sampleBuffers = {}; // midi -> AudioBuffer (Piano)
  let samplesLoadingStarted = false;

  // MuseScore / General MIDI Choir Aahs (Program 53) SoundFont samples
  const CHOIR_BASE_URLS = [
    'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/choir_aahs-mp3/',
    'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/choir_aahs-mp3/'
  ];
  const CHOIR_SAMPLE_MAP = {
    43: 'G2.mp3',
    48: 'C3.mp3',
    51: 'Eb3.mp3',
    54: 'Gb3.mp3',
    57: 'A3.mp3',
    60: 'C4.mp3',
    63: 'Eb4.mp3',
    66: 'Gb4.mp3',
    69: 'A4.mp3',
    72: 'C5.mp3',
    75: 'Eb5.mp3',
    78: 'Gb5.mp3',
    81: 'A5.mp3',
    84: 'C6.mp3'
  };
  const choirSampleBuffers = {}; // midi -> { buffer, sustainStart, sustainEnd, activeEnd }
  let choirLoadingStarted = false;
  let decodeOfflineCtx = null;

  function getDecodeContext() {
    if (ctx) return ctx;
    if (!decodeOfflineCtx) {
      const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (OfflineCtx) {
        decodeOfflineCtx = new OfflineCtx(1, 1, 44100);
      }
    }
    return decodeOfflineCtx;
  }

  // Meet waar de koor-sample daadwerkelijk klinkt (vóór eventuele stille uitloop in het MP3-bestand)
  function analyzeChoirSampleLoop(audioBuffer) {
    const dur = audioBuffer.duration || 0;
    if (dur <= 0.4) {
      return { sustainStart: 0.08, sustainEnd: Math.max(0.2, dur * 0.8), activeEnd: dur };
    }
    try {
      const data = audioBuffer.getChannelData(0);
      const sr = audioBuffer.sampleRate || 44100;
      const winSize = Math.max(256, Math.floor(sr * 0.04)); // 40ms vensters
      const rmsList = [];
      let peakRms = 0;

      for (let pos = 0; pos + winSize <= data.length; pos += winSize) {
        let sumSq = 0;
        for (let i = 0; i < winSize; i++) {
          const v = data[pos + i];
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / winSize);
        rmsList.push({ time: pos / sr, rms });
        if (rms > peakRms) peakRms = rms;
      }

      if (peakRms <= 0.0001 || rmsList.length < 4) {
        return { sustainStart: 0.2, sustainEnd: Math.max(0.45, dur * 0.75), activeEnd: dur };
      }

      // Zoek het laatste venster waar het volume nog vol klinkt (>= 38% van de piek)
      let activeEnd = dur * 0.8;
      for (let i = rmsList.length - 1; i >= 0; i--) {
        if (rmsList[i].rms >= peakRms * 0.38) {
          activeEnd = rmsList[i].time;
          break;
        }
      }

      const sustainStart = Math.min(0.32, Math.max(0.12, activeEnd * 0.25));
      const sustainEnd = Math.max(sustainStart + 0.22, Math.min(dur - 0.05, activeEnd - 0.06));
      return { sustainStart, sustainEnd, activeEnd: Math.max(sustainEnd, activeEnd) };
    } catch (e) {
      return { sustainStart: 0.22, sustainEnd: Math.max(0.5, dur * 0.7), activeEnd: dur * 0.85 };
    }
  }

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
      preloadChoirSamples();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  async function ensureContextReady() {
    const audioCtx = getContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      try {
        await audioCtx.resume();
      } catch (e) {}
    }
    return audioCtx;
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
        const decodeCtx = getDecodeContext();
        if (!decodeCtx) return;
        const decoded = await decodeCtx.decodeAudioData(arrayBuf);
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

  // Convert note name (e.g. "A3", "C#4", "Bb4", "Cb4", "F##4") to frequency
  function noteToFrequency(noteStr) {
    if (!noteStr || typeof noteStr !== 'string') return 440;
    const match = noteStr.trim().match(/^([A-Ga-g])(#{1,2}|b{1,2})?(-?\d+)$/);
    if (!match) return 440;
    const baseOffsets = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const step = match[1].toUpperCase();
    const acc = match[2] || '';
    const octave = parseInt(match[3], 10);
    let semitone = baseOffsets[step];
    if (semitone === undefined) return 440;
    if (acc === '#') semitone += 1;
    else if (acc === '##') semitone += 2;
    else if (acc === 'b') semitone -= 1;
    else if (acc === 'bb') semitone -= 2;
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

  // Laad MuseScore / General MIDI Choir Aahs (Program 53) samples op de achtergrond in
  function preloadChoirSamples() {
    if (choirLoadingStarted) return;
    choirLoadingStarted = true;

    const sampleMidis = Object.keys(CHOIR_SAMPLE_MAP).map(Number);
    const priorityOrder = sampleMidis.sort((a, b) => Math.abs(a - 60) - Math.abs(b - 60));

    priorityOrder.forEach(async (midi) => {
      const file = CHOIR_SAMPLE_MAP[midi];
      for (const baseUrl of CHOIR_BASE_URLS) {
        try {
          const res = await fetch(baseUrl + file);
          if (!res.ok) continue;
          const arrayBuf = await res.arrayBuffer();
          const decodeCtx = getDecodeContext();
          if (!decodeCtx) break;
          const decoded = await decodeCtx.decodeAudioData(arrayBuf);
          const loopMeta = analyzeChoirSampleLoop(decoded);
          choirSampleBuffers[midi] = {
            buffer: decoded,
            sustainStart: loopMeta.sustainStart,
            sustainEnd: loopMeta.sustainEnd,
            activeEnd: loopMeta.activeEnd
          };
          break;
        } catch (err) {
          // Volgende CDN of formant-koor-synthese fallback
        }
      }
    });
  }

  function findClosestChoirSample(freq) {
    const loadedMidis = Object.keys(choirSampleBuffers).map(Number);
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

    if (minDiff > 7) return null;
    const entry = choirSampleBuffers[closestMidi];
    if (!entry || !entry.buffer) return null;
    return {
      midi: closestMidi,
      buffer: entry.buffer,
      sustainStart: entry.sustainStart,
      sustainEnd: entry.sustainEnd,
      activeEnd: entry.activeEnd,
      baseFreq: midiToFreq(closestMidi)
    };
  }

  // Speel een noot met MuseScore Koorgeluid (Choir Aahs GM 53 + warme vocale formant-synthese)
  function playChoirTone(freq, duration = 1.0) {
    const audioCtx = getContext();
    const now = audioCtx.currentTime;
    const dest = masterCompressor || audioCtx.destination;
    const sustainTime = Math.max(0.22, duration);
    const releaseTime = 0.28;

    // 1. Gebruik echte SoundFont Choir Aahs sample indien geladen
    const sampleMatch = findClosestChoirSample(freq);
    if (sampleMatch && sampleMatch.buffer) {
      const source = audioCtx.createBufferSource();
      source.buffer = sampleMatch.buffer;
      const rate = freq / sampleMatch.baseFreq;
      source.playbackRate.setValueAtTime(rate, now);

      // Loop het actief klinkende middendeel zodra de gewenste nootduur langer is dan de actieve samplekern
      // (voorkomt dat een MP3 met stille uitloop halverwege een halve/hele noot wegvalt!)
      const activeEnd = sampleMatch.activeEnd || (sampleMatch.buffer.duration * 0.7);
      if ((sustainTime + releaseTime) * rate > activeEnd * 0.82 && sampleMatch.sustainEnd > sampleMatch.sustainStart + 0.15) {
        source.loop = true;
        source.loopStart = sampleMatch.sustainStart;
        source.loopEnd = sampleMatch.sustainEnd;
      }

      const envGain = audioCtx.createGain();
      const attackTime = Math.min(0.045, sustainTime * 0.22);
      envGain.gain.setValueAtTime(0.001, now);
      envGain.gain.linearRampToValueAtTime(0.84, now + attackTime);
      envGain.gain.setValueAtTime(0.80, now + Math.max(attackTime + 0.01, sustainTime * 0.94));
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

    // 2. Vocale Formant-Koor Synthese ("Aah"-koor met 3 vocale formanten & natuurlijk vibrato)
    const noteGain = audioCtx.createGain();
    const attackTime = Math.min(0.07, sustainTime * 0.28);
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(0.55, now + attackTime);
    noteGain.gain.setValueAtTime(0.50, now + Math.max(attackTime + 0.01, sustainTime * 0.9));
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + sustainTime + releaseTime);

    const warmthFilter = audioCtx.createBiquadFilter();
    warmthFilter.type = 'lowpass';
    warmthFilter.frequency.setValueAtTime(Math.min(4200, freq * 7.5), now);
    warmthFilter.Q.setValueAtTime(0.7, now);
    warmthFilter.connect(noteGain);

    noteGain.connect(dest);
    if (reverbNode) {
      noteGain.connect(reverbNode);
    }

    // Drie parallelle klinker-formantfilters (koor "Aah" / "Ooh" resonantie)
    const formants = [
      { freq: 720, q: 5.0, gain: 0.95 },
      { freq: 1180, q: 6.0, gain: 0.60 },
      { freq: 2550, q: 7.5, gain: 0.22 }
    ];

    const formantInput = audioCtx.createGain();
    formantInput.gain.setValueAtTime(1.0, now);

    formants.forEach(f => {
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f.freq, now);
      bp.Q.setValueAtTime(f.q, now);
      const fg = audioCtx.createGain();
      fg.gain.setValueAtTime(f.gain, now);
      formantInput.connect(bp);
      bp.connect(fg);
      fg.connect(warmthFilter);
    });

    // Directe grondtoon-warmte zodat ook lage bassen en hoge sopranen vol klinken
    const directLow = audioCtx.createBiquadFilter();
    directLow.type = 'lowpass';
    directLow.frequency.setValueAtTime(freq * 2.2, now);
    const directGain = audioCtx.createGain();
    directGain.gain.setValueAtTime(0.32, now);
    formantInput.connect(directLow);
    directLow.connect(directGain);
    directGain.connect(warmthFilter);

    // Subtiel menselijk koor-vibrato (5.3 Hz)
    const vibOsc = audioCtx.createOscillator();
    const vibGain = audioCtx.createGain();
    vibOsc.frequency.setValueAtTime(5.3, now);
    vibGain.gain.setValueAtTime(0.0, now);
    vibGain.gain.linearRampToValueAtTime(4.5, now + Math.min(0.35, sustainTime * 0.5));
    vibOsc.connect(vibGain);

    const voices = [
      { type: 'sawtooth', detune: -6.5, amp: 0.36 },
      { type: 'sawtooth', detune: 6.5, amp: 0.36 },
      { type: 'triangle', detune: 0.0, amp: 0.45 }
    ];

    const stopTime = now + sustainTime + releaseTime + 0.05;
    voices.forEach(v => {
      const osc = audioCtx.createOscillator();
      const vg = audioCtx.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime(v.detune, now);
      vibGain.connect(osc.detune);
      vg.gain.setValueAtTime(v.amp, now);
      osc.connect(vg);
      vg.connect(formantInput);
      osc.start(now);
      osc.stop(stopTime);
    });

    vibOsc.start(now);
    vibOsc.stop(stopTime);
  }

  function playChoirNote(noteStr, duration = 1.2) {
    const freq = noteToFrequency(noteStr);
    playChoirTone(freq, duration);
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
    ensureContextReady,
    preloadPianoSamples,
    preloadChoirSamples,
    noteToFrequency,
    playTone,
    playNote,
    playChoirTone,
    playChoirNote,
    playChime,
    playClick,
    setupPianoKeyboard,
    highlightSungKey,
    NOTE_NAMES
  };
})();
