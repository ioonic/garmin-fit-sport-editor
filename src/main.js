import './styles.css';
import { decodeFitFile, formatDuration, formatDistance, formatSpeed, SPORT_TYPES } from './fit-parser.js';
import { createSpeedChart, setCutMarkers, clearCutMarkers, destroyChart } from './chart.js';
import { encodeFitFile } from './fit-encoder.js';

// ===== State =====
let parsedData = null;
let currentSegments = []; // Array of { startRecordIndex, endRecordIndex, sport }

// ===== DOM Elements =====
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadSection = document.getElementById('upload-section');
const editorSection = document.getElementById('editor-section');
const loadingEl = document.getElementById('loading');
const segmentsBody = document.getElementById('segments-body');
const btnDownload = document.getElementById('btn-download');
const btnReset = document.getElementById('btn-reset');
const btnNewFile = document.getElementById('btn-new-file');

// Summary elements
const summarySport = document.getElementById('summary-sport');
const summaryDuration = document.getElementById('summary-duration');
const summaryDistance = document.getElementById('summary-distance');
const summaryHr = document.getElementById('summary-hr');

// ===== File Upload =====
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.fit')) {
    alert('Por favor selecciona un archivo .FIT');
    return;
  }

  showLoading(true);

  try {
    const arrayBuffer = await file.arrayBuffer();
    parsedData = decodeFitFile(arrayBuffer);

    showSummary(parsedData.summary);

    // Create chart
    createSpeedChart('speed-chart', parsedData.records, onCutMarkersChange);

    // Initialize with one full segment
    resetSegments();

    showEditor(true);
  } catch (err) {
    console.error('Error al decodificar el archivo FIT:', err);
    alert('Error al decodificar el archivo: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// ===== UI Show/Hide =====
function showLoading(show) {
  loadingEl.classList.toggle('hidden', !show);
  if (show) {
    uploadSection.classList.add('hidden');
  }
}

function showEditor(show) {
  editorSection.classList.toggle('hidden', !show);
  uploadSection.classList.toggle('hidden', show);
  loadingEl.classList.add('hidden');
}

// ===== Summary =====
function showSummary(summary) {
  const sportLabel = SPORT_TYPES.find((s) => s.value === summary.sport)?.label ?? summary.sport;
  summarySport.textContent = sportLabel;
  summaryDuration.textContent = formatDuration(summary.totalDurationSec);
  summaryDistance.textContent = formatDistance(summary.totalDistance);
  summaryHr.textContent = summary.avgHeartRate ? `${summary.avgHeartRate} bpm` : '-';
}

// ===== Segments =====
function onCutMarkersChange(recordIndices) {
  if (!parsedData) return;
  buildSegmentsFromCuts(recordIndices);
  renderSegmentsTable();
}

function buildSegmentsFromCuts(cutRecordIndices) {
  const records = parsedData.records;
  const totalRecords = records.length;
  const cuts = [0, ...cutRecordIndices, totalRecords - 1];

  // Save old segments to try to preserve sport selections
  const oldSegments = [...currentSegments];

  currentSegments = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const startIdx = i === 0 ? cuts[i] : cuts[i];
    const endIdx = i === cuts.length - 2 ? cuts[i + 1] : cuts[i + 1] - 1;

    // Guess sport type based on average speed
    const segRecords = records.slice(startIdx, endIdx + 1);
    const avgSpeed = computeAvgSpeed(segRecords);
    let guessedSport = 'running';
    if (avgSpeed > 20) {
      guessedSport = 'cycling';
    } else if (avgSpeed < 3) {
      guessedSport = 'transition';
    }

    // If we have old segments with user selections, try to preserve them
    if (oldSegments.length > 0 && i < oldSegments.length) {
      guessedSport = oldSegments[i].sport;
    }

    currentSegments.push({
      startRecordIndex: startIdx,
      endRecordIndex: endIdx,
      sport: guessedSport,
    });
  }
}

function computeAvgSpeed(segRecords) {
  let sum = 0, count = 0;
  for (const r of segRecords) {
    if (r.speed != null) {
      sum += r.speed * 3.6; // km/h
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function renderSegmentsTable() {
  const records = parsedData.records;
  segmentsBody.innerHTML = '';

  currentSegments.forEach((seg, idx) => {
    const segRecords = records.slice(seg.startRecordIndex, seg.endRecordIndex + 1);
    const first = segRecords[0];
    const last = segRecords[segRecords.length - 1];

    const duration = first && last
      ? (last.timestamp.getTime() - first.timestamp.getTime()) / 1000
      : 0;

    const distance = first && last && last.distance != null && first.distance != null
      ? last.distance - first.distance
      : 0;

    const startTimeStr = first?.timestamp ? formatTime(first.timestamp) : '-';
    const endTimeStr = last?.timestamp ? formatTime(last.timestamp) : '-';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${idx + 1}</strong></td>
      <td>${startTimeStr}</td>
      <td>${endTimeStr}</td>
      <td>${formatDuration(duration)}</td>
      <td>${formatDistance(distance)}</td>
      <td>
        <select data-segment="${idx}">
          ${SPORT_TYPES.map(
            (s) =>
              `<option value="${s.value}" ${s.value === seg.sport ? 'selected' : ''}>${s.label}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        ${currentSegments.length > 1
          ? `<button class="btn-icon btn-remove-segment" data-segment="${idx}" title="Eliminar corte">✕</button>`
          : ''
        }
      </td>
    `;

    segmentsBody.appendChild(tr);
  });

  // Bind sport change events
  segmentsBody.querySelectorAll('select').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const segIdx = parseInt(e.target.dataset.segment);
      currentSegments[segIdx].sport = e.target.value;
    });
  });

  // Bind remove buttons
  segmentsBody.querySelectorAll('.btn-remove-segment').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const segIdx = parseInt(e.target.dataset.segment);
      removeSegmentCut(segIdx);
    });
  });

  // Enable/disable download button
  btnDownload.disabled = currentSegments.length < 2;
}

