import SocketIoClient from "socket.io-client";
import { useCallback, useEffect, useRef, useState, useReducer } from "react";
import { useNavigate } from "react-router-dom";
import Peer from "peerjs";
import { v4 as UUIDv4 } from "uuid";

import { peerReducer } from "../Reducers/peerReducer";
import { addPeerAction, removePeerAction } from "../Actions/peerAction";
import { SocketContext } from "./socketContextValue";

const WS_SERVER =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.DEV && "http://localhost:5000") ||
  "https://calling-app-backend-1.onrender.com";
const REMOTE_CONTROL_TOKEN = import.meta.env.VITE_REMOTE_CONTROL_TOKEN || "";
const HOST_APP_DOWNLOAD_URL =
  import.meta.env.VITE_HOST_APP_DOWNLOAD_URL ||
  "https://github.com/prima-mayank/remote-agent/releases/latest/download/host-app-win.zip";
const HOST_APP_REQUIRED_ERROR_CODES = new Set([
  "host-not-found",
  "host-offline",
]);
const REMOTE_DEBUG_ENABLED = String(import.meta.env.VITE_REMOTE_DEBUG || "").trim() === "1";

const normalizeHttpDownloadUrl = (url) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(raw, base);
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const buildHostAppDownloadUrl = () => {
  const configuredUrl = normalizeHttpDownloadUrl(HOST_APP_DOWNLOAD_URL);
  if (configuredUrl) return configuredUrl;

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(WS_SERVER, base);
    parsed.pathname = "/downloads/host-app-win.zip";
    parsed.search = "";
    parsed.hash = "";
    return normalizeHttpDownloadUrl(parsed.toString());
  } catch {
    return "";
  }
};

const shouldInitiateCall = (localPeerId, remotePeerId) => {
  if (!localPeerId || !remotePeerId) return false;
  return localPeerId.localeCompare(remotePeerId) < 0;
};

const parsePort = (value) => {
  const port = Number(value);
  if (!Number.isFinite(port) || port <= 0) return null;
  return port;
};

const buildPeerConnectionConfig = () => {
  const isBrowser = typeof window !== "undefined";
  const isProduction = isBrowser ? window.location.protocol === "https:" : false;

  let socketHost = null;
  let socketPort = null;
  let socketSecure = isProduction;

  if (isBrowser) {
    try {
      const socketUrl = new URL(WS_SERVER, window.location.origin);
      socketHost = socketUrl.hostname || null;
      socketPort = socketUrl.port
        ? parsePort(socketUrl.port)
        : socketUrl.protocol === "https:"
        ? 443
        : 80;
      socketSecure = socketUrl.protocol === "https:";
    } catch {
      // noop: fallback values below
    }
  }

  const envHost = import.meta.env.VITE_PEER_HOST;
  const envPort = parsePort(import.meta.env.VITE_PEER_PORT);
  const envSecure = import.meta.env.VITE_PEER_SECURE;

  return {
    host:
      envHost ||
      socketHost ||
      (isProduction && isBrowser ? window.location.hostname : "localhost"),
    port: envPort || socketPort || (isProduction ? 443 : 5000),
    path: import.meta.env.VITE_PEER_PATH || "/peerjs/myapp",
    secure: envSecure ? envSecure === "true" : socketSecure,
  };
};

const socket = SocketIoClient(WS_SERVER, {
  auth: REMOTE_CONTROL_TOKEN ? { token: REMOTE_CONTROL_TOKEN } : undefined,
  withCredentials: false,
  // Some hosts (incl. some Render setups) may not reliably support WebSocket upgrade.
  // Keep polling enabled so the app can connect, and upgrade when possible.
  transports: ["polling", "websocket"],
  upgrade: true,
  rememberUpgrade: true,
  timeout: 20000,
  reconnectionAttempts: 10,
});

