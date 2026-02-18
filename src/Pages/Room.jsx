import { useContext, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { SocketContext } from "../Context/socketContextValue";
import UserFeedPlayer from "../components/UserFeedPlayer";

const mapMouseButton = (button) => {
  if (button === 2) return "right";
  if (button === 1) return "middle";
  return "left";
};

const MOVE_EVENT_THROTTLE_MS = 20;
const TOUCH_TAP_MAX_MOVE = 0.015;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

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

const Room = () => {
  const { id } = useParams();
  const {
    socket,
    user,
    stream,
    peers,
    audioEnabled,
    videoEnabled,
    remoteDesktopSession,
    remoteDesktopPendingRequest,
    incomingRemoteDesktopRequest,
    remoteDesktopFrame,
    remoteDesktopError,
    hostAppInstallPrompt,
    provideStream,
    toggleMic,
    toggleCamera,
    requestRemoteDesktopSession,
    stopRemoteDesktopSession,
    dismissHostAppInstallPrompt,
    respondToRemoteDesktopRequest,
    sendRemoteDesktopInput,
    endCall,
  } = useContext(SocketContext);

  const [hasJoined, setHasJoined] = useState(false);
  const [remoteInputActive, setRemoteInputActive] = useState(false);
  const moveThrottleRef = useRef(0);
  const remoteSurfaceRef = useRef(null);
  const remoteFrameRef = useRef(null);
  const touchStateRef = useRef({
    active: false,
    moved: false,
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
  });
  const ignoreNextClickRef = useRef(false);
  const joinedRoomIdRef = useRef("");

  const handleJoinRoom = async (mode) => {
    if (mode === "none") {
      setHasJoined(true);
      return;
    }

    const media = await provideStream(mode === "video");
    if (!media) return;
    setHasJoined(true);
  };

  useEffect(() => {
    // Join the Socket.IO room as early as possible so the room exists/has identity
    // even before the user chooses audio/video/none. WebRTC calls will wait for stream.
    if (!user || !id) return;
    if (joinedRoomIdRef.current === id) return;

    joinedRoomIdRef.current = id;
    socket.emit("joined-room", {
      roomId: id,
      peerId: user.id,
    });
  }, [id, user, socket]);

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
        event.preventDefault();
        releaseModifierKeys();
        setRemoteInputActive(false);
        return;
      }

      event.preventDefault();
      sendRemoteDesktopInput({
        type: "key-down",
        key: event.key,
        code: event.code,
        repeat: event.repeat,
      });
    };

    const onKeyUp = (event) => {
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
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

  if (!hasJoined) {
    return (
      <div className="room-join-page">
        <h2>Join Room: {id}</h2>
        <p>Choose how you want to join:</p>
        <div className="room-join-actions">
          <button onClick={() => handleJoinRoom("video")} className="btn btn-call-video btn-join">
            Join with Video
          </button>
          <button onClick={() => handleJoinRoom("audio")} className="btn btn-call-audio btn-join">
            Join Audio Only
          </button>
          <button onClick={() => handleJoinRoom("none")} className="btn btn-default btn-join">
            Join Without Media (Remote Only)
          </button>
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

    event.preventDefault();
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

    event.preventDefault();
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

    event.preventDefault();
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

    event.preventDefault();
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
    requestRemoteDesktopSession();
  };

  const isControlActive = remoteInputActive && !!remoteDesktopSession;
  const hasVideoTrack = !!stream && stream.getVideoTracks().length > 0;

  const getPrimaryTouch = (event) => event.touches?.[0] || event.changedTouches?.[0];

  const handleTouchStart = (event) => {
    if (!remoteDesktopSession) return;

    const touch = getPrimaryTouch(event);
    if (!touch) return;
    event.preventDefault();

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
    event.preventDefault();

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
    event.preventDefault();

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
      <h3 className="room-title">Room : {id}</h3>

      <div className="room-toolbar">
        <button onClick={toggleMic} disabled={!stream} className="btn btn-default">
          {audioEnabled ? "Mute Mic" : "Unmute Mic"}
        </button>

        {hasVideoTrack && (
          <button onClick={toggleCamera} className="btn btn-default">
            {videoEnabled ? "Turn Camera Off" : "Turn Camera On"}
          </button>
        )}

        <button onClick={() => endCall(id)} className="btn btn-danger">
          End Call
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

      <div className="remote-card">
        <div className="remote-card-header">
          <h4 className="remote-card-title">Full Remote Desktop (Host Agent)</h4>
          <p className="remote-card-subtitle">
            Request remote control from an available host agent.
          </p>
        </div>

        <div className="remote-card-body">
          {!remoteDesktopSession && (
            <div className="remote-connect-row">
              <button
                onClick={connectRemoteDesktop}
                disabled={!!remoteDesktopPendingRequest}
                className="btn btn-primary remote-connect-btn"
              >
                {remoteDesktopPendingRequest ? "Waiting for Approval..." : "Request Remote Control"}
              </button>
              {remoteDesktopPendingRequest && (
                <button onClick={stopRemoteDesktopSession} className="btn btn-danger remote-connect-btn">
                  Cancel Request
                </button>
              )}
            </div>
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
          {hostAppInstallPrompt && (
            <div className="host-app-prompt">
              <div className="host-app-prompt-title">Host App Required</div>
              <div className="host-app-prompt-text">
                {hostAppInstallPrompt.message}
              </div>
              <div className="host-app-prompt-text">
                Ask the other user to install and run the host app, then retry.
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
                  onClick={() => {
                    dismissHostAppInstallPrompt();
                    requestRemoteDesktopSession();
                  }}
                  className="btn btn-default"
                >
                  Retry Request
                </button>
              </div>
            </div>
          )}
          {incomingRemoteDesktopRequest && (
            <div className="remote-status-row">
              <div className="remote-host-label">
                {incomingRemoteDesktopRequest.requesterId} requested remote control.
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
          {remoteDesktopPendingRequest && !remoteDesktopSession && (
            <div className="muted-text">
              Request sent to host {remoteDesktopPendingRequest.hostId}. Waiting for other participant approval.
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
            onContextMenu={(event) => event.preventDefault()}
            className={`remote-surface ${isControlActive ? "remote-surface--active" : ""}`}
          >
            {remoteDesktopFrame ? (
              <img
                ref={remoteFrameRef}
                src={remoteDesktopFrame}
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

      <div className="feeds-layout">
        <div className="feed-section">
          <h4 className="feed-title">
            You {!stream && "(No Media)"} {stream && !hasVideoTrack && "(Audio Only)"}
          </h4>
          <UserFeedPlayer stream={stream} muted={true} isLocal />
        </div>

        <div className="feed-section">
          <h4 className="feed-title">Participants</h4>
          <div className="participants-grid">
            {Object.keys(peers).length === 0 && (
              <div className="muted-text">No other participants</div>
            )}

            {Object.keys(peers).map((peerId) => (
              <div key={peerId} className="participant-card">
                <UserFeedPlayer stream={peers[peerId].stream} muted={false} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Room;
