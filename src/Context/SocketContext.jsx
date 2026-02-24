import { useCallback, useEffect, useRef, useState, useReducer } from "react";
import { useNavigate } from "react-router-dom";
import Peer from "peerjs";
import { v4 as UUIDv4 } from "uuid";

import { peerReducer } from "../Reducers/peerReducer";
import { removePeerAction } from "../Actions/peerAction";
import { SocketContext } from "./socketContextValue";
import { startAdaptiveVideo } from "../utils/peerAdaptiveVideo";
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
export const SocketProvider = ({ children }) => {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => {
    const stablePeerId = getOrCreateStablePeerId({ prefix: "peer" }) || UUIDv4();
    return new Peer(stablePeerId, buildPeerConnectionConfig());
  });
  const [stream, setStream] = useState(null);
  const [peers, dispatch] = useReducer(peerReducer, {});

  const callsRef = useRef({});
  const pendingParticipantsRef = useRef([]);
  const remoteSessionIdRef = useRef(null);
  const remoteSessionHostIdRef = useRef("");
  const remoteInputDebugRef = useRef({ count: 0, lastLoggedAt: 0 });
  const remoteFrameSubscribersRef = useRef(new Set());
  const hasRemoteDesktopFrameRef = useRef(false);
  const screenShareTrackRef = useRef(null);
  const cameraTrackBeforeShareRef = useRef(null);
  const adaptiveVideoControllerRef = useRef(null);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const [remoteDesktopSession, setRemoteDesktopSession] = useState(null);
  const [remoteDesktopPendingRequest, setRemoteDesktopPendingRequest] = useState(null);
  const [remoteHosts, setRemoteHosts] = useState([]);
  const [roomParticipants, setRoomParticipants] = useState([]);
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
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine !== false
  );
  const manualShutdownRef = useRef(false);

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
    if (typeof listener !== "function") {
      return () => {};
    }

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
  });

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

  const stopAdaptiveVideo = useCallback(() => {
    const controller = adaptiveVideoControllerRef.current;
    if (!controller) return;
    try {
      controller.stop();
    } catch {
      // noop
    }
    adaptiveVideoControllerRef.current = null;
  }, []);

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

  useEffect(() => {
    const onConnect = () => {
      setSocketConnected(true);
      refreshRemoteHosts();
      reconnectPeerIfNeeded();
    };
    const onDisconnect = () => setSocketConnected(false);
    const onConnectError = () => setSocketConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [reconnectPeerIfNeeded, refreshRemoteHosts]);

  useEffect(() => {
    if (typeof window === "undefined") return () => {};

    const onOnline = () => {
      setBrowserOnline(true);
      reconnectPeerIfNeeded();
      if (!socket.connected && typeof socket.connect === "function") {
        socket.connect();
      }
    };

    const onOffline = () => {
      setBrowserOnline(false);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [reconnectPeerIfNeeded]);

  const provideStream = async (isVideoCall = true) => {
    const mediaApiMissing = !navigator.mediaDevices?.getUserMedia;

    if (mediaApiMissing) {
      return null;
    }

    try {
      const constraints = {
        audio: true,
        video: isVideoCall ? true : false,
      };

      const media = await navigator.mediaDevices.getUserMedia(constraints);

      setStream(media);
      setAudioEnabled(media.getAudioTracks().some((t) => t.enabled));

      if (isVideoCall) {
        setVideoEnabled(media.getVideoTracks().some((t) => t.enabled));
      } else {
        setVideoEnabled(false);
      }

      return media;
    } catch (err) {
      console.error("getUserMedia failed:", err?.name || err, err);

      if (err?.name === "NotAllowedError") {
        return null;
      }

      if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        return null;
      }

      if (err?.name === "NotReadableError") {
        return null;
      }

      return null;
    }
  };

  useEffect(() => {
    stopAdaptiveVideo();

    if (!stream || isScreenSharing) return;
    if (stream.getVideoTracks().length === 0) return;

    adaptiveVideoControllerRef.current = startAdaptiveVideo(stream, {
      checkIntervalMs: 3500,
      getPeerConnections,
      lowConstraints: {
        width: { ideal: 426, max: 640 },
        height: { ideal: 240, max: 360 },
        frameRate: { ideal: 12, max: 15 },
      },
      veryLowConstraints: {
        width: { ideal: 320, max: 426 },
        height: { ideal: 180, max: 240 },
        frameRate: { ideal: 8, max: 10 },
      },
    });

    return () => {
      stopAdaptiveVideo();
    };
  }, [getPeerConnections, isScreenSharing, stopAdaptiveVideo, stream]);

  const replaceOutgoingVideoTrack = useCallback(async (nextTrack) => {
    const calls = Object.values(callsRef.current);
    await Promise.all(
      calls.map(async (call) => {
        const senders = call?.peerConnection?.getSenders?.() || [];
        const videoSender = senders.find((sender) => sender?.track?.kind === "video");
        if (!videoSender) return;
        try {
          await videoSender.replaceTrack(nextTrack || null);
        } catch (err) {
          void err;
        }
      })
    );
  }, []);

  const stopScreenShare = useCallback(async () => {
    const activeShareTrack = screenShareTrackRef.current;
    const previousCameraTrack = cameraTrackBeforeShareRef.current;

    if (!activeShareTrack && !isScreenSharing) return;

    screenShareTrackRef.current = null;
    cameraTrackBeforeShareRef.current = null;
    setIsScreenSharing(false);

    const restoredCameraTrack =
      previousCameraTrack && previousCameraTrack.readyState === "live"
        ? previousCameraTrack
        : null;

    await replaceOutgoingVideoTrack(restoredCameraTrack);

    const currentStream = streamRef.current;
    const audioTracks = currentStream ? currentStream.getAudioTracks() : [];
    const nextTracks = [...audioTracks];
    if (restoredCameraTrack) {
      nextTracks.push(restoredCameraTrack);
    }

    setStream(nextTracks.length > 0 ? new MediaStream(nextTracks) : null);
    setVideoEnabled(!!restoredCameraTrack && restoredCameraTrack.enabled);

    if (activeShareTrack && activeShareTrack.readyState === "live") {
      activeShareTrack.stop();
    }
  }, [isScreenSharing, replaceOutgoingVideoTrack, streamRef]);

  const startScreenShare = useCallback(async () => {
    if (isScreenSharing) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert("Screen sharing is not supported in this browser.");
      return;
    }

    const currentStream = streamRef.current;
    const currentCameraTrack = currentStream?.getVideoTracks?.()[0] || null;
    if (!currentStream || !currentCameraTrack) {
      alert("Join with video first to start screen sharing.");
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const displayTrack = displayStream.getVideoTracks?.()[0] || null;
      if (!displayTrack) return;

      cameraTrackBeforeShareRef.current = currentCameraTrack;
      screenShareTrackRef.current = displayTrack;

      await replaceOutgoingVideoTrack(displayTrack);

      const nextTracks = [...currentStream.getAudioTracks(), displayTrack];
      setStream(new MediaStream(nextTracks));
      setVideoEnabled(true);
      setIsScreenSharing(true);

      displayTrack.addEventListener(
        "ended",
        () => {
          void stopScreenShare();
        },
        { once: true }
      );
    } catch (err) {
      if (err?.name === "NotAllowedError") return;
      console.error("getDisplayMedia failed:", err);
      alert("Failed to start screen sharing.");
    }
  }, [isScreenSharing, replaceOutgoingVideoTrack, stopScreenShare, streamRef]);

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

  useEffect(() => {
    if (!user || !stream) return;

    user.on("call", (call) => {
      call.answer(stream);
      setupCallHandlers(call, call.peer);
    });

    const onUserJoined = ({ peerId }) => {
      if (!peerId || peerId === user.id) return;
      setRoomParticipants((prev) =>
        prev.includes(peerId) ? prev : [...prev, peerId]
      );
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

  const toggleMic = () => {
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setAudioEnabled(stream.getAudioTracks().some((t) => t.enabled));
    setStream(new MediaStream(stream.getTracks()));
  };

  const toggleCamera = () => {
    if (!stream) return;
    if (isScreenSharing) {
      return;
    }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      return;
    }
    videoTracks.forEach((t) => {
      t.enabled = !t.enabled;
    });
    setVideoEnabled(videoTracks.some((t) => t.enabled));
    setStream(new MediaStream(stream.getTracks()));
  };

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
    setIsScreenSharing(false);
    setRoomParticipants([]);

    if (screenShareTrackRef.current) {
      try {
        screenShareTrackRef.current.stop();
      } catch {
        // noop
      }
      screenShareTrackRef.current = null;
    }
    cameraTrackBeforeShareRef.current = null;

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
        audioEnabled,
        videoEnabled,
        remoteDesktopSession,
        remoteDesktopPendingRequest,
        remoteHosts,
        roomParticipants,
        claimedRemoteHostId,
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