export const SocketProvider = ({ children }) => {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => new Peer(UUIDv4(), buildPeerConnectionConfig()));
  const [stream, setStream] = useState(null);
  const [peers, dispatch] = useReducer(peerReducer, {});

  const callsRef = useRef({});
  const pendingParticipantsRef = useRef([]);
  const remoteSessionIdRef = useRef(null);
  const userRef = useRef(user);
  const streamRef = useRef(stream);
  const claimedRemoteHostIdRef = useRef("");
  const autoClaimRemoteHostIdRef = useRef("");
  const autoRequestRemoteHostIdRef = useRef("");
  const remoteDesktopPendingRequestRef = useRef(null);
  const remoteHostsRef = useRef([]);
  const remoteInputDebugRef = useRef({ count: 0, lastLoggedAt: 0 });
  const remoteFrameSubscribersRef = useRef(new Set());
  const hasRemoteDesktopFrameRef = useRef(false);
  const screenShareTrackRef = useRef(null);
  const cameraTrackBeforeShareRef = useRef(null);

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

  const logRemote = (eventName, payload = undefined) => {
    if (!REMOTE_DEBUG_ENABLED) return;
    const normalizedEventName = String(eventName || "").trim() || "event";
    if (typeof payload === "undefined") {
      console.debug(`[remote-ui] ${normalizedEventName}`);
      return;
    }
    console.debug(`[remote-ui] ${normalizedEventName}`, payload);
  };

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  useEffect(() => {
    claimedRemoteHostIdRef.current = claimedRemoteHostId;
  }, [claimedRemoteHostId]);

  useEffect(() => {
    autoClaimRemoteHostIdRef.current = autoClaimRemoteHostId;
  }, [autoClaimRemoteHostId]);

  useEffect(() => {
    autoRequestRemoteHostIdRef.current = autoRequestRemoteHostId;
  }, [autoRequestRemoteHostId]);

  useEffect(() => {
    remoteDesktopPendingRequestRef.current = remoteDesktopPendingRequest;
  }, [remoteDesktopPendingRequest]);

  useEffect(() => {
    remoteHostsRef.current = remoteHosts;
  }, [remoteHosts]);

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

  const refreshRemoteHosts = useCallback(() => {
    logRemote("request-hosts-list");
    socket.emit("remote-hosts-request");
  }, []);

  useEffect(() => {
    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);
    const onConnectError = () => {
      setSocketConnected(false);
    };

    const onConnected = () => {
      onConnect();
      refreshRemoteHosts();
    };

    socket.on("connect", onConnected);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("connect", onConnected);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [refreshRemoteHosts]);

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

  const setupCallHandlers = useCallback((call, peerId) => {
    if (!call || !peerId) return;

    const existingCall = callsRef.current[peerId];
    if (existingCall && existingCall !== call) {
      try {
        existingCall.close();
      } catch {
        // noop
      }
    }

    callsRef.current[peerId] = call;

    call.on("stream", (remoteStream) => {
      dispatch(addPeerAction(peerId, remoteStream));
    });

    call.on("close", () => {
      if (callsRef.current[peerId] !== call) return;
      dispatch(removePeerAction(peerId));
      delete callsRef.current[peerId];
    });

    call.on("error", (err) => {
      void err;
    });
  }, []);

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

  const fetchParticipantList = useCallback(({ participants }) => {
    const uniqueParticipants = Array.isArray(participants)
      ? [...new Set(participants.map((item) => String(item || "").trim()).filter(Boolean))]
      : [];

    setRoomParticipants(uniqueParticipants);
    if (uniqueParticipants.length === 0) return;

    const localUser = userRef.current;
    const localStream = streamRef.current;

    if (localUser && localStream) {
      uniqueParticipants.forEach((pid) => {
        if (pid === localUser.id) return;
        if (!shouldInitiateCall(localUser.id, pid)) return;
        if (!callsRef.current[pid]) {
          const call = localUser.call(pid, localStream);
          setupCallHandlers(call, pid);
        }
      });
    } else {
      pendingParticipantsRef.current = [
        ...new Set([...pendingParticipantsRef.current, ...uniqueParticipants]),
      ];
    }
  }, [setupCallHandlers]);

  const requestRemoteDesktopSession = useCallback((hostId = "") => {
    logRemote("request-session", { hostId: String(hostId || "").trim() });
    setRemoteDesktopError("");
    setRemoteDesktopPendingRequest(null);
    setRemoteHostSetupStatus("");
    setHostAppInstallPrompt(null);
    socket.emit("remote-session-request", { hostId });
  }, []);

  const requestRemoteHostSetup = (targetPeerId = "") => {
    const normalizedTargetPeerId = String(targetPeerId || "").trim();
    logRemote("request-host-setup", { targetPeerId: normalizedTargetPeerId });
    setRemoteDesktopError("");
    setRemoteHostSetupStatus("");
    setHostAppInstallPrompt(null);
    socket.emit("remote-host-setup-request", { targetPeerId: normalizedTargetPeerId });
  };

  const claimRemoteHost = (hostId = "") => {
    const normalizedHostId = String(hostId || "").trim();
    if (!normalizedHostId) return;
    logRemote("claim-host", { hostId: normalizedHostId });
    socket.emit("remote-host-claim", { hostId: normalizedHostId });
  };

  const stopRemoteDesktopSession = () => {
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
  };

  const dismissHostAppInstallPrompt = () => {
    setHostAppInstallPrompt(null);
  };

  const respondToRemoteDesktopRequest = (accepted) => {
    if (!incomingRemoteDesktopRequest?.requestId) return;

    socket.emit("remote-session-ui-decision", {
      requestId: incomingRemoteDesktopRequest.requestId,
      accepted: !!accepted,
      reason: accepted ? "" : "Rejected by participant.",
    });
    setIncomingRemoteDesktopRequest(null);
  };

  const respondToRemoteHostSetupRequest = (accepted) => {
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
  };

  const sendRemoteDesktopInput = (event) => {
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
  };

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
  }, [isScreenSharing, replaceOutgoingVideoTrack]);

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
  }, [isScreenSharing, replaceOutgoingVideoTrack, stopScreenShare]);

  useEffect(() => {
    const enterRoom = ({ roomId }) => {
      navigate(`/room/${roomId}`);
    };

    const onRoomNotFound = () => {
      alert("Room not found. Ask the host to create a new room link.");
      navigate("/");
    };

    const onUserLeft = ({ peerId }) => {
      if (!peerId) return;

      dispatch(removePeerAction(peerId));
      delete callsRef.current[peerId];
      setRoomParticipants((prev) => prev.filter((id) => id !== peerId));
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

      if (HOST_APP_REQUIRED_ERROR_CODES.has(String(code || "").trim())) {
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
      remoteSessionIdRef.current = null;
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
      setClaimedRemoteHostId("");
      setAutoClaimRemoteHostId("");
      setAutoRequestRemoteHostId("");
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
  }, [fetchParticipantList, navigate, requestRemoteDesktopSession]);

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
      if (!shouldInitiateCall(user.id, peerId)) return;
      if (!callsRef.current[peerId]) {
        const call = user.call(peerId, stream);
        setupCallHandlers(call, peerId);
      }
    };

    socket.on("user-joined", onUserJoined);

    if (pendingParticipantsRef.current.length > 0) {
      pendingParticipantsRef.current.forEach((pid) => {
        if (pid === user.id) return;
        if (!shouldInitiateCall(user.id, pid)) return;
        if (!callsRef.current[pid]) {
          const call = user.call(pid, stream);
          setupCallHandlers(call, pid);
        }
      });
      pendingParticipantsRef.current = [];
    }

    socket.emit("ready");

    return () => {
      try {
        user.off("call");
      } catch {
        // noop
      }
      socket.off("user-joined", onUserJoined);
    };
  }, [setupCallHandlers, stream, user]);

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
    if (remoteDesktopSession?.sessionId) {
      socket.emit("remote-session-stop", { sessionId: remoteDesktopSession.sessionId });
    }

    Object.keys(callsRef.current).forEach((peerId) => {
      try {
        callsRef.current[peerId].close();
      } catch {
        // noop
      }
      delete callsRef.current[peerId];
    });

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
        endCall,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
