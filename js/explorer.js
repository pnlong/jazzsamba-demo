/** Read-only lane explorer for better-take mixes. */
(function () {
  const PX_PER_SEC = 48;
  const LABEL_W = 96;
  const SCROLL_MARGIN = 100;
  const metrical = window.JazzSambaMetrical;
  const { loadCatalog, protocolLabel, protocolShortLabel, protocolChipClass, titleCaseWords } = window.JazzSambaSite;

  const CATALOG_FILTERS = [
    { selectId: "genre-filter", field: "genre", urlParam: "genre", label: (v) => titleCaseWords(v) },
    { selectId: "form-filter", field: "form", urlParam: "form" },
    { selectId: "key-filter", field: "key_signature", urlParam: "key" },
    { selectId: "time-filter", field: "time_signature", urlParam: "time" },
  ];

  const FILTER_SELECT_IDS = [
    "protocol-filter",
    "genre-filter",
    "form-filter",
    "key-filter",
    "time-filter",
    "swung-filter",
  ];

  let catalog = null;
  let musiciansById = {};
  let currentSong = null;
  let annotations = null;
  let peaks = null;
  let duration = 0;
  let raf = 0;
  let followPlayhead = true;
  let syncingScroll = false;
  let metronome = null;
  let metroTransport = null;

  const audio = () => document.getElementById("audio");
  const seek = () => document.getElementById("seek");
  const timeDisplay = () => document.getElementById("time-display");
  const playhead = () => document.getElementById("playhead");
  const canvas = () => document.getElementById("waveform");
  const lanesEl = () => document.getElementById("lanes");
  const waveformWrap = () => document.getElementById("waveform-wrap");
  const lanesPanel = () => document.getElementById("lanes-panel");
  const timelineScroll = () => document.getElementById("timeline-scroll");
  const timelineInner = () => document.getElementById("timeline-inner");
  const statusEl = () => document.getElementById("explorer-notice");
  const playPauseBtn = () => document.getElementById("play-pause-btn");
  const followBtn = () => document.getElementById("follow-playhead-btn");
  const metronomeBtn = () => document.getElementById("metronome-btn");

  function beatsPerBarFromSong(song) {
    const m = String(song?.time_signature || "4/4").match(/(\d+)\s*\/\s*\d+/);
    const n = m ? parseInt(m[1], 10) : 4;
    return Number.isFinite(n) && n > 0 ? n : 4;
  }

  function createMetroTransport() {
    let playbackContext = null;
    const listeners = new Set();

    async function ensureAudioContext() {
      if (!playbackContext || playbackContext.state === "closed") {
        playbackContext = new AudioContext();
      }
      if (playbackContext.state === "suspended" || playbackContext.state === "interrupted") {
        try {
          await playbackContext.resume();
        } catch (_) {
          /* ignore resume errors */
        }
      }
      return playbackContext;
    }

    function notify(type, detail = {}) {
      for (const cb of listeners) {
        try {
          cb({ type, ...detail });
        } catch (_) {
          /* ignore listener errors */
        }
      }
    }

    return {
      ensureAudioContext,
      isPlaying: () => !audio().paused,
      getCurrentTime: () => Math.max(0, audio().currentTime || 0),
      getAudioContext: () =>
        playbackContext && playbackContext.state !== "closed" ? playbackContext : null,
      timelineToContextTime(t) {
        const a = audio();
        if (!a || a.paused || !playbackContext || playbackContext.state === "closed") return null;
        const timelineT = Number(t);
        if (!Number.isFinite(timelineT)) return null;
        const audioT = Number.isFinite(a.currentTime) ? a.currentTime : 0;
        return playbackContext.currentTime + (timelineT - audioT);
      },
      onTransportChange(cb) {
        if (typeof cb !== "function") return () => {};
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      notify,
    };
  }
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
    const el = statusEl();
    if (!el) return;
    const text = msg || "";
    el.textContent = text;
    el.hidden = !text;
    el.style.color = "";
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

  function songMusicianIds(song) {
    const raw = song?.["playing.musician_ids"];
    if (!raw) return [];
    return String(raw)
      .split("-")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
  }

  function syncExplorerUrl({ songId, musicianIds, repertoire } = {}) {
    const url = new URL(location.href);
    if (songId !== undefined) {
      if (songId) url.searchParams.set("song_id", String(songId));
      else url.searchParams.delete("song_id");
    }
    if (musicianIds !== undefined) {
      if (musicianIds && musicianIds.length) {
        url.searchParams.set("musician_id", musicianIds.join(","));
      } else {
        url.searchParams.delete("musician_id");
      }
    }
    if (repertoire) {
      for (const [param, val] of Object.entries(repertoire)) {
        if (val && val !== "all") url.searchParams.set(param, String(val));
        else url.searchParams.delete(param);
      }
    }
    history.replaceState({}, "", url);
  }

  function repertoireFilterState() {
    const state = {};
    CATALOG_FILTERS.forEach(({ selectId, urlParam }) => {
      const el = document.getElementById(selectId);
      state[urlParam] = el ? el.value : "all";
    });
    const swungEl = document.getElementById("swung-filter");
    state.swung = swungEl ? swungEl.value : "all";
    return state;
  }

  function populateCatalogFilters() {
    const params = new URLSearchParams(location.search);
    CATALOG_FILTERS.forEach(({ selectId, field, urlParam, label }) => {
      const select = document.getElementById(selectId);
      if (!select) return;
      const values = Array.from(
        new Set(
          (catalog.songs || [])
            .map((s) => String(s[field] || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      const format = label || ((v) => v);
      select.innerHTML =
        `<option value="all">All</option>` +
        values
          .map((v) => `<option value="${v}">${format(v)}</option>`)
          .join("");
      const want = params.get(urlParam);
      if (want && values.includes(want)) select.value = want;
    });
    const swungEl = document.getElementById("swung-filter");
    const wantSwung = params.get("swung");
    if (swungEl && wantSwung && ["True", "False"].includes(wantSwung)) {
      swungEl.value = wantSwung;
    }
  }

  function resetRepertoireFilters() {
    CATALOG_FILTERS.forEach(({ selectId }) => {
      const el = document.getElementById(selectId);
      if (el) el.value = "all";
    });
    const swungEl = document.getElementById("swung-filter");
    if (swungEl) swungEl.value = "all";
  }

  function resetAllFilters() {
    const proto = document.getElementById("protocol-filter");
    if (proto) proto.value = "all";
    setAllMusiciansChecked(true);
    resetRepertoireFilters();
  }

  function allMusicianIds() {
    return (catalog.musicians || [])
      .map((m) => m.musician_id)
      .filter((id) => Number.isFinite(id));
  }

  function musicianCheckboxEls() {
    return Array.from(document.querySelectorAll("#musician-checkboxes input[data-musician-id]"));
  }

  function setAllMusiciansChecked(checked) {
    musicianCheckboxEls().forEach((el) => {
      el.checked = checked;
    });
    const selectAll = document.getElementById("musician-select-all");
    if (selectAll) {
      selectAll.checked = checked;
      selectAll.indeterminate = false;
    }
  }

  function syncMusicianSelectAll() {
    const boxes = musicianCheckboxEls();
    const selectAll = document.getElementById("musician-select-all");
    if (!selectAll || !boxes.length) return;
    const checkedCount = boxes.filter((el) => el.checked).length;
    selectAll.checked = checkedCount === boxes.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
  }

  function getSelectedMusicianIds() {
    const boxes = musicianCheckboxEls();
    const allIds = allMusicianIds();
    const checked = boxes.filter((el) => el.checked).map((el) => Number(el.dataset.musicianId));
    if (!boxes.length || checked.length === allIds.length) return null;
    return checked;
  }

  function populateMusicianCheckboxes() {
    const container = document.getElementById("musician-checkboxes");
    if (!container) return;
    const musicians = (catalog.musicians || []).slice().sort((a, b) => a.musician_id - b.musician_id);
    container.innerHTML = musicians
      .map(
        (m) =>
          `<label><input type="checkbox" data-musician-id="${m.musician_id}" checked /> ${musicianLabel(m.musician_id)}</label>`
      )
      .join("");

    const params = new URLSearchParams(location.search);
    const wantRaw = params.get("musician_id");
    if (wantRaw) {
      const want = wantRaw
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
      if (want.length) {
        musicianCheckboxEls().forEach((el) => {
          el.checked = want.includes(Number(el.dataset.musicianId));
        });
      }
    }
    syncMusicianSelectAll();
  }

  function filtersAreActive() {
    const proto = document.getElementById("protocol-filter");
    if (proto && proto.value !== "all") return true;
    if (getSelectedMusicianIds() !== null) return true;
    for (const { selectId } of CATALOG_FILTERS) {
      const el = document.getElementById(selectId);
      if (el && el.value !== "all") return true;
    }
    const swungEl = document.getElementById("swung-filter");
    if (swungEl && swungEl.value !== "all") return true;
    return false;
  }

  function updateFilterButtonUI() {
    const btn = document.getElementById("filter-open-btn");
    if (!btn) return;
    btn.classList.toggle("is-active", filtersAreActive());
  }

  function openFilterModal() {
    const modal = document.getElementById("filter-modal");
    const btn = document.getElementById("filter-open-btn");
    if (!modal) return;
    modal.hidden = false;
    if (btn) btn.setAttribute("aria-expanded", "true");
    document.body.classList.add("filter-modal-open");
    document.getElementById("filter-modal-close")?.focus();
  }

  function closeFilterModal() {
    const modal = document.getElementById("filter-modal");
    const btn = document.getElementById("filter-open-btn");
    if (!modal) return;
    modal.hidden = true;
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
    }
    document.body.classList.remove("filter-modal-open");
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function detailTruthy(val) {
    if (val === null || val === undefined || val === "" || val === "NA") return false;
    if (val === "False" || val === false) return false;
    return true;
  }

  function detailRow(label, value) {
    if (!detailTruthy(value)) return "";
    return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd>`;
  }

  function sectionMusiciansFor(sectionIndex) {
    return (annotations?.section_musicians || [])
      .filter((m) => String(m.section_index) === String(sectionIndex))
      .map((m) => {
        const id = parseInt(m.musician_id, 10);
        const catalog = musiciansById[id];
        const name = catalog?.name || `id ${id}`;
        const inst = m.instrument || catalog?.instrument || "";
        return `${name} (${titleCaseInstrument(inst)})`;
      });
  }

  const CHORD_TRIAD_LABELS = {
    maj: "major",
    min: "minor",
    dim: "diminished",
    aug: "augmented",
    sus: "suspended",
    power: "power",
  };

  const CHORD_SEVENTH_LABELS = {
    dom: "dominant 7th",
    maj: "major 7th",
    min: "minor 7th",
    half_dim: "half-diminished 7th",
    dim: "diminished 7th",
  };

  const CHORD_EXTENSION_TAGS = {
    has_6: "6",
    has_9: "9",
    has_11: "11",
    has_13: "13",
    has_add9: "add9",
    is_sus2: "sus2",
    is_sus4: "sus4",
  };

  const CHORD_ALTERATION_TAGS = {
    alt_b5: "♭5",
    alt_sharp5: "♯5",
    alt_b9: "♭9",
    alt_sharp9: "♯9",
    alt_sharp11: "♯11",
    alt_b11: "♭11",
  };

  function annFlagTrue(row, key) {
    return row[key] === "True" || row[key] === true;
  }

  function chordFlagTrue(row, key) {
    return annFlagTrue(row, key);
  }

  function buildSectionHierarchyLine(row) {
    const parts = [];
    const top = titleCaseWords(row.top_level_section || "");
    if (top) parts.push(top);
    if (detailTruthy(row.bottom_level_section) && row.bottom_level_section !== "NA") {
      parts.push(row.bottom_level_section);
    }
    return parts.join(" · ");
  }

  function buildSectionFlagTags(row) {
    const flags = [];
    if (annFlagTrue(row, "is_intro")) flags.push("Intro");
    if (annFlagTrue(row, "is_outro")) flags.push("Outro");
    if (annFlagTrue(row, "is_solo")) flags.push("Solo");
    if (annFlagTrue(row, "is_head_in")) flags.push("Head in");
    else if (annFlagTrue(row, "is_head_out")) flags.push("Head out");
    else if (annFlagTrue(row, "is_head")) flags.push("Head");
    if (!flags.length) return "";
    return flags
      .map((flag) => `<span class="ann-tag">${escapeHtml(flag)}</span>`)
      .join("");
  }

  function buildSectionMusiciansTagsHtml(sectionIndex) {
    const lines = sectionMusiciansFor(sectionIndex);
    if (!lines.length) return "";
    return lines
      .map((line) => `<span class="ann-tag">${escapeHtml(line)}</span>`)
      .join("");
  }

  function humanizeTriad(triad) {
    if (!detailTruthy(triad) || triad === "NA") return "";
    return CHORD_TRIAD_LABELS[triad] || String(triad);
  }

  function humanizeSeventh(seventh) {
    if (!detailTruthy(seventh) || seventh === "none" || seventh === "NA") return "";
    return CHORD_SEVENTH_LABELS[seventh] || String(seventh);
  }

  function chordTagsHtml(row, tagMap) {
    const tags = [];
    for (const [key, label] of Object.entries(tagMap)) {
      if (chordFlagTrue(row, key)) tags.push(label);
    }
    if (!tags.length) return "";
    return tags
      .map((tag) => `<span class="ann-tag">${escapeHtml(tag)}</span>`)
      .join("");
  }

  function detailTagRow(label, tagsHtml) {
    if (!tagsHtml) return "";
    return `<dt>${escapeHtml(label)}</dt><dd class="ann-tag-list">${tagsHtml}</dd>`;
  }

  function buildChordStructureLine(row) {
    const parts = [];
    if (detailTruthy(row.root) && row.root !== "NA") parts.push(row.root);
    const triad = humanizeTriad(row.triad);
    if (triad) parts.push(triad);
    const seventh = humanizeSeventh(row.seventh);
    if (seventh) parts.push(seventh);
    return parts.join(" · ");
  }

  function buildChordIntervalsLine(row) {
    const parts = [];
    if (detailTruthy(row.root_interval) && row.root_interval !== "NA") {
      parts.push(`root +${row.root_interval}`);
    }
    if (detailTruthy(row.bass_interval) && row.bass_interval !== "NA") {
      parts.push(`bass +${row.bass_interval}`);
    }
    if (
      detailTruthy(row.bass_interval_from_root) &&
      row.bass_interval_from_root !== "NA"
    ) {
      parts.push(`bass +${row.bass_interval_from_root} from root`);
    }
    return parts.join(" · ");
  }

  function buildSectionDetailHtml(row) {
    const parts = [];

    const hierarchy = buildSectionHierarchyLine(row);
    if (hierarchy) parts.push(detailRow("Form", hierarchy));

    parts.push(detailTagRow("Flags", buildSectionFlagTags(row)));

    if (annFlagTrue(row, "is_solo") && detailTruthy(row.soloist) && row.soloist !== "NA") {
      parts.push(detailRow("Soloist", titleCaseInstrument(row.soloist)));
    }

    parts.push(
      detailTagRow("Playing", buildSectionMusiciansTagsHtml(row.section_index))
    );

    return `<dl class="ann-detail ann-detail-section">${parts.filter(Boolean).join("")}</dl>`;
  }

  function buildChordDetailHtml(row) {
    const parts = [];

    if (chordFlagTrue(row, "is_no_chord")) {
      parts.push(detailRow("Type", "No chord"));
    }

    const structure = buildChordStructureLine(row);
    if (structure) parts.push(detailRow("Structure", structure));

    const bassNote =
      detailTruthy(row.bass) && row.bass !== "NA" ? row.bass : "";
    const rootNote =
      detailTruthy(row.root) && row.root !== "NA" ? row.root : "";
    if (
      bassNote &&
      (chordFlagTrue(row, "is_slash") || bassNote !== rootNote)
    ) {
      parts.push(detailRow("Slash bass", bassNote));
    }

    const intervals = buildChordIntervalsLine(row);
    if (intervals) parts.push(detailRow("From key", intervals));

    parts.push(
      detailTagRow("Extensions", chordTagsHtml(row, CHORD_EXTENSION_TAGS))
    );
    parts.push(
      detailTagRow("Alterations", chordTagsHtml(row, CHORD_ALTERATION_TAGS))
    );

    return `<dl class="ann-detail ann-detail-chord">${parts.filter(Boolean).join("")}</dl>`;
  }

  function openAnnotationModal(type, index) {
    const modal = document.getElementById("annotation-modal");
    const titleEl = document.getElementById("annotation-modal-title");
    const bodyEl = document.getElementById("annotation-modal-body");
    if (!modal || !titleEl || !bodyEl || !annotations) return;

    let html = "";
    let title = "Details";
    if (type === "sections") {
      const row = (annotations.sections || [])[index];
      if (!row) return;
      title = row.section || "Section";
      html = buildSectionDetailHtml(row);
    } else if (type === "chords") {
      const row = (annotations.chords || [])[index];
      if (!row) return;
      title = row.chord || "Chord";
      html = buildChordDetailHtml(row);
    } else {
      return;
    }

    titleEl.textContent = title;
    bodyEl.innerHTML = html;
    modal.hidden = false;
    document.body.classList.add("filter-modal-open");
    document.getElementById("annotation-modal-close")?.focus();
  }

  function closeAnnotationModal() {
    const modal = document.getElementById("annotation-modal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("filter-modal-open");
  }

  function anyModalOpen() {
    const filterModal = document.getElementById("filter-modal");
    const annModal = document.getElementById("annotation-modal");
    return (
      (filterModal && !filterModal.hidden) ||
      (annModal && !annModal.hidden)
    );
  }

  function setBothScrollLeft(left) {
    syncingScroll = true;
    const scroll = timelineScroll();
    if (scroll) scroll.scrollLeft = left;
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
    const playIcon = btn.querySelector(".transport-icon-play");
    const pauseIcon = btn.querySelector(".transport-icon-pause");
    if (playIcon) playIcon.classList.toggle("hidden", playing);
    if (pauseIcon) pauseIcon.classList.toggle("hidden", !playing);
    btn.title = playing ? "Pause" : "Play";
    btn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  function scrollToTime(t, force = false) {
    if (!force && !followPlayhead) return;
    const scroll = timelineScroll();
    if (!scroll) return;
    const x = tToX(t);
    const left = scroll.scrollLeft;
    const right = left + scroll.clientWidth;
    if (force || x < left + SCROLL_MARGIN || x > right - SCROLL_MARGIN) {
      setBothScrollLeft(Math.max(0, x - scroll.clientWidth * 0.25));
    }
  }

  function seekToTime(t) {
    const clamped = Math.max(0, Math.min(duration, t));
    audio().currentTime = clamped;
    followPlayhead = true;
    updateFollowUI();
    syncPlayhead();
    scrollToTime(clamped, true);
    metroTransport?.notify("seek", { t: clamped });
  }

  function topLevelSectionSeekMarkers() {
    const rows = annotations?.sections || [];
    const markers = [];
    let prevTop = null;
    for (const row of rows) {
      let top = row.top_level_section;
      if (!top || top === "NA") {
        top = String(row.section || "").split("/")[0].trim();
      }
      if (!top || top === prevTop) continue;
      prevTop = top;
      const t = parseFloat(row.start_time);
      if (!Number.isFinite(t) || t < 0) continue;
      markers.push({ t, label: titleCaseWords(top) });
    }
    return markers;
  }

  function renderSectionSeekMarkers() {
    const host = document.getElementById("seek-markers");
    if (!host) return;
    host.innerHTML = "";
    const dur = duration;
    const markers = topLevelSectionSeekMarkers();
    if (!dur || !markers.length) {
      host.classList.add("is-empty");
      return;
    }
    host.classList.remove("is-empty");
    const pinSvg =
      '<svg class="seek-marker-icon" viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5'
      + 'c-1.4 0-2.5-1.1-2.5-2.5S10.6 6.5 12 6.5s2.5 1.1 2.5 2.5S13.4 11.5 12 11.5z"/>'
      + '</svg>';
    for (const marker of markers) {
      const t = Number(marker.t);
      if (!Number.isFinite(t) || t < 0) continue;
      const pct = Math.max(0, Math.min(100, (t / dur) * 100));
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "seek-marker";
      btn.style.left = `${pct}%`;
      const label = String(marker.label || "section");
      btn.title = `${label} (${fmt(t)})`;
      btn.setAttribute("aria-label", `Jump to ${label}`);
      btn.innerHTML = pinSvg;
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        seekToTime(t);
      });
      host.appendChild(btn);
    }
  }

  function waveformHeight() {
    const wrap = waveformWrap();
    const h = wrap?.clientHeight || 0;
    return h > 0 ? h : 120;
  }

  function drawWaveform() {
    const c = canvas();
    if (!c) return;
    const w = contentWidth();
    const h = waveformHeight();
    c.width = w;
    c.height = h;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, w, h);

    // Label gutter (matches lane labels)
    ctx.fillStyle = "#faf8f5";
    ctx.fillRect(0, 0, LABEL_W, h);
    ctx.strokeStyle = "rgba(28,19,21,0.12)";
    ctx.beginPath();
    ctx.moveTo(LABEL_W + 0.5, 0);
    ctx.lineTo(LABEL_W + 0.5, h);
    ctx.stroke();

    if (!peaks?.peaks?.length) return;
    ctx.fillStyle = "#c81d1a";
    const mid = h / 2;
    const amp = mid - 8;
    const arr = peaks.peaks;
    const tw = trackWidth();
    for (let i = 0; i < arr.length; i++) {
      const [mn, mx] = arr[i];
      const x0 = LABEL_W + (i / arr.length) * tw;
      const x1 = LABEL_W + ((i + 1) / arr.length) * tw;
      const top = mid - mx * amp;
      const bot = mid - mn * amp;
      ctx.fillRect(x0, top, Math.max(1, x1 - x0), Math.max(1, bot - top));
    }
    const bars = annotations?.bars || [];
    ctx.strokeStyle = "rgba(28,19,21,0.2)";
    ctx.lineWidth = 1;
    bars.forEach((b) => {
      const x = tToX(parseFloat(b.start_time));
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });
  }

  function wireTimelineResize() {
    const editor = document.getElementById("timeline-editor");
    const wrap = waveformWrap();
    const scroll = timelineScroll();
    if (!editor || editor._resizeObs) return;
    const onResize = () => {
      if (duration <= 0) return;
      drawWaveform();
      if (annotations) renderLanes();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(editor);
    if (wrap) ro.observe(wrap);
    if (scroll) ro.observe(scroll);
    editor._resizeObs = ro;
  }

  const LANE_COUNT = 3;

  function lanesTargetTrackHeight() {
    const panel = lanesPanel();
    const scroll = timelineScroll();
    let h = panel?.clientHeight || 0;
    if (h <= 0 && scroll && scroll.clientHeight > 0) {
      h = Math.floor((scroll.clientHeight * 2) / 5);
    }
    if (h <= 0) {
      const editor = document.getElementById("timeline-editor");
      if (editor && editor.clientHeight > 0) {
        h = Math.floor((editor.clientHeight * 2) / 5);
      }
    }
    if (h <= 0) return null;
    return Math.floor((h - 2) / LANE_COUNT);
  }

  function scaleLaneLayout(items, targetTrackHeight) {
    const baseBlockH = 28;
    const baseGap = 4;
    const baseTop = 4;
    let blockHeight = baseBlockH;
    let scaled = metrical.layoutSublanes(items, blockHeight, baseGap, baseTop);
    let contentH = Math.max(36, scaled.trackHeight);

    if (targetTrackHeight && targetTrackHeight > 0 && contentH > targetTrackHeight) {
      let scale = targetTrackHeight / contentH;
      blockHeight = Math.max(14, Math.round(baseBlockH * scale));
      let gap = Math.max(1, Math.round(baseGap * scale));
      scaled = metrical.layoutSublanes(items, blockHeight, gap, baseTop);
      contentH = scaled.trackHeight;
      if (contentH > targetTrackHeight && blockHeight > 14) {
        scale = targetTrackHeight / contentH;
        blockHeight = Math.max(14, Math.round(blockHeight * scale));
        gap = Math.max(1, Math.round(gap * scale));
        scaled = metrical.layoutSublanes(items, blockHeight, gap, baseTop);
        contentH = scaled.trackHeight;
      }
    }

    return {
      layouts: scaled.layouts,
      contentHeight: contentH,
      blockHeight,
    };
  }

  function renderLane(name, rows, labelKey, labelFn, laneKey, targetTrackHeight) {
    const lane = document.createElement("div");
    lane.className = "lane";
    const label = document.createElement("span");
    label.className = "lane-label";
    label.textContent = name;
    const track = document.createElement("div");
    track.className = "lane-track";
    const inner = document.createElement("div");
    inner.className = "lane-track-inner";
    inner.style.width = `${trackWidth()}px`;
    track.appendChild(inner);
    lane.appendChild(label);
    lane.appendChild(track);

    const bars = annotations.bars || [];
    const items = metrical.assignSublanes(rows || [], bars);
    const { layouts, contentHeight, blockHeight } = scaleLaneLayout(items, targetTrackHeight);
    inner.style.height = `${contentHeight}px`;

    const colorIdx = new Map();
    const rowIndex = new Map();
    (rows || []).forEach((r, i) => rowIndex.set(r, i));
    const clickable = laneKey === "sections" || laneKey === "chords";

    layouts.forEach(({ row, top, sublane }) => {
      const st = metrical.metricalStartTime(bars, row);
      const et = metrical.metricalEndTime(bars, row);
      const block = document.createElement("div");
      block.className = "block";
      if (clickable) {
        block.classList.add("block-clickable");
        block.dataset.annType = laneKey;
        block.dataset.annIndex = String(rowIndex.get(row) ?? 0);
      }
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
      inner.appendChild(block);
    });
    lanesEl().appendChild(lane);
  }

  function renderLanes() {
    const w = contentWidth();
    const inner = timelineInner();
    if (inner) inner.style.width = `${w}px`;
    lanesEl().innerHTML = "";
    lanesEl().style.width = `${w}px`;
    if (!annotations) return;
    const targetTrackHeight = lanesTargetTrackHeight();
    renderLane("Sections", annotations.sections || [], "section", null, "sections", targetTrackHeight);
    renderLane("Chords", annotations.chords || [], "chord", null, "chords", targetTrackHeight);
    renderLane(
      "Soloists",
      annotations.soloists || [],
      "musician_id",
      (row) => musicianLabel(parseInt(row.musician_id, 10)),
      "soloists",
      targetTrackHeight
    );
    requestAnimationFrame(() => {
      if (!annotations || duration <= 0) return;
      const retryTarget = lanesTargetTrackHeight();
      if (!retryTarget) return;
      if (!targetTrackHeight || Math.abs(retryTarget - targetTrackHeight) > 2) {
        renderLanes();
      }
    });
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
    renderSectionSeekMarkers();
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

    syncExplorerUrl({ songId: song.song_id });

    document.querySelectorAll(".song-list button").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.songId) === song.song_id);
    });
    setStatus("");
    updatePlayPauseUI();
    metronome?.sync?.();
  }

  function filteredSongs() {
    const q = (document.getElementById("song-search").value || "").trim().toLowerCase();
    const proto = document.getElementById("protocol-filter").value;
    const musicianIds = getSelectedMusicianIds();
    const swungVal = document.getElementById("swung-filter").value;
    return (catalog.songs || []).filter((s) => {
      if (proto === "async" && s.synchronous) return false;
      if (proto === "sync" && !s.synchronous) return false;
      if (musicianIds !== null) {
        if (!musicianIds.length) return false;
        const roster = songMusicianIds(s);
        if (!roster.some((id) => musicianIds.includes(id))) return false;
      }
      for (const { selectId, field } of CATALOG_FILTERS) {
        const val = document.getElementById(selectId).value;
        if (val !== "all" && String(s[field] || "") !== val) return false;
      }
      if (swungVal !== "all" && String(s.is_swung || "") !== swungVal) return false;
      if (!q) return true;
      return (
        String(s.title).toLowerCase().includes(q) ||
        String(s.artist || "").toLowerCase().includes(q) ||
        String(s.song_id).includes(q) ||
        songMusicianIds(s).some((id) => String(id).includes(q))
      );
    });
  }

  function onFiltersChanged() {
    const musicianIds = getSelectedMusicianIds();
    syncExplorerUrl({
      musicianIds: musicianIds === null ? [] : musicianIds,
      repertoire: repertoireFilterState(),
    });
    updateFilterButtonUI();
    renderSongList();
    const songs = filteredSongs();
    if (!songs.length) {
      setStatus("No songs match these filters.");
      return;
    }
    if (!currentSong || !songs.some((s) => s.song_id === currentSong.song_id)) {
      loadSong(songs[0]).catch((e) => setStatus(e.message));
    } else {
      setStatus("");
    }
  }

  function onSearchChanged() {
    updateFilterButtonUI();
    renderSongList();
    const songs = filteredSongs();
    if (!songs.length) setStatus("No songs match these filters.");
    else if (currentSong && songs.some((s) => s.song_id === currentSong.song_id)) {
      setStatus("");
    }
  }

  function renderSongList() {
    const ul = document.getElementById("song-list");
    const countEl = document.getElementById("song-list-count");
    const songs = filteredSongs();
    if (countEl) {
      countEl.textContent = `${songs.length} song${songs.length === 1 ? "" : "s"}`;
    }
    ul.innerHTML = songs
      .map(
        (s) => `
      <li>
        <button type="button" data-song-id="${s.song_id}" class="${
          currentSong && currentSong.song_id === s.song_id ? "active" : ""
        }">
          <span class="song-list-row">
            <span class="song-id">#${s.song_id}</span>
            <span class="chip chip-protocol ${protocolChipClass(s.synchronous)}" aria-label="${protocolLabel(s.synchronous)}">${protocolShortLabel(s.synchronous)}</span>
            <span class="title">${s.title}</span>
          </span>
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

  function seekFromClientX(clientX) {
    const scroll = timelineScroll();
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    const x = clientX - rect.left + scroll.scrollLeft;
    const t = Math.min(duration, xToT(x));
    audio().currentTime = t;
    followPlayhead = true;
    updateFollowUI();
    syncPlayhead();
    scrollToTime(t, true);
    metroTransport?.notify("seek", { t });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    metroTransport = createMetroTransport();
    metronome = createMetronomeUI({
      transport: metroTransport,
      getBars: () => annotations?.bars || [],
      getBeatsPerBar: () => beatsPerBarFromSong(currentSong),
      buttonEl: metronomeBtn(),
      statusEl: null,
    });
    metronomeBtn().addEventListener(
      "click",
      () => {
        void metroTransport.ensureAudioContext();
      },
      true
    );

    playPauseBtn().addEventListener("click", async () => {
      const a = audio();
      if (a.paused) {
        followPlayhead = true;
        updateFollowUI();
        await metroTransport.ensureAudioContext();
        try {
          await a.play();
        } catch (_) {
          /* autoplay / gesture */
        }
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(syncPlayhead);
        metroTransport.notify("play");
      } else {
        a.pause();
        updatePlayPauseUI();
        metroTransport.notify("pause");
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
      metroTransport.notify("seek", { t: 0 });
      metroTransport.notify("pause");
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
      metroTransport.notify("seek", { t: a.currentTime });
    });
    waveformWrap().addEventListener("click", (ev) => {
      seekFromClientX(ev.clientX);
    });
    lanesPanel().addEventListener("click", (ev) => {
      const block = ev.target.closest(".block-clickable");
      if (block) {
        ev.stopPropagation();
        openAnnotationModal(block.dataset.annType, parseInt(block.dataset.annIndex, 10));
        return;
      }
      if (ev.target.closest(".lane-label")) return;
      seekFromClientX(ev.clientX);
    });
    timelineScroll()?.addEventListener("scroll", () => {
      if (syncingScroll) return;
      followPlayhead = false;
      updateFollowUI();
    });
    audio().addEventListener("pause", () => {
      updatePlayPauseUI();
      metroTransport.notify("pause");
    });
    audio().addEventListener("play", () => {
      void (async () => {
        await metroTransport.ensureAudioContext();
        updatePlayPauseUI();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(syncPlayhead);
        metroTransport.notify("play");
      })();
    });
    audio().addEventListener("ended", () => {
      updatePlayPauseUI();
      syncPlayhead();
      metroTransport.notify("ended");
    });
    window.addEventListener("keydown", (ev) => {
      if (ev.code !== "Space" && ev.key !== " ") return;
      const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || ev.target?.isContentEditable) return;
      ev.preventDefault();
      playPauseBtn().click();
    });
    document.getElementById("protocol-filter").addEventListener("change", onFiltersChanged);
    FILTER_SELECT_IDS.slice(1).forEach((id) => {
      document.getElementById(id).addEventListener("change", onFiltersChanged);
    });
    document.getElementById("song-search").addEventListener("input", onSearchChanged);
    document.getElementById("filter-open-btn").addEventListener("click", openFilterModal);
    document.getElementById("filter-modal-close").addEventListener("click", closeFilterModal);
    document.getElementById("filter-modal-done").addEventListener("click", closeFilterModal);
    document.getElementById("filter-modal-backdrop").addEventListener("click", closeFilterModal);
    document.getElementById("annotation-modal-close").addEventListener("click", closeAnnotationModal);
    document.getElementById("annotation-modal-done").addEventListener("click", closeAnnotationModal);
    document.getElementById("annotation-modal-backdrop").addEventListener("click", closeAnnotationModal);
    document.getElementById("filter-reset").addEventListener("click", () => {
      resetAllFilters();
      onFiltersChanged();
    });
    document.getElementById("musician-select-all").addEventListener("change", (ev) => {
      setAllMusiciansChecked(ev.target.checked);
      onFiltersChanged();
    });
    document.getElementById("musician-checkboxes").addEventListener("change", () => {
      syncMusicianSelectAll();
      onFiltersChanged();
    });
    window.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape" || !anyModalOpen()) return;
      ev.preventDefault();
      const annModal = document.getElementById("annotation-modal");
      if (annModal && !annModal.hidden) closeAnnotationModal();
      else closeFilterModal();
    });
    updateFollowUI();

    wireTimelineResize();

    try {
      catalog = await loadCatalog();
      musiciansById = Object.fromEntries(
        (catalog.musicians || []).map((m) => [m.musician_id, m])
      );
      populateMusicianCheckboxes();
      populateCatalogFilters();
      updateFilterButtonUI();
      renderSongList();
      const params = new URLSearchParams(location.search);
      const want = params.get("song_id");
      const filtered = filteredSongs();
      const song =
        (want && filtered.find((s) => s.song_id === Number(want))) ||
        (want && catalog.songs.find((s) => s.song_id === Number(want))) ||
        filtered[0] ||
        catalog.songs[0];
      if (song) await loadSong(song);
      else setStatus("No songs in catalog.");
    } catch (err) {
      setStatus(`Failed to load catalog: ${err.message}`);
    }
  });
})();
