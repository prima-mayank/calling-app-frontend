export const shouldInitiateCall = (localPeerId, remotePeerId) => {
  if (!localPeerId || !remotePeerId) return false;
  return localPeerId.localeCompare(remotePeerId) < 0;
};

export const isCallHealthy = (call) => {
  if (!call || typeof call !== "object") return false;
  if (call.open === false) return false;

  const pc = call.peerConnection || call._pc || null;
  if (!pc) return true;

  const state = String(pc.connectionState || "").toLowerCase();
  const iceState = String(pc.iceConnectionState || "").toLowerCase();
  const closedStates = new Set(["closed", "failed", "disconnected"]);

  if (closedStates.has(state)) return false;
  if (!state && closedStates.has(iceState)) return false;
  return true;
};

export const isPeerReadyForCalls = (peer) => {
  if (!peer || typeof peer !== "object") return false;
  if (peer.destroyed) return false;
  if (peer.disconnected) return false;
  if (peer.open !== true) return false;
  return !!String(peer.id || "").trim();
};
