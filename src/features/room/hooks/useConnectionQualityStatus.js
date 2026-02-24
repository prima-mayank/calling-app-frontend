import { useEffect, useMemo, useRef, useState } from "react";

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

const buildDetails = ({ rttMs, lossRatio, effectiveType, downlinkMbps }) => {
  const parts = [];

  if (Number.isFinite(rttMs)) {
    parts.push(`RTT ${Math.round(rttMs)}ms`);
  }
  if (Number.isFinite(lossRatio)) {
    parts.push(`Loss ${Math.round(lossRatio * 100)}%`);
  }
  if (effectiveType) {
    parts.push(`Type ${effectiveType}`);
  }
  if (Number.isFinite(downlinkMbps)) {
    parts.push(`Downlink ${downlinkMbps.toFixed(1)}Mbps`);
  }

  return parts.join(" | ");
};

const scoreToStatus = (score) => {
  if (score >= 85) return { label: "Excellent", tone: "excellent" };
  if (score >= 70) return { label: "Good", tone: "good" };
  if (score >= 50) return { label: "Fair", tone: "fair" };
  if (score >= 30) return { label: "Poor", tone: "poor" };
  return { label: "Unstable", tone: "bad" };
};

const summarizePeerStats = async (peerConnections) => {
  if (!peerConnections.length) return { rttMs: null, lossRatio: null };

  let highestRttMs = null;
  let highestLossRatio = null;

  for (const pc of peerConnections) {
    if (!pc || typeof pc.getStats !== "function") continue;

    try {
      const stats = await pc.getStats();
      if (!stats) continue;

      stats.forEach((report) => {
        if (!report || typeof report !== "object") return;

        if (report.type === "candidate-pair" && report.state === "succeeded") {
          const rttSeconds = toFiniteNumber(report.currentRoundTripTime);
          if (rttSeconds === null) return;
          const rttMs = rttSeconds * 1000;
          highestRttMs = highestRttMs === null ? rttMs : Math.max(highestRttMs, rttMs);
          return;
        }

        if (report.type !== "remote-inbound-rtp" || report.kind !== "video") return;

        const fractionLost = toFiniteNumber(report.fractionLost);
        if (fractionLost !== null) {
          const normalized = Math.max(0, Math.min(1, fractionLost));
          highestLossRatio =
            highestLossRatio === null ? normalized : Math.max(highestLossRatio, normalized);
          return;
        }

        const packetsLost = toFiniteNumber(report.packetsLost);
        const packetsReceived = toFiniteNumber(report.packetsReceived);
        if (
          packetsLost === null ||
          packetsReceived === null ||
          packetsLost < 0 ||
          packetsReceived < 0
        ) {
          return;
        }

        const totalPackets = packetsLost + packetsReceived;
        if (totalPackets <= 0) return;

        const ratio = packetsLost / totalPackets;
        highestLossRatio = highestLossRatio === null ? ratio : Math.max(highestLossRatio, ratio);
      });
    } catch {
      // ignore transient stats failures
    }
  }

  return { rttMs: highestRttMs, lossRatio: highestLossRatio };
};

export const useConnectionQualityStatus = ({
  browserOnline,
  socketConnected,
  getPeerConnections,
  checkIntervalMs = 2500,
}) => {
  const [status, setStatus] = useState({
    label: browserOnline ? (socketConnected ? "Checking" : "Reconnecting") : "Offline",
    tone: browserOnline ? (socketConnected ? "checking" : "reconnecting") : "offline",
    detail: "",
  });

  const intervalMs = useMemo(() => {
    const value = Number(checkIntervalMs);
    if (!Number.isFinite(value) || value < 1000) return 2500;
    return value;
  }, [checkIntervalMs]);

  const mountedRef = useRef(false);
  const runningRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const runCheck = async () => {
      if (!mountedRef.current || runningRef.current) return;
      runningRef.current = true;

      try {
        if (!browserOnline) {
          if (mountedRef.current) {
            setStatus({
              label: "Offline",
              tone: "offline",
              detail: "No internet connection detected.",
            });
          }
          return;
        }

        if (!socketConnected) {
          if (mountedRef.current) {
            setStatus({
              label: "Reconnecting",
              tone: "reconnecting",
              detail: "Trying to restore realtime signaling.",
            });
          }
          return;
        }

        const connection = getBrowserConnection();
        const effectiveType = String(connection?.effectiveType || "").toLowerCase();
        const downlinkMbps = toFiniteNumber(connection?.downlink);
        const browserRtt = toFiniteNumber(connection?.rtt);

        let score = 100;
        if (connection?.saveData) {
          score -= 20;
        }
        if (effectiveType === "slow-2g" || effectiveType === "2g") {
          score -= 45;
        } else if (effectiveType === "3g") {
          score -= 20;
        }
        if (Number.isFinite(downlinkMbps)) {
          if (downlinkMbps < 1) {
            score -= 30;
          } else if (downlinkMbps < 2.5) {
            score -= 15;
          }
        }
        if (Number.isFinite(browserRtt)) {
          if (browserRtt > 700) {
            score -= 35;
          } else if (browserRtt > 450) {
            score -= 22;
          } else if (browserRtt > 250) {
            score -= 10;
          }
        }

        let peerConnections = [];
        if (typeof getPeerConnections === "function") {
          try {
            peerConnections = normalizePeerConnections(getPeerConnections());
          } catch {
            peerConnections = [];
          }
        }

        const { rttMs, lossRatio } = await summarizePeerStats(peerConnections);

        if (Number.isFinite(rttMs)) {
          if (rttMs > 900) {
            score -= 40;
          } else if (rttMs > 650) {
            score -= 28;
          } else if (rttMs > 420) {
            score -= 16;
          }
        }

        if (Number.isFinite(lossRatio)) {
          if (lossRatio >= 0.18) {
            score -= 45;
          } else if (lossRatio >= 0.1) {
            score -= 28;
          } else if (lossRatio >= 0.05) {
            score -= 15;
          }
        }

        score = Math.max(0, Math.min(100, score));
        const quality = scoreToStatus(score);
        const detail = buildDetails({
          rttMs,
          lossRatio,
          effectiveType: effectiveType || "",
          downlinkMbps,
        });

        if (mountedRef.current) {
          setStatus({
            label: quality.label,
            tone: quality.tone,
            detail,
          });
        }
      } finally {
        runningRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void runCheck();
    }, intervalMs);

    void runCheck();

    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [browserOnline, getPeerConnections, intervalMs, socketConnected]);

  return status;
};
