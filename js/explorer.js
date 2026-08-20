/** Read-only lane explorer for better-take mixes. */
(function () {
  const PX_PER_SEC = 48;
  const metrical = window.JazzSambaMetrical;
  const { loadCatalog } = window.JazzSambaSite;

  let catalog = null;
  let musiciansById = {};
  let currentSong = null;
  let annotations = null;
  let peaks = null;
  let duration = 0;
  let raf = 0;

  const audio = () => document.getElementById("audio");
  const seek = () => document.getElementById("seek");
  const timeDisplay = () => document.getElementById("time-display");
  const playhead = () => document.getElementById("playhead");
  const canvas = () => document.getElementById("waveform");
  const lanesEl = () => document.getElementById("lanes");
  const statusEl = () => document.getElementById("explorer-status");

  function fmt(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function timelineWidth() {
    return Math.max(640, Math.ceil(duration * PX_PER_SEC));
  }

  function setStatus(msg) {
    if (statusEl()) statusEl().textContent = msg || "";
  }

  function musicianLabel(id) {
    const m = musiciansById[id];
    if (!m) return `id ${id}`;
    const inst = (m.instrument || "").replace(/_/g, " ");
    return `${m.name} (${inst})`;
  }

  function drawWaveform() {
    const c = canvas();
    if (!c || !peaks?.peaks?.length) return;
    const w = timelineWidth();
    c.width = w;
    c.height = 96;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, w, 96);
    ctx.fillStyle = "#3d8a86";
    const mid = 48;
    const arr = peaks.peaks;
    for (let i = 0; i < arr.length; i++) {
      const [mn, mx] = arr[i];
      const x0 = (i / arr.length) * w;
      const x1 = ((i + 1) / arr.length) * w;
      const top = mid - mx * 42;
      const bot = mid - mn * 42;
      ctx.fillRect(x0, top, Math.max(1, x1 - x0), Math.max(1, bot - top));
    }
    // Bar lines
    const bars = annotations?.bars || [];
    ctx.strokeStyle = "rgba(22,53,63,0.22)";
    ctx.lineWidth = 1;
    bars.forEach((b) => {
      const x = parseFloat(b.start_time) * PX_PER_SEC;
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
    track.style.width = `${timelineWidth()}px`;
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
    playhead().style.left = `${t * PX_PER_SEC}px`;
    seek().value = String(Math.min(1000, Math.round((t / Math.max(duration, 0.001)) * 1000)));
    timeDisplay().textContent = `${fmt(t)} / ${fmt(duration)}`;
    if (!a.paused) raf = requestAnimationFrame(syncPlayhead);
  }

  function applyDuration(d) {
    duration = d;
    document.getElementById("timeline-editor").style.setProperty("--tw", `${timelineWidth()}px`);
    drawWaveform();
    renderLanes();
    syncPlayhead();
  }

  async function loadSong(song) {
    currentSong = song;
    setStatus(`Loading ${song.title}…`);
    document.getElementById("song-title").textContent = song.title;
    document.getElementById("song-meta").innerHTML =
      `<span class="chip ${song.synchronous ? "chip-sync" : "chip-async"}">${song.protocol}</span> ` +
      `${song.artist || ""} · ${song.key_signature || ""} · ${song.bpm || "?"} BPM · better mix`;

    const [annRes, peakRes] = await Promise.all([
      fetch(song.annotations_url),
      fetch(song.peaks_url),
    ]);
    if (!annRes.ok) throw new Error(`annotations HTTP ${annRes.status}`);
    annotations = await annRes.json();
    peaks = peakRes.ok ? await peakRes.json() : null;

    const a = audio();
    a.src = song.audio_url;
    a.load();

    const fromPeaks = peaks?.duration || 0;
    const fromBars = metrical.timelineEndTime(annotations.bars || []);
    applyDuration(Math.max(fromPeaks, fromBars, 1));

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
          <span class="meta">${s.protocol} · #${s.song_id} · ${s.genre || ""}</span>
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

  document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("play-btn").addEventListener("click", () => {
      const a = audio();
      if (a.paused) {
        a.play();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(syncPlayhead);
      } else {
        a.pause();
      }
    });
    document.getElementById("stop-btn").addEventListener("click", () => {
      const a = audio();
      a.pause();
      a.currentTime = 0;
      syncPlayhead();
    });
    seek().addEventListener("input", () => {
      const a = audio();
      a.currentTime = (Number(seek().value) / 1000) * duration;
      syncPlayhead();
    });
    document.getElementById("waveform-wrap").addEventListener("click", (ev) => {
      const wrap = ev.currentTarget;
      const x = ev.clientX - wrap.getBoundingClientRect().left + wrap.scrollLeft;
      audio().currentTime = Math.max(0, Math.min(duration, x / PX_PER_SEC));
      syncPlayhead();
    });
    document.getElementById("protocol-filter").addEventListener("change", renderSongList);
    document.getElementById("song-search").addEventListener("input", renderSongList);

    try {
      catalog = await loadCatalog();
      musiciansById = Object.fromEntries(
        (catalog.musicians || []).map((m) => [m.musician_id, m])
      );
      renderSongList();
      const params = new URLSearchParams(location.search);
      const want = params.get("song_id");
      let song =
        (want && catalog.songs.find((s) => s.song_id === Number(want))) ||
        catalog.songs[0];
      if (song) await loadSong(song);
      else setStatus("No songs in catalog.");
    } catch (err) {
      setStatus(`Failed to load catalog: ${err.message}`);
    }
  });
})();
