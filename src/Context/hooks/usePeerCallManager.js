import { useCallback } from "react";
import { addPeerAction, removePeerAction } from "../../Actions/peerAction";
import {
  isCallHealthy,
  isPeerReadyForCalls,
  shouldInitiateCall,
} from "../../utils/peerCallUtils";

export const usePeerCallManager = ({
  userRef,
  streamRef,
  callsRef,
  pendingParticipantsRef,
  dispatch,
  setRoomParticipants,
  setRoomParticipantProfiles,
}) => {
  const getPeerConnections = useCallback(() => {
    return Object.values(callsRef.current)
      .map((call) => call?.peerConnection || call?._pc || null)
      .filter((pc) => !!pc && typeof pc.getStats === "function");
  }, [callsRef]);

  const clearAllPeerConnections = useCallback(() => {
    const activePeerIds = Object.keys(callsRef.current);

    activePeerIds.forEach((peerId) => {
      const activeCall = callsRef.current[peerId];
      try {
        activeCall?.close?.();
      } catch {
        // noop
      }
      delete callsRef.current[peerId];
      dispatch(removePeerAction(peerId));
    });
  }, [callsRef, dispatch]);

  const setupCallHandlers = useCallback((call, peerId) => {
    if (!call || !peerId) return;

    const existingCall = callsRef.current[peerId];
    if (existingCall && existingCall !== call) {
      try {
        existingCall.close();
      } catch {
        // noop
      }
    }

    callsRef.current[peerId] = call;

    call.on("stream", (remoteStream) => {
      dispatch(addPeerAction(peerId, remoteStream));
    });

    call.on("close", () => {
      if (callsRef.current[peerId] !== call) return;
      dispatch(removePeerAction(peerId));
      delete callsRef.current[peerId];
    });

    call.on("error", () => {
      if (callsRef.current[peerId] !== call) return;
      dispatch(removePeerAction(peerId));
      delete callsRef.current[peerId];
    });
  }, [callsRef, dispatch]);

  const addPendingParticipants = useCallback((participantIds = []) => {
    const normalized = Array.isArray(participantIds)
      ? participantIds.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    if (normalized.length === 0) return;

    pendingParticipantsRef.current = [
      ...new Set([...pendingParticipantsRef.current, ...normalized]),
    ];
  }, [pendingParticipantsRef]);

  const startCallToParticipant = useCallback((localUser, localStream, peerId) => {
    const normalizedPeerId = String(peerId || "").trim();
    if (!normalizedPeerId || !localUser || !localStream) return false;
    if (normalizedPeerId === localUser.id) return true;
    if (!shouldInitiateCall(localUser.id, normalizedPeerId)) return true;

    const existingCall = callsRef.current[normalizedPeerId];
    if (existingCall && isCallHealthy(existingCall)) return true;
    if (existingCall) {
      try {
        existingCall.close();
      } catch {
        // noop
      }
      delete callsRef.current[normalizedPeerId];
      dispatch(removePeerAction(normalizedPeerId));
    }

    if (!isPeerReadyForCalls(localUser)) return false;

    try {
      const call = localUser.call(normalizedPeerId, localStream);
      setupCallHandlers(call, normalizedPeerId);
      return true;
    } catch {
      return false;
    }
  }, [callsRef, dispatch, setupCallHandlers]);

  const drainPendingParticipants = useCallback((peerOverride = null, streamOverride = null) => {
    const localUser = peerOverride || userRef.current;
    const localStream = streamOverride || streamRef.current;
    if (!isPeerReadyForCalls(localUser) || !localStream) return false;

    const queued = [
      ...new Set(
        pendingParticipantsRef.current
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      ),
    ];
    if (queued.length === 0) return true;

    pendingParticipantsRef.current = [];
    const failed = [];

    queued.forEach((participantId) => {
      const started = startCallToParticipant(localUser, localStream, participantId);
      if (!started) {
        failed.push(participantId);
      }
    });

    if (failed.length > 0) {
      addPendingParticipants(failed);
      return false;
    }

    return true;
  }, [addPendingParticipants, pendingParticipantsRef, startCallToParticipant, streamRef, userRef]);

  const fetchParticipantList = useCallback(({ participants, participantProfiles }) => {
    const uniqueParticipants = Array.isArray(participants)
      ? [...new Set(participants.map((item) => String(item || "").trim()).filter(Boolean))]
      : [];
    const normalizedParticipantProfiles = uniqueParticipants.reduce((acc, participantId) => {
      const profile = participantProfiles?.[participantId] || {};
      const displayName = String(profile?.displayName || "").trim();
      const email = String(profile?.email || "").trim().toLowerCase();
      const label =
        String(profile?.label || "").trim() || displayName || email || participantId;

      acc[participantId] = {
        displayName,
        email,
        label,
      };
      return acc;
    }, {});

    setRoomParticipants(uniqueParticipants);
    setRoomParticipantProfiles(normalizedParticipantProfiles);
    const participantSet = new Set(uniqueParticipants);

    Object.keys(callsRef.current).forEach((existingPeerId) => {
      const existingCall = callsRef.current[existingPeerId];
      if (!participantSet.has(existingPeerId) || !isCallHealthy(existingCall)) {
        try {
          existingCall?.close?.();
        } catch {
          // noop
        }
        delete callsRef.current[existingPeerId];
        dispatch(removePeerAction(existingPeerId));
      }
    });

    if (uniqueParticipants.length === 0) return;

    const localUser = userRef.current;
    const localStream = streamRef.current;
    if (!isPeerReadyForCalls(localUser) || !localStream) {
      addPendingParticipants(uniqueParticipants);
      return;
    }

    uniqueParticipants.forEach((participantId) => {
      const started = startCallToParticipant(localUser, localStream, participantId);
      if (!started) {
        addPendingParticipants([participantId]);
      }
    });
  }, [
    addPendingParticipants,
    callsRef,
    dispatch,
    setRoomParticipantProfiles,
    setRoomParticipants,
    startCallToParticipant,
    streamRef,
    userRef,
  ]);

  return {
    getPeerConnections,
    clearAllPeerConnections,
    setupCallHandlers,
    addPendingParticipants,
    startCallToParticipant,
    drainPendingParticipants,
    fetchParticipantList,
  };
};
