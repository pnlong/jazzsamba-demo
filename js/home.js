/** Home page: stats + featured better-mix players (2 async + 2 sync slots). */
(function () {
  const { loadCatalog, renderAuthors, renderAffils, protocolLabel, protocolChipClass } =
    window.JazzSambaSite;

  function songById(catalog, id) {
    if (id == null) return null;
    return (catalog.songs || []).find((s) => s.song_id === Number(id)) || null;
  }

  function featuredSongs(catalog) {
    const feat = catalog.featured || {};
    const asyncIds = (feat.async || [null, null]).slice(0, 2);
    const syncIds = (feat.sync || [null, null]).slice(0, 2);
    return [
      ...asyncIds.map((id) => ({ protocol: "async", song: songById(catalog, id), slot: id })),
      ...syncIds.map((id) => ({ protocol: "sync", song: songById(catalog, id), slot: id })),
    ];
  }

  function renderStems(stems) {
    if (!stems || !stems.length) return "";
    const rows = stems
      .map(
        (stem) => `
        <div class="stem-row">
          <span class="stem-label">${stem.label}</span>
          <audio controls preload="none" src="${stem.url}"></audio>
        </div>`
      )
      .join("");
    return `
      <div class="stem-list">
        <h4>Stems</h4>
        ${rows}
      </div>`;
  }

  function renderSamples(catalog) {
    const root = document.getElementById("featured-samples");
    if (!root) return;
    const items = featuredSongs(catalog);
    root.innerHTML = items
      .map(({ protocol, song, slot }) => {
        const sync = protocol === "sync";
        const chip = protocolChipClass(sync);
        const label = protocolLabel(sync);
        if (!song) {
          return `
            <article class="sample-card empty">
              <span class="chip ${chip}">${label}</span>
              <h3>Featured song TBD</h3>
              <p class="muted">Set <code>featured.${protocol}</code> song_id in <code>data/catalog.json</code>${
                slot == null ? "" : ` (current: ${slot})`
              }.</p>
            </article>`;
        }
        return `
          <article class="sample-card">
            <span class="chip ${chip}">${label}</span>
            <h3>${song.title}</h3>
            <div class="mix-block">
              <span class="stem-label">Mixture</span>
              <audio controls preload="none" src="${song.preview_audio_url || song.audio_url}"></audio>
            </div>
            ${renderStems(song.stems)}
          </article>`;
      })
      .join("");
  }

  function renderStats(catalog) {
    const c = catalog.counts || {};
    const map = {
      "stat-songs": c.songs,
      "stat-async": c.async,
      "stat-sync": c.sync,
      "stat-musicians": c.musicians,
    };
    Object.entries(map).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && val != null) el.textContent = String(val);
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    renderAuthors(document.getElementById("author-list"));
    renderAffils(document.getElementById("affil-legend"));
    try {
      const catalog = await loadCatalog();
      renderStats(catalog);
      renderSamples(catalog);
    } catch (err) {
      const root = document.getElementById("featured-samples");
      if (root) {
        root.innerHTML = `<div class="placeholder-box">Catalog not built yet. Run
          <code>uv run python -m preprocessing.scripts.export_project_page_assets</code>.
          (${err.message})</div>`;
      }
    }
  });
})();