function removeSegmentCut(segIdx) {
  if (currentSegments.length <= 1) return;

  // Merge with next segment (or previous if last)
  if (segIdx < currentSegments.length - 1) {
    currentSegments[segIdx + 1].startRecordIndex = currentSegments[segIdx].startRecordIndex;
    currentSegments.splice(segIdx, 1);
  } else {
    currentSegments[segIdx - 1].endRecordIndex = currentSegments[segIdx].endRecordIndex;
    currentSegments.splice(segIdx, 1);
  }

  // Update chart markers
  const cutIndices = currentSegments.slice(1).map((s) => s.startRecordIndex);
  setCutMarkers(cutIndices, parsedData.records);

  renderSegmentsTable();
}

function resetSegments() {
  clearCutMarkers();
  currentSegments = [
    {
      startRecordIndex: 0,
      endRecordIndex: parsedData.records.length - 1,
      sport: parsedData.summary.sport || 'running',
    },
  ];
  renderSegmentsTable();
}

// ===== Presets =====
document.querySelectorAll('.btn-preset').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const preset = e.target.dataset.preset;
    applyPreset(preset);
  });
});

function applyPreset(preset) {
  if (!parsedData) return;

  const records = parsedData.records;
  const totalRecords = records.length;

  // Find approximate split points based on speed changes
  const speedProfile = computeSpeedProfile(records);
  const splits = findSpeedTransitions(speedProfile, preset === 'triathlon' ? 2 : 2);

  if (splits.length < 2) {
    // Fallback: split evenly
    const third = Math.floor(totalRecords / 3);
    splits.length = 0;
    splits.push(third, third * 2);
  }

  const sportSequence = preset === 'triathlon'
    ? ['swimming', 'cycling', 'running']
    : ['running', 'cycling', 'running'];

  // Build segments
  const cuts = [0, ...splits, totalRecords - 1];
  currentSegments = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    currentSegments.push({
      startRecordIndex: i === 0 ? cuts[i] : cuts[i],
      endRecordIndex: i === cuts.length - 2 ? cuts[i + 1] : cuts[i + 1] - 1,
      sport: sportSequence[i] || 'generic',
    });
  }

  // Update chart
  setCutMarkers(splits, records);
  renderSegmentsTable();
}

/**
 * Compute smoothed speed profile for transition detection
 */
function computeSpeedProfile(records) {
  const windowSize = Math.max(10, Math.floor(records.length / 100));
  const profile = [];

  for (let i = 0; i < records.length; i++) {
    let sum = 0, count = 0;
    const start = Math.max(0, i - windowSize);
    const end = Math.min(records.length - 1, i + windowSize);

    for (let j = start; j <= end; j++) {
      if (records[j].speed != null) {
        sum += records[j].speed * 3.6;
        count++;
      }
    }

    profile.push(count > 0 ? sum / count : 0);
  }

  return profile;
}

/**
 * Find speed transitions in profile (where speed changes significantly)
 */
function findSpeedTransitions(profile, numSplits) {
  if (profile.length < 100) return [];

  // Calculate derivative of speed
  const derivative = [];
  const windowSize = Math.max(5, Math.floor(profile.length / 200));

  for (let i = 0; i < profile.length; i++) {
    const prev = Math.max(0, i - windowSize);
    const next = Math.min(profile.length - 1, i + windowSize);
    derivative.push(Math.abs(profile[next] - profile[prev]));
  }

  // Find peaks in derivative (transition points)
  const minGap = Math.floor(profile.length * 0.15); // Minimum gap between splits
  const peaks = [];

  // Smooth the derivative further
  const smoothDeriv = [];
  const sw = Math.max(5, Math.floor(profile.length / 50));
  for (let i = 0; i < derivative.length; i++) {
    let sum = 0;
    const s = Math.max(0, i - sw);
    const e = Math.min(derivative.length - 1, i + sw);
    for (let j = s; j <= e; j++) sum += derivative[j];
    smoothDeriv.push(sum / (e - s + 1));
  }

  // Find top N peaks
  const candidates = smoothDeriv
    .map((v, i) => ({ index: i, value: v }))
    .filter((c) => c.index > minGap && c.index < profile.length - minGap)
    .sort((a, b) => b.value - a.value);

  for (const candidate of candidates) {
    if (peaks.length >= numSplits) break;
    const tooClose = peaks.some((p) => Math.abs(p - candidate.index) < minGap);
    if (!tooClose) {
      peaks.push(candidate.index);
    }
  }

  return peaks.sort((a, b) => a - b);
}

// ===== Download =====
btnDownload.addEventListener('click', () => {
  if (!parsedData || currentSegments.length < 2) {
    alert('Necesitas al menos 2 segmentos para modificar el archivo.');
    return;
  }

  try {
    const encoded = encodeFitFile(parsedData, currentSegments);

    const blob = new Blob([encoded], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'actividad_modificada.fit';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error al codificar el archivo FIT:', err);
    alert('Error al generar el archivo: ' + err.message);
  }
});

// ===== Reset =====
btnReset.addEventListener('click', () => {
  resetSegments();
});

// ===== New File =====
btnNewFile.addEventListener('click', () => {
  destroyChart();
  parsedData = null;
  currentSegments = [];
  fileInput.value = '';
  showEditor(false);
  uploadSection.classList.remove('hidden');
});

// ===== Helpers =====
function formatTime(date) {
  if (!(date instanceof Date)) return '-';
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
