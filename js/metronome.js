/**
 * Session-local metronome overlay for annotators.
 * Schedules Web Audio clicks on the shared playback AudioContext — never writes to disk.
 */
function createMetronomeUI({
  transport,
  getBars,
  getBeatsPerBar,
  buttonEl = null,
  statusEl = null,
} = {}) {
  const LOOKAHEAD_MS = 40;
  const LOOKAHEAD_HIDDEN_MS = 250;
  const SCHEDULE_AHEAD_VISIBLE_SEC = 0.4;
  const SCHEDULE_AHEAD_HIDDEN_SEC = 30;
  const MAX_SCHEDULE_PER_PASS = 512;
  const EPS = 0.001;

  let enabled = false;
  let beatTimes = [];
  let nextIndex = 0;
  let accentBuf = null;
  let tickBuf = null;
  let bufferSampleRate = null;
  let scheduled = [];
  let timerId = null;
  let hintedEmpty = false;
  let unsubscribe = null;
  let onVisibilityChange = null;

  function tabIsHidden() {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  function scheduleAheadSec() {
    return tabIsHidden() ? SCHEDULE_AHEAD_HIDDEN_SEC : SCHEDULE_AHEAD_VISIBLE_SEC;
  }

  function timerIntervalMs() {
    return tabIsHidden() ? LOOKAHEAD_HIDDEN_MS : LOOKAHEAD_MS;
  }

  function makeClickBuffer(ctx, { freq, durationSec, peak }) {
    const sr = ctx.sampleRate;
    const n = Math.max(1, Math.floor(sr * durationSec));
    const buf = ctx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 90) * peak;
      data[i] = Math.sin(2 * Math.PI * freq * t) * env;
    }
    return buf;
  }

  function ensureBuffers(ctx) {
    if (!ctx) return false;
    if (accentBuf && tickBuf && bufferSampleRate === ctx.sampleRate) return true;
    accentBuf = makeClickBuffer(ctx, { freq: 1400, durationSec: 0.04, peak: 0.55 });
    tickBuf = makeClickBuffer(ctx, { freq: 900, durationSec: 0.03, peak: 0.28 });
    bufferSampleRate = ctx.sampleRate;
    return true;
  }

  function buildBeatTimes() {
    const bars = typeof getBars === 'function' ? (getBars() || []) : [];
    const bpb = Math.max(1, Math.floor(Number(typeof getBeatsPerBar === 'function' ? getBeatsPerBar() : 4) || 4));
    const out = [];
    for (const bar of bars) {
      const start = parseFloat(bar.start_time);
      const end = parseFloat(bar.end_time);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start + EPS) continue;
      const dur = end - start;
      for (let k = 0; k < bpb; k++) {
        out.push({ t: start + (k / bpb) * dur, accent: k === 0 });
      }
    }
    // Closing tap / final barline: one last accent after the last bar's interior beats.
    if (bars.length) {
      const lastEnd = parseFloat(bars[bars.length - 1].end_time);
      if (Number.isFinite(lastEnd) && !out.some(b => Math.abs(b.t - lastEnd) < EPS)) {
        out.push({ t: lastEnd, accent: true });
      }
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  function cancelScheduled() {
    for (const item of scheduled) {
      try {
        item.source.stop(0);
      } catch (_) {}
      try {
        item.source.disconnect();
      } catch (_) {}
    }
    scheduled = [];
  }

  function stopTimer() {
    if (timerId != null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startTimer() {
    stopTimer();
    timerId = setInterval(scheduleAhead, timerIntervalMs());
  }

  function scheduleClick(beat) {
    const ctx = transport?.getAudioContext?.();
    if (!ctx || !ensureBuffers(ctx)) return false;
    const when = transport.timelineToContextTime(beat.t);
    if (when == null) return false;
    const minWhen = ctx.currentTime + 0.002;
    const startWhen = when < minWhen ? minWhen : when;
    const source = ctx.createBufferSource();
    source.buffer = beat.accent ? accentBuf : tickBuf;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(ctx.destination);
    try {
      source.start(startWhen);
    } catch (_) {
      return false;
    }
    scheduled.push({ source, when: startWhen });
    source.onended = () => {
      scheduled = scheduled.filter(s => s.source !== source);
    };
    return true;
  }

  function scheduleAhead() {
    if (!enabled || !transport?.isPlaying?.()) return;
    const ctx = transport.getAudioContext?.();
    if (!ctx || !ensureBuffers(ctx)) return;

    const aheadSec = scheduleAheadSec();
    const hidden = tabIsHidden();
    const nowT = transport.getCurrentTime?.() ?? 0;
    const timelineHorizon = nowT + aheadSec;
    const contextHorizon = ctx.currentTime + aheadSec;
    let scheduledCount = 0;

    while (nextIndex < beatTimes.length && scheduledCount < MAX_SCHEDULE_PER_PASS) {
      const beat = beatTimes[nextIndex];
      if (hidden && beat.t > timelineHorizon) break;

      const when = transport.timelineToContextTime(beat.t);
      if (when == null) break;
      if (!hidden && when > contextHorizon) break;
      if (hidden && when > contextHorizon + 0.5) break;

      if (scheduleClick(beat)) scheduledCount += 1;
      nextIndex += 1;
    }
  }

  function reschedule() {
    cancelScheduled();
    stopTimer();
    if (!enabled) return;
    beatTimes = buildBeatTimes();
    if (!beatTimes.length) {
      if (!hintedEmpty && statusEl) {
        statusEl.textContent = 'Metronome on — need barlines to click';
        statusEl.style.color = '#ffcc66';
        hintedEmpty = true;
      }
      return;
    }
    hintedEmpty = false;
    if (!transport?.isPlaying?.()) return;
    const nowT = transport.getCurrentTime?.() ?? 0;
    nextIndex = beatTimes.findIndex(b => b.t >= nowT - EPS);
    if (nextIndex < 0) nextIndex = beatTimes.length;
    scheduleAhead();
    startTimer();
  }

  function handleVisibilityChange() {
    if (!enabled || !transport?.isPlaying?.()) return;
    // Background tabs throttle timers (~1s). Burst-schedule far ahead on Web Audio.
    scheduleAhead();
    if (tabIsHidden()) {
      scheduleAhead();
    } else {
      startTimer();
    }
  }

  function updateButton() {
    if (!buttonEl) return;
    buttonEl.classList.toggle('is-active', enabled);
    buttonEl.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    buttonEl.title = enabled ? 'Metronome on (session only)' : 'Metronome off';
    buttonEl.setAttribute('aria-label', enabled ? 'Metronome on' : 'Metronome off');
  }

  function setEnabled(on) {
    enabled = Boolean(on);
    updateButton();
    if (!enabled) {
      cancelScheduled();
      stopTimer();
      return;
    }
    reschedule();
  }

  function sync() {
    if (!enabled) return;
    reschedule();
  }

  function wireTransport() {
    if (!transport?.onTransportChange) return;
    unsubscribe = transport.onTransportChange(ev => {
      if (!enabled) return;
      if (ev.type === 'play' || ev.type === 'seek') {
        reschedule();
      } else if (ev.type === 'pause' || ev.type === 'ended') {
        cancelScheduled();
        stopTimer();
      }
    });
  }

  if (buttonEl) {
    buttonEl.addEventListener('click', () => {
      void (async () => {
        const next = !enabled;
        if (next && transport?.ensureAudioContext) {
          await Promise.resolve(transport.ensureAudioContext());
        }
        setEnabled(next);
      })();
    });
  }
  wireTransport();
  if (typeof document !== 'undefined') {
    onVisibilityChange = handleVisibilityChange;
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  updateButton();

  return {
    setEnabled,
    isEnabled: () => enabled,
    sync,
    destroy() {
      setEnabled(false);
      if (unsubscribe) unsubscribe();
      unsubscribe = null;
      if (onVisibilityChange) {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        onVisibilityChange = null;
      }
    },
  };
}
