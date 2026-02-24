import { useCallback } from "react";
import { REMOTE_DEBUG_ENABLED } from "../../config/runtimeConfig";

export const useRemoteDesktopControls = ({
  socket,
  logRemote,
  remoteDesktopSession,
  remoteDesktopPendingRequest,
  incomingRemoteDesktopRequest,
  incomingRemoteHostSetupRequest,
  remoteHostsRef,
  remoteInputDebugRef,
  setRemoteDesktopError,
  setRemoteDesktopPendingRequest,
  setRemoteHostSetupStatus,
  setHostAppInstallPrompt,
  setIncomingRemoteDesktopRequest,
  setIncomingRemoteHostSetupRequest,
  setAutoClaimRemoteHostId,
  buildHostAppDownloadUrl,
}) => {
  const refreshRemoteHosts = useCallback(() => {
    logRemote("request-hosts-list");
    socket.emit("remote-hosts-request");
  }, [logRemote, socket]);

  const requestRemoteDesktopSession = useCallback((hostId = "") => {
    logRemote("request-session", { hostId: String(hostId || "").trim() });
    setRemoteDesktopError("");
    setRemoteDesktopPendingRequest(null);
    setRemoteHostSetupStatus("");
    setHostAppInstallPrompt(null);
    socket.emit("remote-session-request", { hostId });
  }, [
    logRemote,
    setHostAppInstallPrompt,
    setRemoteDesktopError,
    setRemoteDesktopPendingRequest,
    setRemoteHostSetupStatus,
    socket,
  ]);

  const requestRemoteHostSetup = useCallback((targetPeerId = "") => {
    const normalizedTargetPeerId = String(targetPeerId || "").trim();
    logRemote("request-host-setup", { targetPeerId: normalizedTargetPeerId });
    setRemoteDesktopError("");
    setRemoteHostSetupStatus("");
    setHostAppInstallPrompt(null);
    socket.emit("remote-host-setup-request", { targetPeerId: normalizedTargetPeerId });
  }, [logRemote, setHostAppInstallPrompt, setRemoteDesktopError, setRemoteHostSetupStatus, socket]);

  const claimRemoteHost = useCallback((hostId = "") => {
    const normalizedHostId = String(hostId || "").trim();
    if (!normalizedHostId) return;
    logRemote("claim-host", { hostId: normalizedHostId });
    socket.emit("remote-host-claim", { hostId: normalizedHostId });
  }, [logRemote, socket]);

  const stopRemoteDesktopSession = useCallback(() => {
    if (remoteDesktopSession?.sessionId) {
      socket.emit("remote-session-stop", {
        sessionId: remoteDesktopSession.sessionId,
      });
      return;
    }

    if (remoteDesktopPendingRequest?.requestId) {
      socket.emit("remote-session-stop");
      setRemoteDesktopPendingRequest(null);
      setRemoteDesktopError("");
      setHostAppInstallPrompt(null);
    }
  }, [
    remoteDesktopPendingRequest,
    remoteDesktopSession,
    setHostAppInstallPrompt,
    setRemoteDesktopError,
    setRemoteDesktopPendingRequest,
    socket,
  ]);

  const dismissHostAppInstallPrompt = useCallback(() => {
    setHostAppInstallPrompt(null);
  }, [setHostAppInstallPrompt]);

  const respondToRemoteDesktopRequest = useCallback((accepted) => {
    if (!incomingRemoteDesktopRequest?.requestId) return;

    socket.emit("remote-session-ui-decision", {
      requestId: incomingRemoteDesktopRequest.requestId,
      accepted: !!accepted,
      reason: accepted ? "" : "Rejected by participant.",
    });
    setIncomingRemoteDesktopRequest(null);
  }, [incomingRemoteDesktopRequest, setIncomingRemoteDesktopRequest, socket]);

  const respondToRemoteHostSetupRequest = useCallback((accepted) => {
    if (!incomingRemoteHostSetupRequest?.requestId) return;

    const suggestedHostId = String(incomingRemoteHostSetupRequest.suggestedHostId || "").trim();
    const downloadUrl = buildHostAppDownloadUrl();

    socket.emit("remote-host-setup-decision", {
      requestId: incomingRemoteHostSetupRequest.requestId,
      accepted: !!accepted,
    });

    if (accepted) {
      if (downloadUrl) {
        window.setTimeout(() => {
          const hostAlreadyOnline =
            !!suggestedHostId &&
            remoteHostsRef.current.some((host) => host.hostId === suggestedHostId);
          if (hostAlreadyOnline) return;
          window.open(downloadUrl, "_blank", "noopener,noreferrer");
        }, 250);
      }
      setAutoClaimRemoteHostId(suggestedHostId);
      setHostAppInstallPrompt({
        message: suggestedHostId
          ? `Setup accepted. Start the host app on this device with host ID '${suggestedHostId}'.`
          : "Setup accepted. Start the host app on this device.",
        downloadUrl,
      });
      setRemoteHostSetupStatus(
        "Host setup accepted. Download opened. Start the host app and keep it running."
      );
    }

    setIncomingRemoteHostSetupRequest(null);
  }, [
    buildHostAppDownloadUrl,
    incomingRemoteHostSetupRequest,
    remoteHostsRef,
    setAutoClaimRemoteHostId,
    setHostAppInstallPrompt,
    setIncomingRemoteHostSetupRequest,
    setRemoteHostSetupStatus,
    socket,
  ]);

  const sendRemoteDesktopInput = useCallback((event) => {
    if (!remoteDesktopSession?.sessionId) return;
    if (!event || !event.type) return;

    const normalizedEvent = { ...event };
    const type = normalizedEvent.type;

    if (
      type === "move" ||
      type === "click" ||
      type === "mouse-down" ||
      type === "mouse-up" ||
      type === "wheel"
    ) {
      const x = Number(normalizedEvent.x);
      const y = Number(normalizedEvent.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      normalizedEvent.x = Math.min(1, Math.max(0, x));
      normalizedEvent.y = Math.min(1, Math.max(0, y));
    }

    socket.emit("remote-input", {
      sessionId: remoteDesktopSession.sessionId,
      event: normalizedEvent,
    });

    if (REMOTE_DEBUG_ENABLED) {
      const now = Date.now();
      const debugState = remoteInputDebugRef.current;
      debugState.count += 1;
      if (now - debugState.lastLoggedAt >= 1500) {
        logRemote("input-sent", {
          sessionId: remoteDesktopSession.sessionId,
          count: debugState.count,
          lastType: type,
        });
        debugState.lastLoggedAt = now;
      }
    }
  }, [logRemote, remoteDesktopSession, remoteInputDebugRef, socket]);

  return {
    refreshRemoteHosts,
    requestRemoteDesktopSession,
    requestRemoteHostSetup,
    claimRemoteHost,
    stopRemoteDesktopSession,
    dismissHostAppInstallPrompt,
    respondToRemoteDesktopRequest,
    respondToRemoteHostSetupRequest,
    sendRemoteDesktopInput,
  };
};
