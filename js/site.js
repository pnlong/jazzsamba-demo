/** Shared shell helpers for JazzSAMBA demo pages. */
(function (global) {
  const AUTHORS = [
    { name: "Phillip Long", affil: 1, band: true },
    { name: "Jacob Nguyen", affil: null, band: true },
    { name: "Jace Hosto", affil: null, band: true },
    { name: "Gage Hosto", affil: null, band: true },
    { name: "Jett Takazawa", affil: null, band: true },
    { name: "Fares Nofal", affil: null, band: true },
    { name: "Sebastian Stade", affil: null, band: true },
    { name: "Nithya Shikarpur", affil: 2, band: false },
    { name: "Julian McAuley", affil: 1, band: false },
    { name: "Cheng-Zhi Anna Huang", affil: 2, band: false },
    { name: "Aleksandra Teng Ma", affil: 2, band: false },
    { name: "Stephen Brade", affil: 2, band: false },
  ];

  const AFFILS = [
    "University of California, San Diego",
    "Massachusetts Institute of Technology",
  ];

  const BAND = [
    {
      musician_id: 0,
      name: "Jace Hosto",
      instrument: "Drums",
      bio:
        "Jace plays drums. He has been playing for seven years and jazz for five. He studies at the College of the Ozarks. Outside of music he golfs, surfs, and plays tennis.",
    },
    {
      musician_id: 1,
      name: "Jett Takazawa",
      instrument: "Bass",
      bio:
        "Jett plays bass. He has been playing for nine years and jazz for seven. He is a senior at Boston College, studying information systems and business analytics.",
    },
    {
      musician_id: 2,
      name: "Jacob Nguyen",
      instrument: "Piano",
      bio:
        "Jacob plays piano. He has been playing for about twelve years and teaching himself jazz for about four. He studies math and economics at Boston College. Outside of music he cooks, bikes, surfs, and travels.",
    },
    {
      musician_id: 3,
      name: "Phillip Long",
      instrument: "Trumpet",
      bio:
        "Phillip plays trumpet. He started in sixth grade to join middle school jazz band and has been playing jazz for about ten years. He is a student at the University of California, San Diego, where he works on AI music research.",
    },
    {
      musician_id: 4,
      name: "Gage Hosto",
      instrument: "Alto Saxophone",
      bio:
        "Gage plays alto saxophone. He started in fourth grade and has been playing for twelve years, with seven years of serious jazz since freshman year of high school. He studies at the College of the Ozarks. When he is not at school he golfs and spends time at the beach with friends.",
    },
    {
      musician_id: 5,
      name: "Fares Nofal",
      instrument: "Tenor Saxophone",
      bio:
        "Fares plays tenor saxophone. He started on alto and has been on tenor for four years; this is his fifth year playing jazz. He studies at Irvine Valley College and plays with the Irvine Valley College Jazz Improv Ensemble.",
    },
    {
      musician_id: 6,
      name: "Jungyeon Bac",
      instrument: "Bass",
      bio:
        "Jungyeon plays bass, switching from piano after nine years about two years ago. Jazz followed a visit to the Comstock Saloon in San Francisco six years ago. Jungyeon studies applied math at Boston College and enjoys traveling in Asia.",
    },
    {
      musician_id: 7,
      name: "Sebastian Stade",
      instrument: "Bass",
      bio:
        "Sebastian plays bass guitar. He has been playing since seventh grade, about eight years, mostly in rock and country, and got into jazz bass over the past year. He works as a touring bassist and songwriter.",
    },
  ];

  function protocolLabel(synchronous) {
    return synchronous ? "Synchronous" : "Asynchronous";
  }

  function protocolShortLabel(synchronous) {
    return synchronous ? "S" : "A";
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
    package: "https://github.com/pnlong/jazzsamba",
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

  function renderSiteFooter() {
    const footer = document.querySelector(".site-footer");
    if (!footer) return;

    const homeLink = `<a href="index.html">JazzSAMBA</a>`;
    const codeLink = `<a data-link="code" href="#">Code</a>`;
    const packageLink = `<a data-link="package" href="#">Package</a>`;
    const page = pageName();

    let line = "";
    switch (page) {
      case "home":
        line = `${homeLink} · ${codeLink} · ${packageLink}`;
        break;
      case "explore":
        line = `${homeLink} · Explore`;
        break;
      case "about":
        line = `${homeLink} · About`;
        break;
      case "band":
        line = `${homeLink} · The Band`;
        break;
      default:
        line = homeLink;
    }

    footer.innerHTML = line;
  }

  function renderAuthors(el) {
    if (!el) return;
    const parts = AUTHORS.map((a) => {
      const sup = a.affil == null ? "" : `<sup>${a.affil}</sup>`;
      return `${a.name}${sup}`;
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
    const members = BAND.slice().sort((a, b) => a.musician_id - b.musician_id);
    el.innerHTML = members
      .map((m) => {
        const src = `img/band/${m.musician_id}.jpg`;
        const bio = m.bio
          ? `<div class="band-bio"><p>${m.bio}</p></div>`
          : `<div class="band-bio band-bio-empty" aria-hidden="true"></div>`;
        return `
        <article class="band-card" data-musician-id="${m.musician_id}">
          <div class="band-photo">
            <img src="${src}" alt="" loading="lazy"
              onerror="const p=this.parentElement; this.remove(); if(p) p.innerHTML='<span class=&quot;band-initials&quot;>${initials(m.name)}</span>';" />
          </div>
          <div class="band-meta">
            <h3>${m.name}</h3>
            <div class="instrument">${m.instrument}</div>
            ${bio}
          </div>
        </article>`;
      })
      .join("");

    function equalizeHeights() {
      const cards = Array.from(el.querySelectorAll(".band-card"));
      cards.forEach((card) => {
        card.style.minHeight = "";
      });
      const tallest = cards.reduce((max, card) => Math.max(max, card.offsetHeight), 0);
      cards.forEach((card) => {
        card.style.minHeight = `${tallest}px`;
      });
    }

    requestAnimationFrame(equalizeHeights);
    if (!el._bandResizeBound) {
      el._bandResizeBound = true;
      let resizeTimer = null;
      window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(equalizeHeights, 100);
      });
    }
  }

  function wireCodeLinks() {
    document.querySelectorAll("[data-link=code]").forEach((a) => {
      a.href = LINKS.code;
    });
    document.querySelectorAll("[data-link=package]").forEach((a) => {
      a.href = LINKS.package;
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
    renderSiteFooter,
    renderAuthors,
    renderAffils,
    renderBand,
    wireCodeLinks,
    loadCatalog,
    initials,
    protocolLabel,
    protocolShortLabel,
    protocolChipClass,
    titleCaseWords,
  };

  function wireMobileNav() {
    const toggle = document.getElementById("nav-toggle");
    const nav = document.getElementById("site-nav");
    if (!toggle || !nav) return;

    function setOpen(open) {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }

    toggle.addEventListener("click", () => {
      setOpen(!nav.classList.contains("is-open"));
    });

    nav.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => setOpen(false));
    });

    window.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") setOpen(false);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    markCurrentNav();
    renderSiteFooter();
    wireCodeLinks();
    wireMobileNav();
  });
})(window);
