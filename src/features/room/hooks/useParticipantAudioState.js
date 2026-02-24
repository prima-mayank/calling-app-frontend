import { useCallback, useMemo, useState } from "react";

const normalizePeerId = (value) => String(value || "").trim();

export const useParticipantAudioState = (peerIds = []) => {
  const [mutedByPeerId, setMutedByPeerId] = useState({});

  const activePeerSet = useMemo(() => {
    return new Set(
      (Array.isArray(peerIds) ? peerIds : [])
        .map((peerId) => normalizePeerId(peerId))
        .filter(Boolean)
    );
  }, [peerIds]);

  const isPeerMuted = useCallback(
    (peerId) => {
      const normalizedPeerId = normalizePeerId(peerId);
      if (!normalizedPeerId) return false;
      if (!activePeerSet.has(normalizedPeerId)) return false;
      return !!mutedByPeerId[normalizedPeerId];
    },
    [activePeerSet, mutedByPeerId]
  );

  const togglePeerMuted = useCallback((peerId) => {
    const normalizedPeerId = normalizePeerId(peerId);
    if (!normalizedPeerId) return;
    if (!activePeerSet.has(normalizedPeerId)) return;

    setMutedByPeerId((prev) => {
      if (prev[normalizedPeerId]) {
        const next = { ...prev };
        delete next[normalizedPeerId];
        return next;
      }
      return {
        ...prev,
        [normalizedPeerId]: true,
      };
    });
  }, [activePeerSet]);

  return {
    isPeerMuted,
    togglePeerMuted,
  };
};
