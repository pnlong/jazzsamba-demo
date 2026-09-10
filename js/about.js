/** About page: load precomputed chart JSON and mount Chart.js figures. */

import { doughnutChart, stackedBarChart } from "./charts.js";

const CHART_SPECS = [
  { id: "chart-synchronous", file: "synchronous.json", kind: "doughnut" },
  { id: "chart-genre", file: "genre.json", kind: "stacked" },
  { id: "chart-form", file: "form.json", kind: "stacked" },
  { id: "chart-year", file: "year.json", kind: "stacked" },
  { id: "chart-bpm", file: "bpm.json", kind: "stacked" },
  { id: "chart-tempo-text", file: "tempo_text.json", kind: "stacked" },
  { id: "chart-is-swung", file: "is_swung.json", kind: "stacked" },
  { id: "chart-horn-lead", file: "horn_lead.json", kind: "stacked" },
  { id: "chart-key-signature", file: "key_signature.json", kind: "stacked" },
  { id: "chart-time-signature", file: "time_signature.json", kind: "stacked" },
];

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return res.json();
}

export async function renderCharts() {
  if (typeof Chart === "undefined") {
    console.error("Chart.js is not loaded");
    return;
  }

  const payloads = await Promise.all(
    CHART_SPECS.map((spec) => fetchJson(`data/charts/${spec.file}`))
  );

  CHART_SPECS.forEach((spec, i) => {
    const data = payloads[i];
    if (spec.kind === "doughnut") {
      doughnutChart(spec.id, data);
    } else {
      stackedBarChart(spec.id, data, { horizontal: true });
    }
  });
}

renderCharts().catch((err) => {
  console.error("Catalog charts failed to render:", err);
});
