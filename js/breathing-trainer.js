/**
 * ZingStart - Breathing Trainer
 * Guided 4-4-8 Diaphragmatic Breath & S-sound Vocal Support Routine
 * Dynamische 60fps realtime buikademhaling-animatie
 */

const BreathingTrainer = (() => {
  let isRunning = false;
  let animFrameId = null;
  let startTime = null;
  let soundEnabled = true;
  let lastChimePhase = null;

  // Cyclus: Inademen (4s) -> Vasthouden (4s) -> Uitblazen (8s) = 16s totaal
  const CYCLE_MS = 16000;

  function renderBelly(progress, phaseName) {
    const contourEl = document.getElementById('breath-belly-contour');
    const fillEl = document.getElementById('breath-belly-fill');
    const navelEl = document.getElementById('breath-belly-navel');
    const handEl = document.getElementById('breath-hand-group');
    const bubbleEl = document.getElementById('breathing-bubble');
    const countEl = document.getElementById('breath-count');
    const airStream = document.getElementById('breath-airstream');
    const sSound = document.getElementById('breath-s-sound');

    // Organische ademcurve via ease-in-out
    const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

    if (contourEl && fillEl) {
      // De buik zwelt tot 30px horizontaal uit naar links!
      const c1x = 69 - 18 * ease;
      const c1y = 112 - 2 * ease;
      const c2x = 67 - 30 * ease; // maximale bolling
      const c2y = 134 + 2 * ease;
      const c3x = 68 - 26 * ease;
      const c3y = 146 + 4 * ease;
      const c4x = 73 - 14 * ease;
      const c4y = 158 + 2 * ease;

      const contourD = `M76 102 C${c1x} ${c1y} ${c2x} ${c2y} ${c3x} ${c3y} C${c4x} ${c4y} 76 164 80 166`;
      const fillD = `M76 102 C${c1x} ${c1y} ${c2x} ${c2y} ${c3x} ${c3y} C${c4x} ${c4y} 76 164 80 166 C73 158 70 146 70 134 C70 122 73 112 76 102 Z`;

      contourEl.setAttribute('d', contourD);
      fillEl.setAttribute('d', fillD);

      if (navelEl) {
        navelEl.setAttribute('cx', 67 - 28 * ease);
        navelEl.setAttribute('cy', 134 + 2 * ease);
      }
    }

    if (handEl) {
      // Hand op de onderbuik beweegt vloeiend mee met de buikwand
      const handShift = -26 * ease;
      handEl.setAttribute('transform', `translate(${handShift}, 0)`);
    }

    if (bubbleEl) {
      const bubbleScale = 0.65 + 0.5 * ease;
      const bubbleOpacity = 0.2 + 0.35 * ease;
      bubbleEl.style.transform = `scale(${bubbleScale})`;
      bubbleEl.style.opacity = bubbleOpacity;
    }

    // Visuele feedback en kleuren per ademfase
    if (phaseName === 'in') {
      if (bubbleEl) bubbleEl.style.background = 'radial-gradient(circle, #38bdf8 0%, #818cf8 50%, transparent 75%)';
      if (contourEl) {
        contourEl.setAttribute('stroke', '#38bdf8');
        contourEl.style.filter = 'drop-shadow(-4px 0 10px rgba(56, 189, 248, 0.95))';
      }
      if (countEl) countEl.style.color = '#38bdf8';
      if (airStream) {
        airStream.setAttribute('stroke', '#38bdf8');
        airStream.style.opacity = '1';
      }
      if (sSound) sSound.style.opacity = '0';
    } else if (phaseName === 'hold') {
      if (bubbleEl) bubbleEl.style.background = 'radial-gradient(circle, #fbbf24 0%, #f59e0b 50%, transparent 75%)';
      if (contourEl) {
        contourEl.setAttribute('stroke', '#f59e0b');
        contourEl.style.filter = 'drop-shadow(-4px 0 10px rgba(245, 158, 11, 0.95))';
      }
      if (countEl) countEl.style.color = '#f59e0b';
      if (airStream) airStream.style.opacity = '0';
      if (sSound) sSound.style.opacity = '0';
    } else {
      if (bubbleEl) bubbleEl.style.background = 'radial-gradient(circle, #d946ef 0%, #8b5cf6 50%, transparent 75%)';
      if (contourEl) {
        contourEl.setAttribute('stroke', '#d946ef');
        contourEl.style.filter = 'drop-shadow(-2px 0 6px rgba(217, 70, 239, 0.7))';
      }
      if (countEl) countEl.style.color = '#d946ef';
      if (airStream) {
        airStream.setAttribute('stroke', '#d946ef');
        airStream.style.opacity = '0.85';
      }
      if (sSound) sSound.style.opacity = '1';
    }
  }

  function animLoop(now) {
    if (!isRunning) return;
    if (!startTime) startTime = now;

    const elapsed = (now - startTime) % CYCLE_MS;
    let progress = 0;
    let phaseName = 'in';
    let secRemaining = 4;
    let labelText = '';

    if (elapsed < 4000) {
      // 1. Inademen (0s tot 4s): buik zwelt op van 0 naar 1
      phaseName = 'in';
      progress = elapsed / 4000;
      secRemaining = 4 - Math.floor(elapsed / 1000);
      labelText = 'Inademen (Lage buikadem)...';
    } else if (elapsed < 8000) {
      // 2. Vasthouden (4s tot 8s): buik blijft maximaal ontspannen bol
      phaseName = 'hold';
      progress = 1.0;
      secRemaining = 4 - Math.floor((elapsed - 4000) / 1000);
      labelText = 'Rustig vasthouden...';
    } else {
      // 3. Uitblazen op Sssss (8s tot 16s): buik zakt gecontroleerd in van 1 naar 0
      phaseName = 'exhale';
      progress = 1.0 - (elapsed - 8000) / 8000;
      secRemaining = 8 - Math.floor((elapsed - 8000) / 1000);
      labelText = 'Uitblazen op "Ssssss" (Ademsteun)...';
    }

    // Audio chime bij elke fasewisseling
    if (soundEnabled && lastChimePhase !== phaseName) {
      lastChimePhase = phaseName;
      if (typeof AudioEngine !== 'undefined' && AudioEngine.playChime) {
        AudioEngine.playChime(phaseName === 'in');
      }
    }

    renderBelly(progress, phaseName);

    const countEl = document.getElementById('breath-count');
    const actionEl = document.getElementById('breath-action');
    if (countEl) countEl.textContent = secRemaining;
    if (actionEl) actionEl.textContent = labelText;

    animFrameId = requestAnimationFrame(animLoop);
  }

  function start() {
    isRunning = true;
    startTime = null;
    lastChimePhase = null;

    if (soundEnabled && typeof AudioEngine !== 'undefined' && AudioEngine.playChime) {
      AudioEngine.playChime(true);
    }

    cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(animLoop);

    const btn = document.getElementById('btn-toggle-breathing');
    const label = document.getElementById('breath-btn-label');
    if (btn && label) {
      btn.classList.add('active');
      label.textContent = 'Pauzeer Ademtraining';
    }
  }

  function stop() {
    isRunning = false;
    cancelAnimationFrame(animFrameId);
    startTime = null;
    lastChimePhase = null;

    renderBelly(0, 'in');

    const countEl = document.getElementById('breath-count');
    const actionEl = document.getElementById('breath-action');
    if (countEl) {
      countEl.textContent = '4';
      countEl.style.color = '#38bdf8';
    }
    if (actionEl) actionEl.textContent = 'Klaar om te beginnen?';

    const btn = document.getElementById('btn-toggle-breathing');
    const label = document.getElementById('breath-btn-label');
    if (btn && label) {
      btn.classList.remove('active');
      label.textContent = 'Start Ademtraining';
    }
  }

  function toggle() {
    if (isRunning) {
      stop();
    } else {
      start();
    }
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    const btn = document.getElementById('btn-sound-chime');
    if (btn) {
      btn.textContent = soundEnabled ? '🔔 Geluid Aan' : '🔕 Geluid Uit';
    }
  }

  return {
    start,
    stop,
    toggle,
    toggleSound,
    isRunning: () => isRunning
  };
})();
