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

const isPoorByConnectionApi = () => {
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return true;
    }

    const connection = getBrowserConnection();
    if (!connection) return false;

    const downlink = toFiniteNumber(connection.downlink);
    const rtt = toFiniteNumber(connection.rtt);
    const effectiveType = String(connection.effectiveType || "").toLowerCase();

    if (connection.saveData) return true;
    if (effectiveType === "slow-2g" || effectiveType === "2g") return true;
    if (downlink !== null && downlink <= 0.9) return true;
    if (rtt !== null && rtt >= 600) return true;

    return false;
  } catch {
    return false;
  }
};

const isPoorByPeerStats = async (peerConnections) => {
  if (!peerConnections || peerConnections.length === 0) return false;

  try {
    let poorDetected = false;

    for (const pc of peerConnections) {
      if (!pc || typeof pc.getStats !== "function") continue;
      const stats = await pc.getStats();
      if (!stats) continue;

      let highestRtt = 0;
      let highestLossRatio = 0;

      stats.forEach((report) => {
        if (!report || typeof report !== "object") return;

        if (report.type === "candidate-pair" && report.state === "succeeded") {
          const rtt = toFiniteNumber(report.currentRoundTripTime);
          if (rtt !== null) {
            highestRtt = Math.max(highestRtt, rtt);
          }
        }

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

      if (highestRtt >= 0.8 || highestLossRatio >= 0.15) {
        poorDetected = true;
      }

      if (poorDetected) break;
    }

    return poorDetected;
  } catch (err) {
    console.warn("[LowNetworkWarning] stats check failed:", err);
    return false;
  }
};

export default function LowNetworkWarning({
  getPeerConnections,
  checkIntervalMs = 2000,
  poorForMs = 4000,
}) {
  const [visible, setVisible] = useState(false);
  const poorSinceRef = useRef(0);
  const mountedRef = useRef(false);
  const runningCheckRef = useRef(false);

  const intervalMs = useMemo(() => {
    const value = Number(checkIntervalMs);
    if (!Number.isFinite(value) || value < 500) return 2000;
    return value;
  }, [checkIntervalMs]);

  const requiredPoorMs = useMemo(() => {
    const value = Number(poorForMs);
    if (!Number.isFinite(value) || value < 1000) return 4000;
    return value;
  }, [poorForMs]);

  useEffect(() => {
    mountedRef.current = true;

    const checkNetwork = async () => {
      if (!mountedRef.current || runningCheckRef.current) return;
      runningCheckRef.current = true;

      try {
        const poorByConnection = isPoorByConnectionApi();

        let poorByStats = false;
        if (typeof getPeerConnections === "function") {
          let resolvedConnections = [];
          try {
            resolvedConnections = normalizePeerConnections(getPeerConnections());
          } catch {
            resolvedConnections = [];
          }
          poorByStats = await isPoorByPeerStats(resolvedConnections);
        }

        const now = Date.now();
        const isPoor = poorByConnection || poorByStats;

        if (isPoor) {
          if (!poorSinceRef.current) {
            poorSinceRef.current = now;
          }
          if (now - poorSinceRef.current >= requiredPoorMs && mountedRef.current) {
            setVisible(true);
          }
          return;
        }

        poorSinceRef.current = 0;
        if (mountedRef.current) {
          setVisible(false);
        }
      } catch (err) {
        console.warn("[LowNetworkWarning] network check failed:", err);
      } finally {
        runningCheckRef.current = false;
      }
    };

    const onNetworkEvent = () => {
      void checkNetwork();
    };

    const connection = getBrowserConnection();

    try {
      if (typeof window !== "undefined") {
        window.addEventListener("online", onNetworkEvent);
        window.addEventListener("offline", onNetworkEvent);
      }
      if (connection && typeof connection.addEventListener === "function") {
        connection.addEventListener("change", onNetworkEvent);
      }
    } catch {
      // noop
    }

    const intervalId = window.setInterval(() => {
      void checkNetwork();
    }, intervalMs);

    void checkNetwork();

    return () => {
      mountedRef.current = false;

      if (typeof window !== "undefined") {
        window.removeEventListener("online", onNetworkEvent);
        window.removeEventListener("offline", onNetworkEvent);
      }

      try {
        if (connection && typeof connection.removeEventListener === "function") {
          connection.removeEventListener("change", onNetworkEvent);
        }
      } catch {
        // noop
      }

      window.clearInterval(intervalId);
    };
  }, [getPeerConnections, intervalMs, requiredPoorMs]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        padding: "8px 12px",
        borderRadius: 8,
        background: "#b42318",
        color: "#ffffff",
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
      }}
    >
      Low Internet
    </div>
  );
}

