/** Read-only metrical helpers for the project-page explorer. */
(function (global) {
  function barsIndex(bars) {
    const idx = {};
    (bars || []).forEach((b) => {
      idx[parseInt(b.bar, 10)] = b;
    });
    return idx;
  }

  function barDuration(idx, barIndex) {
    const row = idx[barIndex];
    if (!row) return 0;
    return parseFloat(row.end_time) - parseFloat(row.start_time);
  }

  function timeInBar(idx, barIndex, fraction) {
    const row = idx[barIndex];
    if (!row) return 0;
    return parseFloat(row.start_time) + fraction * barDuration(idx, barIndex);
  }

  function lastBarIndex(idx) {
    const keys = Object.keys(idx).map((k) => parseInt(k, 10));
    if (!keys.length) return null;
    return Math.max(...keys);
  }

  function timelineEndTime(bars) {
    if (!bars?.length) return 0;
    return Math.max(...bars.map((b) => parseFloat(b.end_time) || 0));
  }

  function metricalStartTime(bars, row) {
    if (row.start_time != null && row.start_time !== "" && !Number.isNaN(parseFloat(row.start_time))) {
      return parseFloat(row.start_time);
    }
    const idx = barsIndex(bars);
    return timeInBar(idx, parseInt(row.start_bar, 10), parseFloat(row.start_fraction) || 0);
  }

  function metricalEndTime(bars, row) {
    if (row.end_time != null && row.end_time !== "" && !Number.isNaN(parseFloat(row.end_time))) {
      return parseFloat(row.end_time);
    }
    const idx = barsIndex(bars);
    const endBar = parseInt(row.end_bar, 10);
    const last = lastBarIndex(idx);
    if (last != null && endBar > last) return timelineEndTime(bars);
    return timeInBar(idx, endBar, parseFloat(row.end_fraction) || 0);
  }

  function assignSublanes(rows, bars) {
    const items = rows.map((row, index) => ({
      index,
      row,
      start: metricalStartTime(bars, row),
      end: metricalEndTime(bars, row),
    }));
    items.sort((a, b) => a.start - b.start || a.end - b.end);
    const laneEnds = [];
    items.forEach((item) => {
      let assigned = -1;
      for (let i = 0; i < laneEnds.length; i++) {
        if (item.start >= laneEnds[i] - 0.001) {
          assigned = i;
          laneEnds[i] = item.end;
          break;
        }
      }
      if (assigned === -1) {
        assigned = laneEnds.length;
        laneEnds.push(item.end);
      }
      item.sublane = assigned;
    });
    return items;
  }

  function sublaneRowOffset(sublane) {
    if (sublane === 0) return 0;
    const magnitude = Math.ceil(sublane / 2);
    return sublane % 2 === 1 ? magnitude : -magnitude;
  }

  function layoutSublanes(sublaneItems, blockHeight, gap, defaultTop) {
    const rowStep = blockHeight + gap;
    let minTop = defaultTop;
    let maxBottom = defaultTop + blockHeight;
    const layouts = sublaneItems.map((item) => {
      const rowOff = sublaneRowOffset(item.sublane);
      const top = defaultTop + rowOff * rowStep;
      minTop = Math.min(minTop, top);
      maxBottom = Math.max(maxBottom, top + blockHeight);
      return { ...item, top };
    });
    const padTop = minTop < 0 ? -minTop : 0;
    layouts.forEach((l) => {
      l.top += padTop;
    });
    return {
      layouts,
      trackHeight: maxBottom - minTop + padTop + 4,
    };
  }

  const LANE_PALETTES = {
    sections: [38, 72],
    chords: [8, 68],
    soloists: [22, 55],
  };

  function blockStyle(laneKey, index) {
    const pal = LANE_PALETTES[laneKey] || [38, 60];
    const [h, s] = pal;
    const light = index % 2 === 0;
    const l = light ? 88 : 80;
    const borderL = light ? 62 : 52;
    return {
      background: `hsl(${h} ${s}% ${l}%)`,
      border: `1px solid hsl(${h} ${Math.max(20, s - 8)}% ${borderL}%)`,
      color: "#1c1315",
    };
  }

  global.JazzSambaMetrical = {
    barsIndex,
    timelineEndTime,
    metricalStartTime,
    metricalEndTime,
    assignSublanes,
    layoutSublanes,
    blockStyle,
  };
})(window);
