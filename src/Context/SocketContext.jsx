import SocketIoClient from "socket.io-client";
import { useCallback, useEffect, useRef, useState, useReducer } from "react";
import { useNavigate } from "react-router-dom";
import Peer from "peerjs";
import { v4 as UUIDv4 } from "uuid";

import { peerReducer } from "../Reducers/peerReducer";
import { addPeerAction, removePeerAction } from "../Actions/peerAction";
import { SocketContext } from "./socketContextValue";

const WS_SERVER = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

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
  withCredentials: false,
  transports: ["polling"],
  upgrade: false,
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

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const [remoteDesktopSession, setRemoteDesktopSession] = useState(null);
  const [remoteDesktopPendingRequest, setRemoteDesktopPendingRequest] = useState(null);
  const [incomingRemoteDesktopRequest, setIncomingRemoteDesktopRequest] = useState(null);
  const [remoteDesktopFrame, setRemoteDesktopFrame] = useState(null);
  const [remoteDesktopError, setRemoteDesktopError] = useState("");

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

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
    if (!call) return;
    callsRef.current[peerId] = call;

    call.on("stream", (remoteStream) => {
      dispatch(addPeerAction(peerId, remoteStream));
    });

    call.on("close", () => {
      dispatch(removePeerAction(peerId));
      delete callsRef.current[peerId];
    });

    call.on("error", (err) => {
      console.warn("call error with", peerId, err);
    });
  }, []);

  const fetchParticipantList = useCallback(({ participants }) => {
    if (!participants || participants.length === 0) return;

    const uniqueParticipants = [...new Set(participants)];
    const localUser = userRef.current;
    const localStream = streamRef.current;

    if (localUser && localStream) {
      uniqueParticipants.forEach((pid) => {
        if (pid === localUser.id) return;
        if (!callsRef.current[pid]) {
          const call = localUser.call(pid, localStream);
          setupCallHandlers(call, pid);
          callsRef.current[pid] = call;
        }
      });
    } else {
      pendingParticipantsRef.current = [
        ...new Set([...pendingParticipantsRef.current, ...uniqueParticipants]),
      ];
    }
  }, [setupCallHandlers]);

  const requestRemoteDesktopSession = () => {
    setRemoteDesktopError("");
    setRemoteDesktopPendingRequest(null);
    socket.emit("remote-session-request");
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
    }
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
  };

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
    };

    const onRemoteSessionPending = ({ requestId, hostId }) => {
      if (!requestId) return;
      setRemoteDesktopPendingRequest({ requestId, hostId });
      setRemoteDesktopError("");
    };

    const onRemoteSessionRequestedUi = ({ requestId, requesterId }) => {
      if (!requestId) return;
      setIncomingRemoteDesktopRequest({
        requestId,
        requesterId: requesterId || "another participant",
      });
    };

    const onRemoteSessionStarted = ({ sessionId, hostId }) => {
      if (!sessionId) return;
      remoteSessionIdRef.current = sessionId;
      setRemoteDesktopSession({ sessionId, hostId });
      setRemoteDesktopPendingRequest(null);
      setRemoteDesktopFrame(null);
      setRemoteDesktopError("");
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
      setRemoteDesktopPendingRequest(null);
      setIncomingRemoteDesktopRequest(null);
      setRemoteDesktopFrame(null);
    };

    const onRemoteFrame = ({ sessionId, image }) => {
      if (!sessionId || typeof image !== "string") return;
      if (remoteSessionIdRef.current !== sessionId) return;
      setRemoteDesktopFrame(`data:image/jpeg;base64,${image}`);
    };

    const onRemoteSessionError = ({ message }) => {
      const normalizedMessage =
        typeof message === "string" && message.trim()
          ? message.trim()
          : "Remote session failed.";
      setRemoteDesktopError(normalizedMessage);
      setRemoteDesktopPendingRequest(null);
      setIncomingRemoteDesktopRequest(null);
      alert(normalizedMessage);
    };

    const onSocketDisconnect = () => {
      remoteSessionIdRef.current = null;
      setRemoteDesktopSession(null);
      setRemoteDesktopPendingRequest(null);
      setIncomingRemoteDesktopRequest(null);
      setRemoteDesktopFrame(null);
    };

    socket.on("room-created", enterRoom);
    socket.on("room-not-found", onRoomNotFound);
    socket.on("get-users", fetchParticipantList);
    socket.on("user-left", onUserLeft);
    socket.on("remote-session-pending", onRemoteSessionPending);
    socket.on("remote-session-requested-ui", onRemoteSessionRequestedUi);
    socket.on("remote-session-started", onRemoteSessionStarted);
    socket.on("remote-session-ended", onRemoteSessionEnded);
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
      socket.off("remote-session-started", onRemoteSessionStarted);
      socket.off("remote-session-ended", onRemoteSessionEnded);
      socket.off("remote-frame", onRemoteFrame);
      socket.off("remote-session-error", onRemoteSessionError);
      socket.off("disconnect", onSocketDisconnect);
    };
  }, [fetchParticipantList, navigate]);

  useEffect(() => {
    if (!user || !stream) return;

    user.on("call", (call) => {
      call.answer(stream);
      setupCallHandlers(call, call.peer);
    });

    const onUserJoined = ({ peerId }) => {
      if (!peerId || peerId === user.id) return;
      if (!callsRef.current[peerId]) {
        const call = user.call(peerId, stream);
        setupCallHandlers(call, peerId);
      }
    };

    socket.on("user-joined", onUserJoined);

    if (pendingParticipantsRef.current.length > 0) {
      pendingParticipantsRef.current.forEach((pid) => {
        if (pid === user.id) return;
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

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      console.warn("No video tracks to toggle (Audio Only mode)");
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
    remoteSessionIdRef.current = null;
    setRemoteDesktopFrame(null);
    setRemoteDesktopError("");

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
        incomingRemoteDesktopRequest,
        remoteDesktopFrame,
        remoteDesktopError,
        provideStream,
        toggleMic,
        toggleCamera,
        requestRemoteDesktopSession,
        stopRemoteDesktopSession,
        respondToRemoteDesktopRequest,
        sendRemoteDesktopInput,
        endCall,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};
