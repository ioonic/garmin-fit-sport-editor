import { Decoder, Stream, Profile } from '@garmin/fitsdk';

/**
 * Decodes a FIT file from an ArrayBuffer and returns structured data
 * for visualization and re-encoding.
 */
export function decodeFitFile(arrayBuffer) {
  const stream = Stream.fromArrayBuffer(arrayBuffer);

  if (!Decoder.isFIT(stream)) {
    throw new Error('El archivo no es un fichero FIT válido.');
  }

  const decoder = new Decoder(stream);
  if (!decoder.checkIntegrity()) {
    console.warn('Advertencia: La integridad del archivo FIT no se pudo verificar. Se intentará decodificar igualmente.');
  }

  // Capture all messages in order for re-encoding
  const orderedMessages = [];
  const onMesg = (messageNumber, message) => {
    orderedMessages.push({
      mesgNum: messageNumber,
      mesgName: Profile.types.mesgNum[messageNumber] || `unknown_${messageNumber}`,
      data: { ...message },
    });
  };

  const { messages, errors } = decoder.read({
    mesgListener: onMesg,
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    includeUnknownData: true,
    mergeHeartRates: true,
  });

  if (errors.length > 0) {
    console.warn('Errores durante la decodificación:', errors);
  }

  // Also decode with raw values for re-encoding
  const rawStream = Stream.fromArrayBuffer(arrayBuffer);
  const rawDecoder = new Decoder(rawStream);
  const rawOrderedMessages = [];
  const onRawMesg = (messageNumber, message) => {
    rawOrderedMessages.push({
      mesgNum: messageNumber,
      data: { ...message },
    });
  };

  rawDecoder.read({
    mesgListener: onRawMesg,
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: false,
    includeUnknownData: true,
    mergeHeartRates: false,
  });

  // Extract records for chart data
  const records = (messages.recordMesgs || []).map((r) => ({
    timestamp: r.timestamp,
    speed: r.enhancedSpeed ?? r.speed ?? null,
    heartRate: r.heartRate ?? null,
    distance: r.distance ?? null,
    positionLat: r.positionLat ?? null,
    positionLong: r.positionLong ?? null,
    cadence: r.cadence ?? null,
    power: r.power ?? null,
    altitude: r.enhancedAltitude ?? r.altitude ?? null,
  }));

  // Extract sessions
  const sessions = (messages.sessionMesgs || []).map((s) => ({
    sport: s.sport ?? 'unknown',
    subSport: s.subSport ?? 'generic',
    startTime: s.startTime,
    timestamp: s.timestamp,
    totalElapsedTime: s.totalElapsedTime ?? 0,
    totalTimerTime: s.totalTimerTime ?? 0,
    totalDistance: s.totalDistance ?? 0,
    avgHeartRate: s.avgHeartRate ?? null,
    avgSpeed: s.enhancedAvgSpeed ?? s.avgSpeed ?? null,
  }));

  // Extract laps
  const laps = (messages.lapMesgs || []).map((l) => ({
    startTime: l.startTime,
    timestamp: l.timestamp,
    totalElapsedTime: l.totalElapsedTime ?? 0,
    totalTimerTime: l.totalTimerTime ?? 0,
    totalDistance: l.totalDistance ?? 0,
    sport: l.sport ?? null,
  }));

  // Compute overall summary
  const firstRecord = records[0];
  const lastRecord = records[records.length - 1];
  const totalDurationSec = sessions.reduce((sum, s) => sum + s.totalElapsedTime, 0);
  const totalDistance = sessions.reduce((sum, s) => sum + s.totalDistance, 0);
  const avgHr = sessions[0]?.avgHeartRate ?? null;
  const originalSport = sessions[0]?.sport ?? 'unknown';

  return {
    records,
    sessions,
    laps,
    summary: {
      sport: originalSport,
      totalDurationSec,
      totalDistance,
      avgHeartRate: avgHr,
      startTime: firstRecord?.timestamp ?? null,
      endTime: lastRecord?.timestamp ?? null,
    },
    rawOrderedMessages,
    messages,
  };
}

/**
 * Formats seconds into HH:MM:SS
 */
export function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Formats distance in meters to km with 2 decimals
 */
export function formatDistance(meters) {
  if (meters == null) return '-';
  return (meters / 1000).toFixed(2) + ' km';
}

/**
 * Formats speed from m/s to km/h
 */
export function formatSpeed(mps) {
  if (mps == null) return null;
  return (mps * 3.6).toFixed(1);
}

/**
 * Available sport types for the user to select
 */
export const SPORT_TYPES = [
  { value: 'running', label: 'Carrera' },
  { value: 'cycling', label: 'Ciclismo' },
  { value: 'transition', label: 'Transición' },
  { value: 'swimming', label: 'Natación' },
  { value: 'walking', label: 'Caminata' },
  { value: 'hiking', label: 'Senderismo' },
  { value: 'generic', label: 'Genérico' },
];
