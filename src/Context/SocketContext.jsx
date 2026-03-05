import { useCallback, useEffect, useRef, useState, useReducer } from "react";
import { useNavigate } from "react-router-dom";
import Peer from "peerjs";
import { v4 as UUIDv4 } from "uuid";

import { peerReducer } from "../Reducers/peerReducer";
import { removePeerAction } from "../Actions/peerAction";
import { SocketContext } from "./socketContextValue";
import {
  getOrCreateStablePeerId,
  rotateStablePeerId,
  saveStablePeerId,
} from "../utils/peerStableIdentity";
import {
  HOST_APP_REQUIRED_ERROR_CODES,
  REMOTE_DEBUG_ENABLED,
  buildHostAppDownloadUrl,
  buildPeerConnectionConfig,
} from "../config/runtimeConfig";
import { socket } from "../services/socketClient";
import { isPeerReadyForCalls } from "../utils/peerCallUtils";
import { registerSocketContextEvents } from "./socketEventHandlers";
import { useSyncedRef } from "../hooks/useSyncedRef";
import { usePeerCallManager } from "./hooks/usePeerCallManager";
import { useRemoteDesktopControls } from "./hooks/useRemoteDesktopControls";
import { useDirectCallState } from "./hooks/useDirectCallState";
import { useMediaStream } from "../hooks/useMediaStream";
import { useScreenShare } from "../hooks/useScreenShare";
import { useSocketConnectivity } from "../hooks/useSocketConnectivity";

