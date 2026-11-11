/**
 * ZingStart - Breathing Trainer
 * Guided 4-4-8 Diaphragmatic Breath & S-sound Vocal Support Routine
 */

const BreathingTrainer = (() => {
  let isRunning = false;
  let timerInterval = null;
  let soundEnabled = true;

  // Phases: inhale (4s), hold (4s), exhale (8s)
  const PHASES = [
    { name: 'in', label: 'Inademen (Lage buikadem)...', duration: 4, className: 'inhale' },
    { name: 'hold', label: 'Rustig vasthouden...', duration: 4, className: 'hold' },
    { name: 'exhale', label: 'Uitblazen op "Ssssss" (Ademsteun)...', duration: 8, className: 'exhale' }
  ];

  let currentPhaseIndex = 0;
  let secondsRemaining = 4;

  function updateVisuals() {
    const bubble = document.getElementById('breathing-bubble');
    const belly = document.getElementById('breath-belly');
    const hand = document.getElementById('breath-hand');
    const airflow = document.getElementById('breath-airflow');
    const countEl = document.getElementById('breath-count');
    const actionEl = document.getElementById('breath-action');
    const phase = PHASES[currentPhaseIndex];

    if (!countEl || !actionEl) return;

    countEl.textContent = secondsRemaining;
    actionEl.textContent = phase.label;

    if (phase.name === 'in') {
      countEl.style.color = '#38bdf8';
    } else if (phase.name === 'hold') {
      countEl.style.color = '#f59e0b';
    } else {
      countEl.style.color = '#d946ef';
    }

    const animEls = [bubble, belly, hand, airflow].filter(Boolean);
    animEls.forEach(el => {
      el.classList.remove('inhale', 'hold', 'exhale');
      el.style.transitionDuration = `${phase.duration}s`;
      el.classList.add(phase.className);
    });
  }

  function tick() {
    if (!isRunning) return;

    secondsRemaining--;

    if (secondsRemaining <= 0) {
      // Advance to next phase
      currentPhaseIndex = (currentPhaseIndex + 1) % PHASES.length;
      const nextPhase = PHASES[currentPhaseIndex];
      secondsRemaining = nextPhase.duration;

      if (soundEnabled) {
        AudioEngine.playChime(nextPhase.name === 'in');
      }
    }

    updateVisuals();
  }

  function start() {
    isRunning = true;
    currentPhaseIndex = 0;
    secondsRemaining = PHASES[0].duration;

    if (soundEnabled) {
      AudioEngine.playChime(true);
    }

    updateVisuals();
    clearInterval(timerInterval);
    timerInterval = setInterval(tick, 1000);

    const btn = document.getElementById('btn-toggle-breathing');
    const label = document.getElementById('breath-btn-label');
    if (btn && label) {
      btn.classList.add('active');
      label.textContent = 'Pauzeer Ademtraining';
    }
  }

  function stop() {
    isRunning = false;
    clearInterval(timerInterval);

    const bubble = document.getElementById('breathing-bubble');
    const belly = document.getElementById('breath-belly');
    const hand = document.getElementById('breath-hand');
    const airflow = document.getElementById('breath-airflow');
    const countEl = document.getElementById('breath-count');
    const actionEl = document.getElementById('breath-action');

    const animEls = [bubble, belly, hand, airflow].filter(Boolean);
    animEls.forEach(el => {
      el.classList.remove('inhale', 'hold', 'exhale');
      el.style.transitionDuration = '0.5s';
    });

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
