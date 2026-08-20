/** Read-only lane explorer for better-take mixes. */
(function () {
  const PX_PER_SEC = 48;
  const LABEL_W = 96;
  const SCROLL_MARGIN = 100;
  const metrical = window.JazzSambaMetrical;
  const { loadCatalog, protocolLabel, protocolChipClass } = window.JazzSambaSite;

  let catalog = null;
  let musiciansById = {};
  let currentSong = null;
  let annotations = null;
  let peaks = null;
  let duration = 0;
  let raf = 0;
  let followPlayhead = true;
  let syncingScroll = false;

  const audio = () => document.getElementById("audio");
  const seek = () => document.getElementById("seek");
  const timeDisplay = () => document.getElementById("time-display");
  const playhead = () => document.getElementById("playhead");
  const canvas = () => document.getElementById("waveform");
  const lanesEl = () => document.getElementById("lanes");
  const waveformWrap = () => document.getElementById("waveform-wrap");
  const lanesPanel = () => document.getElementById("lanes-panel");
  const statusEl = () => document.getElementById("explorer-status");
  const playPauseBtn = () => document.getElementById("play-pause-btn");
  const followBtn = () => document.getElementById("follow-playhead-btn");

  function fmt(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function contentWidth() {
    return Math.round(LABEL_W + Math.max(duration * PX_PER_SEC, 640));
  }

  function trackWidth() {
    return Math.round(Math.max(duration * PX_PER_SEC, 640));
  }

  function tToX(t) {
    return LABEL_W + t * PX_PER_SEC;
  }

  function xToT(x) {
    return Math.max(0, (x - LABEL_W) / PX_PER_SEC);
  }

  function setStatus(msg) {
    if (statusEl()) statusEl().textContent = msg || "";
  }

  function titleCaseInstrument(inst) {
    return String(inst || "")
      .replace(/_/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  function musicianLabel(id) {
    const m = musiciansById[id];
    if (!m) return `id ${id}`;
    return `${m.name} (${titleCaseInstrument(m.instrument)})`;
  }

  function setBothScrollLeft(left) {
    syncingScroll = true;
    waveformWrap().scrollLeft = left;
    lanesPanel().scrollLeft = left;
    syncingScroll = false;
  }

  function updateFollowUI() {
    const btn = followBtn();
    if (!btn) return;
    btn.classList.toggle("is-active", followPlayhead);
    const label = followPlayhead ? "Following playhead" : "Follow playhead";
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-pressed", followPlayhead ? "true" : "false");
  }

  function updatePlayPauseUI() {
    const btn = playPauseBtn();
    if (!btn) return;
    const playing = !audio().paused;
    btn.textContent = playing ? "Pause" : "Play";
    btn.title = playing ? "Pause" : "Play";
    btn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  function scrollToTime(t, force = false) {
    if (!force && !followPlayhead) return;
    const wrap = waveformWrap();
    const x = tToX(t);
    const left = wrap.scrollLeft;
    const right = left + wrap.clientWidth;
    if (force || x < left + SCROLL_MARGIN || x > right - SCROLL_MARGIN) {
      setBothScrollLeft(Math.max(0, x - wrap.clientWidth * 0.25));
    }
  }

  function drawWaveform() {
    const c = canvas();
    if (!c) return;
    const w = contentWidth();
    c.width = w;
    c.height = 96;
    c.style.width = `${w}px`;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, w, 96);

    // Label gutter (matches lane labels)
    ctx.fillStyle = "#fffcf7";
    ctx.fillRect(0, 0, LABEL_W, 96);
    ctx.strokeStyle = "rgba(22,53,63,0.12)";
    ctx.beginPath();
    ctx.moveTo(LABEL_W + 0.5, 0);
    ctx.lineTo(LABEL_W + 0.5, 96);
    ctx.stroke();

    if (!peaks?.peaks?.length) return;
    ctx.fillStyle = "#3d8a86";
    const mid = 48;
    const arr = peaks.peaks;
    const tw = trackWidth();
    for (let i = 0; i < arr.length; i++) {
      const [mn, mx] = arr[i];
      const x0 = LABEL_W + (i / arr.length) * tw;
      const x1 = LABEL_W + ((i + 1) / arr.length) * tw;
      const top = mid - mx * 42;
      const bot = mid - mn * 42;
      ctx.fillRect(x0, top, Math.max(1, x1 - x0), Math.max(1, bot - top));
    }
    const bars = annotations?.bars || [];
    ctx.strokeStyle = "rgba(22,53,63,0.22)";
    ctx.lineWidth = 1;
    bars.forEach((b) => {
      const x = tToX(parseFloat(b.start_time));
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 96);
      ctx.stroke();
    });
  }

  function renderLane(name, rows, labelKey, labelFn, laneKey) {
    const lane = document.createElement("div");
    lane.className = "lane";
    const label = document.createElement("span");
    label.className = "lane-label";
    label.textContent = name;
    const track = document.createElement("div");
    track.className = "lane-track";
    track.style.width = `${trackWidth()}px`;
    lane.appendChild(label);
    lane.appendChild(track);

    const bars = annotations.bars || [];
    const blockHeight = 28;
    const items = metrical.assignSublanes(rows || [], bars);
    const { layouts, trackHeight } = metrical.layoutSublanes(items, blockHeight, 4, 4);
    track.style.height = `${Math.max(36, trackHeight)}px`;

    const colorIdx = new Map();
    layouts.forEach(({ row, top, sublane }) => {
      const st = metrical.metricalStartTime(bars, row);
      const et = metrical.metricalEndTime(bars, row);
      const block = document.createElement("div");
      block.className = "block";
      const ci = colorIdx.get(sublane) || 0;
      colorIdx.set(sublane, ci + 1);
      const colors = metrical.blockStyle(laneKey, ci);
      block.style.left = `${st * PX_PER_SEC}px`;
      block.style.width = `${Math.max((et - st) * PX_PER_SEC, 12)}px`;
      block.style.top = `${top}px`;
      block.style.height = `${blockHeight}px`;
      block.style.background = colors.background;
      block.style.border = colors.border;
      block.style.color = colors.color;
      block.textContent = labelFn ? labelFn(row) : row[labelKey] ?? "";
      block.title = block.textContent;
      track.appendChild(block);
    });
    lanesEl().appendChild(lane);
  }

  function renderLanes() {
    lanesEl().innerHTML = "";
    lanesEl().style.width = `${contentWidth()}px`;
    if (!annotations) return;
    renderLane("Sections", annotations.sections || [], "section", null, "sections");
    renderLane("Chords", annotations.chords || [], "chord", null, "chords");
    renderLane(
      "Soloists",
      annotations.soloists || [],
      "musician_id",
      (row) => musicianLabel(parseInt(row.musician_id, 10)),
      "soloists"
    );
  }

  function syncPlayhead() {
    const a = audio();
    const t = a.currentTime || 0;
    playhead().style.left = `${tToX(t)}px`;
    seek().value = String(Math.min(1000, Math.round((t / Math.max(duration, 0.001)) * 1000)));
    timeDisplay().textContent = `${fmt(t)} / ${fmt(duration)}`;
    updatePlayPauseUI();
    if (!a.paused) {
      scrollToTime(t);
      raf = requestAnimationFrame(syncPlayhead);
    }
  }

  function applyDuration(d) {
    if (!Number.isFinite(d) || d <= 0) return;
    duration = d;
    drawWaveform();
    renderLanes();
    syncPlayhead();
  }

  async function loadSong(song) {
    currentSong = song;
    cancelAnimationFrame(raf);
    setStatus(`Loading ${song.title}…`);
    document.getElementById("song-title").textContent = song.title;
    document.getElementById("song-meta").innerHTML =
      `<span class="chip ${protocolChipClass(song.synchronous)}">${protocolLabel(song.synchronous)}</span>`;

    const [annRes, peakRes] = await Promise.all([
      fetch(song.annotations_url),
      fetch(song.peaks_url),
    ]);
    if (!annRes.ok) throw new Error(`annotations HTTP ${annRes.status}`);
    annotations = await annRes.json();
    peaks = peakRes.ok ? await peakRes.json() : null;

    const a = audio();
    a.pause();
    a.src = song.audio_url;
    a.load();

    // Prefer peaks/bars until audio metadata arrives (authoritative).
    const fromPeaks = peaks?.duration || 0;
    const fromBars = metrical.timelineEndTime(annotations.bars || []);
    applyDuration(Math.max(fromPeaks, fromBars, 1));
    followPlayhead = true;
    updateFollowUI();
    setBothScrollLeft(0);

    a.onloadedmetadata = () => {
      if (a.duration && Number.isFinite(a.duration)) applyDuration(a.duration);
    };

    const url = new URL(location.href);
    url.searchParams.set("song_id", String(song.song_id));
    history.replaceState({}, "", url);

    document.querySelectorAll(".song-list button").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.songId) === song.song_id);
    });
    setStatus("Better-take mixture · stems available in the Zenodo download");
    updatePlayPauseUI();
  }

  function filteredSongs() {
    const q = (document.getElementById("song-search").value || "").trim().toLowerCase();
    const proto = document.getElementById("protocol-filter").value;
    return (catalog.songs || []).filter((s) => {
      if (proto === "async" && s.synchronous) return false;
      if (proto === "sync" && !s.synchronous) return false;
      if (!q) return true;
      return (
        String(s.title).toLowerCase().includes(q) ||
        String(s.artist || "").toLowerCase().includes(q) ||
        String(s.song_id).includes(q)
      );
    });
  }

  function renderSongList() {
    const ul = document.getElementById("song-list");
    const songs = filteredSongs();
    ul.innerHTML = songs
      .map(
        (s) => `
      <li>
        <button type="button" data-song-id="${s.song_id}" class="${
          currentSong && currentSong.song_id === s.song_id ? "active" : ""
        }">
          <span class="title">${s.title}</span>
          <span class="meta">${protocolLabel(s.synchronous)} · #${s.song_id}</span>
        </button>
      </li>`
      )
      .join("");
    ul.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const song = catalog.songs.find((s) => s.song_id === Number(btn.dataset.songId));
        if (song) loadSong(song).catch((e) => setStatus(e.message));
      });
    });
  }

  function seekFromClientX(clientX, scrollEl) {
    const rect = scrollEl.getBoundingClientRect();
    const x = clientX - rect.left + scrollEl.scrollLeft;
    const t = Math.min(duration, xToT(x));
    audio().currentTime = t;
    followPlayhead = true;
    updateFollowUI();
    syncPlayhead();
    scrollToTime(t, true);
  }

  document.addEventListener("DOMContentLoaded", async () => {
    playPauseBtn().addEventListener("click", async () => {
      const a = audio();
      if (a.paused) {
        followPlayhead = true;
        updateFollowUI();
        try {
          await a.play();
        } catch (_) {
          /* autoplay / gesture */
        }
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(syncPlayhead);
      } else {
        a.pause();
        updatePlayPauseUI();
      }
    });
    document.getElementById("stop-btn").addEventListener("click", () => {
      const a = audio();
      a.pause();
      a.currentTime = 0;
      followPlayhead = true;
      updateFollowUI();
      syncPlayhead();
      scrollToTime(0, true);
    });
    followBtn().addEventListener("click", () => {
      followPlayhead = true;
      updateFollowUI();
      scrollToTime(audio().currentTime || 0, true);
    });
    seek().addEventListener("input", () => {
      const a = audio();
      a.currentTime = (Number(seek().value) / 1000) * duration;
      followPlayhead = true;
      updateFollowUI();
      syncPlayhead();
      scrollToTime(a.currentTime, true);
    });
    waveformWrap().addEventListener("click", (ev) => {
      seekFromClientX(ev.clientX, waveformWrap());
    });
    lanesPanel().addEventListener("click", (ev) => {
      if (ev.target.closest(".lane-label")) return;
      seekFromClientX(ev.clientX, lanesPanel());
    });
    waveformWrap().addEventListener("scroll", () => {
      if (syncingScroll) return;
      followPlayhead = false;
      updateFollowUI();
      syncingScroll = true;
      lanesPanel().scrollLeft = waveformWrap().scrollLeft;
      syncingScroll = false;
    });
    lanesPanel().addEventListener("scroll", () => {
      if (syncingScroll) return;
      followPlayhead = false;
      updateFollowUI();
      syncingScroll = true;
      waveformWrap().scrollLeft = lanesPanel().scrollLeft;
      syncingScroll = false;
    });
    audio().addEventListener("pause", updatePlayPauseUI);
    audio().addEventListener("play", () => {
      updatePlayPauseUI();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(syncPlayhead);
    });
    audio().addEventListener("ended", () => {
      updatePlayPauseUI();
      syncPlayhead();
    });
    window.addEventListener("keydown", (ev) => {
      if (ev.code !== "Space" && ev.key !== " ") return;
      const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || ev.target?.isContentEditable) return;
      ev.preventDefault();
      playPauseBtn().click();
    });
    document.getElementById("protocol-filter").addEventListener("change", renderSongList);
    document.getElementById("song-search").addEventListener("input", renderSongList);
    updateFollowUI();

    try {
      catalog = await loadCatalog();
      musiciansById = Object.fromEntries(
        (catalog.musicians || []).map((m) => [m.musician_id, m])
      );
      renderSongList();
      const params = new URLSearchParams(location.search);
      const want = params.get("song_id");
      const song =
        (want && catalog.songs.find((s) => s.song_id === Number(want))) ||
        catalog.songs[0];
      if (song) await loadSong(song);
      else setStatus("No songs in catalog.");
    } catch (err) {
      setStatus(`Failed to load catalog: ${err.message}`);
    }
  });
})();
