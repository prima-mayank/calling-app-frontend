import { useContext, useEffect, useRef, useState } from "react";
import { useCallback } from "react";
import { useParams } from "react-router-dom";
import { SocketContext } from "../Context/socketContextValue";
import UserFeedPlayer from "../components/UserFeedPlayer";
import LowNetworkWarning from "../components/LowNetworkWarning";

const mapMouseButton = (button) => {
  if (button === 2) return "right";
  if (button === 1) return "middle";
  return "left";
};

const MOVE_EVENT_THROTTLE_MS = 20;
const TOUCH_TAP_MAX_MOVE = 0.015;
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const HOME_JOIN_PREF_KEY = "home_join_pref_v1";
const HOME_JOIN_PREF_MAX_AGE_MS = 5 * 60 * 1000;

const copyTextFallback = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "absolute";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  document.body.removeChild(textArea);
  return copied;
};

const preventDefaultIfCancelable = (event) => {
  if (!event || typeof event.preventDefault !== "function") return;
  if (typeof event.cancelable === "boolean" && !event.cancelable) return;
  event.preventDefault();
};

const isLocalHostName = (hostname) => {
  const value = String(hostname || "").trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
};

const isInsecureContextOnLanIp = () => {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return false;
  return !isLocalHostName(window.location?.hostname);
};

