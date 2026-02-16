import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Filler,
  Tooltip,
  Legend
);

let chartInstance = null;
let cutMarkers = [];
let onCutMarkersChange = null;

const CUT_LINE_COLOR = 'rgba(239, 68, 68, 0.8)';
const CUT_LINE_DASH = [6, 4];

/**
 * Vertical line plugin to draw cut markers
 */
const cutLinePlugin = {
  id: 'cutLines',
  afterDraw(chart) {
    const ctx = chart.ctx;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    cutMarkers.forEach((markerIndex, i) => {
      const meta = chart.getDatasetMeta(0);
      if (!meta.data[markerIndex]) return;

      const x = meta.data[markerIndex].x;

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash(CUT_LINE_DASH);
      ctx.strokeStyle = CUT_LINE_COLOR;
      ctx.lineWidth = 2;
      ctx.moveTo(x, yScale.top);
      ctx.lineTo(x, yScale.bottom);
      ctx.stroke();

      // Label
      ctx.setLineDash([]);
      ctx.fillStyle = CUT_LINE_COLOR;
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Corte ${i + 1}`, x, yScale.top - 6);
      ctx.restore();
    });
  },
};

Chart.register(cutLinePlugin);

/**
 * Creates the speed chart with click-to-cut functionality
 */
export function createSpeedChart(canvasId, records, onMarkersChange) {
  onCutMarkersChange = onMarkersChange;
  cutMarkers = [];

  const canvas = document.getElementById(canvasId);

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  // Prepare data - sample if too many points for performance
  const maxPoints = 2000;
  const step = records.length > maxPoints ? Math.ceil(records.length / maxPoints) : 1;

  const startTime = records[0]?.timestamp?.getTime() ?? 0;

  const labels = [];
  const speedData = [];
  const hrData = [];
  const indexMap = []; // Maps chart data index back to original records index

  for (let i = 0; i < records.length; i += step) {
    const r = records[i];
    const elapsedMin = (r.timestamp.getTime() - startTime) / 60000;
    labels.push(elapsedMin);
    speedData.push(r.speed != null ? r.speed * 3.6 : null); // m/s -> km/h
    hrData.push(r.heartRate);
    indexMap.push(i);
  }

  chartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Velocidad (km/h)',
          data: speedData,
          borderColor: '#00b4d8',
          backgroundColor: 'rgba(0, 180, 216, 0.1)',
          borderWidth: 1.5,
          pointRadius: 0,
          pointHitRadius: 8,
          fill: true,
          tension: 0.3,
          yAxisID: 'y',
        },
        {
          label: 'FC (bpm)',
          data: hrData,
          borderColor: 'rgba(239, 68, 68, 0.5)',
          borderWidth: 1,
          pointRadius: 0,
          pointHitRadius: 0,
          fill: false,
          tension: 0.3,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: '#9aa0a6',
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: '#2a2f38',
          titleColor: '#e8eaed',
          bodyColor: '#9aa0a6',
          borderColor: '#3a3f4a',
          borderWidth: 1,
          callbacks: {
            title: (items) => {
              const min = items[0].label;
              const totalMin = parseFloat(min);
              const h = Math.floor(totalMin / 60);
              const m = Math.floor(totalMin % 60);
              const s = Math.floor((totalMin * 60) % 60);
              return h > 0
                ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                : `${m}:${String(s).padStart(2, '0')}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: 'Tiempo (min)',
            color: '#6b7280',
          },
          ticks: {
            color: '#6b7280',
            callback: (value) => {
              const h = Math.floor(value / 60);
              const m = Math.floor(value % 60);
              return h > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${m}`;
            },
          },
          grid: { color: 'rgba(58, 63, 74, 0.5)' },
        },
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Velocidad (km/h)',
            color: '#00b4d8',
          },
          ticks: { color: '#6b7280' },
          grid: { color: 'rgba(58, 63, 74, 0.3)' },
          min: 0,
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: 'FC (bpm)',
            color: 'rgba(239, 68, 68, 0.5)',
          },
          ticks: { color: '#6b7280' },
          grid: { display: false },
          min: 0,
        },
      },
      onClick: (event, elements, chart) => {
        handleChartClick(event, chart, records, indexMap);
      },
    },
  });

  return chartInstance;
}

/**
 * Handle click on chart to place/remove cut markers
 */
function handleChartClick(event, chart, records, indexMap) {
  const xScale = chart.scales.x;
  const rect = chart.canvas.getBoundingClientRect();
  const clickX = event.native.clientX - rect.left;

  // Find closest data point
  const meta = chart.getDatasetMeta(0);
  let closestIdx = 0;
  let closestDist = Infinity;

  for (let i = 0; i < meta.data.length; i++) {
    const dist = Math.abs(meta.data[i].x - clickX);
    if (dist < closestDist) {
      closestDist = dist;
      closestIdx = i;
    }
  }

  const recordIndex = indexMap[closestIdx];

  // Check if clicking near an existing marker (within 10px) - remove it
  const existingMarkerIdx = cutMarkers.findIndex((m) => {
    const mChartIdx = indexMap.indexOf(m) !== -1
      ? indexMap.indexOf(m)
      : indexMap.findIndex((im) => Math.abs(im - m) <= 1);
    if (mChartIdx === -1) return false;
    const mX = meta.data[mChartIdx]?.x ?? 0;
    return Math.abs(mX - clickX) < 15;
  });

  if (existingMarkerIdx !== -1) {
    cutMarkers.splice(existingMarkerIdx, 1);
  } else {
    // Don't allow cuts at very start or end
    if (recordIndex < 5 || recordIndex > records.length - 5) return;
    cutMarkers.push(closestIdx);
    cutMarkers.sort((a, b) => a - b);
  }

  chart.update('none');

  if (onCutMarkersChange) {
    // Convert chart indices back to record indices
    const recordIndices = cutMarkers.map((ci) => indexMap[ci]);
    onCutMarkersChange(recordIndices);
  }
}

/**
 * Set cut markers programmatically (e.g., from presets)
 */
export function setCutMarkers(recordIndices, records) {
  if (!chartInstance) return;

  const maxPoints = 2000;
  const step = records.length > maxPoints ? Math.ceil(records.length / maxPoints) : 1;

  // Convert record indices to chart indices
  cutMarkers = recordIndices.map((ri) => Math.round(ri / step));
  chartInstance.update('none');

  if (onCutMarkersChange) {
    onCutMarkersChange(recordIndices);
  }
}

/**
 * Clear all cut markers
 */
export function clearCutMarkers() {
  cutMarkers = [];
  if (chartInstance) {
    chartInstance.update('none');
  }
  if (onCutMarkersChange) {
    onCutMarkersChange([]);
  }
}

/**
 * Get current cut marker record indices
 */
export function getCutMarkerIndices(records) {
  if (!chartInstance) return [];
  const maxPoints = 2000;
  const step = records.length > maxPoints ? Math.ceil(records.length / maxPoints) : 1;
  return cutMarkers.map((ci) => ci * step);
}

/**
 * Destroy the chart instance
 */
export function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  cutMarkers = [];
}
