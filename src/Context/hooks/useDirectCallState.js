import { useCallback, useEffect, useRef, useState } from "react";
import { saveHomeJoinPreference } from "../../features/room/utils/roomSessionStorage";
import {
  closeDirectCallIncomingNotification,
  consumeDirectCallActionFromUrl,
  ensureDirectCallNotificationServiceWorker,
  listenToDirectCallNotificationActions,
  showDirectCallIncomingNotification,
} from "../../features/directCall/services/callNotificationService";

const normalizeText = (value) => String(value || "").trim();
const resolveCallerLabel = (caller) => {
  const displayName = normalizeText(caller?.displayName);
  if (displayName) return displayName;
  const email = normalizeText(caller?.email);
  if (email) return email;
  return "Someone";
};

export const useDirectCallState = ({ socket, navigate }) => {
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);
  const [directCallNotice, setDirectCallNotice] = useState("");

  const outgoingCallRef = useRef(null);
  const incomingCallRef = useRef(null);
  const pageNotificationRef = useRef(null);
  const lastNotifiedRequestIdRef = useRef("");
  const pendingNotificationActionRef = useRef(null);

  useEffect(() => {
    outgoingCallRef.current = outgoingCall;
  }, [outgoingCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  const closeBrowserIncomingNotification = useCallback((requestId = "") => {
    const normalizedRequestId =
      normalizeText(requestId) || normalizeText(incomingCallRef.current?.requestId);
    const fallbackNotification = pageNotificationRef.current;
    pageNotificationRef.current = null;
    void closeDirectCallIncomingNotification({
      requestId: normalizedRequestId,
      fallbackNotification,
    });
  }, []);

  const showBrowserIncomingNotification = useCallback(
    async (callPayload) => {
      const requestId = normalizeText(callPayload?.requestId);
      if (!requestId) return;

      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        closeBrowserIncomingNotification();
        return;
      }

      if (
        lastNotifiedRequestIdRef.current === requestId &&
        pageNotificationRef.current
      ) {
        return;
      }

      closeBrowserIncomingNotification(lastNotifiedRequestIdRef.current);
      const callerLabel = resolveCallerLabel(callPayload?.caller);
      const result = await showDirectCallIncomingNotification({
        requestId,
        mode: normalizeText(callPayload?.mode),
        callerLabel,
        onClickFallback: () => {
          if (typeof window !== "undefined" && typeof window.focus === "function") {
            window.focus();
          }
          navigate("/");
        },
      });

      if (result?.notification) {
        result.notification.onclose = () => {
          if (pageNotificationRef.current === result.notification) {
            pageNotificationRef.current = null;
          }
        };
        pageNotificationRef.current = result.notification;
      }
      lastNotifiedRequestIdRef.current = requestId;
    },
    [closeBrowserIncomingNotification, navigate]
  );

  const acceptIncomingCall = useCallback(
    ({ expectedRequestId = "" } = {}) => {
      const normalizedExpectedRequestId = normalizeText(expectedRequestId);
      const activeIncomingCall = incomingCallRef.current;
      const requestId = normalizeText(activeIncomingCall?.requestId);
      const roomId = normalizeText(activeIncomingCall?.roomId);
      const mode = normalizeText(activeIncomingCall?.mode);
      if (!requestId || !roomId || !mode) return false;
      if (normalizedExpectedRequestId && normalizedExpectedRequestId !== requestId) {
        return false;
      }

      socket.emit("direct-call-response", {
        requestId,
        accepted: true,
      });

      closeBrowserIncomingNotification(requestId);
      setIncomingCall(null);
      setDirectCallNotice("");
      saveHomeJoinPreference(mode);
      navigate(`/room/${roomId}`);
      return true;
    },
    [closeBrowserIncomingNotification, navigate, socket]
  );

  const rejectIncomingCall = useCallback(
    ({ expectedRequestId = "" } = {}) => {
      const normalizedExpectedRequestId = normalizeText(expectedRequestId);
      const activeIncomingCall = incomingCallRef.current;
      const requestId = normalizeText(activeIncomingCall?.requestId);
      if (!requestId) return false;
      if (normalizedExpectedRequestId && normalizedExpectedRequestId !== requestId) {
        return false;
      }

      socket.emit("direct-call-response", {
        requestId,
        accepted: false,
      });
      closeBrowserIncomingNotification(requestId);
      setIncomingCall(null);
      setDirectCallNotice("Call rejected.");
      return true;
    },
    [closeBrowserIncomingNotification, socket]
  );

  useEffect(() => {
    void ensureDirectCallNotificationServiceWorker();
    pendingNotificationActionRef.current = consumeDirectCallActionFromUrl();
  }, []);

  useEffect(() => {
    const onDirectCallIncoming = (payload = {}) => {
      setIncomingCall({
        requestId: normalizeText(payload.requestId),
        roomId: normalizeText(payload.roomId),
        mode: normalizeText(payload.mode),
        caller: payload.caller || null,
      });
      setDirectCallNotice("");
    };

    const onDirectCallRinging = (payload = {}) => {
      setOutgoingCall({
        requestId: normalizeText(payload.requestId),
        roomId: normalizeText(payload.roomId),
        targetUserId: normalizeText(payload.targetUserId),
        mode: normalizeText(payload.mode),
      });
      setDirectCallNotice("Calling user...");
    };

    const onDirectCallAccepted = (payload = {}) => {
      const roomId = normalizeText(payload.roomId);
      const mode = normalizeText(payload.mode);
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
      const message = normalizeText(payload.message);
      setOutgoingCall(null);
      setDirectCallNotice(message || "Call ended.");
    };

    const onDirectCallCancelled = (payload = {}) => {
      const activeIncoming = incomingCallRef.current;
      const incomingRequestId = normalizeText(activeIncoming?.requestId);
      const cancelledRequestId = normalizeText(payload.requestId);
      if (!incomingRequestId || incomingRequestId !== cancelledRequestId) {
        return;
      }

      closeBrowserIncomingNotification(cancelledRequestId);
      setIncomingCall(null);
      setDirectCallNotice(
        normalizeText(payload.message) || "Incoming call is no longer available."
      );
    };

    const onDirectCallError = (payload = {}) => {
      const message = normalizeText(payload.message);
      setDirectCallNotice(message || "Direct call failed.");
      setOutgoingCall(null);
    };

    const onSocketDisconnect = () => {
      closeBrowserIncomingNotification();
      setIncomingCall(null);
      setOutgoingCall(null);
    };

    socket.on("direct-call-incoming", onDirectCallIncoming);
    socket.on("direct-call-ringing", onDirectCallRinging);
    socket.on("direct-call-accepted", onDirectCallAccepted);
    socket.on("direct-call-rejected", onDirectCallRejected);
    socket.on("direct-call-ended", onDirectCallEnded);
    socket.on("direct-call-cancelled", onDirectCallCancelled);
    socket.on("direct-call-error", onDirectCallError);
    socket.on("disconnect", onSocketDisconnect);

    return () => {
      socket.off("direct-call-incoming", onDirectCallIncoming);
      socket.off("direct-call-ringing", onDirectCallRinging);
      socket.off("direct-call-accepted", onDirectCallAccepted);
      socket.off("direct-call-rejected", onDirectCallRejected);
      socket.off("direct-call-ended", onDirectCallEnded);
      socket.off("direct-call-cancelled", onDirectCallCancelled);
      socket.off("direct-call-error", onDirectCallError);
      socket.off("disconnect", onSocketDisconnect);
    };
  }, [closeBrowserIncomingNotification, navigate, socket]);

  useEffect(() => {
    return listenToDirectCallNotificationActions(({ action, requestId }) => {
      if (action === "accept") {
        void acceptIncomingCall({ expectedRequestId: requestId });
        return;
      }
      if (action === "reject") {
        void rejectIncomingCall({ expectedRequestId: requestId });
      }
    });
  }, [acceptIncomingCall, rejectIncomingCall]);

  useEffect(() => {
    const activeRequestId = normalizeText(incomingCall?.requestId);
    if (!activeRequestId) {
      lastNotifiedRequestIdRef.current = "";
      closeBrowserIncomingNotification();
      return;
    }

    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      closeBrowserIncomingNotification();
      return;
    }

    void showBrowserIncomingNotification(incomingCall);
  }, [closeBrowserIncomingNotification, incomingCall, showBrowserIncomingNotification]);

  useEffect(() => {
    const pendingAction = pendingNotificationActionRef.current;
    if (!pendingAction) return;
    const activeRequestId = normalizeText(incomingCall?.requestId);
    if (!activeRequestId || pendingAction.requestId !== activeRequestId) {
      return;
    }

    const handled =
      pendingAction.action === "accept"
        ? acceptIncomingCall({ expectedRequestId: pendingAction.requestId })
        : rejectIncomingCall({ expectedRequestId: pendingAction.requestId });
    if (handled) {
      pendingNotificationActionRef.current = null;
    }
  }, [acceptIncomingCall, incomingCall, rejectIncomingCall]);

  useEffect(() => {
    if (typeof document === "undefined") return () => {};

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        closeBrowserIncomingNotification();
        return;
      }

      const activeIncomingCall = incomingCallRef.current;
      const activeRequestId = normalizeText(activeIncomingCall?.requestId);
      if (!activeRequestId) {
        closeBrowserIncomingNotification();
        return;
      }

      void showBrowserIncomingNotification(activeIncomingCall);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [closeBrowserIncomingNotification, showBrowserIncomingNotification]);

  useEffect(() => {
    return () => {
      closeBrowserIncomingNotification();
    };
  }, [closeBrowserIncomingNotification]);

  const startDirectCall = useCallback(
    ({ targetUserId, mode, isEnabled = true }) => {
      if (!isEnabled) {
        setDirectCallNotice("Login is required for direct calls.");
        return false;
      }

      const normalizedTargetUserId = normalizeText(targetUserId);
      const normalizedMode = normalizeText(mode);
      if (!normalizedTargetUserId || (normalizedMode !== "audio" && normalizedMode !== "video")) {
        setDirectCallNotice("Invalid call request.");
        return false;
      }

      setDirectCallNotice("");
      socket.emit("direct-call-request", {
        targetUserId: normalizedTargetUserId,
        mode: normalizedMode,
      });
      return true;
    },
    [socket]
  );

  const cancelOutgoingCall = useCallback(() => {
    const activeCall = outgoingCallRef.current;
    const requestId = normalizeText(activeCall?.requestId);
    if (!requestId) return false;
    socket.emit("direct-call-cancel", { requestId });
    setOutgoingCall(null);
    setDirectCallNotice("Call cancelled.");
    return true;
  }, [socket]);

  const resetDirectCallState = useCallback(() => {
    closeBrowserIncomingNotification();
    setIncomingCall(null);
    setOutgoingCall(null);
    setDirectCallNotice("");
  }, [closeBrowserIncomingNotification]);

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
