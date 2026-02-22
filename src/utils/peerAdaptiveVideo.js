const DEFAULT_CHECK_INTERVAL_MS = 3500;
const DEFAULT_LOW_CONSTRAINTS = {
  width: { ideal: 426, max: 640 },
  height: { ideal: 240, max: 360 },
  frameRate: { ideal: 12, max: 15 },
};
const DEFAULT_VERY_LOW_CONSTRAINTS = {
  width: { ideal: 320, max: 426 },
  height: { ideal: 180, max: 240 },
  frameRate: { ideal: 8, max: 10 },
};

const QUALITY_SCORE = {
  good: 0,
  weak: 1,
  "very-poor": 2,
};

const getBrowserConnection = () => {
  try {
    if (typeof navigator === "undefined") return null;
    return (
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection ||
      null
    );
  } catch {
    return null;
  }
};

const toFiniteNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getConnectionApiQuality = () => {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return "very-poor";
    }

    const connection = getBrowserConnection();
    if (!connection) return "good";

    const downlink = toFiniteNumber(connection.downlink);
    const rtt = toFiniteNumber(connection.rtt);
    const effectiveType = String(connection.effectiveType || "").toLowerCase();

    let weak = false;
    let veryPoor = false;

    if (connection.saveData) weak = true;

    if (effectiveType === "slow-2g" || effectiveType === "2g") {
      veryPoor = true;
    } else if (effectiveType === "3g") {
      weak = true;
    }

    if (downlink !== null) {
      if (downlink <= 0.35) {
        veryPoor = true;
      } else if (downlink <= 1) {
        weak = true;
      }
    }

    if (rtt !== null) {
      if (rtt >= 1200) {
        veryPoor = true;
      } else if (rtt >= 450) {
        weak = true;
      }
    }

    if (veryPoor) return "very-poor";
    if (weak) return "weak";
    return "good";
  } catch {
    return "good";
  }
};

const normalizePeerConnections = (value) => {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];

  return list
    .map((item) => {
      if (!item) return null;
      if (typeof item.getStats === "function") return item;
      if (item.peerConnection && typeof item.peerConnection.getStats === "function") {
        return item.peerConnection;
      }
      if (item._pc && typeof item._pc.getStats === "function") {
        return item._pc;
      }
      return null;
    })
    .filter(Boolean);
};

const getStatsQuality = async (peerConnections) => {
  if (!peerConnections || peerConnections.length === 0) return "good";

  let highestRttMs = 0;
  let highestLossRatio = 0;

  for (const pc of peerConnections) {
    if (!pc || typeof pc.getStats !== "function") continue;

    let stats;
    try {
      stats = await pc.getStats();
    } catch {
      continue;
    }
    if (!stats) continue;

    stats.forEach((report) => {
      if (!report || typeof report !== "object") return;

      if (report.type === "candidate-pair" && report.state === "succeeded") {
        const rttSeconds = toFiniteNumber(report.currentRoundTripTime);
        if (rttSeconds !== null) {
          highestRttMs = Math.max(highestRttMs, rttSeconds * 1000);
        }
      }

      // For locally-sent outbound video, many browsers expose loss stats in remote-inbound-rtp.
      if (report.type === "remote-inbound-rtp" && report.kind === "video") {
        const fractionLost = toFiniteNumber(report.fractionLost);
        if (fractionLost !== null) {
          highestLossRatio = Math.max(highestLossRatio, fractionLost);
          return;
        }

        const packetsLost = toFiniteNumber(report.packetsLost);
        const packetsReceived = toFiniteNumber(report.packetsReceived);
        if (
          packetsLost !== null &&
          packetsReceived !== null &&
          packetsLost >= 0 &&
          packetsReceived >= 0
        ) {
          const total = packetsLost + packetsReceived;
          if (total > 0) {
            highestLossRatio = Math.max(highestLossRatio, packetsLost / total);
          }
        }
      }
    });
  }

  if (highestRttMs >= 1200 || highestLossRatio >= 0.2) return "very-poor";
  if (highestRttMs >= 450 || highestLossRatio >= 0.08) return "weak";
  return "good";
};

const pickWorstQuality = (left, right) =>
  QUALITY_SCORE[left] >= QUALITY_SCORE[right] ? left : right;

const buildRestoreConstraints = (track, originalConstraints) => {
  const restore = {};

  if (originalConstraints && typeof originalConstraints === "object") {
    if (typeof originalConstraints.width !== "undefined") {
      restore.width = originalConstraints.width;
    }
    if (typeof originalConstraints.height !== "undefined") {
      restore.height = originalConstraints.height;
    }
    if (typeof originalConstraints.frameRate !== "undefined") {
      restore.frameRate = originalConstraints.frameRate;
    }
  }

  try {
    const settings =
      track && typeof track.getSettings === "function" ? track.getSettings() : null;
    if (settings && typeof settings === "object") {
      if (typeof restore.width === "undefined" && Number.isFinite(settings.width)) {
        restore.width = settings.width;
      }
      if (typeof restore.height === "undefined" && Number.isFinite(settings.height)) {
        restore.height = settings.height;
      }
      if (
        typeof restore.frameRate === "undefined" &&
        Number.isFinite(settings.frameRate)
      ) {
        restore.frameRate = settings.frameRate;
      }
    }
  } catch {
    // noop
  }

  return restore;
};

