/**
 * Zing! - Score Viewer & Audio Companion with Multi-Part Choir (SATB)
 * 100% getrouwe transcriptie van de originele koorpartituur (2/4 maat met 1/4 opmaat).
 */

const ScoreViewer = (() => {
  let isPlayingCompanion = false;
  let companionInterval = null;
  let currentTempo = 1.0;
  let currentBpm = 120;
  let currentStep = 0;
  let selectedVoice = 'sopraan'; // 'sopraan', 'alt', 'tenor', 'bas', 'tutti'

  function setBpm(newBpm) {
    currentBpm = Math.max(40, Math.min(220, Math.round(newBpm)));
    const bpmDisplay = document.getElementById('score-bpm-display');
    if (bpmDisplay) {
      bpmDisplay.textContent = `${currentBpm} BPM`;
    }
    const bpmSlider = document.getElementById('score-bpm-slider');
    if (bpmSlider && parseInt(bpmSlider.value, 10) !== currentBpm) {
      bpmSlider.value = currentBpm;
    }
  }

  // Helper to build Tutti chords from synchronized choral parts (2, 3 (SAB) or 4 (SATB) voices)
  // Accepts either an object map { sopraan: [...], alt: [...] } or separate voice arrays
  function buildTutti(voiceMapOrSoprano, ...restVoices) {
    if (!voiceMapOrSoprano) return [];

    // Formaat 1: Losse arrays als argumenten: buildTutti(sopraan, alt, tenor, bas)
    if (Array.isArray(voiceMapOrSoprano)) {
      const allVoices = [voiceMapOrSoprano, ...restVoices].filter(v => Array.isArray(v) && v.length > 0);
      if (allVoices.length === 0) return [];
      const baseVoice = allVoices[0];
      return baseVoice.map((baseNote, idx) => {
        const chord = allVoices
          .map(voice => (voice[idx] ? voice[idx].note : null))
          .filter(n => n && n !== 'REST');
        return {
          notes: chord.length > 0 ? chord : ['REST'],
          dur: baseNote.dur,
          measureIndex: baseNote.measureIndex
        };
      });
    }

    // Formaat 2: Object-map met partijnamen: { sopraan: [...], alt: [...] }
    if (typeof voiceMapOrSoprano === 'object') {
      const keys = Object.keys(voiceMapOrSoprano).filter(k => k !== 'tutti' && Array.isArray(voiceMapOrSoprano[k]));
      if (keys.length === 0) return [];
      if (keys.length === 1) return voiceMapOrSoprano[keys[0]] || [];

      const baseVoice = voiceMapOrSoprano[keys[0]] || [];
      return baseVoice.map((baseNote, idx) => {
        const chord = keys
          .map(k => voiceMapOrSoprano[k] && voiceMapOrSoprano[k][idx] ? voiceMapOrSoprano[k][idx].note : null)
          .filter(n => n && n !== 'REST');
        return {
          notes: chord.length > 0 ? chord : ['REST'],
          dur: baseNote.dur,
          measureIndex: baseNote.measureIndex
        };
      });
    }

    return [];
  }

  // Dynamische MusicXML 3.1 Parser: laadt elk .musicxml bestand in en bouwt automatisch de stempartijen (SATB, SAB of solo)
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

      // Detecteer part-namen rechtstreeks uit de part-list van de MusicXML
      const partListEls = xmlDoc.querySelectorAll('part-list > score-part');
      const partNameMap = {};
      const partLabels = {};
      if (partListEls && partListEls.length > 0) {
        partListEls.forEach(sp => {
          const id = sp.getAttribute('id');
          const nameEl = sp.querySelector('part-name');
          const rawLabel = nameEl ? nameEl.textContent.trim() : '';
          const rawName = rawLabel.toLowerCase();
          let key = rawName.replace(/[^a-z0-9]+/g, '');
          if (rawName.includes('sopraan') || rawName.includes('sopran')) key = 'sopraan';
          else if (rawName.includes('alt') || rawName.includes('alto')) key = 'alt';
          else if (rawName.includes('tenor')) key = 'tenor';
          else if (rawName.includes('bariton') || rawName.includes('baritone')) key = 'bariton';
          else if (rawName.includes('bas') || rawName.includes('bass')) key = 'bas';
          if (id && key) {
            partNameMap[id] = key;
            partLabels[key] = rawLabel;
          }
        });
      }

      const parsedVoices = {};
      const voiceIndexMap = {};
      const voiceLyrics = {};

      // Lees globale divisions uit het XML-bestand
      const firstDiv = xmlDoc.querySelector('attributes > divisions');
      let defaultDivisions = firstDiv ? parseInt(firstDiv.textContent.trim(), 10) : 1;

      // Analyseer herhalingstekens en volta's op basis van de maatstructuur in het eerste part
      let playbackOrder = [];
      const sampleMeasures = parts[0].querySelectorAll('measure');
      const measureCount = sampleMeasures.length;

      if (measureCount > 0) {
        const meta = [];
        sampleMeasures.forEach((m, idx) => {
          const fwdRepeat = m.querySelector('repeat[direction="forward"]');
          const bwdRepeat = m.querySelector('repeat[direction="backward"]');
          const endingEl = m.querySelector('ending');
          let ending = null;
          if (endingEl) {
            ending = {
              number: endingEl.getAttribute('number') || '1',
              type: endingEl.getAttribute('type') || 'start'
            };
          }
          meta.push({
            index: idx,
            forward: !!fwdRepeat,
            backward: !!bwdRepeat,
            ending: ending
          });
        });

        const hasBackward = meta.some(m => m.backward);
        if (!hasBackward) {
          playbackOrder = Array.from({ length: measureCount }, (_, i) => i);
        } else {
          let currentRepeatStart = 0;
          let ending1Start = -1;
          let ending2Start = -1;

          for (let i = 0; i < measureCount; i++) {
            const m = meta[i];
            if (m.forward) {
              currentRepeatStart = i;
              ending1Start = -1;
              ending2Start = -1;
            }
            if (m.ending) {
              const numStr = String(m.ending.number || '1');
              if (numStr.includes('1') && ending1Start === -1) ending1Start = i;
              if (numStr.includes('2') && ending2Start === -1) ending2Start = i;
            }

            playbackOrder.push(i);

            if (m.backward) {
              if (ending1Start !== -1) {
                for (let j = currentRepeatStart; j < ending1Start; j++) {
                  playbackOrder.push(j);
                }
                if (ending2Start !== -1 && ending2Start > i) {
                  i = ending2Start - 1;
                }
              } else {
                for (let j = currentRepeatStart; j <= i; j++) {
                  playbackOrder.push(j);
                }
              }
              currentRepeatStart = i + 1;
              ending1Start = -1;
              ending2Start = -1;
            }
          }
        }
      }

      parts.forEach((partEl, idx) => {
        const partId = partEl.getAttribute('id');
        const voiceKey = partNameMap[partId] || (partId ? partId.toLowerCase() : `part_${idx + 1}`);
        voiceIndexMap[voiceKey] = idx;

        const measuresNotes = [];
        let currentDivisions = defaultDivisions;
        const measures = partEl.querySelectorAll('measure');

        const partVerses = {};
        const partMeasures = [];

        measures.forEach((measure, mIndex) => {
          const mNum = measure.getAttribute('number') || String(mIndex + 1);
          const divEl = measure.querySelector('attributes > divisions');
          if (divEl) {
            currentDivisions = parseInt(divEl.textContent.trim(), 10) || currentDivisions;
          }

          const mNotes = [];
          const noteEls = measure.querySelectorAll('note');
          const mLyricTokens = {};

          noteEls.forEach(n => {
            // Sla akkoordnoten op dezelfde balk over (koorbalken zijn monofoon per stem)
            if (n.querySelector('chord')) return;

            const isRest = n.querySelector('rest') !== null;
            const durEl = n.querySelector('duration');
            const durDivs = durEl ? parseInt(durEl.textContent.trim(), 10) : currentDivisions;
            // Kwartsnoot = 1.0 (dur: 0.5 = achtste noot, dur: 1.0 = kwartnoot, dur: 2.0 = halve noot)
            const dur = durDivs / currentDivisions;

            if (isRest) {
              mNotes.push({ note: 'REST', dur, measureIndex: mIndex });
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
                mNotes.push({ note: `${step}${acc}${oct}`, dur, measureIndex: mIndex });
              }
            }

            // Lyric extractie
            const lyrics = n.querySelectorAll('lyric');
            lyrics.forEach(lyr => {
              const vNum = lyr.getAttribute('number') || '1';
              const txtEl = lyr.querySelector('text');
              const sylEl = lyr.querySelector('syllabic');
              if (txtEl && txtEl.textContent && txtEl.textContent.trim()) {
                const token = {
                  text: txtEl.textContent.trim(),
                  syllabic: sylEl && sylEl.textContent ? sylEl.textContent.trim().toLowerCase() : 'single',
                  measureIndex: mIndex,
                  measureNumber: mNum
                };
                if (!partVerses[vNum]) partVerses[vNum] = [];
                partVerses[vNum].push(token);

                if (!mLyricTokens[vNum]) mLyricTokens[vNum] = [];
                mLyricTokens[vNum].push(token);
              }
            });
          });
          measuresNotes[mIndex] = mNotes;
          partMeasures[mIndex] = {
            measureNumber: mNum,
            verses: mLyricTokens
          };
        });

        // Vloeiende tekst per vers construeren
        const assembledVerses = {};
        Object.keys(partVerses).sort().forEach(vNum => {
          const tokens = partVerses[vNum];
          const words = [];
          let curWord = '';
          tokens.forEach(tok => {
            const s = tok.syllabic;
            const t = tok.text;
            if (s === 'single') {
              if (curWord) { words.push(curWord); curWord = ''; }
              words.push(t);
            } else if (s === 'begin') {
              if (curWord) { words.push(curWord); }
              curWord = t;
            } else if (s === 'middle') {
              curWord += t;
            } else if (s === 'end') {
              curWord += t;
              words.push(curWord);
              curWord = '';
            }
          });
          if (curWord) words.push(curWord);
          assembledVerses[vNum] = words.join(' ');
        });

        voiceLyrics[voiceKey] = {
          voiceKey,
          label: partLabels[voiceKey] || (VOICE_CONFIG[voiceKey] ? VOICE_CONFIG[voiceKey].name : voiceKey),
          verses: assembledVerses,
          tokensByVerse: partVerses,
          measures: partMeasures
        };

        // Unroll maten volgens berekende afspeelvolgorde (inclusief herhalingen)
        const unrolledVoiceNotes = [];
        const effectiveOrder = (playbackOrder && playbackOrder.length > 0)
          ? playbackOrder
          : Array.from({ length: measures.length }, (_, i) => i);

        effectiveOrder.forEach(mIdx => {
          const notesInM = measuresNotes[mIdx] || [];
          notesInM.forEach(noteItem => {
            unrolledVoiceNotes.push({ ...noteItem, measureIndex: mIdx });
          });
        });

        parsedVoices[voiceKey] = unrolledVoiceNotes;
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

      // Lees tekstvakken en extra liedstrofes uit de MusicXML (<credit-words> en <direction-type><words>)
      const textBlocks = [];
      const docTitleEl = xmlDoc.querySelector('movement-title') || xmlDoc.querySelector('work > work-title');
      const docTitle = docTitleEl ? docTitleEl.textContent.trim() : '';
      const docCompEl = xmlDoc.querySelector('identification > creator[type="composer"]') || xmlDoc.querySelector('creator');
      const docComp = docCompEl ? docCompEl.textContent.trim() : '';

      xmlDoc.querySelectorAll('credit').forEach(cr => {
        const cTypeEl = cr.querySelector('credit-type');
        const cType = cTypeEl ? cTypeEl.textContent.trim().toLowerCase() : '';
        if (cType === 'title' || cType === 'subtitle' || cType === 'composer' || cType === 'page number' || cType === 'rights') {
          return;
        }
        const wordsEls = Array.from(cr.querySelectorAll('credit-words'));
        const combined = wordsEls.map(w => w.textContent.trim()).filter(Boolean).join('\n');
        if (combined && combined !== docTitle && combined !== docComp) {
          textBlocks.push(combined);
        }
      });

      xmlDoc.querySelectorAll('direction > direction-type > words').forEach(wEl => {
        const txt = wEl.textContent.trim();
        if (txt && (txt.includes('\n') || txt.length > 30)) {
          if (!textBlocks.includes(txt)) {
            textBlocks.push(txt);
          }
        }
      });

      // Bouw automatische Tutti akkoorden enkel indien meerstemmig (> 1 stem)
      const voiceKeys = Object.keys(parsedVoices);
      if (voiceKeys.length > 1) {
        parsedVoices.tutti = buildTutti(parsedVoices);
      }
      return { voices: parsedVoices, voiceIndexMap, partLabels, bpm: detectedBpm, textBlocks, voiceLyrics };
    } catch (err) {
      console.warn('Kon MusicXML niet dynamisch inladen vanuit:', xmlUrlOrText, err);
      return null;
    }
  }

  // Dynamisch geladen partituren-register (gevuld vanuit scores-index.json + XML/PDF)
  const SCORES = {};
  let activeScoreKey = null;

  const VOICE_CONFIG = {
    'sopraan': { label: '🔵 Sopraan', name: 'Sopraan (Melodie)', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    'alt': { label: '🟢 Alt', name: 'Alt (2e stem)', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
    'tenor': { label: '🟠 Tenor', name: 'Tenor (Hoge mannenstem)', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    'bariton': { label: '🟤 Bariton', name: 'Bariton (Mannenstem)', color: '#78350f', bg: '#fef3c7', border: '#fde68a' },
    'bas': { label: '🔴 Bas', name: 'Bas (Lage mannenstem)', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    'tutti': { label: '🟣 Tutti', name: 'Tutti (Volledig Koor)', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' }
  };

  function getVoiceLabel(voiceKey) {
    if (VOICE_CONFIG[voiceKey]) return VOICE_CONFIG[voiceKey].name;
    return voiceKey;
  }

  function renderVoicePills(voices) {
    const container = document.getElementById('voice-picker-container');
    const pillsBar = document.getElementById('voice-pills-bar');
    if (!container || !pillsBar) return;

    if (!voices) {
      container.style.display = 'none';
      return;
    }

    const voiceKeys = Object.keys(voices);
    const nonTuttiKeys = voiceKeys.filter(k => k !== 'tutti');

    // 1-stemmig lied (zoals Calypso): verberg de hele balk!
    if (nonTuttiKeys.length <= 1) {
      container.style.display = 'none';
      pillsBar.innerHTML = '';
      return;
    }

    // Meerstemmig lied: toon balk en genereer knoppen
    container.style.display = 'flex';
    pillsBar.innerHTML = '';

    const order = ['sopraan', 'alt', 'tenor', 'bariton', 'bas', 'tutti'];
    const sortedKeys = order.filter(k => voiceKeys.includes(k));

    if (!sortedKeys.includes(selectedVoice)) {
      selectedVoice = sortedKeys[0];
    }

    sortedKeys.forEach(key => {
      const info = VOICE_CONFIG[key] || { label: key, name: key };
      const btn = document.createElement('button');
      btn.className = `voice-pill ${key === selectedVoice ? 'active' : ''}`;
      btn.dataset.voice = key;
      btn.textContent = info.label;
      btn.title = info.name;
      btn.addEventListener('click', () => {
        setVoicePart(key);
      });
      pillsBar.appendChild(btn);
    });
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

  function renderXmlTextBoxes(textBlocks) {
    const boxEl = document.getElementById('score-xml-textboxes');
    if (!boxEl) return;
    if (!textBlocks || textBlocks.length === 0 || activeViewMode !== 'musicxml') {
      boxEl.style.display = 'none';
      boxEl.innerHTML = '';
      return;
    }

    boxEl.style.display = 'grid';
    boxEl.style.gridTemplateColumns = 'repeat(auto-fit, minmax(240px, 1fr))';
    boxEl.style.gap = '14px';
    boxEl.innerHTML = '';

    textBlocks.forEach(block => {
      const item = document.createElement('div');
      item.style.background = '#ffffff';
      item.style.padding = '12px 14px';
      item.style.borderRadius = '6px';
      item.style.borderLeft = '3px solid #4f46e5';
      item.style.fontSize = '13.5px';
      item.style.lineHeight = '1.7';
      item.style.color = '#1e293b';
      item.style.whiteSpace = 'pre-line';
      item.textContent = block;
      boxEl.appendChild(item);
    });
  }

  function updateTrackLabels() {
    const scoreData = SCORES[activeScoreKey];
    if (!scoreData) return;

    // Update HTML Sheet Title Banner (100% uit XML gegevens)
    const sheetTitleEl = document.getElementById('score-sheet-title');
    const sheetMetaEl = document.getElementById('score-sheet-meta');
    if (sheetTitleEl) {
      sheetTitleEl.textContent = scoreData.title || '';
    }
    if (sheetMetaEl) {
      sheetMetaEl.textContent = scoreData.subtitle || '';
    }

    renderXmlTextBoxes(scoreData.textBlocks);

    // Update Download XML button
    const downloadBtn = document.getElementById('btn-download-musicxml');
    if (downloadBtn) {
      if (scoreData.musicXmlUrl && !scoreData.musicXmlUrl.trim().startsWith('<')) {
        downloadBtn.style.display = 'inline-flex';
        downloadBtn.href = scoreData.musicXmlUrl;
        const filename = scoreData.filename || ((scoreData.title ? scoreData.title.replace(/[^a-zA-Z0-9_-]/g, '_') : activeScoreKey) + '.musicxml');
        downloadBtn.setAttribute('download', filename);
      } else {
        downloadBtn.style.display = 'none';
      }
    }
  }

  let lyricsSubMode = 'flowing'; // 'flowing' of 'measure'
  let showRawTxt = false;
  const cachedRawTxt = {};

  function parseLyricsFromTxt(rawTxt, availableVoices) {
    if (!rawTxt || !rawTxt.trim()) return {};
    const lines = rawTxt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsed = {};
    const voiceKeys = availableVoices ? Object.keys(availableVoices).filter(k => k !== 'tutti') : ['sopraan'];
    const hasMultiVoice = lines.some(l => l.includes('||'));

    if (hasMultiVoice && voiceKeys.length > 1) {
      voiceKeys.forEach(vk => {
        parsed[vk] = {
          voiceKey: vk,
          label: VOICE_CONFIG[vk] ? VOICE_CONFIG[vk].name : vk,
          verses: { '1': '' },
          measures: []
        };
      });

      lines.forEach((line, mIdx) => {
        const segs = line.split('||').map(s => s.trim());
        voiceKeys.forEach((vk, idx) => {
          const seg = segs[idx] !== undefined ? segs[idx] : segs[0];
          parsed[vk].measures.push({
            measureNumber: String(mIdx + 1),
            verses: { '1': [{ text: seg, syllabic: 'single' }] }
          });
        });
      });

      voiceKeys.forEach((vk, idx) => {
        const words = lines.map(l => {
          const segs = l.split('||').map(s => s.trim());
          const seg = segs[idx] !== undefined ? segs[idx] : segs[0];
          return seg.replace(/-/g, '').replace(/\s+/g, ' ');
        }).filter(w => w && w !== '-').join(' ');
        parsed[vk].verses['1'] = words;
      });
    } else {
      const primaryKey = voiceKeys[0] || 'sopraan';
      parsed[primaryKey] = {
        voiceKey: primaryKey,
        label: VOICE_CONFIG[primaryKey] ? VOICE_CONFIG[primaryKey].name : primaryKey,
        verses: { '1': lines.map(l => l.replace(/-/g, '').replace(/\s+/g, ' ')).join(' ') },
        measures: lines.map((l, idx) => ({
          measureNumber: String(idx + 1),
          verses: { '1': [{ text: l, syllabic: 'single' }] }
        }))
      };
    }
    return parsed;
  }

  function renderTextView() {
    const txtContainer = document.getElementById('txt-viewer-container');
    const statusEl = document.getElementById('score-rendering-status');
    const scoreData = SCORES[activeScoreKey];
    if (!txtContainer) return;

    if (statusEl) {
      statusEl.textContent = selectedVoice === 'tutti'
        ? '📝 Liedtekst: Tutti (Alle stemmen)'
        : `📝 Liedtekst: ${getVoiceLabel(selectedVoice)}`;
    }

    const hasXmlLyrics = scoreData && scoreData.voiceLyrics && Object.keys(scoreData.voiceLyrics).length > 0;

    const txtUrl = (scoreData && (scoreData.txtUrl || (scoreData.pdfUrl && scoreData.pdfUrl.replace(/\.pdf$/i, '.txt'))))
      || `./assets/scores/${activeScoreKey}.txt`;

    if (!cachedRawTxt[activeScoreKey]) {
      fetch(txtUrl + (txtUrl.includes('?') ? '&' : '?') + 't=' + Date.now())
        .then(res => res.ok ? res.text() : '')
        .then(txt => {
          cachedRawTxt[activeScoreKey] = txt;
          if (!hasXmlLyrics && txt && scoreData) {
            scoreData.voiceLyrics = parseLyricsFromTxt(txt, scoreData.voices);
          }
          renderTextHtml(txtContainer);
        })
        .catch(() => {
          cachedRawTxt[activeScoreKey] = '';
          renderTextHtml(txtContainer);
        });
      txtContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: #64748b;">Liedtekst inladen...</div>';
      return;
    }

    renderTextHtml(txtContainer);
  }

  function renderTextHtml(container) {
    const scoreData = SCORES[activeScoreKey];
    const voiceLyrics = (scoreData && scoreData.voiceLyrics) ? scoreData.voiceLyrics : {};
    const availableKeys = Object.keys(voiceLyrics);
    const rawTxt = cachedRawTxt[activeScoreKey] || '';

    let html = '';

    // Sub-toolbar bovenaan de tekstweergave
    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0;">
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button id="btn-txt-submode-flowing" class="btn-secondary" style="font-size: 0.82rem; padding: 5px 12px; border-radius: 6px; cursor: pointer; ${lyricsSubMode === 'flowing' && !showRawTxt ? 'background: var(--accent-indigo); color: #fff; border-color: var(--accent-indigo);' : ''}">📖 Vloeiende Tekst</button>
          <button id="btn-txt-submode-measure" class="btn-secondary" style="font-size: 0.82rem; padding: 5px 12px; border-radius: 6px; cursor: pointer; ${lyricsSubMode === 'measure' && !showRawTxt ? 'background: var(--accent-indigo); color: #fff; border-color: var(--accent-indigo);' : ''}">🎼 Maat-voor-maat</button>
          <button id="btn-txt-submode-raw" class="btn-secondary" style="font-size: 0.82rem; padding: 5px 12px; border-radius: 6px; cursor: pointer; ${showRawTxt ? 'background: var(--accent-indigo); color: #fff; border-color: var(--accent-indigo);' : ''}">📄 Ruwe Tekst (.txt)</button>
        </div>
        <div style="font-size: 0.8rem; color: #64748b;">
          ${selectedVoice === 'tutti' ? '🟣 Tutti weergave' : `🎤 Filter actief: ${getVoiceLabel(selectedVoice)}`}
        </div>
      </div>
    `;

    // Modus 1: Ruwe .txt weergave
    if (showRawTxt) {
      html += `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 0.85rem; font-weight: 600; color: #475569;">📄 Bronbestand (${activeScoreKey}.txt)</span>
            <button id="btn-copy-raw-txt" class="btn-secondary" style="font-size: 0.75rem; padding: 3px 8px;">📋 Kopiëren</button>
          </div>
          <pre style="margin: 0; font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; font-size: 0.95rem; line-height: 1.6; white-space: pre-wrap; color: #1e293b;">${rawTxt ? escapeHtml(rawTxt) : 'Geen .txt bestand gevonden voor deze partituur.'}</pre>
        </div>
      `;
      container.innerHTML = html;
      bindTxtToolbarEvents(container);
      const copyBtn = container.querySelector('#btn-copy-raw-txt');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(rawTxt).then(() => {
            copyBtn.textContent = '✅ Gekopieerd!';
            setTimeout(() => { copyBtn.textContent = '📋 Kopiëren'; }, 2000);
          });
        });
      }
      return;
    }

    // Modus 2: Geen tekst beschikbaar
    if (availableKeys.length === 0 && !rawTxt) {
      html += `
        <div style="padding: 32px; text-align: center; color: #64748b; background: #f8fafc; border-radius: 8px; border: 1px dashed #cbd5e1;">
          Geen zangtekst beschikbaar voor deze partituur.
        </div>
      `;
      container.innerHTML = html;
      bindTxtToolbarEvents(container);
      return;
    }

    // Modus 3: Tutti weergave (toon alle stemmen naast elkaar of onder elkaar)
    if (selectedVoice === 'tutti') {
      const displayKeys = availableKeys.length > 0 ? availableKeys : ['sopraan'];
      html += `
        <div style="margin-bottom: 16px;">
          <h3 style="font-family: var(--font-heading); font-size: 1.15rem; color: #1e293b; margin: 0 0 4px 0;">🎶 Koorzangtekst — Alle Stemmen (Tutti)</h3>
          <p style="font-size: 0.82rem; color: #64748b; margin: 0;">Overzicht van de verschillende partijen. Klik op een stemknop bovenaan om in te zoomen op 1 stem.</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
      `;

      displayKeys.forEach(vk => {
        const vData = voiceLyrics[vk] || { verses: {}, measures: [] };
        const vConf = VOICE_CONFIG[vk] || { label: vk, name: vk, color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' };
        const verses = vData.verses || {};
        const vKeys = Object.keys(verses);

        html += `
          <div style="background: #ffffff; border: 1.5px solid ${vConf.border || '#e2e8f0'}; border-radius: 8px; padding: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9;">
              <span style="font-weight: 700; color: ${vConf.color}; font-size: 0.98rem;">${vConf.label}</span>
              <button class="btn-voice-focus btn-secondary" data-voice="${vk}" style="font-size: 0.72rem; padding: 3px 8px; border-radius: 4px; cursor: pointer;">Focus 🔍</button>
            </div>
        `;

        if (lyricsSubMode === 'flowing') {
          if (vKeys.length > 0) {
            vKeys.forEach(vNum => {
              html += `
                <div style="margin-bottom: 12px;">
                  <span style="display: inline-block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; background: ${vConf.bg}; color: ${vConf.color}; padding: 2px 7px; border-radius: 4px; margin-bottom: 4px;">Vers ${vNum}</span>
                  <div style="font-size: 0.92rem; line-height: 1.6; color: #1e293b; white-space: pre-wrap;">${escapeHtml(verses[vNum])}</div>
                </div>
              `;
            });
          } else {
            html += `<div style="font-size: 0.85rem; color: #94a3b8; font-style: italic;">Geen tekstregels voor deze stem.</div>`;
          }
        } else {
          // Maat-voor-maat weergave in Tutti kaart
          const measures = vData.measures || [];
          html += `<div style="max-height: 320px; overflow-y: auto; font-size: 0.82rem; line-height: 1.5; color: #334155;">`;
          measures.forEach(m => {
            const mVerses = m.verses || {};
            const textParts = Object.keys(mVerses).map(vN => {
              const toks = mVerses[vN].map(t => t.text).join(' ');
              return Object.keys(mVerses).length > 1 ? `(V${vN}) ${toks}` : toks;
            }).filter(Boolean);
            if (textParts.length > 0) {
              html += `
                <div style="display: flex; gap: 8px; padding: 3px 0; border-bottom: 1px solid #f8fafc;">
                  <span style="font-weight: 700; color: #94a3b8; min-width: 32px;">M${m.measureNumber}:</span>
                  <span style="color: #1e293b;">${escapeHtml(textParts.join(' | '))}</span>
                </div>
              `;
            }
          });
          html += `</div>`;
        }

        html += `</div>`;
      });

      html += `</div>`;
      container.innerHTML = html;
      bindTxtToolbarEvents(container);
      return;
    }

    // Modus 4: Solo Stem weergave (bijv. Sopraan, Alt, Tenor of Bas geselecteerd)
    const targetKey = voiceLyrics[selectedVoice] ? selectedVoice : (availableKeys[0] || 'sopraan');
    const vData = voiceLyrics[targetKey] || { verses: {}, measures: [] };
    const vConf = VOICE_CONFIG[targetKey] || { label: targetKey, name: targetKey, color: '#4f46e5', bg: '#eef2ff', border: '#c7d2fe' };
    const verses = vData.verses || {};
    const vKeys = Object.keys(verses);

    html += `
      <div style="background: #ffffff; border: 2px solid ${vConf.border || '#cbd5e1'}; border-radius: 10px; padding: 22px 24px; box-shadow: 0 4px 14px rgba(0,0,0,0.04); margin-bottom: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;">
          <div>
            <div style="display: inline-flex; align-items: center; gap: 8px;">
              <span style="font-size: 1.25rem; font-weight: 800; color: ${vConf.color};">${vConf.label}</span>
              <span style="font-size: 0.88rem; color: #64748b; font-weight: 500;">(${vConf.name})</span>
            </div>
            <div style="font-size: 0.82rem; color: #64748b; margin-top: 3px;">
              Zangtekst en lettergrepen specifiek voor deze partij
            </div>
          </div>
          <button class="btn-voice-focus btn-secondary" data-voice="tutti" style="font-size: 0.78rem; padding: 5px 12px; border-radius: 6px; cursor: pointer;">
            🟣 Toon Tutti (Alle stemmen)
          </button>
        </div>
    `;

    if (lyricsSubMode === 'flowing') {
      if (vKeys.length > 0) {
        vKeys.forEach(vNum => {
          html += `
            <div style="margin-bottom: 20px; background: #fafafa; border-radius: 8px; padding: 14px 18px; border-left: 4px solid ${vConf.color};">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background: ${vConf.bg}; color: ${vConf.color}; padding: 3px 8px; border-radius: 4px;">Vers ${vNum}</span>
              </div>
              <p style="margin: 0; font-size: 1.05rem; line-height: 1.75; color: #0f172a; white-space: pre-wrap;">${escapeHtml(verses[vNum])}</p>
            </div>
          `;
        });
      } else {
        html += `<div style="padding: 20px; color: #94a3b8; font-style: italic;">Geen tekstregels gevonden voor deze partij.</div>`;
      }
    } else {
      // Maat-voor-maat tabel
      const measures = vData.measures || [];
      html += `
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; text-align: left; color: #475569;">
                <th style="padding: 8px 12px; width: 80px; font-weight: 600;">Maat</th>
                <th style="padding: 8px 12px; font-weight: 600;">Liedtekst / Syllaben</th>
              </tr>
            </thead>
            <tbody>
      `;
      measures.forEach(m => {
        const mVerses = m.verses || {};
        const textParts = Object.keys(mVerses).map(vN => {
          const toks = mVerses[vN].map(t => t.text).join(' ');
          return Object.keys(mVerses).length > 1 ? `<strong>(Vers ${vN})</strong> ${escapeHtml(toks)}` : escapeHtml(toks);
        }).filter(Boolean);

        if (textParts.length > 0) {
          html += `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 8px 12px; font-weight: 700; color: #64748b; background: #fbfcfe;">M${m.measureNumber}</td>
              <td style="padding: 8px 12px; color: #0f172a; line-height: 1.6;">${textParts.join('<br>')}</td>
            </tr>
          `;
        }
      });
      html += `
            </tbody>
          </table>
        </div>
      `;
    }

    // Snelle voice switcher onderaan
    if (availableKeys.length > 1) {
      html += `
        <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid #f1f5f9; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span style="font-size: 0.8rem; color: #64748b; font-weight: 600;">Wissel stem:</span>
      `;
      availableKeys.forEach(vk => {
        const vC = VOICE_CONFIG[vk] || { label: vk };
        const isActive = vk === selectedVoice;
        html += `
          <button class="btn-voice-focus btn-secondary" data-voice="${vk}" style="font-size: 0.76rem; padding: 3px 9px; border-radius: 99px; cursor: pointer; ${isActive ? 'background: ' + (vC.color || '#4f46e5') + '; color: #fff; font-weight: 700;' : ''}">
            ${vC.label}
          </button>
        `;
      });
      html += `
          <button class="btn-voice-focus btn-secondary" data-voice="tutti" style="font-size: 0.76rem; padding: 3px 9px; border-radius: 99px; cursor: pointer; ${selectedVoice === 'tutti' ? 'background: #7c3aed; color: #fff; font-weight: 700;' : ''}">
            🟣 Tutti
          </button>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
    bindTxtToolbarEvents(container);
  }

  function bindTxtToolbarEvents(container) {
    const btnFlowing = container.querySelector('#btn-txt-submode-flowing');
    const btnMeasure = container.querySelector('#btn-txt-submode-measure');
    const btnRaw = container.querySelector('#btn-txt-submode-raw');

    if (btnFlowing) {
      btnFlowing.addEventListener('click', () => {
        lyricsSubMode = 'flowing';
        showRawTxt = false;
        renderTextHtml(container);
      });
    }
    if (btnMeasure) {
      btnMeasure.addEventListener('click', () => {
        lyricsSubMode = 'measure';
        showRawTxt = false;
        renderTextHtml(container);
      });
    }
    if (btnRaw) {
      btnRaw.addEventListener('click', () => {
        showRawTxt = true;
        renderTextHtml(container);
      });
    }

    container.querySelectorAll('.btn-voice-focus').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.dataset.voice;
        if (v) {
          setVoicePart(v);
        }
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let osmdInstance = null;
  let activeViewMode = 'musicxml'; // 'musicxml', 'pdf' of 'txt'

  function switchViewMode(mode) {
    activeViewMode = mode;
    const osmdContainer = document.getElementById('osmd-container');
    const pdfFrame = document.getElementById('pdf-viewer-frame');
    const txtContainer = document.getElementById('txt-viewer-container');
    const btnXml = document.getElementById('btn-view-musicxml');
    const btnPdf = document.getElementById('btn-view-pdf');
    const btnTxt = document.getElementById('btn-view-txt');
    const statusEl = document.getElementById('score-rendering-status');
    const scoreData = SCORES[activeScoreKey];

    function setToggleStyles(activeBtn) {
      [btnXml, btnPdf, btnTxt].forEach(btn => {
        if (!btn) return;
        if (btn === activeBtn) {
          btn.classList.add('active');
          btn.style.background = 'var(--accent-indigo)';
          btn.style.color = '#ffffff';
          btn.style.borderColor = 'var(--accent-indigo)';
        } else {
          btn.classList.remove('active');
          btn.style.background = '';
          btn.style.color = '';
          btn.style.borderColor = '';
        }
      });
    }

    if (mode === 'musicxml' && scoreData && scoreData.musicXmlUrl) {
      if (osmdContainer) osmdContainer.style.display = 'block';
      if (pdfFrame) pdfFrame.style.display = 'none';
      if (txtContainer) txtContainer.style.display = 'none';
      setToggleStyles(btnXml);
      renderMusicXMLWithOSMD(scoreData.musicXmlUrl);
      renderXmlTextBoxes(scoreData.textBlocks);
    } else if (mode === 'txt') {
      if (osmdContainer) osmdContainer.style.display = 'none';
      if (pdfFrame) pdfFrame.style.display = 'none';
      renderXmlTextBoxes(null);
      if (txtContainer) {
        txtContainer.style.display = 'block';
        renderTextView();
      }
      setToggleStyles(btnTxt);
    } else {
      // PDF Scan weergave rechtstreeks uit het PDF-bestand
      if (osmdContainer) osmdContainer.style.display = 'none';
      if (txtContainer) txtContainer.style.display = 'none';
      renderXmlTextBoxes(null);
      if (pdfFrame) {
        pdfFrame.style.display = 'block';
        if (scoreData && scoreData.pdfUrl) {
          pdfFrame.removeAttribute('srcdoc');
          pdfFrame.src = scoreData.pdfUrl;
        } else {
          pdfFrame.removeAttribute('src');
        }
      }
      if (statusEl) statusEl.textContent = scoreData && scoreData.pdfUrl ? '📄 Originele PDF Scan' : '';
      setToggleStyles(btnPdf);
    }
  }

  function applyVoiceFilterToOSMD() {
    if (!osmdInstance || !osmdInstance.sheet) return;
    const osmdContainer = document.getElementById('osmd-container');
    if (!osmdContainer || osmdContainer.offsetWidth <= 0 || osmdContainer.offsetParent === null) {
      return;
    }
    const instruments = osmdInstance.sheet.Instruments;
    if (!instruments || instruments.length === 0) return;

    const scoreData = SCORES[activeScoreKey];
    const xmlVoiceIndexMap = (scoreData && scoreData.voiceIndexMap) ? scoreData.voiceIndexMap : {};

    instruments.forEach((inst, idx) => {
      let isVisible = true;
      if (selectedVoice === 'tutti' || instruments.length === 1) {
        isVisible = true;
      } else if (xmlVoiceIndexMap[selectedVoice] !== undefined) {
        isVisible = (idx === xmlVoiceIndexMap[selectedVoice]);
      } else {
        const name = (inst.NameLabel ? inst.NameLabel.text : (inst.nameLabel ? inst.nameLabel.text : '')).toLowerCase();
        isVisible = !!(name && (name.includes(selectedVoice) || name.startsWith(selectedVoice[0])));
      }
      inst.Visible = isVisible;
      inst.visible = isVisible;
    });

    try {
      const isMobile = window.innerWidth < 640;
      if (isMobile) {
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
        drawingParameters: 'default',
        newSystemFromXML: true,
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawPartNames: false, // Geen witruimte links verspillen aan stemnaam
        drawPartAbbreviations: false,
        drawMeasureNumbers: true,
        drawMetronomeMarks: false,
        drawLyrics: true,
        defaultFontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fillEmptyMeasuresWithWholeRests: true,
        followCursor: false
      });
    } else {
      osmdInstance.setOptions({
        drawingParameters: 'default',
        newSystemFromXML: true,
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawPartNames: false,
        drawPartAbbreviations: false,
        defaultFontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        followCursor: false
      });
    }

    // Graveerregels: noten plaatsen in functie van de tekst (Behind Bars regel voor vocale muziek)
    if (osmdInstance.EngravingRules) {
      osmdInstance.EngravingRules.NewSystemAtXMLNewSystemAttribute = true;
      osmdInstance.EngravingRules.LyricsHeight = 2.0; // Standaard leesbare letterhoogte
      osmdInstance.EngravingRules.LyricsUseXPaddingForLongLyrics = true;
      osmdInstance.EngravingRules.LyricsXPaddingFactorForLongLyrics = 1.25; // Duwt noten uit elkaar bij langere woorden
      osmdInstance.EngravingRules.HorizontalBetweenLyricsDistance = 0.8; // Garandeert vrije ruimte tussen lettergrepen
      osmdInstance.EngravingRules.VerticalBetweenLyricsDistance = 0.5;
      osmdInstance.EngravingRules.LyricsYMarginToBottomLine = 0.35;
      osmdInstance.EngravingRules.DefaultFontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
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
    const btnXml = document.getElementById('btn-view-musicxml');
    const statusEl = document.getElementById('score-rendering-status');
    if (!frame || !key) return;

    activeScoreKey = key;
    stopCompanion();

    const scoreData = SCORES[key];
    if (!scoreData) return;

    if (scoreData.musicXmlUrl) {
      if (btnXml) btnXml.style.display = 'inline-flex';
      loadMusicXML(scoreData.musicXmlUrl).then(result => {
        if (result && result.voices) {
          scoreData.voices = result.voices;
          scoreData.voiceIndexMap = result.voiceIndexMap || {};
          scoreData.partLabels = result.partLabels || {};
          scoreData.textBlocks = result.textBlocks || [];
          scoreData.voiceLyrics = result.voiceLyrics || {};
          renderVoicePills(scoreData.voices);
          scoreData.notes = scoreData.voices[selectedVoice] || Object.values(result.voices)[0];
          if (result.bpm) {
            setBpm(result.bpm);
          } else if (scoreData.bpm) {
            setBpm(scoreData.bpm);
          }
          updateTrackLabels();
          if (activeViewMode === 'txt') {
            renderTextView();
          }
        }
      });

      if (activeViewMode === 'txt') {
        switchViewMode('txt');
      } else {
        switchViewMode('musicxml');
      }
    } else {
      if (btnXml) btnXml.style.display = 'none';
      if (statusEl) statusEl.textContent = '';
      switchViewMode('pdf');
    }

    updateTrackLabels();

    if (scoreData.voices) {
      renderVoicePills(scoreData.voices);
    } else {
      renderVoicePills(null);
    }
  }

  // Helper om de cursor exact naar een specifieke maat te sturen (bijvoorbeeld na een herhaling)
  function jumpCursorToMeasure(targetMeasureIndex) {
    if (!osmdInstance || !osmdInstance.cursor) return;
    try {
      osmdInstance.cursor.show();
      osmdInstance.cursor.reset();
      while (!osmdInstance.cursor.iterator.EndReached && osmdInstance.cursor.iterator.CurrentMeasureIndex < targetMeasureIndex) {
        osmdInstance.cursor.next();
      }
    } catch (e) {
      console.warn('Fout bij springen naar maat:', targetMeasureIndex, e);
    }
  }

  // Geïsoleerde scroll-helper: scrolt UITSLUITEND de partituurbak (#score-container), nooit het hele venster!
  function scrollScoreContainerToCursor() {
    const container = document.getElementById('score-container');
    if (!container || !osmdInstance || !osmdInstance.cursor || !osmdInstance.cursor.cursorElement) return;
    const cursorEl = osmdInstance.cursor.cursorElement;
    if (!cursorEl || cursorEl.style.display === 'none') return;

    try {
      const containerRect = container.getBoundingClientRect();
      const cursorRect = cursorEl.getBoundingClientRect();

      // Bereken cursor Y relatief tot de scrollbare inhoud van #score-container
      const relativeTop = cursorRect.top - containerRect.top + container.scrollTop;
      // Houd de actieve balk comfortabel in beeld op circa 35% vanaf de bovenrand
      const targetScrollTop = relativeTop - (container.clientHeight * 0.35);

      container.scrollTo({
        top: Math.max(0, Math.round(targetScrollTop)),
        behavior: 'smooth'
      });
    } catch (e) {
      console.warn('Fout bij scrollen naar cursor:', e);
    }
  }

  // Play synthesized companion track
  function playNextCompanionNote() {
    if (!isPlayingCompanion) return;

    const notes = getActiveNotes();
    if (!notes || notes.length === 0 || currentStep >= notes.length) {
      stopCompanion();
      return;
    }

    const currentNote = notes[currentStep];
    const stepDur = currentNote.dur; // 1.0 = kwartnoot
    const duration = stepDur * (60 / currentBpm);

    if (currentNote.notes && Array.isArray(currentNote.notes)) {
      // Tutti Chord: play all choral voices simultaneously
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
        if (currentStep > 0) {
          const prevNote = notes[currentStep - 1];
          if (prevNote && currentNote.measureIndex !== undefined && prevNote.measureIndex !== undefined && currentNote.measureIndex < prevNote.measureIndex) {
            // Muzikale herhaling: spring direct terug naar de herhaalde maat
            jumpCursorToMeasure(currentNote.measureIndex);
          } else {
            osmdInstance.cursor.next();
          }
        }
        scrollScoreContainerToCursor();
      } catch (e) {}
    }

    currentStep++;
    if (currentStep >= notes.length) {
      // Laatste noot klinkt uit en daarna stopt de speler automatisch
      companionInterval = setTimeout(() => {
        stopCompanion();
      }, duration * 1000);
    } else {
      companionInterval = setTimeout(playNextCompanionNote, duration * 1000);
    }
  }

  function startCompanion() {
    isPlayingCompanion = true;
    currentStep = 0;

    if (osmdInstance && osmdInstance.cursor && activeViewMode === 'musicxml') {
      try {
        osmdInstance.cursor.show();
        osmdInstance.cursor.reset();
        scrollScoreContainerToCursor();
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
    currentStep = 0;
    if (companionInterval) {
      clearTimeout(companionInterval);
      companionInterval = null;
    }
    AudioEngine.highlightSungKey(null);

    if (osmdInstance && osmdInstance.cursor) {
      try {
        osmdInstance.cursor.hide();
        osmdInstance.cursor.reset();
      } catch (e) {}
    }

    const container = document.getElementById('score-container');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
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

    if (activeViewMode === 'txt') {
      renderTextView();
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

    // BPM Slider
    const bpmSlider = document.getElementById('score-bpm-slider');
    if (bpmSlider) {
      bpmSlider.addEventListener('input', (e) => {
        setBpm(parseInt(e.target.value, 10));
      });
      bpmSlider.addEventListener('change', (e) => {
        setBpm(parseInt(e.target.value, 10));
      });
    }

    // BPM +/- knoppen fallback
    const bpmMinusBtn = document.getElementById('btn-bpm-minus');
    const bpmPlusBtn = document.getElementById('btn-bpm-plus');
    if (bpmMinusBtn) {
      bpmMinusBtn.addEventListener('click', () => setBpm(currentBpm - 5));
    }
    if (bpmPlusBtn) {
      bpmPlusBtn.addEventListener('click', () => setBpm(currentBpm + 5));
    }

    // Mode Switcher handlers: MusicXML vs Originele PDF Scan vs Liedtekst
    const btnViewXml = document.getElementById('btn-view-musicxml');
    const btnViewPdf = document.getElementById('btn-view-pdf');
    const btnViewTxt = document.getElementById('btn-view-txt');
    if (btnViewXml) {
      btnViewXml.addEventListener('click', () => switchViewMode('musicxml'));
    }
    if (btnViewPdf) {
      btnViewPdf.addEventListener('click', () => switchViewMode('pdf'));
    }
    if (btnViewTxt) {
      btnViewTxt.addEventListener('click', () => switchViewMode('txt'));
    }
  }

  function init() {
    setupEventListeners();
  }

  function registerScore(key, data) {
    if (key && data) {
      SCORES[key] = Object.assign(SCORES[key] || {}, data);
    }
  }

  return {
    init,
    displayScore,
    setVoicePart,
    setBpm,
    toggleCompanion,
    stopCompanion,
    registerScore,
  };
})();

// Explicitly bind to window for global access
if (typeof window !== 'undefined') {
  window.ScoreViewer = ScoreViewer;
}

