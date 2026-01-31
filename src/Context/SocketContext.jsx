// SocketContext.jsx
import SocketIoClient from "socket.io-client";
import { createContext, useEffect, useRef, useState, useReducer } from "react";
import { useNavigate } from "react-router-dom";
import Peer from "peerjs";
import { v4 as UUIDv4 } from "uuid";

import { peerReducer } from "../Reducers/peerReducer";
import { addPeerAction } from "../Actions/peerAction";

const WS_SERVER = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
console.log("Connecting to WebSocket server:", WS_SERVER);

export const SocketContext = createContext(null);

const socket = SocketIoClient(WS_SERVER, {
  withCredentials: false,
  transports: ["polling", "websocket"]
});

export const SocketProvider = ({ children }) => {
  const navigate = useNavigate();

  const [user, setUser] = useState(null); // PeerJS Peer instance
  const [stream, setStream] = useState(null); // local MediaStream
  const [peers, dispatch] = useReducer(peerReducer, {}); // remote peers list

  // internal refs for calls & pending participants
  const callsRef = useRef({}); // peerId => PeerJS MediaConnection
  const pendingParticipantsRef = useRef([]); // participants arriving before stream/user ready

  // mic/camera state
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  // Fetch local media
  const fetchUserFeed = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      setStream(media);
      setAudioEnabled(media.getAudioTracks().some(t => t.enabled));
      setVideoEnabled(media.getVideoTracks().some(t => t.enabled));
    } catch (err) {
      console.error("getUserMedia failed:", err);
      alert("Please allow access to camera and microphone.");
    }
  };

  // When server gives list of participants in room
  const fetchParticipantList = ({ roomId, participants }) => {
    // console.log("Fetched room participants:", roomId, participants);
    if (!participants || participants.length === 0) return;

    // If our user & stream are ready, call them now. Otherwise buffer
    if (user && stream) {
      participants.forEach(pid => {
        if (pid === user.id) return;
        // Prevent duplicate calls
        if (!callsRef.current[pid]) {
          const call = user.call(pid, stream);
          setupCallHandlers(call, pid);
          callsRef.current[pid] = call;
        }
      });
    } else {
      // buffer for later
      pendingParticipantsRef.current = pendingParticipantsRef.current.concat(participants);
    }
  };

  // Setup PeerJS MediaConnection handlers for a call
  const setupCallHandlers = (call, peerId) => {
    if (!call) return;
    callsRef.current[peerId] = call;

    call.on("stream", (remoteStream) => {
      // Add remote stream to reducer state so UI can render
      dispatch(addPeerAction(peerId, remoteStream));
    });

    call.on("close", () => {
      // remove peer on call close
      dispatch({ type: "REMOVE_PEER", payload: { peerId } });
      delete callsRef.current[peerId];
    });

    call.on("error", (err) => {
      console.warn("call error with", peerId, err);
    });
  };

  // Init: create Peer and local media, wire socket events
  useEffect(() => {
    const userId = UUIDv4();

    // Auto-detect environment
    const isProduction = window.location.protocol === "https:";
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    // Smart fallbacks: env vars → production defaults → localhost defaults
    const peerHost = import.meta.env.VITE_PEER_HOST || 
      (isProduction ? window.location.hostname : "localhost");
    
    const peerPort = import.meta.env.VITE_PEER_PORT ? 
      Number(import.meta.env.VITE_PEER_PORT) : 
      (isProduction ? 443 : 5000);
    
    const peerPath = import.meta.env.VITE_PEER_PATH || "/peerjs/myapp";
    
    const peerSecure = import.meta.env.VITE_PEER_SECURE ? 
      import.meta.env.VITE_PEER_SECURE === "true" : 
      isProduction;

    console.log("Peer Config:", { peerHost, peerPort, peerPath, peerSecure });

    const newPeer = new Peer(userId, {
      host: peerHost,
      port: peerPort,
      path: peerPath,
      secure: peerSecure,
      config: {
        iceServers: [
          { urls: ["stun:stun.l.google.com:19302"] },
          { urls: ["stun:stun1.l.google.com:19302"] }
        ]
      }
    }); 

    setUser(newPeer);
    fetchUserFeed();

    // socket handlers that trigger navigation or participant list arrival
    const enterRoom = ({ roomId }) => {
      navigate(`/room/${roomId}`);
    };

    socket.on("room-created", enterRoom);
    socket.on("get-users", fetchParticipantList);

    // cleanup
    return () => {
      socket.off("room-created", enterRoom);
      socket.off("get-users", fetchParticipantList);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When both user (Peer) and local stream are available, wire Peer handlers and call buffered participants
  useEffect(() => {
    if (!user || !stream) return;

    // handle incoming calls
    user.on("call", (call) => {
      // console.log("Receiving a call from", call.peer);
      // answer with our local stream
      call.answer(stream);
      setupCallHandlers(call, call.peer);
    });

    // If server later notifies of new user join, we handle in separate socket handler
    socket.on("user-joined", ({ peerId }) => {
      if (!peerId || peerId === user.id) return;
      // console.log("user-joined", peerId);

      // place a call to the new peer
      if (!callsRef.current[peerId]) {
        const call = user.call(peerId, stream);
        setupCallHandlers(call, peerId);
      }
    });

    // Process any participants that were buffered before stream/user were ready
    if (pendingParticipantsRef.current.length > 0) {
      pendingParticipantsRef.current.forEach(pid => {
        if (pid === user.id) return;
        if (!callsRef.current[pid]) {
          const call = user.call(pid, stream);
          setupCallHandlers(call, pid);
        }
      });
      pendingParticipantsRef.current = [];
    }

    // Notify server we are ready to receive joins (this is optional — depends on server)
    socket.emit("ready");

    // cleanup listeners on unmount or change
    return () => {
      try { user.off("call"); } catch (e) {}
      socket.off("user-joined");
    };
  }, [user, stream]);

  // toggle mic - simply toggle enabled on audio tracks
  const toggleMic = () => {
    if (!stream) return;
    stream.getAudioTracks().forEach(t => {
      t.enabled = !t.enabled;
    });
    setAudioEnabled(stream.getAudioTracks().some(t => t.enabled));
    // update stream state to force re-render if needed
    setStream(new MediaStream(stream.getTracks()));
  };

  // toggle camera - toggle enabled on video tracks
  const toggleCamera = () => {
    if (!stream) return;
    stream.getVideoTracks().forEach(t => {
      t.enabled = !t.enabled;
    });
    setVideoEnabled(stream.getVideoTracks().some(t => t.enabled));
    setStream(new MediaStream(stream.getTracks()));
  };

  // End call: close all calls, destroy PeerJS peer, stop media tracks, clear peers and navigate home
  const endCall = (roomId) => {
    // close all active calls
    Object.keys(callsRef.current).forEach(peerId => {
      try {
        callsRef.current[peerId].close();
      } catch (e) { /* ignore */ }
      delete callsRef.current[peerId];
    });

    // destroy the PeerJS peer
    try {
      if (user && user.destroy) user.destroy();
    } catch (e) {}

    // stop local tracks
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }

    // clear reducer peers state
    Object.keys(peers).forEach(pid => {
      dispatch({ type: "REMOVE_PEER", payload: { peerId: pid } });
    });

    // let server know we left (server may handle this, but emit anyway)
    try {
      socket.emit("leave-room", { roomId, peerId: user?.id });
    } catch (e) { /* ignore */ }

    setStream(null);
    setUser(null);
    // go to home / landing
    navigate("/");
  };

  // Provider value
  return (
    <SocketContext.Provider value={{
      socket,
      user,
      stream,
      peers,
      audioEnabled,
      videoEnabled,
      toggleMic,
      toggleCamera,
      endCall
    }}>
      {children}
    </SocketContext.Provider>
  );
}
