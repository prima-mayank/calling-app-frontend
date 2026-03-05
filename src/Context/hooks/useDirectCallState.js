import { useCallback, useEffect, useRef, useState } from "react";
import { saveHomeJoinPreference } from "../../features/room/utils/roomSessionStorage";
import {
  closeDirectCallIncomingNotification,
  consumeDirectCallActionFromUrl,
  ensureDirectCallNotificationServiceWorker,
  isDirectCallNotificationOwnedByCurrentTab,
  listenToDirectCallNotificationActions,
  showDirectCallIncomingNotification,
} from "../../features/directCall/services/callNotificationService";
import { useWindowActivityState } from "../../features/directCall/hooks/useWindowActivityState";
import { useDirectCallNotificationPermission } from "../../features/directCall/hooks/useDirectCallNotificationPermission";

const PENDING_NOTIFICATION_ACTION_TTL_MS = 30_000;
const NOTIFICATION_RETRY_INTERVAL_MS = 1_600;

const normalizeText = (value) => String(value || "").trim();
const normalizeNotificationAction = (value) => {
  const action = normalizeText(value).toLowerCase();
  if (action === "accept" || action === "reject") return action;
  return "";
};
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
  const activeNotificationRequestIdRef = useRef("");
  const pendingNotificationActionRef = useRef(null);

  const { shouldUseSystemNotification } = useWindowActivityState();
  const {
    notificationPermissionState,
    canShowCallNotifications,
    requestCallNotificationPermission,
  } = useDirectCallNotificationPermission();

  const storePendingNotificationAction = useCallback(({ action, requestId }) => {
    const normalizedAction = normalizeNotificationAction(action);
    const normalizedRequestId = normalizeText(requestId);
    if (!normalizedAction || !normalizedRequestId) return;

    pendingNotificationActionRef.current = {
      action: normalizedAction,
      requestId: normalizedRequestId,
      receivedAt: Date.now(),
    };
  }, []);

  useEffect(() => {
    outgoingCallRef.current = outgoingCall;
  }, [outgoingCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  const closeBrowserIncomingNotification = useCallback(
    (requestId = "", options = {}) => {
      const { onlyIfOwnedByCurrentTab = true } = options;
    const normalizedRequestId =
      normalizeText(requestId) || normalizeText(incomingCallRef.current?.requestId);
    const fallbackNotification = pageNotificationRef.current;
    pageNotificationRef.current = null;
    if (
      !normalizedRequestId ||
      activeNotificationRequestIdRef.current === normalizedRequestId
    ) {
      activeNotificationRequestIdRef.current = "";
    }

    void closeDirectCallIncomingNotification({
      requestId: normalizedRequestId,
      fallbackNotification,
      onlyIfOwnedByCurrentTab,
    });
    },
    []
  );

  const showBrowserIncomingNotification = useCallback(
    async (callPayload) => {
      const requestId = normalizeText(callPayload?.requestId);
      if (!requestId) return false;
      if (!shouldUseSystemNotification) {
        closeBrowserIncomingNotification(requestId);
        return false;
      }

      if (activeNotificationRequestIdRef.current === requestId) {
        return true;
      }

      const previousRequestId = normalizeText(activeNotificationRequestIdRef.current);
      if (previousRequestId && previousRequestId !== requestId) {
        closeBrowserIncomingNotification(previousRequestId);
      }

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

      if (result?.kind === "none") {
        return false;
      }

      if (result?.notification) {
        const existingOnClose = result.notification.onclose;
        result.notification.onclose = (...args) => {
          if (pageNotificationRef.current === result.notification) {
            pageNotificationRef.current = null;
          }
          if (activeNotificationRequestIdRef.current === requestId) {
            activeNotificationRequestIdRef.current = "";
          }
          if (typeof existingOnClose === "function") {
            existingOnClose(...args);
          }
        };
        pageNotificationRef.current = result.notification;
      }

      activeNotificationRequestIdRef.current = requestId;
      return true;
    },
    [
      closeBrowserIncomingNotification,
      navigate,
      shouldUseSystemNotification,
    ]
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

      pendingNotificationActionRef.current = null;
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

      pendingNotificationActionRef.current = null;
      closeBrowserIncomingNotification(requestId);
      setIncomingCall(null);
      setDirectCallNotice("Call rejected.");
      return true;
    },
    [closeBrowserIncomingNotification, socket]
  );

  useEffect(() => {
    void ensureDirectCallNotificationServiceWorker();
    const pendingActionFromUrl = consumeDirectCallActionFromUrl();
    if (pendingActionFromUrl) {
      storePendingNotificationAction(pendingActionFromUrl);
    }
  }, [storePendingNotificationAction]);

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
      if (cancelledRequestId) {
        closeBrowserIncomingNotification(cancelledRequestId);
      }
      if (!incomingRequestId || incomingRequestId !== cancelledRequestId) {
        return;
      }

      pendingNotificationActionRef.current = null;
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
      pendingNotificationActionRef.current = null;
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
      const normalizedAction = normalizeNotificationAction(action);
      const normalizedRequestId = normalizeText(requestId);
      if (!normalizedAction || !normalizedRequestId) return;

      const handled =
        normalizedAction === "accept"
          ? acceptIncomingCall({ expectedRequestId: normalizedRequestId })
          : rejectIncomingCall({ expectedRequestId: normalizedRequestId });

      if (!handled) {
        storePendingNotificationAction({
          action: normalizedAction,
          requestId: normalizedRequestId,
        });
      }
    });
  }, [acceptIncomingCall, rejectIncomingCall, storePendingNotificationAction]);

  useEffect(() => {
    const activeRequestId = normalizeText(incomingCall?.requestId);
    if (!activeRequestId) {
      pendingNotificationActionRef.current = null;
      activeNotificationRequestIdRef.current = "";
      closeBrowserIncomingNotification();
      return;
    }

    if (!shouldUseSystemNotification) {
      if (isDirectCallNotificationOwnedByCurrentTab(activeRequestId)) {
        closeBrowserIncomingNotification(activeRequestId, {
          onlyIfOwnedByCurrentTab: true,
        });
      }
      return;
    }

    void showBrowserIncomingNotification(incomingCall);
  }, [
    closeBrowserIncomingNotification,
    incomingCall,
    shouldUseSystemNotification,
    showBrowserIncomingNotification,
  ]);

  useEffect(() => {
    const activeRequestId = normalizeText(incomingCall?.requestId);
    if (
      !activeRequestId ||
      !shouldUseSystemNotification ||
      notificationPermissionState === "denied" ||
      notificationPermissionState === "unsupported"
    ) {
      return () => {};
    }

    const intervalId = window.setInterval(() => {
      if (activeNotificationRequestIdRef.current === activeRequestId) return;
      const activeIncomingCall = incomingCallRef.current;
      if (!activeIncomingCall) return;
      void showBrowserIncomingNotification(activeIncomingCall);
    }, NOTIFICATION_RETRY_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    incomingCall,
    notificationPermissionState,
    shouldUseSystemNotification,
    showBrowserIncomingNotification,
  ]);

  useEffect(() => {
    const pendingAction = pendingNotificationActionRef.current;
    if (!pendingAction) return;

    if (Date.now() - Number(pendingAction.receivedAt || 0) > PENDING_NOTIFICATION_ACTION_TTL_MS) {
      pendingNotificationActionRef.current = null;
      return;
    }

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
    return () => {
      pendingNotificationActionRef.current = null;
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
    pendingNotificationActionRef.current = null;
    closeBrowserIncomingNotification();
    setIncomingCall(null);
    setOutgoingCall(null);
    setDirectCallNotice("");
  }, [closeBrowserIncomingNotification]);

  return {
    incomingCall,
    outgoingCall,
    directCallNotice,
    notificationPermissionState,
    canShowCallNotifications,
    requestCallNotificationPermission,
    setDirectCallNotice,
    startDirectCall,
    cancelOutgoingCall,
    acceptIncomingCall,
    rejectIncomingCall,
    resetDirectCallState,
  };
};
