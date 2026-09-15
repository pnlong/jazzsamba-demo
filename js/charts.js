/** Chart.js helpers for JazzSAMBA About catalog statistics. */

const TEXT_MUTED = "#524548";
const TEXT_PRIMARY = "#1c1315";
const GRID_COLOR = "#c9c0b8";
const BORDER_SUBTLE = "#ebe6df";
const ASYNC_COLOR = "#efa838";
const SYNC_COLOR = "#c81d1a";

function applyChartDefaults() {
  if (typeof Chart === "undefined") return;
  Chart.defaults.backgroundColor = "transparent";
  Chart.defaults.color = TEXT_MUTED;
  Chart.defaults.font.family =
    '"Plus Jakarta Sans", "Segoe UI", sans-serif';
  Chart.defaults.plugins.legend.labels.color = TEXT_MUTED;
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
  Chart.defaults.plugins.legend.labels.boxHeight = 12;
}

/**
 * Stacked bar: one bar per category (total height), segments async + sync.
 * @param {string} canvasId
 * @param {{ labels: string[], async: number[], sync: number[], unit?: string }} data
 * @param {{ horizontal?: boolean }} [opts]
 */
export function stackedBarChart(canvasId, data, opts = {}) {
  applyChartDefaults();
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return null;

  const horizontal = opts.horizontal !== false;
  const labels = data.labels || [];
  const asyncCounts = data.async || [];
  const syncCounts = data.sync || [];
  const unit = data.unit === "hours" ? "hours" : "count";
  const axisTitle = unit === "hours" ? "Hours" : "Count";
  const formatValue = (v) =>
    unit === "hours" ? Number(v || 0).toFixed(2) : String(v || 0);

  return new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Asynchronous",
          data: asyncCounts,
          backgroundColor: ASYNC_COLOR,
          borderColor: BORDER_SUBTLE,
          borderWidth: 1,
          borderSkipped: false,
          borderRadius: 0,
          stack: "protocol",
        },
        {
          label: "Synchronous",
          data: syncCounts,
          backgroundColor: SYNC_COLOR,
          borderColor: BORDER_SUBTLE,
          borderWidth: 1,
          borderSkipped: false,
          borderRadius: horizontal
            ? { topLeft: 0, bottomLeft: 0, topRight: 4, bottomRight: 4 }
            : { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          stack: "protocol",
        },
      ],
    },
    options: {
      indexAxis: horizontal ? "y" : "x",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: { usePointStyle: true, pointStyle: "rectRounded" },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              return ` ${ctx.dataset.label}: ${formatValue(ctx.raw)}`;
            },
            afterBody(items) {
              if (!items.length) return "";
              const i = items[0].dataIndex;
              const a = asyncCounts[i] || 0;
              const s = syncCounts[i] || 0;
              return `Total: ${formatValue(a + s)}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          beginAtZero: true,
          grid: {
            color: horizontal ? GRID_COLOR : "transparent",
            drawBorder: false,
          },
          ticks: {
            color: TEXT_MUTED,
            precision: unit === "hours" ? 1 : 0,
          },
          title: {
            display: horizontal,
            text: axisTitle,
            color: TEXT_PRIMARY,
          },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: {
            color: horizontal ? "transparent" : GRID_COLOR,
            drawBorder: false,
          },
          ticks: {
            color: TEXT_MUTED,
            precision: unit === "hours" ? 1 : 0,
          },
          title: {
            display: !horizontal,
            text: axisTitle,
            color: TEXT_PRIMARY,
          },
        },
      },
    },
  });
}

/**
 * Doughnut chart for simple category counts.
 * @param {string} canvasId
 * @param {{ labels: string[], counts: number[] }} data
 */
export function doughnutChart(canvasId, data) {
  applyChartDefaults();
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return null;

  const labels = data.labels || [];
  const counts = data.counts || [];
  const colors = labels.map((label) => {
    const key = String(label).toLowerCase();
    if (key.startsWith("async")) return ASYNC_COLOR;
    if (key.startsWith("sync")) return SYNC_COLOR;
    return ASYNC_COLOR;
  });

  return new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: counts,
          backgroundColor: colors,
          borderColor: "#ffffff",
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "55%",
      plugins: {
        legend: {
          position: "bottom",
          labels: { usePointStyle: true, pointStyle: "circle", padding: 16 },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const total = counts.reduce((a, b) => a + b, 0);
              const value = ctx.raw || 0;
              const pct = total ? ((100 * value) / total).toFixed(1) : "0.0";
              return ` ${ctx.label}: ${value} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}