const Room = () => {
  const { id } = useParams();
  const {
    socket,
    user,
    stream,
    peers,
    audioEnabled,
    videoEnabled,
    isScreenSharing,
    remoteDesktopSession,
    remoteDesktopPendingRequest,
    remoteHosts,
    roomParticipants,
    incomingRemoteDesktopRequest,
    incomingRemoteHostSetupRequest,
    remoteHostSetupPending,
    remoteHostSetupStatus,
    hasRemoteDesktopFrame,
    remoteDesktopError,
    hostAppInstallPrompt,
    socketConnected,
    browserOnline,
    provideStream,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    requestRemoteDesktopSession,
    requestRemoteHostSetup,
    claimRemoteHost,
    stopRemoteDesktopSession,
    dismissHostAppInstallPrompt,
    respondToRemoteDesktopRequest,
    respondToRemoteHostSetupRequest,
    subscribeRemoteDesktopFrame,
    sendRemoteDesktopInput,
    getPeerConnections,
    endCall,
  } = useContext(SocketContext);

  const [hasJoined, setHasJoined] = useState(false);
  const [remoteInputActive, setRemoteInputActive] = useState(false);
  const [showRemotePanel, setShowRemotePanel] = useState(false);
  const [zoomTarget, setZoomTarget] = useState("");
  const [selectedRemoteHostId, setSelectedRemoteHostId] = useState("");
  const [selectedSetupPeerId, setSelectedSetupPeerId] = useState("");
  const moveThrottleRef = useRef(0);
  const remoteSurfaceRef = useRef(null);
  const remoteFrameRef = useRef(null);
  const latestRemoteFrameDataUrlRef = useRef("");
  const touchStateRef = useRef({
    active: false,
    moved: false,
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
  });
  const ignoreNextClickRef = useRef(false);

  const joinRoomWithMode = useCallback(async (mode) => {
    if (mode === "none") {
      setHasJoined(true);
      return;
    }

    if (isInsecureContextOnLanIp()) {
      alert(
        "Camera/mic on local IP needs HTTPS. Use localhost on this machine or open the app via an HTTPS tunnel/domain."
      );
      return;
    }

    const media = await provideStream(mode === "video");
    if (!media) return;
    setHasJoined(true);
  }, [provideStream]);

  useEffect(() => {
    if (hasJoined) return;

    let parsed = null;
    try {
      const raw = sessionStorage.getItem(HOME_JOIN_PREF_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    if (!parsed || typeof parsed !== "object") return;

    const mode = String(parsed.mode || "").trim();
    const ts = Number(parsed.ts || 0);
    const isFresh =
      Number.isFinite(ts) && ts > 0 && Date.now() - ts <= HOME_JOIN_PREF_MAX_AGE_MS;

    try {
      sessionStorage.removeItem(HOME_JOIN_PREF_KEY);
    } catch {
      // noop
    }

    if (!isFresh) return;
    if (mode !== "video" && mode !== "audio" && mode !== "none") return;

    const autoJoin = async () => {
      await joinRoomWithMode(mode);
    };

    void autoJoin();
  }, [hasJoined, joinRoomWithMode]);

  useEffect(() => {
    // Join the Socket.IO room as early as possible so the room exists/has identity
    // even before the user chooses audio/video/none. WebRTC calls will wait for stream.
    const peerId = user?.id;
    if (!peerId || !id) return;

    const emitJoinRoom = () => {
      socket.emit("joined-room", {
        roomId: id,
        peerId,
      });

      if (hasJoined) {
        socket.emit("ready");
      }
    };

    if (socket.connected) {
      emitJoinRoom();
    }

    socket.on("connect", emitJoinRoom);

    return () => {
      socket.off("connect", emitJoinRoom);
    };
  }, [hasJoined, id, socket, user?.id]);

  useEffect(() => {
    const unsubscribe = subscribeRemoteDesktopFrame((frameDataUrl) => {
      latestRemoteFrameDataUrlRef.current = frameDataUrl;

      const frameElement = remoteFrameRef.current;
      if (frameElement) {
        frameElement.src = frameDataUrl;
      }
    });

    return unsubscribe;
  }, [subscribeRemoteDesktopFrame]);

  useEffect(() => {
    if (!hasRemoteDesktopFrame || !remoteFrameRef.current) return;
    if (!latestRemoteFrameDataUrlRef.current) return;
    remoteFrameRef.current.src = latestRemoteFrameDataUrlRef.current;
  }, [hasRemoteDesktopFrame]);

  useEffect(() => {
    if (remoteDesktopSession && hasRemoteDesktopFrame) return;

    latestRemoteFrameDataUrlRef.current = "";
    if (remoteFrameRef.current) {
      remoteFrameRef.current.removeAttribute("src");
    }
  }, [hasRemoteDesktopFrame, remoteDesktopSession]);

  useEffect(() => {
    const isControlActive = remoteInputActive && !!remoteDesktopSession;
    if (!isControlActive || !remoteDesktopSession) return;

    const isTypingTarget = (element) => {
      if (!element) return false;
      const tag = element.tagName?.toLowerCase();
      if (!tag) return false;
      if (element.isContentEditable) return true;
      return tag === "input" || tag === "textarea" || tag === "select";
    };

    const releaseModifierKeys = () => {
      const modifierReleases = [
        { key: "Shift", code: "ShiftLeft" },
        { key: "Shift", code: "ShiftRight" },
        { key: "Control", code: "ControlLeft" },
        { key: "Control", code: "ControlRight" },
        { key: "Alt", code: "AltLeft" },
        { key: "Alt", code: "AltRight" },
        { key: "Meta", code: "MetaLeft" },
        { key: "Meta", code: "MetaRight" },
      ];

      modifierReleases.forEach((modifier) => {
        sendRemoteDesktopInput({
          type: "key-up",
          key: modifier.key,
          code: modifier.code,
        });
      });
    };

    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "Escape") {
        preventDefaultIfCancelable(event);
        releaseModifierKeys();
        setRemoteInputActive(false);
        return;
      }

      preventDefaultIfCancelable(event);
      sendRemoteDesktopInput({
        type: "key-down",
        key: event.key,
        code: event.code,
        repeat: event.repeat,
      });
    };

    const onKeyUp = (event) => {
      if (isTypingTarget(event.target)) return;
      preventDefaultIfCancelable(event);
      sendRemoteDesktopInput({
        type: "key-up",
        key: event.key,
        code: event.code,
      });
    };

    const onWindowBlur = () => {
      releaseModifierKeys();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        releaseModifierKeys();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      releaseModifierKeys();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [remoteInputActive, remoteDesktopSession, sendRemoteDesktopInput]);

  const hasRemoteActivity = !!(
    remoteDesktopSession ||
    remoteDesktopPendingRequest ||
    incomingRemoteDesktopRequest ||
    remoteDesktopError ||
    hostAppInstallPrompt ||
    hasRemoteDesktopFrame
  );

  if (!hasJoined) {
    return (
      <div className="room-join-page">
        <LowNetworkWarning getPeerConnections={getPeerConnections} />
        <div className="room-join-shell panel">
          <h2>Join Room: {id}</h2>
          <p className="room-join-subtitle">Choose how you want to join this room.</p>
          <div className="room-join-actions">
            <button onClick={() => joinRoomWithMode("video")} className="btn btn-call-video btn-join">
              Join with Video
            </button>
            <button onClick={() => joinRoomWithMode("audio")} className="btn btn-call-audio btn-join">
              Join Audio Only
            </button>
          </div>
        </div>
      </div>
    );
  }

  const buildPointerPayloadFromClient = (clientX, clientY) => {
    const frame = remoteFrameRef.current;
    const surface = remoteSurfaceRef.current;
    if (!surface) return null;

    const surfaceRect = surface.getBoundingClientRect();
    if (!surfaceRect.width || !surfaceRect.height) return null;

    if (
      clientX < surfaceRect.left ||
      clientX > surfaceRect.left + surfaceRect.width ||
      clientY < surfaceRect.top ||
      clientY > surfaceRect.top + surfaceRect.height
    ) {
      return null;
    }

    let activeRect = surfaceRect;

    if (frame) {
      const frameRect = frame.getBoundingClientRect();
      const naturalWidth = Number(frame.naturalWidth);
      const naturalHeight = Number(frame.naturalHeight);

      if (
        frameRect.width > 0 &&
        frameRect.height > 0 &&
        Number.isFinite(naturalWidth) &&
        Number.isFinite(naturalHeight) &&
        naturalWidth > 0 &&
        naturalHeight > 0
      ) {
        const frameRatio = frameRect.width / frameRect.height;
        const imageRatio = naturalWidth / naturalHeight;

        let width = frameRect.width;
        let height = frameRect.height;
        let offsetX = 0;
        let offsetY = 0;

        if (frameRatio > imageRatio) {
          height = frameRect.height;
          width = height * imageRatio;
          offsetX = (frameRect.width - width) / 2;
        } else if (frameRatio < imageRatio) {
          width = frameRect.width;
          height = width / imageRatio;
          offsetY = (frameRect.height - height) / 2;
        }

        activeRect = {
          left: frameRect.left + offsetX,
          top: frameRect.top + offsetY,
          width,
          height,
        };
      }
    }

    const x = clamp01((clientX - activeRect.left) / activeRect.width);
    const y = clamp01((clientY - activeRect.top) / activeRect.height);

    return { x, y };
  };

  const buildPointerPayload = (event) =>
    buildPointerPayloadFromClient(event.clientX, event.clientY);

  const handleRemoteMove = (event) => {
    if (!remoteDesktopSession || !isControlActive) return;

    const now = Date.now();
    if (now - moveThrottleRef.current < MOVE_EVENT_THROTTLE_MS) return;
    moveThrottleRef.current = now;

    const pointer = buildPointerPayload(event);
    if (!pointer) return;

    sendRemoteDesktopInput({
      type: "move",
      ...pointer,
    });
  };

  const handleRemoteClick = (event) => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    if (!remoteDesktopSession) return;

    preventDefaultIfCancelable(event);
    const pointer = buildPointerPayload(event);
    if (!pointer) return;

    sendRemoteDesktopInput({
      type: "click",
      button: mapMouseButton(event.button),
      ...pointer,
    });
  };

  const handleRemoteMouseDown = (event) => {
    if (!remoteDesktopSession || !isControlActive) return;

    preventDefaultIfCancelable(event);
    const pointer = buildPointerPayload(event);
    if (!pointer) return;

    sendRemoteDesktopInput({
      type: "mouse-down",
      button: mapMouseButton(event.button),
      ...pointer,
    });
  };

  const handleRemoteMouseUp = (event) => {
    if (!remoteDesktopSession || !isControlActive) return;

    preventDefaultIfCancelable(event);
    const pointer = buildPointerPayload(event);
    if (!pointer) return;

    sendRemoteDesktopInput({
      type: "mouse-up",
      button: mapMouseButton(event.button),
      ...pointer,
    });
  };

  const handleRemoteWheel = (event) => {
    if (!remoteDesktopSession || !isControlActive) return;

    preventDefaultIfCancelable(event);
    const pointer = buildPointerPayload(event);
    if (!pointer) return;

    sendRemoteDesktopInput({
      type: "wheel",
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      ...pointer,
    });
  };

  const connectRemoteDesktop = () => {
    if (!effectiveSelectedRemoteHostId) {
      alert("Select a host first.");
      return;
    }
    if (selectedRemoteHostOwnership === "you") {
      alert("This host is claimed by you. Ask the other participant to request control.");
      return;
    }
    if (selectedRemoteHostOwnership !== "other") {
      alert("The other participant must claim this host before you can request control.");
      return;
    }
    if (selectedRemoteHost?.busy) {
      alert("Selected host is currently busy.");
      return;
    }
    requestRemoteDesktopSession(effectiveSelectedRemoteHostId);
  };

  const isControlActive =
    remoteInputActive && !!remoteDesktopSession && socketConnected && browserOnline;
  const shouldShowRemotePanel = showRemotePanel || hasRemoteActivity;
  const hasVideoTrack = !!stream && stream.getVideoTracks().length > 0;
  const otherParticipants = [
    ...new Set(
      roomParticipants
        .map((participantId) => String(participantId || "").trim())
        .filter((participantId) => participantId && participantId !== user?.id)
    ),
  ];
  const hasExplicitHostSelection = remoteHosts.some(
    (host) => host.hostId === selectedRemoteHostId
  );
  const effectiveSelectedRemoteHostId = hasExplicitHostSelection ? selectedRemoteHostId : "";
  const selectedRemoteHost = hasExplicitHostSelection
    ? remoteHosts.find((host) => host.hostId === selectedRemoteHostId) || null
    : null;
  const selectedRemoteHostOwnership = selectedRemoteHost?.ownership || "unclaimed";
  const canClaimSelectedHost =
    !!effectiveSelectedRemoteHostId && selectedRemoteHostOwnership !== "other";
  const canRequestSelectedHost =
    !!effectiveSelectedRemoteHostId &&
    !!selectedRemoteHost &&
    !selectedRemoteHost.busy &&
    !remoteDesktopPendingRequest &&
    selectedRemoteHostOwnership === "other";
  const effectiveSetupPeerId = otherParticipants.includes(selectedSetupPeerId)
    ? selectedSetupPeerId
    : otherParticipants.length === 1
    ? otherParticipants[0]
    : "";
  const hostOwnershipTotals = remoteHosts.reduce(
    (acc, host) => {
      const ownership =
        host?.ownership === "you" || host?.ownership === "other" ? host.ownership : "unclaimed";
      acc[ownership] += 1;
      return acc;
    },
    { you: 0, other: 0, unclaimed: 0 }
  );
  const hostOwnershipSeen = { you: 0, other: 0, unclaimed: 0 };
  const hostSelectOptions = remoteHosts.map((host) => {
    const ownership =
      host?.ownership === "you" || host?.ownership === "other" ? host.ownership : "unclaimed";
    hostOwnershipSeen[ownership] += 1;

    const baseLabel =
      ownership === "you" ? "You" : ownership === "other" ? "Other" : "Unclaimed";
    const duplicateSuffix =
      hostOwnershipTotals[ownership] > 1 ? ` ${hostOwnershipSeen[ownership]}` : "";
    const busySuffix = host?.busy ? " (busy)" : "";

    return {
      value: host.hostId,
      label: `${baseLabel}${duplicateSuffix}${busySuffix}`,
    };
  });
  const setupParticipantOptions = otherParticipants.map((peerId, index) => ({
    value: peerId,
    label: otherParticipants.length === 1 ? "Other" : `Other ${index + 1}`,
  }));
  const peerIds = Object.keys(peers);
  const participantsWithoutMedia = otherParticipants.filter(
    (participantId) => !peers[participantId]
  );
  const localParticipantBase = user?.id ? 1 : 0;
  const participantCount = Math.max(
    localParticipantBase + peerIds.length,
    localParticipantBase + otherParticipants.length
  );
  const modeLabel = isScreenSharing
    ? "Screen Sharing"
    : !stream
    ? "Remote Only"
    : hasVideoTrack
    ? "Video Call"
    : "Audio Call";
  const toggleZoom = (targetId) => {
    setZoomTarget((prev) => (prev === targetId ? "" : targetId));
  };

  const videoTiles = [
    {
      id: "local",
      label: `You ${!stream ? "(No Media)" : stream && !hasVideoTrack ? "(Audio Only)" : ""}`.trim(),
      stream,
      muted: true,
      isLocal: true,
    },
    ...peerIds.map((peerId) => ({
      id: `peer:${peerId}`,
      label: peerId,
      stream: peers[peerId].stream,
      muted: false,
      isLocal: false,
    })),
  ];

  const effectiveZoomTarget =
    zoomTarget.startsWith("peer:") && !peers[zoomTarget.slice(5)] ? "" : zoomTarget;

  const activeVideoTile = videoTiles.find((tile) => tile.id === effectiveZoomTarget) || null;
  const isVideoSpotlightActive = !!activeVideoTile;

  const getPrimaryTouch = (event) => event.touches?.[0] || event.changedTouches?.[0];

  const handleTouchStart = (event) => {
    if (!remoteDesktopSession) return;

    const touch = getPrimaryTouch(event);
    if (!touch) return;
    preventDefaultIfCancelable(event);

    const pointer = buildPointerPayloadFromClient(touch.clientX, touch.clientY);
    if (!pointer) return;

    setRemoteInputActive(true);
    touchStateRef.current = {
      active: true,
      moved: false,
      x: pointer.x,
      y: pointer.y,
      startX: pointer.x,
      startY: pointer.y,
    };

    sendRemoteDesktopInput({
      type: "mouse-down",
      button: "left",
      ...pointer,
    });
  };

  const handleTouchMove = (event) => {
    if (!remoteDesktopSession || !touchStateRef.current.active) return;

    const touch = getPrimaryTouch(event);
    if (!touch) return;
    preventDefaultIfCancelable(event);

    const now = Date.now();
    if (now - moveThrottleRef.current < MOVE_EVENT_THROTTLE_MS) return;
    moveThrottleRef.current = now;

    const pointer = buildPointerPayloadFromClient(touch.clientX, touch.clientY);
    if (!pointer) return;

    const deltaX = Math.abs(pointer.x - touchStateRef.current.startX);
    const deltaY = Math.abs(pointer.y - touchStateRef.current.startY);
    if (deltaX > TOUCH_TAP_MAX_MOVE || deltaY > TOUCH_TAP_MAX_MOVE) {
      touchStateRef.current.moved = true;
    }

    touchStateRef.current.x = pointer.x;
    touchStateRef.current.y = pointer.y;

    sendRemoteDesktopInput({
      type: "move",
      ...pointer,
    });
  };

  const finishTouchInteraction = (event) => {
    if (!remoteDesktopSession || !touchStateRef.current.active) return;
    preventDefaultIfCancelable(event);

    const touch = getPrimaryTouch(event);
    const pointer = touch
      ? buildPointerPayloadFromClient(touch.clientX, touch.clientY)
      : { x: touchStateRef.current.x, y: touchStateRef.current.y };
    if (!pointer) {
      touchStateRef.current.active = false;
      return;
    }

    sendRemoteDesktopInput({
      type: "mouse-up",
      button: "left",
      ...pointer,
    });

    if (!touchStateRef.current.moved) {
      sendRemoteDesktopInput({
        type: "click",
        button: "left",
        ...pointer,
      });
      ignoreNextClickRef.current = true;
    }

    touchStateRef.current.active = false;
  };

  const handleTouchEnd = (event) => {
    finishTouchInteraction(event);
  };

  const handleTouchCancel = (event) => {
    finishTouchInteraction(event);
  };

  return (
    <div className="room-page">
      <LowNetworkWarning getPeerConnections={getPeerConnections} />
      <div className="room-header panel">
        <div className="room-header-main">
          <h3 className="room-title">Room: {id}</h3>
          <p className="room-meta">
            <span className="room-badge">{modeLabel}</span>
            <span className="room-meta-sep">•</span>
            <span>
              {participantCount} participant{participantCount === 1 ? "" : "s"}
            </span>
          </p>
          <div className={`connection-pill ${socketConnected && browserOnline ? "connection-pill--online" : ""}`}>
            {!browserOnline
              ? "Internet offline"
              : socketConnected
              ? "Realtime connected"
              : "Reconnecting to server..."}
          </div>
        </div>
      </div>

      <div className="room-toolbar">
        <div className="room-toolbar-group">
          <button onClick={toggleMic} disabled={!stream} className="btn btn-default">
            {audioEnabled ? "Mute Mic" : "Unmute Mic"}
          </button>

          {hasVideoTrack && (
            <button onClick={toggleCamera} className="btn btn-default">
              {videoEnabled ? "Turn Camera Off" : "Turn Camera On"}
            </button>
          )}

          {hasVideoTrack && !isScreenSharing && (
            <button onClick={startScreenShare} className="btn btn-primary">
              Share Screen
            </button>
          )}

          {isScreenSharing && (
            <button onClick={stopScreenShare} className="btn btn-danger">
              Stop Sharing
            </button>
          )}

          <button onClick={() => endCall(id)} className="btn btn-danger">
            End Call
          </button>
        </div>

        <div className="room-toolbar-group room-toolbar-group--secondary">
          <button onClick={() => setShowRemotePanel((prev) => !prev)} className="btn btn-default">
            {shouldShowRemotePanel ? "Hide Remote Panel" : "Remote Control"}
          </button>

          <button
            onClick={async () => {
              const url = window.location.href;
              if (navigator.share) {
                try {
                  await navigator.share({ url });
                  return;
                } catch {
                  // fall through to copy fallback
                }
              }

              const copied = await copyTextFallback(url);
              if (copied) {
                alert("Link copied!");
                return;
              }

              window.prompt("Copy this room link:", url);
            }}
            className="btn btn-primary"
          >
            Share Link
          </button>
        </div>
      </div>

      {shouldShowRemotePanel && (
        <div className={`remote-card ${isVideoSpotlightActive ? "remote-card--dimmed" : ""}`}>
          <div className="remote-card-header">
            <div className="remote-card-top">
              <h4 className="remote-card-title">Full Remote Desktop (Host Agent)</h4>
            </div>
            <p className="remote-card-subtitle">
              Request remote control from an available host agent.
            </p>
          </div>

          <div className="remote-card-body">
            {!remoteDesktopSession && (
              <>
                {remoteHosts.length > 0 ? (
                  <div className="remote-connect-row">
                    <select
                      value={effectiveSelectedRemoteHostId}
                      onChange={(event) => setSelectedRemoteHostId(event.target.value)}
                      className="remote-host-select"
                    >
                      <option value="">Select Host</option>
                      {hostSelectOptions.map((hostOption) => (
                        <option key={hostOption.value} value={hostOption.value}>
                          {hostOption.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => claimRemoteHost(effectiveSelectedRemoteHostId)}
                      disabled={!canClaimSelectedHost}
                      className="btn btn-secondary remote-claim-btn"
                    >
                      {selectedRemoteHostOwnership === "other"
                        ? "Claimed by Other"
                        : selectedRemoteHostOwnership === "you"
                        ? "Host Claimed"
                        : "Claim As My Host"}
                    </button>
                    <button
                      onClick={connectRemoteDesktop}
                      disabled={!canRequestSelectedHost}
                      className="btn btn-primary remote-connect-btn"
                    >
                      {remoteDesktopPendingRequest
                        ? "Waiting for Approval..."
                        : !effectiveSelectedRemoteHostId
                        ? "Select Host"
                        : selectedRemoteHost?.busy
                        ? "Host Busy"
                        : selectedRemoteHostOwnership === "unclaimed"
                        ? "Host Must Be Claimed"
                        : selectedRemoteHostOwnership === "you"
                        ? "Other User Must Request"
                        : "Request Remote Control"}
                    </button>
                    {remoteDesktopPendingRequest && (
                      <button onClick={stopRemoteDesktopSession} className="btn btn-danger remote-connect-btn">
                        Cancel Request
                      </button>
                    )}
                    <div className="muted-text">
                      Host tags: <strong>You</strong> means claimed by you, <strong>Other</strong>{" "}
                      means claimed by the other participant, <strong>Unclaimed</strong> means
                      someone still needs to claim the host before requesting control.
                    </div>
                  </div>
                ) : (
                  <div className="remote-setup-row">
                    <select
                      value={effectiveSetupPeerId}
                      onChange={(event) => setSelectedSetupPeerId(event.target.value)}
                      className="remote-host-select"
                      disabled={otherParticipants.length <= 1}
                    >
                      <option value="">
                        {otherParticipants.length === 0
                          ? "No participant available"
                          : "Select Other"}
                      </option>
                      {setupParticipantOptions.map((participantOption) => (
                        <option key={participantOption.value} value={participantOption.value}>
                          {participantOption.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => requestRemoteHostSetup(effectiveSetupPeerId)}
                      disabled={!effectiveSetupPeerId || !!remoteHostSetupPending}
                      className="btn btn-primary remote-connect-btn"
                    >
                      {remoteHostSetupPending
                        ? "Waiting Setup Approval..."
                        : "Request Host Setup"}
                    </button>
                  </div>
                )}
              </>
            )}

            {remoteDesktopSession && (
              <div className="remote-status-row">
                <div className="remote-host-label">Connected to host: {remoteDesktopSession.hostId}</div>
                <button onClick={stopRemoteDesktopSession} className="btn btn-danger">
                  Disconnect Desktop
                </button>
              </div>
            )}

            {remoteDesktopError && <div className="error-text">{remoteDesktopError}</div>}
            {remoteHostSetupStatus && <div className="muted-text">{remoteHostSetupStatus}</div>}
            {hostAppInstallPrompt && (
              <div className="host-app-prompt">
                <div className="host-app-prompt-title">Host App Required</div>
                <div className="host-app-prompt-text">
                  {hostAppInstallPrompt.message}
                </div>
                <div className="host-app-prompt-text">
                  Ask the other user to install and run the host app, then continue.
                </div>
                <div className="host-app-prompt-actions">
                  {!!hostAppInstallPrompt.downloadUrl && (
                    <button
                      onClick={() =>
                        window.open(hostAppInstallPrompt.downloadUrl, "_blank", "noopener,noreferrer")
                      }
                      className="btn btn-primary"
                    >
                      Download Host App
                    </button>
                  )}
                  <button
                    onClick={dismissHostAppInstallPrompt}
                    className="btn btn-default"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
            {incomingRemoteDesktopRequest && (
              <div className="remote-status-row">
                <div className="remote-host-label">
                  {incomingRemoteDesktopRequest.requesterId} requested remote control for host{" "}
                  {incomingRemoteDesktopRequest.hostId || "unknown"}.
                </div>
                <button
                  onClick={() => respondToRemoteDesktopRequest(true)}
                  className="btn btn-primary"
                >
                  Accept
                </button>
                <button
                  onClick={() => respondToRemoteDesktopRequest(false)}
                  className="btn btn-danger"
                >
                  Reject
                </button>
              </div>
            )}
            {incomingRemoteHostSetupRequest && (
              <div className="remote-status-row">
                <div className="remote-host-label">
                  {incomingRemoteHostSetupRequest.requesterId} asked to start host app on your
                  device.
                </div>
                <button
                  onClick={() => respondToRemoteHostSetupRequest(true)}
                  className="btn btn-primary"
                >
                  Accept & Setup
                </button>
                <button
                  onClick={() => respondToRemoteHostSetupRequest(false)}
                  className="btn btn-danger"
                >
                  Reject
                </button>
              </div>
            )}
            {remoteDesktopPendingRequest && !remoteDesktopSession && (
              <div className="muted-text">
                Request sent to host {remoteDesktopPendingRequest.hostId}. Waiting for other participant approval.
              </div>
            )}
            {remoteHostSetupPending && !remoteDesktopSession && (
              <div className="muted-text">
                Host setup request sent to {remoteHostSetupPending.targetPeerId}. Waiting for
                acceptance.
              </div>
            )}

            <div
              ref={remoteSurfaceRef}
              tabIndex={0}
              onClick={(event) => {
                if (!remoteDesktopSession) return;
                setRemoteInputActive(true);
                handleRemoteClick(event);
              }}
              onMouseMove={handleRemoteMove}
              onMouseDown={handleRemoteMouseDown}
              onMouseUp={handleRemoteMouseUp}
              onWheel={handleRemoteWheel}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchCancel}
              onContextMenu={preventDefaultIfCancelable}
              className={`remote-surface ${isControlActive ? "remote-surface--active" : ""}`}
            >
              {hasRemoteDesktopFrame ? (
                <img
                  ref={remoteFrameRef}
                  alt="Remote desktop"
                  className={`remote-surface-frame ${
                    isControlActive ? "remote-surface-frame--active" : ""
                  }`}
                  draggable={false}
                />
              ) : (
                <div className="remote-surface-empty">
                  <div className="remote-surface-empty-title">
                    {remoteDesktopSession ? "Waiting for host frames..." : "No active desktop session"}
                  </div>
                  <div className="remote-surface-empty-subtitle">
                    Click the panel after connect to start keyboard and mouse control.
                  </div>
                </div>
              )}

              {remoteDesktopSession && (
                <div className="remote-surface-badge">
                  {isControlActive ? "Control Active (Esc to release)" : "Click to Control"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isVideoSpotlightActive ? (
        <div className="spotlight-layout">
          <div className="spotlight-main panel">
            <div className="spotlight-main-header">
              <h4 className="feed-title">{activeVideoTile.label}</h4>
              <button onClick={() => setZoomTarget("")} className="btn btn-secondary feed-zoom-btn">
                Unzoom
              </button>
            </div>
            <UserFeedPlayer
              stream={activeVideoTile.stream}
              muted={activeVideoTile.muted}
              isLocal={activeVideoTile.isLocal}
            />
          </div>

          <div className="spotlight-strip">
            {videoTiles
              .filter((tile) => tile.id !== activeVideoTile.id)
              .map((tile) => (
                <div key={tile.id} className="spotlight-tile">
                  <div className="participant-card-header">
                    <div className="participant-name">{tile.label}</div>
                    <button onClick={() => setZoomTarget(tile.id)} className="btn btn-secondary feed-zoom-btn">
                      Focus
                    </button>
                  </div>
                  <UserFeedPlayer stream={tile.stream} muted={tile.muted} isLocal={tile.isLocal} />
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="feeds-layout">
          <div className="feed-section">
            <div className="feed-title-row">
              <h4 className="feed-title">
                You {!stream && "(No Media)"} {stream && !hasVideoTrack && "(Audio Only)"}
              </h4>
              <button onClick={() => toggleZoom("local")} className="btn btn-secondary feed-zoom-btn">
                Zoom
              </button>
            </div>
            <UserFeedPlayer stream={stream} muted={true} isLocal />
          </div>

          <div className="feed-section">
            <h4 className="feed-title">Participants</h4>
            <div className="participants-grid">
              {peerIds.length === 0 && participantsWithoutMedia.length === 0 && (
                <div className="muted-text">No other participants</div>
              )}

              {peerIds.map((peerId) => (
                <div key={peerId} className="participant-card">
                  <div className="participant-card-header">
                    <div className="participant-name">{peerId}</div>
                    <button onClick={() => toggleZoom(`peer:${peerId}`)} className="btn btn-secondary feed-zoom-btn">
                      Zoom
                    </button>
                  </div>
                  <UserFeedPlayer stream={peers[peerId].stream} muted={false} />
                </div>
              ))}

              {participantsWithoutMedia.map((participantId) => (
                <div key={`nomedia:${participantId}`} className="participant-card">
                  <div className="participant-card-header">
                    <div className="participant-name">{participantId}</div>
                  </div>
                  <div className="muted-text">Joined without media</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Room;
