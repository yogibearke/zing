/**
 * Zing! - Main Application Controller
 * 5 Compact Pillars, LocalStorage Tool Reordering, Uniform Direct Screen Router,
 * and Dual Back Navigation (On-Screen + Smartphone Bottom System Arrow).
 */

document.addEventListener('DOMContentLoaded', () => {
  // --------------------------------------------------------------------------
  // 1. Tool Order & LocalStorage Management
  // --------------------------------------------------------------------------
  function getPillarTools(pillar) {
    const storageKey = `zing_order_${pillar.id}`;
    const savedOrder = localStorage.getItem(storageKey);

    if (savedOrder) {
      try {
        const orderIds = JSON.parse(savedOrder);
        // Sort tools matching saved IDs, append any new tools at the end
        const sorted = [];
        orderIds.forEach(id => {
          const found = pillar.tools.find(t => t.id === id);
          if (found) sorted.push(found);
        });
        pillar.tools.forEach(t => {
          if (!sorted.includes(t)) sorted.push(t);
        });
        return sorted;
      } catch (err) {
        console.warn('Could not parse saved tool order for', pillar.id);
      }
    }
    return [...pillar.tools];
  }

  function savePillarToolsOrder(pillarId, toolsArray) {
    const storageKey = `zing_order_${pillarId}`;
    const ids = toolsArray.map(t => t.id);
    localStorage.setItem(storageKey, JSON.stringify(ids));
  }

  function moveTool(pillar, toolId, direction) {
    const tools = getPillarTools(pillar);
    const index = tools.findIndex(t => t.id === toolId);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const temp = tools[index - 1];
      tools[index - 1] = tools[index];
      tools[index] = temp;
    } else if (direction === 'down' && index < tools.length - 1) {
      const temp = tools[index + 1];
      tools[index + 1] = tools[index];
      tools[index] = temp;
    }

    savePillarToolsOrder(pillar.id, tools);
    renderPillarTools(pillar, tools);
  }

  // --------------------------------------------------------------------------
  // 2. Render 5 Compact Pillars on Home Screen
  // --------------------------------------------------------------------------
  const pillarsContainer = document.getElementById('pillars-container');

  function renderPillarTools(pillar, tools) {
    const listEl = document.getElementById(`tools-list-${pillar.id}`);
    if (!listEl) return;
    listEl.innerHTML = '';

    tools.forEach((tool, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'tool-item-card';

      const isExternalTab = !!tool.openInNewTab;
      const arrowIcon = isExternalTab
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

      itemEl.innerHTML = `
        <div class="reorder-controls">
          <button class="btn-reorder btn-move-up" title="Naar boven verplaatsen" ${index === 0 ? 'style="opacity:0.3;pointer-events:none;"' : ''}>▲</button>
          <button class="btn-reorder btn-move-down" title="Naar beneden verplaatsen" ${index === tools.length - 1 ? 'style="opacity:0.3;pointer-events:none;"' : ''}>▼</button>
        </div>
        <div class="tool-item-main">
          <div class="tool-item-top">
            <span class="badge ${tool.badgeClass}">${tool.badge}</span>
            <span class="tool-item-title">${tool.title}</span>
          </div>
          <div class="tool-item-desc">${tool.desc}</div>
        </div>
        <div class="tool-item-arrow" title="${isExternalTab ? 'Opent direct in nieuw tabblad' : 'Open in Zing!'}">
          ${arrowIcon}
        </div>
      `;

      // Up / Down sorting clicks
      const upBtn = itemEl.querySelector('.btn-move-up');
      upBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveTool(pillar, tool.id, 'up');
      });

      const downBtn = itemEl.querySelector('.btn-move-down');
      downBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moveTool(pillar, tool.id, 'down');
      });

      // Direct uniform click: opens new tab if openInNewTab, otherwise opens in-app screen
      itemEl.addEventListener('click', () => {
        if (tool.openInNewTab) {
          window.open(tool.externalUrl, '_blank', 'noopener,noreferrer');
        } else {
          collapseAllPillars();
          openToolScreen(tool);
        }
      });

      listEl.appendChild(itemEl);
    });
  }

  function collapseAllPillars() {
    if (!pillarsContainer) return;
    pillarsContainer.querySelectorAll('.pillar-card.expanded').forEach(card => {
      card.classList.remove('expanded');
    });
    if (viewHome) {
      viewHome.classList.remove('home-expanded');
    }
  }

  function renderPillars() {
    if (!pillarsContainer || !ContentData.pillars) return;
    pillarsContainer.innerHTML = '';

    ContentData.pillars.forEach((pillar) => {
      const card = document.createElement('div');
      card.className = `pillar-card ${pillar.themeClass}`;
      card.id = `pillar-${pillar.id}`;

      card.innerHTML = `
        <div class="pillar-header">
          <div class="pillar-icon-box">${pillar.icon}</div>
          <div class="pillar-titles">
            <div class="pillar-top-row">
              <span class="pillar-badge">${pillar.badge}</span>
              <span class="pillar-tools-count">${pillar.tools.length} opties ▾</span>
            </div>
            <div class="pillar-name">${pillar.title}</div>
            <div class="pillar-explanation">${pillar.shortExplanation}</div>
          </div>
          <svg class="pillar-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div class="pillar-body">
          <p class="pillar-instruction">${pillar.description}</p>
          <div class="tools-list" id="tools-list-${pillar.id}"></div>
        </div>
      `;

      // Toggle accordion on header tap
      const header = card.querySelector('.pillar-header');
      header.addEventListener('click', () => {
        const wasExpanded = card.classList.contains('expanded');
        // Sluit eventuele andere open panelen voor een rustig overzicht bij lange lijsten
        pillarsContainer.querySelectorAll('.pillar-card.expanded').forEach(other => {
          if (other !== card) other.classList.remove('expanded');
        });
        card.classList.toggle('expanded', !wasExpanded);

        // Vaste schermhoogte loslaten zolang er een pijler open staat
        const anyOpen = !!pillarsContainer.querySelector('.pillar-card.expanded');
        if (viewHome) viewHome.classList.toggle('home-expanded', anyOpen);
      });

      pillarsContainer.appendChild(card);

      // Render reorderable tools inside this pillar
      const tools = getPillarTools(pillar);
      renderPillarTools(pillar, tools);
    });
  }

  // --------------------------------------------------------------------------
  // 3. Uniform Screen Router & Dual Back Navigation
  // --------------------------------------------------------------------------
  const viewHome = document.getElementById('view-home');
  const viewScreen = document.getElementById('view-screen');
  const activeTitleEl = document.getElementById('screen-active-title');

  function openToolScreen(tool, pushHistory = true) {
    collapseAllPillars();

    viewHome.classList.remove('view-active');
    viewHome.classList.add('view-hidden');

    viewScreen.classList.remove('view-hidden');
    viewScreen.classList.add('view-active');

    if (activeTitleEl) activeTitleEl.textContent = tool.title;

    // Deactivate all tool blocks
    document.querySelectorAll('.tool-content-block').forEach(b => b.classList.remove('active'));

    if (tool.type === 'builtin') {
      const block = document.getElementById(tool.targetScreen);
      if (block) block.classList.add('active');
    } else {
      // External tool: open in screen-external
      const extBlock = document.getElementById('screen-external');
      const extTitle = document.getElementById('ext-tool-title');
      const extDesc = document.getElementById('ext-tool-desc');
      const extLink = document.getElementById('ext-tool-direct-link');
      const extFrame = document.getElementById('ext-viewer-frame');

      if (extTitle) extTitle.textContent = tool.title;
      if (extDesc) extDesc.textContent = tool.desc;
      if (extLink) extLink.href = tool.externalUrl;
      if (extFrame) extFrame.src = tool.embedUrl || tool.externalUrl;

      if (extBlock) extBlock.classList.add('active');
    }

    if (pushHistory) {
      history.pushState({ screen: 'tool', toolId: tool.id }, '', `#tool-${tool.id}`);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeToolScreen(isFromPopState = false) {
    collapseAllPillars();

    viewScreen.classList.remove('view-active');
    viewScreen.classList.add('view-hidden');

    viewHome.classList.remove('view-hidden');
    viewHome.classList.add('view-active');

    // Deactivate any active external iframe to stop audio
    const extFrame = document.getElementById('ext-viewer-frame');
    if (extFrame) extFrame.src = 'about:blank';

    if (!isFromPopState) {
      history.pushState(null, '', window.location.pathname);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Bind on-screen back buttons (Top & Bottom)
  const btnBackTop = document.getElementById('btn-back-top');
  const btnBackBottom = document.getElementById('btn-back-bottom');

  if (btnBackTop) btnBackTop.addEventListener('click', () => closeToolScreen());
  if (btnBackBottom) btnBackBottom.addEventListener('click', () => closeToolScreen());

  const brandHome = document.getElementById('brand-home');
  if (brandHome) {
    brandHome.addEventListener('click', (e) => {
      e.preventDefault();
      closeToolScreen();
    });
  }

  // Smartphone bottom system back arrow listener (popstate)
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.screen === 'tool') {
      // Find tool
      let foundTool = null;
      ContentData.pillars.forEach(p => {
        const t = p.tools.find(tool => tool.id === e.state.toolId);
        if (t) foundTool = t;
      });
      if (foundTool) openToolScreen(foundTool, false);
    } else {
      // No tool state: return to home!
      closeToolScreen(true);
    }
  });

  // --------------------------------------------------------------------------
  // 4. Inzingroutine (Piano Vocalises)
  // --------------------------------------------------------------------------
  let isWarmupRunning = false;
  let warmupTimeout = null;
  let warmupVoice = 'laag';
  let warmupKeyIndex = 0;

  const WARMUP_RANGES = {
    'laag': { startMidi: 48, maxSteps: 8, name: 'Bas / Alt' },
    'midden': { startMidi: 53, maxSteps: 8, name: 'Bariton / Mezzo' },
    'hoog': { startMidi: 57, maxSteps: 8, name: 'Tenor / Sopraan' }
  };

  const voiceChips = document.querySelectorAll('.voice-chip');
  voiceChips.forEach(chip => {
    chip.addEventListener('click', () => {
      voiceChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      warmupVoice = chip.dataset.voice;
      stopWarmup();
    });
  });

  function play5ToneScale(rootMidi, callback) {
    const scaleDegrees = [0, 2, 4, 5, 7, 5, 4, 2, 0];
    let step = 0;
    const noteDuration = 0.35;

    function playNext() {
      if (!isWarmupRunning) return;

      if (step < scaleDegrees.length) {
        const midi = rootMidi + scaleDegrees[step];
        const noteName = AudioEngine.NOTE_NAMES[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        const fullNote = `${noteName}${octave}`;

        AudioEngine.playTone(440 * Math.pow(2, (midi - 69) / 12), noteDuration);
        AudioEngine.highlightSungKey(fullNote);

        step++;
        warmupTimeout = setTimeout(playNext, noteDuration * 1000);
      } else {
        AudioEngine.highlightSungKey(null);
        warmupTimeout = setTimeout(callback, 1200);
      }
    }

    playNext();
  }

  function stepWarmup() {
    if (!isWarmupRunning) return;

    const rangeConfig = WARMUP_RANGES[warmupVoice];
    const rootMidi = rangeConfig.startMidi + warmupKeyIndex;
    const rootName = AudioEngine.NOTE_NAMES[rootMidi % 12];
    const rootOctave = Math.floor(rootMidi / 12) - 1;

    const keyDisplay = document.getElementById('warmup-current-key');
    if (keyDisplay) {
      keyDisplay.textContent = `${rootName}${rootOctave}-groot (${rootName} toonladder)`;
    }

    play5ToneScale(rootMidi, () => {
      warmupKeyIndex = (warmupKeyIndex + 1) % rangeConfig.maxSteps;
      stepWarmup();
    });
  }

  function startWarmup() {
    isWarmupRunning = true;
    warmupKeyIndex = 0;
    stepWarmup();

    const btn = document.getElementById('btn-start-warmup');
    const label = document.getElementById('warmup-btn-label');
    if (btn && label) {
      btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      label.textContent = 'Pauzeer Inzingen';
    }
  }

  function stopWarmup() {
    isWarmupRunning = false;
    if (warmupTimeout) {
      clearTimeout(warmupTimeout);
      warmupTimeout = null;
    }
    AudioEngine.highlightSungKey(null);

    const btn = document.getElementById('btn-start-warmup');
    const label = document.getElementById('warmup-btn-label');
    if (btn && label) {
      btn.style.background = '';
      label.textContent = 'Start Inzingroutine';
    }
  }

  const warmupBtn = document.getElementById('btn-start-warmup');
  if (warmupBtn) {
    warmupBtn.addEventListener('click', () => {
      if (isWarmupRunning) stopWarmup();
      else startWarmup();
    });
  }

  // --------------------------------------------------------------------------
  // 5. Metronoom Controller
  // --------------------------------------------------------------------------
  let isMetronomeRunning = false;
  let metronomeTimer = null;
  let currentBeat = 0;
  const beatsPerMeasure = 4;

  const bpmSlider = document.getElementById('bpm-slider');
  const bpmVal = document.getElementById('bpm-val');
  const tempoName = document.getElementById('tempo-name');
  const metroBtn = document.getElementById('btn-toggle-metronome');
  const metroDots = document.querySelectorAll('.beat-dot');

  function getTempoDescriptor(bpm) {
    if (bpm < 60) return 'Largo (Zeer breed en langzaam)';
    if (bpm < 76) return 'Adagio (Rustig en ontspannen)';
    if (bpm < 108) return 'Andante (Rustig wandeltempo)';
    if (bpm < 120) return 'Moderato (Matig tempo)';
    if (bpm < 168) return 'Allegro (Levendig en vlot)';
    return 'Presto (Zeer snel)';
  }

  function tickMetronome() {
    if (!isMetronomeRunning) return;

    metroDots.forEach((dot, index) => {
      if (index === currentBeat) dot.classList.add('active');
      else dot.classList.remove('active');
    });

    const isAccent = (currentBeat === 0);
    AudioEngine.playClick(isAccent);

    currentBeat = (currentBeat + 1) % beatsPerMeasure;
  }

  function startMetronome() {
    isMetronomeRunning = true;
    currentBeat = 0;
    const bpm = parseInt(bpmSlider.value, 10);
    const intervalMs = (60 / bpm) * 1000;

    tickMetronome();
    metronomeTimer = setInterval(tickMetronome, intervalMs);

    if (metroBtn) {
      metroBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      document.getElementById('metro-btn-label').textContent = 'Pauzeer Metronoom';
    }
  }

  function stopMetronome() {
    isMetronomeRunning = false;
    clearInterval(metronomeTimer);
    metroDots.forEach(dot => dot.classList.remove('active'));

    if (metroBtn) {
      metroBtn.style.background = '';
      document.getElementById('metro-btn-label').textContent = 'Start Metronoom';
    }
  }

  if (bpmSlider) {
    bpmSlider.addEventListener('input', (e) => {
      const bpm = parseInt(e.target.value, 10);
      bpmVal.textContent = bpm;
      tempoName.textContent = getTempoDescriptor(bpm);

      if (isMetronomeRunning) {
        clearInterval(metronomeTimer);
        const intervalMs = (60 / bpm) * 1000;
        metronomeTimer = setInterval(tickMetronome, intervalMs);
      }
    });
  }

  if (metroBtn) {
    metroBtn.addEventListener('click', () => {
      if (isMetronomeRunning) stopMetronome();
      else startMetronome();
    });
  }

  // --------------------------------------------------------------------------
  // 6. Tuner & Breathing Trainer Bindings
  // --------------------------------------------------------------------------
  const micBtn = document.getElementById('btn-toggle-mic');
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      PitchDetector.toggle();
    });
  }

  const playDetectedBtn = document.getElementById('btn-play-detected-note');
  if (playDetectedBtn) {
    playDetectedBtn.addEventListener('click', () => {
      PitchDetector.playLastNote();
    });
  }

  const breathBtn = document.getElementById('btn-toggle-breathing');
  if (breathBtn) {
    breathBtn.addEventListener('click', () => {
      BreathingTrainer.toggle();
    });
  }

  const chimeBtn = document.getElementById('btn-sound-chime');
  if (chimeBtn) {
    chimeBtn.addEventListener('click', () => {
      BreathingTrainer.toggleSound();
    });
  }

  const quickSoundBtn = document.getElementById('btn-quick-sound');
  if (quickSoundBtn) {
    quickSoundBtn.addEventListener('click', () => {
      AudioEngine.playNote('A3', 1.2);
    });
  }

  // --------------------------------------------------------------------------
  // 7. PWA Installation Handler
  // --------------------------------------------------------------------------
  let deferredPrompt = null;
  const installBtn = document.getElementById('btn-install-app');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'inline-flex';
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) {
        alert('Om Zing! op je startscherm te zetten:\n- Op iPhone: tik op Delen in Safari en kies "Zet op beginscherm".\n- Op Android: tik op de 3 puntjes in Chrome en kies "App installeren".');
        return;
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to install prompt: ${outcome}`);
      deferredPrompt = null;
      installBtn.style.display = 'none';
    });
  }

  // --------------------------------------------------------------------------
  // 8. Initialize App Components
  // --------------------------------------------------------------------------
  AudioEngine.setupPianoKeyboard('piano-keys');
  AudioEngine.setupPianoKeyboard('console-piano-keys', 'ckey-');

  // Desktop console: snelknoppen openen direct de ingebouwde tool
  document.querySelectorAll('.console-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      let found = null;
      ContentData.pillars.forEach(p => {
        const t = p.tools.find(tool => tool.id === btn.dataset.toolId);
        if (t) found = t;
      });
      if (found) openToolScreen(found);
    });
  });
  ScoreViewer.init();
  renderPillars();
});