const applyTrackConstraints = async (track, constraints, label) => {
  if (!track || typeof track.applyConstraints !== "function") return;
  try {
    await track.applyConstraints(constraints);
  } catch (err) {
    console.warn(`[peerAdaptiveVideo] applyConstraints failed (${label}):`, err);
  }
};

export const startAdaptiveVideo = (localStream, options = {}) => {
  const videoTrack =
    localStream && typeof localStream.getVideoTracks === "function"
      ? localStream.getVideoTracks()[0]
      : null;

  if (!videoTrack) {
    return {
      stop: () => {},
      getMode: () => "normal",
    };
  }

  const checkIntervalMsRaw = Number(options.checkIntervalMs);
  const checkIntervalMs =
    Number.isFinite(checkIntervalMsRaw) && checkIntervalMsRaw >= 1000
      ? checkIntervalMsRaw
      : DEFAULT_CHECK_INTERVAL_MS;

  const lowConstraints =
    options.lowConstraints && typeof options.lowConstraints === "object"
      ? options.lowConstraints
      : DEFAULT_LOW_CONSTRAINTS;

  const veryLowConstraints =
    options.veryLowConstraints && typeof options.veryLowConstraints === "object"
      ? options.veryLowConstraints
      : DEFAULT_VERY_LOW_CONSTRAINTS;

  const originalConstraints =
    typeof videoTrack.getConstraints === "function"
      ? { ...videoTrack.getConstraints() }
      : {};
  const restoreConstraints = buildRestoreConstraints(videoTrack, originalConstraints);

  let mode = "normal";
  let stopped = false;
  let running = false;
  let intervalId = null;
  let poorStreak = 0;
  let goodStreak = 0;

  const toWeak = async () => {
    if (mode === "weak") return;
    await applyTrackConstraints(videoTrack, lowConstraints, "weak");
    mode = "weak";
  };

  const toVeryPoor = async () => {
    if (mode === "very-poor") return;
    await applyTrackConstraints(videoTrack, veryLowConstraints, "very-poor");
    mode = "very-poor";
  };

  const toGood = async () => {
    if (mode === "normal") return;
    if (Object.keys(restoreConstraints).length > 0) {
      await applyTrackConstraints(videoTrack, restoreConstraints, "restore");
    } else {
      await applyTrackConstraints(videoTrack, {}, "restore-default");
    }
    mode = "normal";
  };

  const runCheck = async () => {
    if (stopped || running) return;
    if (videoTrack.readyState === "ended") {
      stop();
      return;
    }

    running = true;
    try {
      const connectionQuality = getConnectionApiQuality();

      let statsQuality = "good";
      if (typeof options.getPeerConnections === "function") {
        const peerConnections = normalizePeerConnections(options.getPeerConnections());
        statsQuality = await getStatsQuality(peerConnections);
      }

      const quality = pickWorstQuality(connectionQuality, statsQuality);

      if (quality === "very-poor") {
        poorStreak += 1;
        goodStreak = 0;
        await toVeryPoor();
        return;
      }

      if (quality === "weak") {
        poorStreak += 1;
        goodStreak = 0;
        if (poorStreak >= 1) {
          await toWeak();
        }
        return;
      }

      poorStreak = 0;
      goodStreak += 1;
      if (goodStreak >= 2) {
        await toGood();
      }
    } catch (err) {
      console.warn("[peerAdaptiveVideo] adaptive check failed:", err);
    } finally {
      running = false;
    }
  };

  const onNetworkChange = () => {
    void runCheck();
  };

  const connection = getBrowserConnection();
  try {
    if (typeof window !== "undefined") {
      window.addEventListener("online", onNetworkChange);
      window.addEventListener("offline", onNetworkChange);
    }
    if (connection && typeof connection.addEventListener === "function") {
      connection.addEventListener("change", onNetworkChange);
    }
  } catch {
    // noop
  }

  intervalId = window.setInterval(() => {
    void runCheck();
  }, checkIntervalMs);

  void runCheck();

  const stop = () => {
    if (stopped) return;
    stopped = true;

    try {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onNetworkChange);
        window.removeEventListener("offline", onNetworkChange);
      }
    } catch {
      // noop
    }

    try {
      if (connection && typeof connection.removeEventListener === "function") {
        connection.removeEventListener("change", onNetworkChange);
      }
    } catch {
      // noop
    }

    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };

  return {
    stop,
    getMode: () => mode,
  };
};

