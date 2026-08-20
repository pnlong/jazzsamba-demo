/** Shared shell helpers for JazzSAMBA demo pages. */
(function (global) {
  const AUTHORS = [
    { name: "Phillip Long", affil: 1, band: true },
    { name: "Jacob Nguyen", affil: 2, band: true },
    { name: "Jace Hosto", affil: 3, band: true },
    { name: "Gage Hosto", affil: 3, band: true },
    { name: "Jett Takazawa", affil: 2, band: true },
    { name: "Fares Nofal", affil: null, band: true },
    { name: "Sebastian Stade", affil: null, band: true },
    { name: "Nithya Shikarpur", affil: 4, band: false },
    { name: "Julian McAuley", affil: 1, band: false },
    { name: "Cheng-Zhi Anna Huang", affil: 4, band: false },
    { name: "Aleksandra Teng Ma", affil: 4, band: false },
    { name: "Stephen Brade", affil: 4, band: false },
  ];

  const AFFILS = [
    "University of California, San Diego",
    "Boston College",
    "College of the Ozarks",
    "Massachusetts Institute of Technology",
  ];

  const BAND = [
    { name: "Phillip Long", instrument: "Trumpet", slug: "phillip-long" },
    { name: "Jacob Nguyen", instrument: "Piano", slug: "jacob-nguyen" },
    { name: "Jace Hosto", instrument: "Drums", slug: "jace-hosto" },
    { name: "Gage Hosto", instrument: "Alto Saxophone", slug: "gage-hosto" },
    { name: "Jett Takazawa", instrument: "Bass", slug: "jett-takazawa" },
    { name: "Sebastian Stade", instrument: "Bass", slug: "sebastian-stade" },
    { name: "Fares Nofal", instrument: "Tenor Saxophone", slug: "fares-nofal" },
    { name: "Jungyeon Bac", instrument: "Bass", slug: "jungyeon-bac" },
  ];

  function protocolLabel(synchronous) {
    return synchronous ? "Synchronous" : "Asynchronous";
  }

  function protocolChipClass(synchronous) {
    return synchronous ? "chip-sync" : "chip-async";
  }

  function titleCaseWords(text) {
    return String(text || "")
      .replace(/_/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  const LINKS = {
    code: "https://github.com/pnlong/jazz-standard-dataset",
    zenodo: null,
    paper: null,
  };

  function pageName() {
    const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    if (!file || file === "index.html") return "home";
    if (file.startsWith("explore")) return "explore";
    if (file.startsWith("about")) return "about";
    if (file.startsWith("band")) return "band";
    return "home";
  }

  function markCurrentNav() {
    const page = pageName();
    document.querySelectorAll(".nav a[data-page]").forEach((a) => {
      if (a.dataset.page === page) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function renderAuthors(el) {
    if (!el) return;
    const parts = AUTHORS.map((a) => {
      const sup = a.affil == null ? "" : `<sup>${a.affil}</sup>`;
      const name = a.band
        ? `<a href="band.html">${a.name}</a>${sup}`
        : `${a.name}${sup}`;
      return name;
    });
    el.innerHTML = parts.join(", ");
  }

  function renderAffils(el) {
    if (!el) return;
    el.innerHTML = `<ol>${AFFILS.map((a) => `<li>${a}</li>`).join("")}</ol>`;
  }

  function initials(name) {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  function renderBand(el) {
    if (!el) return;
    el.innerHTML = BAND.map((m) => {
      const src = `img/band/${m.slug}.jpg`;
      return `
        <article class="band-card">
          <div class="band-photo" data-slug="${m.slug}">
            <img src="${src}" alt="${m.name}" loading="lazy"
              onerror="this.remove(); this.parentElement.textContent='${initials(m.name)}';" />
          </div>
          <div class="band-meta">
            <h3>${m.name}</h3>
            <div class="instrument">${m.instrument}</div>
          </div>
        </article>`;
    }).join("");
  }

  function wireCodeLinks() {
    document.querySelectorAll("[data-link=code]").forEach((a) => {
      a.href = LINKS.code;
    });
    document.querySelectorAll("[data-link=zenodo]").forEach((a) => {
      if (LINKS.zenodo) a.href = LINKS.zenodo;
      else {
        a.setAttribute("aria-disabled", "true");
        a.title = "Zenodo record coming soon";
        a.addEventListener("click", (ev) => ev.preventDefault());
      }
    });
    document.querySelectorAll("[data-link=paper]").forEach((a) => {
      if (LINKS.paper) a.href = LINKS.paper;
      else {
        a.setAttribute("aria-disabled", "true");
        a.title = "Paper PDF coming soon";
        a.addEventListener("click", (ev) => ev.preventDefault());
      }
    });
  }

  async function loadCatalog() {
    const res = await fetch("data/catalog.json");
    if (!res.ok) throw new Error(`catalog.json HTTP ${res.status}`);
    return res.json();
  }

  global.JazzSambaSite = {
    AUTHORS,
    AFFILS,
    BAND,
    LINKS,
    pageName,
    markCurrentNav,
    renderAuthors,
    renderAffils,
    renderBand,
    wireCodeLinks,
    loadCatalog,
    initials,
    protocolLabel,
    protocolChipClass,
    titleCaseWords,
  };

  document.addEventListener("DOMContentLoaded", () => {
    markCurrentNav();
    wireCodeLinks();
  });
})(window);
