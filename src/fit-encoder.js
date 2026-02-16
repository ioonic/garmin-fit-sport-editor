import { Encoder, Profile, Utils } from '@garmin/fitsdk';

/**
 * Re-encodes a FIT file with multiple sessions based on user-defined segments.
 *
 * @param {Object} parsedData - Data from decodeFitFile()
 * @param {Array} segments - Array of { startRecordIndex, endRecordIndex, sport }
 * @param {ArrayBuffer} originalArrayBuffer - Original FIT file bytes for raw re-decode
 * @returns {Uint8Array} Encoded FIT file bytes
 */
export function encodeFitFile(parsedData, segments) {
  const { rawOrderedMessages, records } = parsedData;

  const encoder = new Encoder();

  // 1. Write FILE_ID message
  const fileIdMsg = findMessage(rawOrderedMessages, Profile.MesgNum.FILE_ID);
  if (fileIdMsg) {
    encoder.onMesg(Profile.MesgNum.FILE_ID, {
      ...fileIdMsg.data,
      type: 'activity',
    });
  } else {
    encoder.onMesg(Profile.MesgNum.FILE_ID, {
      type: 'activity',
      manufacturer: 'garmin',
      product: 0,
      timeCreated: getTimestamp(records[0]?.timestamp),
      serialNumber: 12345,
    });
  }

  // 2. Write DEVICE_INFO messages (all of them)
  const deviceInfoMsgs = findAllMessages(rawOrderedMessages, Profile.MesgNum.DEVICE_INFO);
  for (const dim of deviceInfoMsgs) {
    encoder.onMesg(Profile.MesgNum.DEVICE_INFO, dim.data);
  }

  // 3. Write SPORT messages for each segment
  // (some files have sport messages, some don't)

  // 4. Process each segment
  let totalLapIndex = 0;

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segment = segments[segIdx];
    const segRecords = records.slice(segment.startRecordIndex, segment.endRecordIndex + 1);

    if (segRecords.length === 0) continue;

    const segStart = segRecords[0].timestamp;
    const segEnd = segRecords[segRecords.length - 1].timestamp;
    const segStartTs = getTimestamp(segStart);
    const segEndTs = getTimestamp(segEnd);

    // Find raw record messages for this segment's time range
    const rawRecordsInSegment = getRawRecordsInRange(
      rawOrderedMessages,
      segment.startRecordIndex,
      segment.endRecordIndex
    );

    // Timer start event
    encoder.onMesg(Profile.MesgNum.EVENT, {
      timestamp: segStartTs,
      event: 'timer',
      eventType: 'start',
    });

    // Write all record messages for this segment
    for (const rawRec of rawRecordsInSegment) {
      encoder.onMesg(Profile.MesgNum.RECORD, rawRec.data);
    }

    // Timer stop event
    encoder.onMesg(Profile.MesgNum.EVENT, {
      timestamp: segEndTs,
      event: 'timer',
      eventType: 'stopAll',
    });

    // Calculate segment stats
    const stats = computeSegmentStats(segRecords);

    // Write LAP message for this segment
    encoder.onMesg(Profile.MesgNum.LAP, {
      messageIndex: totalLapIndex,
      timestamp: segEndTs,
      startTime: segStartTs,
      totalElapsedTime: stats.elapsedTime,
      totalTimerTime: stats.elapsedTime,
      totalDistance: stats.totalDistance,
      sport: segment.sport,
      subSport: 'generic',
      avgHeartRate: stats.avgHeartRate,
      maxHeartRate: stats.maxHeartRate,
      avgSpeed: stats.avgSpeed,
      maxSpeed: stats.maxSpeed,
      avgCadence: stats.avgCadence,
      avgPower: stats.avgPower,
      enhancedAvgSpeed: stats.avgSpeed,
      enhancedMaxSpeed: stats.maxSpeed,
    });

    totalLapIndex++;

    // Write SESSION message for this segment
    encoder.onMesg(Profile.MesgNum.SESSION, {
      messageIndex: segIdx,
      timestamp: segEndTs,
      startTime: segStartTs,
      totalElapsedTime: stats.elapsedTime,
      totalTimerTime: stats.elapsedTime,
      totalDistance: stats.totalDistance,
      sport: segment.sport,
      subSport: 'generic',
      firstLapIndex: segIdx,
      numLaps: 1,
      avgHeartRate: stats.avgHeartRate,
      maxHeartRate: stats.maxHeartRate,
      avgSpeed: stats.avgSpeed,
      maxSpeed: stats.maxSpeed,
      avgCadence: stats.avgCadence,
      avgPower: stats.avgPower,
      enhancedAvgSpeed: stats.avgSpeed,
      enhancedMaxSpeed: stats.maxSpeed,
      totalCalories: stats.totalCalories,
    });
  }

  // 5. Write ACTIVITY message
  const firstRecord = records[0];
  const lastRecord = records[records.length - 1];
  const totalElapsedTime =
    (lastRecord.timestamp.getTime() - firstRecord.timestamp.getTime()) / 1000;

  const activityTimestamp = getTimestamp(lastRecord.timestamp);

  // Calculate local timestamp offset
  const localOffset = lastRecord.timestamp.getTimezoneOffset() * -60;

  encoder.onMesg(Profile.MesgNum.ACTIVITY, {
    timestamp: activityTimestamp,
    numSessions: segments.length,
    totalTimerTime: totalElapsedTime,
    localTimestamp: activityTimestamp + localOffset,
  });

  // Close encoder and return bytes
  return encoder.close();
}

