export const registerSocketContextEvents = ({
  socket,
  navigate,
  fetchParticipantList,
  clearAllPeerConnections,
  requestRemoteDesktopSession,
  logRemote,
  callsRef,
  dispatch,
  removePeerAction,
  setRoomParticipants,
  setRoomParticipantProfiles,
  remoteDesktopPendingRequestRef,
  setRemoteDesktopPendingRequest,
  setRemoteDesktopError,
  setHostAppInstallPrompt,
  setIncomingRemoteDesktopRequest,
  setIncomingRemoteHostSetupRequest,
  setRemoteHostSetupPending,
  setRemoteHostSetupStatus,
  remoteSessionIdRef,
  remoteSessionHostIdRef,
  hasRemoteDesktopFrameRef,
  setRemoteDesktopSession,
  setHasRemoteDesktopFrame,
  claimedRemoteHostIdRef,
  setClaimedRemoteHostId,
  setRemoteHosts,
  autoClaimRemoteHostIdRef,
  setAutoClaimRemoteHostId,
  autoRequestRemoteHostIdRef,
  setAutoRequestRemoteHostId,
  remoteFrameSubscribersRef,
  hostAppRequiredErrorCodes,
  buildHostAppDownloadUrl,
  pendingParticipantsRef,
}) => {
  const enterRoom = ({ roomId }) => {
    navigate(`/room/${roomId}`);
  };

  const onRoomNotFound = () => {
    alert("Room not found. Ask the host to create a new room link.");
    navigate("/");
  };

  const onUserLeft = ({ peerId }) => {
    if (!peerId) return;

    const existingCall = callsRef.current[peerId];
    if (existingCall) {
      try {
        existingCall.close();
      } catch {
        // noop
      }
      delete callsRef.current[peerId];
    }
    dispatch(removePeerAction(peerId));
    setRoomParticipants((prev) => prev.filter((id) => id !== peerId));
    // also remove profile if tracked externally (SocketContext maintains it)
    setRoomParticipantProfiles((prev) => {
      const copy = { ...prev };
      delete copy[peerId];
      return copy;
    });
  };

  const onRemoteSessionPending = ({ requestId, hostId }) => {
    logRemote("session-pending", { requestId, hostId });
    if (!requestId) return;
    remoteDesktopPendingRequestRef.current = { requestId, hostId };
    setRemoteDesktopPendingRequest({ requestId, hostId });
    setRemoteDesktopError("");
    setHostAppInstallPrompt(null);
  };

  const onRemoteSessionRequestedUi = ({ requestId, requesterId, hostId }) => {
    logRemote("session-requested-ui", { requestId, requesterId, hostId });
    if (!requestId) return;
    setIncomingRemoteDesktopRequest({
      requestId,
      requesterId: requesterId || "another participant",
      hostId: String(hostId || "").trim(),
    });
  };

  const onRemoteHostSetupPending = ({ requestId, targetPeerId, suggestedHostId }) => {
    if (!requestId) return;
    const normalizedTargetPeerId = String(targetPeerId || "").trim();
    const normalizedHostId = String(suggestedHostId || "").trim();
    setRemoteHostSetupPending({
      requestId,
      targetPeerId: normalizedTargetPeerId,
      suggestedHostId: normalizedHostId,
    });
    setRemoteHostSetupStatus(
      normalizedTargetPeerId
        ? `Host setup request sent to ${normalizedTargetPeerId}.`
        : "Host setup request sent."
    );
  };

  const onRemoteHostSetupRequested = ({ requestId, requesterId, suggestedHostId }) => {
    if (!requestId) return;
    setIncomingRemoteHostSetupRequest({
      requestId,
      requesterId: String(requesterId || "another participant").trim(),
      suggestedHostId: String(suggestedHostId || "").trim(),
    });
  };

  const onRemoteHostSetupResult = ({ status, message, suggestedHostId }) => {
    const normalizedStatus = String(status || "").trim();
    const normalizedMessage = String(message || "").trim();
    const normalizedHostId = String(suggestedHostId || "").trim();

    setRemoteHostSetupPending(null);
    setRemoteHostSetupStatus(
      normalizedMessage ||
        (normalizedStatus === "accepted"
          ? "Participant accepted host setup request."
          : "Host setup request was not accepted.")
    );

    if (normalizedStatus === "accepted") {
      setAutoRequestRemoteHostId(normalizedHostId);
    }
  };

  const onRemoteSessionStarted = ({ sessionId, hostId }) => {
    logRemote("session-started", { sessionId, hostId });
    if (!sessionId) return;
    remoteSessionIdRef.current = sessionId;
    remoteSessionHostIdRef.current = String(hostId || "").trim();
    remoteDesktopPendingRequestRef.current = null;
    hasRemoteDesktopFrameRef.current = false;
    setRemoteDesktopSession({ sessionId, hostId });
    setRemoteDesktopPendingRequest(null);
    setHasRemoteDesktopFrame(false);
    setRemoteDesktopError("");
    setHostAppInstallPrompt(null);
    setRemoteHostSetupPending(null);
    setRemoteHostSetupStatus("");
  };

  const onRemoteHostsList = ({ hosts }) => {
    const normalizedHosts = Array.isArray(hosts)
      ? hosts
          .map((item) => {
            const hostId = String(item?.hostId || "").trim();
            const ownershipRaw = String(item?.ownership || "").trim().toLowerCase();
            const ownership =
              ownershipRaw === "you"
                ? "you"
                : ownershipRaw === "other"
                ? "other"
                : hostId && hostId === String(claimedRemoteHostIdRef.current || "").trim()
                ? "you"
                : "unclaimed";
            return {
              hostId,
              busy: !!item?.busy,
              ownership,
              label: String(item?.label || hostId).trim(),
            };
          })
          .filter((item) => !!item.hostId)
      : [];
    setRemoteHosts(normalizedHosts);
    logRemote("hosts-list", { count: normalizedHosts.length, hosts: normalizedHosts });

    const pendingAutoClaimHostId = String(autoClaimRemoteHostIdRef.current || "").trim();
    if (pendingAutoClaimHostId) {
      const hostOnline = normalizedHosts.some(
        (host) => host.hostId === pendingAutoClaimHostId
      );
      if (hostOnline) {
        if (claimedRemoteHostIdRef.current !== pendingAutoClaimHostId) {
          socket.emit("remote-host-claim", { hostId: pendingAutoClaimHostId });
        }
        autoClaimRemoteHostIdRef.current = "";
        setAutoClaimRemoteHostId("");
      }
    }

    const pendingAutoRequestHostId = String(autoRequestRemoteHostIdRef.current || "").trim();
    if (pendingAutoRequestHostId) {
      const hostOnline = normalizedHosts.some(
        (host) => host.hostId === pendingAutoRequestHostId
      );
      if (
        hostOnline &&
        !remoteSessionIdRef.current &&
        !remoteDesktopPendingRequestRef.current
      ) {
        requestRemoteDesktopSession(pendingAutoRequestHostId);
        autoRequestRemoteHostIdRef.current = "";
        setAutoRequestRemoteHostId("");
      }
    }
  };

  const onRemoteHostClaimed = ({ hostId }) => {
    const normalizedHostId = String(hostId || "").trim();
    if (!normalizedHostId) return;
    claimedRemoteHostIdRef.current = normalizedHostId;
    setClaimedRemoteHostId(normalizedHostId);
    logRemote("host-claimed", { hostId: normalizedHostId });
  };

  const onRemoteSessionEnded = ({ sessionId }) => {
    if (!sessionId) return;
    if (remoteSessionIdRef.current === sessionId) {
      remoteSessionIdRef.current = null;
      remoteSessionHostIdRef.current = "";
    }

    setRemoteDesktopSession((prev) => {
      if (!prev) return prev;
      if (prev.sessionId !== sessionId) return prev;
      return null;
    });
    remoteDesktopPendingRequestRef.current = null;
    setRemoteDesktopPendingRequest(null);
    setIncomingRemoteDesktopRequest(null);
    setIncomingRemoteHostSetupRequest(null);
    hasRemoteDesktopFrameRef.current = false;
    setHasRemoteDesktopFrame(false);
    setHostAppInstallPrompt(null);
  };

  const onRemoteFrame = ({ sessionId, image }) => {
    if (!sessionId || typeof image !== "string") return;
    if (remoteSessionIdRef.current !== sessionId) return;

    const frameDataUrl = `data:image/jpeg;base64,${image}`;
    const listeners = remoteFrameSubscribersRef.current;
    listeners.forEach((listener) => {
      try {
        listener(frameDataUrl);
      } catch {
        // noop
      }
    });

    if (!hasRemoteDesktopFrameRef.current) {
      hasRemoteDesktopFrameRef.current = true;
      setHasRemoteDesktopFrame(true);
    }
  };

  const onRemoteSessionError = ({ message, code }) => {
    logRemote("session-error", { message, code });
    const normalizedMessage =
      typeof message === "string" && message.trim()
        ? message.trim()
        : "Remote session failed.";
    setRemoteDesktopError(normalizedMessage);
    remoteDesktopPendingRequestRef.current = null;
    setRemoteDesktopPendingRequest(null);
    setIncomingRemoteDesktopRequest(null);
    setRemoteHostSetupPending(null);

    if (hostAppRequiredErrorCodes.has(String(code || "").trim())) {
      const downloadUrl = buildHostAppDownloadUrl();
      setHostAppInstallPrompt({
        message: normalizedMessage,
        downloadUrl,
      });
      return;
    }

    setHostAppInstallPrompt(null);
    alert(normalizedMessage);
  };

  const onSocketDisconnect = () => {
    logRemote("socket-disconnect");
    const activeSessionHostId = String(remoteSessionHostIdRef.current || "").trim();
    const pendingRequestHostId = String(
      remoteDesktopPendingRequestRef.current?.hostId || ""
    ).trim();
    const reconnectClaimHostId = String(claimedRemoteHostIdRef.current || "").trim();
    const reconnectAutoRequestHostId = String(
      autoRequestRemoteHostIdRef.current || activeSessionHostId || pendingRequestHostId
    ).trim();

    clearAllPeerConnections();
    pendingParticipantsRef.current = [];
    remoteSessionIdRef.current = null;
    remoteSessionHostIdRef.current = "";
    remoteDesktopPendingRequestRef.current = null;
    claimedRemoteHostIdRef.current = "";
    setRemoteDesktopSession(null);
    setRemoteDesktopPendingRequest(null);
    setIncomingRemoteDesktopRequest(null);
    setIncomingRemoteHostSetupRequest(null);
    setRemoteHostSetupPending(null);
    setRemoteHostSetupStatus("");
    hasRemoteDesktopFrameRef.current = false;
    setHasRemoteDesktopFrame(false);
    setHostAppInstallPrompt(null);
    setRemoteHosts([]);
    setRoomParticipants([]);
    setRoomParticipantProfiles({});
    setClaimedRemoteHostId("");
    autoClaimRemoteHostIdRef.current = reconnectClaimHostId;
    autoRequestRemoteHostIdRef.current = reconnectAutoRequestHostId;
    setAutoClaimRemoteHostId(reconnectClaimHostId);
    setAutoRequestRemoteHostId(reconnectAutoRequestHostId);
  };

  socket.on("room-created", enterRoom);
  socket.on("room-not-found", onRoomNotFound);
  socket.on("get-users", fetchParticipantList);
  socket.on("user-left", onUserLeft);
  socket.on("remote-session-pending", onRemoteSessionPending);
  socket.on("remote-session-requested-ui", onRemoteSessionRequestedUi);
  socket.on("remote-host-setup-pending", onRemoteHostSetupPending);
  socket.on("remote-host-setup-requested", onRemoteHostSetupRequested);
  socket.on("remote-host-setup-result", onRemoteHostSetupResult);
  socket.on("remote-session-started", onRemoteSessionStarted);
  socket.on("remote-session-ended", onRemoteSessionEnded);
  socket.on("remote-hosts-list", onRemoteHostsList);
  socket.on("remote-host-claimed", onRemoteHostClaimed);
  socket.on("remote-frame", onRemoteFrame);
  socket.on("remote-session-error", onRemoteSessionError);
  socket.on("disconnect", onSocketDisconnect);

  return () => {
    socket.off("room-created", enterRoom);
    socket.off("room-not-found", onRoomNotFound);
    socket.off("get-users", fetchParticipantList);
    socket.off("user-left", onUserLeft);
    socket.off("remote-session-pending", onRemoteSessionPending);
    socket.off("remote-session-requested-ui", onRemoteSessionRequestedUi);
    socket.off("remote-host-setup-pending", onRemoteHostSetupPending);
    socket.off("remote-host-setup-requested", onRemoteHostSetupRequested);
    socket.off("remote-host-setup-result", onRemoteHostSetupResult);
    socket.off("remote-session-started", onRemoteSessionStarted);
    socket.off("remote-session-ended", onRemoteSessionEnded);
    socket.off("remote-hosts-list", onRemoteHostsList);
    socket.off("remote-host-claimed", onRemoteHostClaimed);
    socket.off("remote-frame", onRemoteFrame);
    socket.off("remote-session-error", onRemoteSessionError);
    socket.off("disconnect", onSocketDisconnect);
  };
};
