import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { saveHomeJoinPreference } from "../../room/utils/roomSessionStorage";

export const useDirectCallFlow = ({ socket, isEnabled }) => {
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);
  const [directCallNotice, setDirectCallNotice] = useState("");
  const outgoingCallRef = useRef(null);
  const incomingCallRef = useRef(null);

  useEffect(() => {
    outgoingCallRef.current = outgoingCall;
  }, [outgoingCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    const onDirectCallIncoming = (payload = {}) => {
      setIncomingCall({
        requestId: String(payload.requestId || "").trim(),
        roomId: String(payload.roomId || "").trim(),
        mode: String(payload.mode || "").trim(),
        caller: payload.caller || null,
      });
      setDirectCallNotice("");
    };

    const onDirectCallRinging = (payload = {}) => {
      setOutgoingCall({
        requestId: String(payload.requestId || "").trim(),
        roomId: String(payload.roomId || "").trim(),
        targetUserId: String(payload.targetUserId || "").trim(),
        mode: String(payload.mode || "").trim(),
      });
      setDirectCallNotice("Calling user...");
    };

    const onDirectCallAccepted = (payload = {}) => {
      const roomId = String(payload.roomId || "").trim();
      const mode = String(payload.mode || "").trim();
      if (!roomId || !mode) return;

      setOutgoingCall(null);
      setDirectCallNotice("");
      saveHomeJoinPreference(mode);
      navigate(`/room/${roomId}`);
    };

    const onDirectCallRejected = () => {
      setOutgoingCall(null);
      setDirectCallNotice("Call was rejected.");
    };

    const onDirectCallEnded = (payload = {}) => {
      const message = String(payload.message || "").trim();
      setOutgoingCall(null);
      setDirectCallNotice(message || "Call ended.");
    };

    const onDirectCallCancelled = (payload = {}) => {
      const activeIncoming = incomingCallRef.current;
      const incomingRequestId = String(activeIncoming?.requestId || "").trim();
      const cancelledRequestId = String(payload.requestId || "").trim();
      if (!incomingRequestId || incomingRequestId !== cancelledRequestId) {
        return;
      }

      setIncomingCall(null);
      setDirectCallNotice(
        String(payload.message || "").trim() || "Incoming call is no longer available."
      );
    };

    const onDirectCallError = (payload = {}) => {
      const message = String(payload.message || "").trim();
      setDirectCallNotice(message || "Direct call failed.");
      setOutgoingCall(null);
    };

    socket.on("direct-call-incoming", onDirectCallIncoming);
    socket.on("direct-call-ringing", onDirectCallRinging);
    socket.on("direct-call-accepted", onDirectCallAccepted);
    socket.on("direct-call-rejected", onDirectCallRejected);
    socket.on("direct-call-ended", onDirectCallEnded);
    socket.on("direct-call-cancelled", onDirectCallCancelled);
    socket.on("direct-call-error", onDirectCallError);

    return () => {
      socket.off("direct-call-incoming", onDirectCallIncoming);
      socket.off("direct-call-ringing", onDirectCallRinging);
      socket.off("direct-call-accepted", onDirectCallAccepted);
      socket.off("direct-call-rejected", onDirectCallRejected);
      socket.off("direct-call-ended", onDirectCallEnded);
      socket.off("direct-call-cancelled", onDirectCallCancelled);
      socket.off("direct-call-error", onDirectCallError);
    };
  }, [navigate, socket]);

  const startDirectCall = useCallback(
    ({ targetUserId, mode }) => {
      if (!isEnabled) {
        setDirectCallNotice("Login is required for direct calls.");
        return;
      }

      const normalizedTargetUserId = String(targetUserId || "").trim();
      const normalizedMode = String(mode || "").trim();
      if (!normalizedTargetUserId || (normalizedMode !== "audio" && normalizedMode !== "video")) {
        setDirectCallNotice("Invalid call request.");
        return;
      }

      setDirectCallNotice("");
      socket.emit("direct-call-request", {
        targetUserId: normalizedTargetUserId,
        mode: normalizedMode,
      });
    },
    [isEnabled, socket]
  );

  const cancelOutgoingCall = useCallback(() => {
    const activeCall = outgoingCallRef.current;
    const requestId = String(activeCall?.requestId || "").trim();
    if (!requestId) return;
    socket.emit("direct-call-cancel", { requestId });
    setOutgoingCall(null);
    setDirectCallNotice("Call cancelled.");
  }, [socket]);

  const acceptIncomingCall = useCallback(() => {
    const activeIncomingCall = incomingCallRef.current;
    const requestId = String(activeIncomingCall?.requestId || "").trim();
    const roomId = String(activeIncomingCall?.roomId || "").trim();
    const mode = String(activeIncomingCall?.mode || "").trim();
    if (!requestId || !roomId || !mode) return;

    socket.emit("direct-call-response", {
      requestId,
      accepted: true,
    });

    setIncomingCall(null);
    setDirectCallNotice("");
    saveHomeJoinPreference(mode);
    navigate(`/room/${roomId}`);
  }, [navigate, socket]);

  const rejectIncomingCall = useCallback(() => {
    const activeIncomingCall = incomingCallRef.current;
    const requestId = String(activeIncomingCall?.requestId || "").trim();
    if (!requestId) return;

    socket.emit("direct-call-response", {
      requestId,
      accepted: false,
    });
    setIncomingCall(null);
    setDirectCallNotice("Call rejected.");
  }, [socket]);

  const resetDirectCallState = useCallback(() => {
    setIncomingCall(null);
    setOutgoingCall(null);
    setDirectCallNotice("");
  }, []);

  return {
    incomingCall,
    outgoingCall,
    directCallNotice,
    setDirectCallNotice,
    startDirectCall,
    cancelOutgoingCall,
    acceptIncomingCall,
    rejectIncomingCall,
    resetDirectCallState,
  };
};
