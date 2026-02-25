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
import { useParticipantAudioState } from "../features/room/hooks/useParticipantAudioState";
import { usePictureInPictureController } from "../features/room/hooks/usePictureInPictureController";
import { useConnectionQualityStatus } from "../features/room/hooks/useConnectionQualityStatus";
import { useRoomRejoinRecovery } from "../features/room/hooks/useRoomRejoinRecovery";
import { copyTextFallback, isInsecureContextOnLanIp } from "../features/room/utils/roomAccessHelpers";
import {
  clearActiveRoomSession,
  clearHomeJoinPreference,
  readActiveRoomSessionModeForRoom,
  readHomeJoinPreference,
  saveActiveRoomSession,
  saveQuickRejoinRoom,
} from "../features/room/utils/roomSessionStorage";
import { registerRemoteKeyboardControl } from "../features/remoteDesktop/utils/remoteKeyboardControl";

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
    roomParticipantProfiles,
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

  const initialResumeJoinMode =
    readActiveRoomSessionModeForRoom(id) || readHomeJoinPreference();

  const [hasJoined, setHasJoined] = useState(false);
  const [resumeJoinMode, setResumeJoinMode] = useState(initialResumeJoinMode);
  const [isAutoJoining, setIsAutoJoining] = useState(!!initialResumeJoinMode);
  const [remoteInputActive, setRemoteInputActive] = useState(false);
  const [showRemotePanel, setShowRemotePanel] = useState(false);
  const [zoomTarget, setZoomTarget] = useState("");
  const [selectedRemoteHostId, setSelectedRemoteHostId] = useState("");
  const [selectedSetupPeerId, setSelectedSetupPeerId] = useState("");
  const autoJoinAttemptedRef = useRef(false);
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
        saveActiveRoomSession({ roomId: id, mode: "none" });
        return { ok: true, reason: "" };
      }

      if (isInsecureContextOnLanIp()) {
        alert(
          "Camera/mic on local IP needs HTTPS. Use localhost on this machine or open the app via an HTTPS tunnel/domain."
        );
        return { ok: false, reason: "insecure" };
      }

      const media = await provideStream(mode === "video");
      if (!media) {
        return { ok: false, reason: "media" };
      }
      setHasJoined(true);
      saveActiveRoomSession({ roomId: id, mode });
      return { ok: true, reason: "" };
    },
    [id, provideStream]
  );

  useEffect(() => {
    if (hasJoined) return;
    if (autoJoinAttemptedRef.current) return;
    const mode = String(resumeJoinMode || "").trim();
    if (!mode) return;
    autoJoinAttemptedRef.current = true;

    const autoJoin = async () => {
      setIsAutoJoining(true);
      clearHomeJoinPreference();
      const maxAttempts = mode === "none" ? 1 : 3;
      const retryDelayMs = 650;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const result = await joinRoomWithMode(mode);
        if (result?.ok) {
          setIsAutoJoining(false);
          setResumeJoinMode("");
          return;
        }
        if (result?.reason !== "media") {
          setIsAutoJoining(false);
          setResumeJoinMode("");
          return;
        }
        if (attempt === maxAttempts - 1) {
          setIsAutoJoining(false);
          setResumeJoinMode("");
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
      }

      setIsAutoJoining(false);
      setResumeJoinMode("");
    };

    void autoJoin();
  }, [hasJoined, joinRoomWithMode, resumeJoinMode]);

  useRoomRejoinRecovery({
    socket,
    roomId: id,
    user,
    hasJoined,
    roomParticipants,
  });

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
    roomParticipantProfiles,
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
  const { isPeerMuted, togglePeerMuted } = useParticipantAudioState(peerIds);
  const {
    registerVideoElement,
    isPictureInPictureSupported,
    isPictureInPictureActive,
    togglePictureInPicture,
  } = usePictureInPictureController();
  const connectionQualityStatus = useConnectionQualityStatus({
    browserOnline,
    socketConnected,
    getPeerConnections,
  });

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
        isAutoJoining={isAutoJoining}
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

  const handleEndCall = () => {
    const rejoinMode = !stream ? "none" : hasVideoTrack ? "video" : "audio";
    clearActiveRoomSession();
    saveQuickRejoinRoom({
      roomId: id,
      mode: rejoinMode,
    });
    endCall(id);
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
        connectionQualityStatus={connectionQualityStatus}
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
        onEndCall={handleEndCall}
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
        roomParticipantProfiles={roomParticipantProfiles}
        participantsWithoutMedia={participantsWithoutMedia}
        toggleZoom={toggleZoom}
        isPeerMuted={isPeerMuted}
        togglePeerMuted={togglePeerMuted}
        registerVideoElement={registerVideoElement}
        togglePictureInPicture={togglePictureInPicture}
        isPictureInPictureSupported={isPictureInPictureSupported}
        isPictureInPictureActive={isPictureInPictureActive}
      />
    </div>
  );
};

export default Room;