export const SocketProvider = ({ children }) => {
  const navigate = useNavigate();

  // ── Media stream ──────────────────────────────────────────────────────────
  const { stream, setStream, audioEnabled, videoEnabled, setVideoEnabled, provideStream, toggleMic } =
    useMediaStream();

  // ── PeerJS user instance ──────────────────────────────────────────────────
  const [user, setUser] = useState(() => {
    const stablePeerId = getOrCreateStablePeerId({ prefix: "peer" }) || UUIDv4();
    return new Peer(stablePeerId, buildPeerConnectionConfig());
  });
  const [peers, dispatch] = useReducer(peerReducer, {});

  // ── Refs ──────────────────────────────────────────────────────────────────
  const callsRef = useRef({});
  const pendingParticipantsRef = useRef([]);
  const remoteSessionIdRef = useRef(null);
  const remoteSessionHostIdRef = useRef("");
  const remoteInputDebugRef = useRef({ count: 0, lastLoggedAt: 0 });
  const remoteFrameSubscribersRef = useRef(new Set());
  const hasRemoteDesktopFrameRef = useRef(false);
  const manualShutdownRef = useRef(false);

  // ── Remote desktop state ──────────────────────────────────────────────────
  const [remoteDesktopSession, setRemoteDesktopSession] = useState(null);
  const [remoteDesktopPendingRequest, setRemoteDesktopPendingRequest] = useState(null);
  const [remoteHosts, setRemoteHosts] = useState([]);
  const [roomParticipants, setRoomParticipants] = useState([]);
  const [roomParticipantProfiles, setRoomParticipantProfiles] = useState({});
  const [claimedRemoteHostId, setClaimedRemoteHostId] = useState("");
  const [incomingRemoteDesktopRequest, setIncomingRemoteDesktopRequest] = useState(null);
  const [incomingRemoteHostSetupRequest, setIncomingRemoteHostSetupRequest] = useState(null);
  const [remoteHostSetupPending, setRemoteHostSetupPending] = useState(null);
  const [remoteHostSetupStatus, setRemoteHostSetupStatus] = useState("");
  const [autoClaimRemoteHostId, setAutoClaimRemoteHostId] = useState("");
  const [autoRequestRemoteHostId, setAutoRequestRemoteHostId] = useState("");
  const [hasRemoteDesktopFrame, setHasRemoteDesktopFrame] = useState(false);
  const [remoteDesktopError, setRemoteDesktopError] = useState("");
  const [hostAppInstallPrompt, setHostAppInstallPrompt] = useState(null);

  // ── Synced refs (always reflect latest state value for async callbacks) ───
  const userRef = useSyncedRef(user);
  const streamRef = useSyncedRef(stream);
  const claimedRemoteHostIdRef = useSyncedRef(claimedRemoteHostId);
  const autoClaimRemoteHostIdRef = useSyncedRef(autoClaimRemoteHostId);
  const autoRequestRemoteHostIdRef = useSyncedRef(autoRequestRemoteHostId);
  const remoteDesktopPendingRequestRef = useSyncedRef(remoteDesktopPendingRequest);
  const remoteHostsRef = useSyncedRef(remoteHosts);

  const logRemote = (eventName, payload = undefined) => {
    if (!REMOTE_DEBUG_ENABLED) return;
    const normalizedEventName = String(eventName || "").trim() || "event";
    if (typeof payload === "undefined") {
      console.debug(`[remote-ui] ${normalizedEventName}`);
      return;
    }
    console.debug(`[remote-ui] ${normalizedEventName}`, payload);
  };

  const reconnectPeerIfNeeded = useCallback(() => {
    const activeUser = userRef.current;
    if (!activeUser || manualShutdownRef.current) return false;
    if (activeUser.destroyed) return false;
    if (!activeUser.disconnected) return false;
    if (typeof activeUser.reconnect !== "function") return false;

    try {
      activeUser.reconnect();
      return true;
    } catch {
      return false;
    }
  }, [userRef]);

  const subscribeRemoteDesktopFrame = useCallback((listener) => {
    if (typeof listener !== "function") return () => {};

    const listeners = remoteFrameSubscribersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const {
    getPeerConnections,
    clearAllPeerConnections,
    setupCallHandlers,
    addPendingParticipants,
    startCallToParticipant,
    drainPendingParticipants,
    fetchParticipantList,
  } = usePeerCallManager({
    userRef,
    streamRef,
    callsRef,
    pendingParticipantsRef,
    dispatch,
    setRoomParticipants,
    setRoomParticipantProfiles,
  });

  // ── PeerJS lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return () => {};

    const onOpen = (peerId) => {
      const normalizedPeerId = String(peerId || "").trim();
      if (!normalizedPeerId) return;
      saveStablePeerId(normalizedPeerId);

      if (socket.connected) {
        socket.emit("ready");
        void drainPendingParticipants(user, streamRef.current);
      }
    };

    const onDisconnected = () => {
      if (manualShutdownRef.current) return;
      try {
        user.reconnect();
      } catch {
        // noop
      }
    };

    const onError = (err) => {
      if (manualShutdownRef.current) return;

      const errorType = String(err?.type || "").trim().toLowerCase();
      if (errorType === "unavailable-id") {
        const fallbackPeerId = rotateStablePeerId({ prefix: "peer" }) || UUIDv4();
        clearAllPeerConnections();
        try {
          user.destroy();
        } catch {
          // noop
        }
        setUser(new Peer(fallbackPeerId, buildPeerConnectionConfig()));
        return;
      }

      if (
        errorType === "network" ||
        errorType === "server-error" ||
        errorType === "socket-error"
      ) {
        try {
          user.reconnect();
        } catch {
          // noop
        }
      }
    };

    user.on("open", onOpen);
    user.on("disconnected", onDisconnected);
    user.on("error", onError);

    return () => {
      try {
        user.off("open", onOpen);
        user.off("disconnected", onDisconnected);
        user.off("error", onError);
      } catch {
        // noop
      }
    };
  }, [clearAllPeerConnections, drainPendingParticipants, streamRef, user]);

  // ── Screen sharing + adaptive video ───────────────────────────────────────
  const { isScreenSharing, startScreenShare, stopScreenShare, stopAdaptiveVideo, cleanupScreenShare } =
    useScreenShare({ stream, streamRef, setStream, setVideoEnabled, callsRef, getPeerConnections });

  // ── Remote desktop controls ───────────────────────────────────────────────
  const {
    refreshRemoteHosts,
    requestRemoteDesktopSession,
    requestRemoteHostSetup,
    claimRemoteHost,
    stopRemoteDesktopSession,
    dismissHostAppInstallPrompt,
    respondToRemoteDesktopRequest,
    respondToRemoteHostSetupRequest,
    sendRemoteDesktopInput,
  } = useRemoteDesktopControls({
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
  });

  // ── Direct calls ──────────────────────────────────────────────────────────
  const {
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
  } = useDirectCallState({ socket, navigate });

  // ── Socket + browser network state ───────────────────────────────────────
  const { socketConnected, socketConnectError, browserOnline } = useSocketConnectivity({
    socket,
    reconnectPeerIfNeeded,
    refreshRemoteHosts,
  });

  // ── Socket event handlers (room, remote desktop, presence) ───────────────
  useEffect(() => {
    return registerSocketContextEvents({
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
      hostAppRequiredErrorCodes: HOST_APP_REQUIRED_ERROR_CODES,
      buildHostAppDownloadUrl,
      pendingParticipantsRef,
    });
  }, [
    autoClaimRemoteHostIdRef,
    autoRequestRemoteHostIdRef,
    claimedRemoteHostIdRef,
    clearAllPeerConnections,
    fetchParticipantList,
    navigate,
    remoteDesktopPendingRequestRef,
    requestRemoteDesktopSession,
  ]);

  useEffect(() => {
    refreshRemoteHosts();
  }, [refreshRemoteHosts]);

  // ── Incoming calls + user-joined ──────────────────────────────────────────
  useEffect(() => {
    if (!user || !stream) return;

    user.on("call", (call) => {
      call.answer(stream);
      setupCallHandlers(call, call.peer);
    });

    const onUserJoined = ({ peerId, participantProfile }) => {
      if (!peerId || peerId === user.id) return;
      setRoomParticipants((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]));

      const profile = participantProfile || {};
      const normalizedDisplayName = String(profile.displayName || "").trim();
      const normalizedEmail = String(profile.email || "").trim().toLowerCase();
      const normalizedLabel =
        String(profile.label || "").trim() ||
        normalizedDisplayName ||
        normalizedEmail ||
        String(peerId || "").trim();
      if (normalizedLabel) {
        setRoomParticipantProfiles((prev) => ({
          ...prev,
          [peerId]: {
            displayName: normalizedDisplayName,
            email: normalizedEmail,
            label: normalizedLabel,
          },
        }));
      }

      if (!isPeerReadyForCalls(user)) {
        addPendingParticipants([peerId]);
        return;
      }

      const started = startCallToParticipant(user, stream, peerId);
      if (!started) {
        addPendingParticipants([peerId]);
      }
    };

    socket.on("user-joined", onUserJoined);

    const emitReady = () => {
      if (!isPeerReadyForCalls(user)) return;
      socket.emit("ready");
    };
    const onSocketConnect = () => {
      reconnectPeerIfNeeded();
      emitReady();
      void drainPendingParticipants(user, stream);
    };
    const onPeerOpen = () => {
      emitReady();
      void drainPendingParticipants(user, stream);
    };

    socket.on("connect", onSocketConnect);
    user.on("open", onPeerOpen);

    onSocketConnect();

    return () => {
      try {
        user.off("call");
        user.off("open", onPeerOpen);
      } catch {
        // noop
      }
      socket.off("connect", onSocketConnect);
      socket.off("user-joined", onUserJoined);
    };
  }, [
    addPendingParticipants,
    drainPendingParticipants,
    reconnectPeerIfNeeded,
    setupCallHandlers,
    startCallToParticipant,
    stream,
    user,
  ]);

  // ── Media controls ────────────────────────────────────────────────────────
  const toggleCamera = () => {
    if (!stream || isScreenSharing) return;

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;

    videoTracks.forEach((t) => {
      t.enabled = !t.enabled;
    });
    setVideoEnabled(videoTracks.some((t) => t.enabled));
    setStream(new MediaStream(stream.getTracks()));
  };

  // ── End call ──────────────────────────────────────────────────────────────
  const endCall = (roomId) => {
    manualShutdownRef.current = true;
    stopAdaptiveVideo();

    if (remoteDesktopSession?.sessionId) {
      socket.emit("remote-session-stop", { sessionId: remoteDesktopSession.sessionId });
    }

    clearAllPeerConnections();

    try {
      if (user) user.destroy();
    } catch {
      // noop
    }

    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }

    setRemoteDesktopSession(null);
    setRemoteDesktopPendingRequest(null);
    setIncomingRemoteDesktopRequest(null);
    setIncomingRemoteHostSetupRequest(null);
    setRemoteHostSetupPending(null);
    setRemoteHostSetupStatus("");
    remoteSessionIdRef.current = null;
    remoteSessionHostIdRef.current = "";
    hasRemoteDesktopFrameRef.current = false;
    setHasRemoteDesktopFrame(false);
    setRemoteDesktopError("");
    setRoomParticipants([]);
    setRoomParticipantProfiles({});

    cleanupScreenShare();

    Object.keys(peers).forEach((pid) => {
      dispatch(removePeerAction(pid));
    });

    try {
      socket.emit("leave-room", { roomId, peerId: user?.id });
    } catch {
      // noop
    }

    setStream(null);
    setUser(null);
    navigate("/");
    window.location.reload();
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        user,
        stream,
        peers,
        incomingCall,
        outgoingCall,
        directCallNotice,
        notificationPermissionState,
        canShowCallNotifications,
        audioEnabled,
        videoEnabled,
        remoteDesktopSession,
        remoteDesktopPendingRequest,
        remoteHosts,
        roomParticipants,
        roomParticipantProfiles,
        claimedRemoteHostId,
        incomingRemoteDesktopRequest,
        incomingRemoteHostSetupRequest,
        remoteHostSetupPending,
        remoteHostSetupStatus,
        hasRemoteDesktopFrame,
        remoteDesktopError,
        hostAppInstallPrompt,
        socketConnected,
        socketConnectError,
        browserOnline,
        setDirectCallNotice,
        startDirectCall,
        cancelOutgoingCall,
        acceptIncomingCall,
        rejectIncomingCall,
        requestCallNotificationPermission,
        resetDirectCallState,
        provideStream,
        toggleMic,
        toggleCamera,
        isScreenSharing,
        startScreenShare,
        stopScreenShare,
        requestRemoteDesktopSession,
        requestRemoteHostSetup,
        claimRemoteHost,
        refreshRemoteHosts,
        stopRemoteDesktopSession,
        dismissHostAppInstallPrompt,
        respondToRemoteDesktopRequest,
        respondToRemoteHostSetupRequest,
        subscribeRemoteDesktopFrame,
        sendRemoteDesktopInput,
        getPeerConnections,
        endCall,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