/**
 * Find the first message with the given mesgNum
 */
function findMessage(orderedMessages, mesgNum) {
  return orderedMessages.find((m) => m.mesgNum === mesgNum);
}

/**
 * Find all messages with the given mesgNum
 */
function findAllMessages(orderedMessages, mesgNum) {
  return orderedMessages.filter((m) => m.mesgNum === mesgNum);
}

/**
 * Get raw record messages for a given index range.
 * We track record indices separately since orderedMessages may contain
 * other message types interleaved.
 */
function getRawRecordsInRange(orderedMessages, startIdx, endIdx) {
  let recordIdx = 0;
  const result = [];

  for (const msg of orderedMessages) {
    if (msg.mesgNum === Profile.MesgNum.RECORD) {
      if (recordIdx >= startIdx && recordIdx <= endIdx) {
        result.push(msg);
      }
      recordIdx++;
      if (recordIdx > endIdx) break;
    }
  }

  return result;
}

/**
 * Get event messages within a time range
 */
function getRawEventsInRange(orderedMessages, startTime, endTime) {
  const startMs = startTime.getTime();
  const endMs = endTime.getTime();

  return orderedMessages.filter((m) => {
    if (m.mesgNum !== Profile.MesgNum.EVENT) return false;
    const ts = m.data.timestamp;
    if (!ts) return false;
    // Handle both Date objects and FIT timestamps
    const msTime = ts instanceof Date ? ts.getTime() : ts * 1000 + Utils.FIT_EPOCH_MS;
    return msTime >= startMs && msTime <= endMs;
  });
}

/**
 * Compute statistics for a segment of records
 */
function computeSegmentStats(segRecords) {
  if (segRecords.length === 0) {
    return {
      elapsedTime: 0,
      totalDistance: 0,
      avgHeartRate: null,
      maxHeartRate: null,
      avgSpeed: null,
      maxSpeed: null,
      avgCadence: null,
      avgPower: null,
      totalCalories: 0,
    };
  }

  const first = segRecords[0];
  const last = segRecords[segRecords.length - 1];
  const elapsedTime = (last.timestamp.getTime() - first.timestamp.getTime()) / 1000;

  const firstDist = first.distance ?? 0;
  const lastDist = last.distance ?? 0;
  const totalDistance = lastDist - firstDist;

  let hrSum = 0, hrCount = 0, maxHr = 0;
  let speedSum = 0, speedCount = 0, maxSpeed = 0;
  let cadenceSum = 0, cadenceCount = 0;
  let powerSum = 0, powerCount = 0;

  for (const r of segRecords) {
    if (r.heartRate != null) {
      hrSum += r.heartRate;
      hrCount++;
      maxHr = Math.max(maxHr, r.heartRate);
    }
    if (r.speed != null) {
      speedSum += r.speed;
      speedCount++;
      maxSpeed = Math.max(maxSpeed, r.speed);
    }
    if (r.cadence != null) {
      cadenceSum += r.cadence;
      cadenceCount++;
    }
    if (r.power != null) {
      powerSum += r.power;
      powerCount++;
    }
  }

  return {
    elapsedTime,
    totalDistance: totalDistance > 0 ? totalDistance : 0,
    avgHeartRate: hrCount > 0 ? Math.round(hrSum / hrCount) : null,
    maxHeartRate: maxHr > 0 ? maxHr : null,
    avgSpeed: speedCount > 0 ? speedSum / speedCount : null,
    maxSpeed: maxSpeed > 0 ? maxSpeed : null,
    avgCadence: cadenceCount > 0 ? Math.round(cadenceSum / cadenceCount) : null,
    avgPower: powerCount > 0 ? Math.round(powerSum / powerCount) : null,
    totalCalories: 0,
  };
}

/**
 * Convert a Date or FIT timestamp value for the encoder.
 * The encoder expects FIT epoch integers when convertDateTimesToDates was false,
 * or Date objects when it was true.
 * Since our rawOrderedMessages were decoded with convertDateTimesToDates: false,
 * we convert Dates to FIT epoch.
 */
function getTimestamp(dateOrValue) {
  if (dateOrValue instanceof Date) {
    return Math.round((dateOrValue.getTime() - Utils.FIT_EPOCH_MS) / 1000);
  }
  return dateOrValue;
}
