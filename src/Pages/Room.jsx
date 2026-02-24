import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { SocketContext } from "../Context/socketContextValue";
import LowNetworkWarning from "../components/LowNetworkWarning";
import RoomJoinGate from "../features/room/components/RoomJoinGate";
import RoomHeaderBar from "../features/room/components/RoomHeaderBar";
import RoomToolbar from "../features/room/components/RoomToolbar";
import RoomFeeds from "../features/room/components/RoomFeeds";
import RemoteDesktopPanel from "../features/remoteDesktop/components/RemoteDesktopPanel";
import { useRemotePointerHandlers } from "../features/remoteDesktop/hooks/useRemotePointerHandlers";
import { useRoomDerivedState } from "../features/room/hooks/useRoomDerivedState";
import { copyTextFallback, isInsecureContextOnLanIp } from "../features/room/utils/roomAccessHelpers";
import { registerRemoteKeyboardControl } from "../features/remoteDesktop/utils/remoteKeyboardControl";
import { isPeerReadyForCalls } from "../utils/peerCallUtils";

const HOME_JOIN_PREF_KEY = "home_join_pref_v1";
const HOME_JOIN_PREF_MAX_AGE_MS = 5 * 60 * 1000;

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

  const joinRoomWithMode = useCallback(
    async (mode) => {
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
    },
    [provideStream]
  );

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

      if (hasJoined && isPeerReadyForCalls(user)) {
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
  }, [hasJoined, id, socket, user, user?.id]);

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
    return registerRemoteKeyboardControl({
      remoteInputActive,
      remoteDesktopSession,
      sendRemoteDesktopInput,
      setRemoteInputActive,
    });
  }, [remoteInputActive, remoteDesktopSession, sendRemoteDesktopInput]);

  const {
    shouldShowRemotePanel,
    hasVideoTrack,
    otherParticipants,
    effectiveSelectedRemoteHostId,
    selectedRemoteHost,
    selectedRemoteHostOwnership,
    canClaimSelectedHost,
    canRequestSelectedHost,
    effectiveSetupPeerId,
    hostSelectOptions,
    setupParticipantOptions,
    peerIds,
    participantsWithoutMedia,
    participantCount,
    modeLabel,
    videoTiles,
    activeVideoTile,
    isVideoSpotlightActive,
  } = useRoomDerivedState({
    stream,
    peers,
    roomParticipants,
    userId: user?.id,
    isScreenSharing,
    remoteDesktopSession,
    remoteDesktopPendingRequest,
    incomingRemoteDesktopRequest,
    remoteDesktopError,
    hostAppInstallPrompt,
    hasRemoteDesktopFrame,
    showRemotePanel,
    remoteHosts,
    selectedRemoteHostId,
    selectedSetupPeerId,
    zoomTarget,
  });

  const isControlActive =
    remoteInputActive && !!remoteDesktopSession && socketConnected && browserOnline;

  const {
    handleRemoteMove,
    handleRemoteClick,
    handleRemoteMouseDown,
    handleRemoteMouseUp,
    handleRemoteWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  } = useRemotePointerHandlers({
    remoteDesktopSession,
    isControlActive,
    sendRemoteDesktopInput,
    setRemoteInputActive,
    moveThrottleRef,
    remoteSurfaceRef,
    remoteFrameRef,
    touchStateRef,
    ignoreNextClickRef,
  });

  if (!hasJoined) {
    return (
      <RoomJoinGate
        roomId={id}
        joinRoomWithMode={joinRoomWithMode}
        getPeerConnections={getPeerConnections}
      />
    );
  }

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

  const toggleZoom = (targetId) => {
    setZoomTarget((prev) => (prev === targetId ? "" : targetId));
  };

  const handleShareLink = async () => {
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
  };

  return (
    <div className="room-page">
      <LowNetworkWarning getPeerConnections={getPeerConnections} />
      <RoomHeaderBar
        roomId={id}
        modeLabel={modeLabel}
        participantCount={participantCount}
        socketConnected={socketConnected}
        browserOnline={browserOnline}
      />

      <RoomToolbar
        stream={stream}
        hasVideoTrack={hasVideoTrack}
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        isScreenSharing={isScreenSharing}
        toggleMic={toggleMic}
        toggleCamera={toggleCamera}
        startScreenShare={startScreenShare}
        stopScreenShare={stopScreenShare}
        onEndCall={() => endCall(id)}
        shouldShowRemotePanel={shouldShowRemotePanel}
        setShowRemotePanel={setShowRemotePanel}
        onShareLink={handleShareLink}
      />

      {shouldShowRemotePanel && (
        <RemoteDesktopPanel
          isVideoSpotlightActive={isVideoSpotlightActive}
          remoteDesktopSession={remoteDesktopSession}
          remoteHosts={remoteHosts}
          effectiveSelectedRemoteHostId={effectiveSelectedRemoteHostId}
          selectedRemoteHostOwnership={selectedRemoteHostOwnership}
          selectedRemoteHost={selectedRemoteHost}
          canClaimSelectedHost={canClaimSelectedHost}
          canRequestSelectedHost={canRequestSelectedHost}
          remoteDesktopPendingRequest={remoteDesktopPendingRequest}
          hostSelectOptions={hostSelectOptions}
          setSelectedRemoteHostId={setSelectedRemoteHostId}
          claimRemoteHost={claimRemoteHost}
          connectRemoteDesktop={connectRemoteDesktop}
          stopRemoteDesktopSession={stopRemoteDesktopSession}
          otherParticipants={otherParticipants}
          effectiveSetupPeerId={effectiveSetupPeerId}
          setSelectedSetupPeerId={setSelectedSetupPeerId}
          setupParticipantOptions={setupParticipantOptions}
          requestRemoteHostSetup={requestRemoteHostSetup}
          remoteHostSetupPending={remoteHostSetupPending}
          remoteDesktopError={remoteDesktopError}
          remoteHostSetupStatus={remoteHostSetupStatus}
          hostAppInstallPrompt={hostAppInstallPrompt}
          dismissHostAppInstallPrompt={dismissHostAppInstallPrompt}
          incomingRemoteDesktopRequest={incomingRemoteDesktopRequest}
          respondToRemoteDesktopRequest={respondToRemoteDesktopRequest}
          incomingRemoteHostSetupRequest={incomingRemoteHostSetupRequest}
          respondToRemoteHostSetupRequest={respondToRemoteHostSetupRequest}
          remoteSurfaceRef={remoteSurfaceRef}
          hasRemoteDesktopFrame={hasRemoteDesktopFrame}
          remoteFrameRef={remoteFrameRef}
          isControlActive={isControlActive}
          setRemoteInputActive={setRemoteInputActive}
          handleRemoteClick={handleRemoteClick}
          handleRemoteMove={handleRemoteMove}
          handleRemoteMouseDown={handleRemoteMouseDown}
          handleRemoteMouseUp={handleRemoteMouseUp}
          handleRemoteWheel={handleRemoteWheel}
          handleTouchStart={handleTouchStart}
          handleTouchMove={handleTouchMove}
          handleTouchEnd={handleTouchEnd}
          handleTouchCancel={handleTouchCancel}
        />
      )}

      <RoomFeeds
        isVideoSpotlightActive={isVideoSpotlightActive}
        activeVideoTile={activeVideoTile}
        videoTiles={videoTiles}
        setZoomTarget={setZoomTarget}
        stream={stream}
        hasVideoTrack={hasVideoTrack}
        peerIds={peerIds}
        peers={peers}
        participantsWithoutMedia={participantsWithoutMedia}
        toggleZoom={toggleZoom}
      />
    </div>
  );
};

export default Room;
