// SocketContext.jsx
import SocketIoClient from "socket.io-client";
import { createContext, useEffect, useRef, useState, useReducer } from "react";
import { useNavigate } from "react-router-dom";
import Peer from "peerjs";
import { v4 as UUIDv4 } from "uuid";

import { peerReducer } from "../Reducers/peerReducer";
import { addPeerAction } from "../Actions/peerAction";

const WS_SERVER = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

export const SocketContext = createContext(null);

const socket = SocketIoClient(WS_SERVER, {
  withCredentials: false,
  transports: ["polling", "websocket"]
});

export const SocketProvider = ({ children }) => {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [stream, setStream] = useState(null);
  const [peers, dispatch] = useReducer(peerReducer, {});

  const callsRef = useRef({});
  const pendingParticipantsRef = useRef([]);
  const screenTrackRef = useRef(null);
  const cameraTrackRef = useRef(null);
  const cameraTrackEnabledBeforeShareRef = useRef(true);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const provideStream = async (isVideoCall = true) => {
    try {
      const constraints = {
        audio: true,
        video: isVideoCall ? true : false
      };
      
      const media = await navigator.mediaDevices.getUserMedia(constraints);
      
      setStream(media);
      setAudioEnabled(media.getAudioTracks().some(t => t.enabled));
      
      if (isVideoCall) {
        setVideoEnabled(media.getVideoTracks().some(t => t.enabled));
      } else {
        setVideoEnabled(false);
      }

      return media;
    } catch (err) {
      console.error("getUserMedia failed:", err);
      alert("Please allow access to microphone (and camera for video calls).");
      return null;
    }
  };

  const fetchParticipantList = ({ roomId, participants }) => {
    if (!participants || participants.length === 0) return;
    if (user && stream) {
      participants.forEach(pid => {
        if (pid === user.id) return;
        if (!callsRef.current[pid]) {
          const call = user.call(pid, stream);
          setupCallHandlers(call, pid);
          callsRef.current[pid] = call;
        }
      });
    } else {
      pendingParticipantsRef.current = pendingParticipantsRef.current.concat(participants);
    }
  };

  const setupCallHandlers = (call, peerId) => {
    if (!call) return;
    callsRef.current[peerId] = call;

    call.on("stream", (remoteStream) => {
      dispatch(addPeerAction(peerId, remoteStream));
    });

    call.on("close", () => {
      dispatch({ type: "REMOVE_PEER", payload: { peerId } });
      delete callsRef.current[peerId];
    });

    call.on("error", (err) => {
      console.warn("call error with", peerId, err);
    });
  };

  const replaceVideoTrackForAllCalls = async (nextTrack) => {
    if (!nextTrack) return;

    const calls = Object.values(callsRef.current);
    await Promise.all(
      calls.map(async (call) => {
        const pc = call?.peerConnection || call?._pc;
        if (!pc) return;

        const sender = pc
          .getSenders()
          .find((s) => s.track && s.track.kind === "video");

        if (!sender) return;

        try {
          await sender.replaceTrack(nextTrack);
        } catch (err) {
          console.warn("Failed to replace video track for peer", call.peer, err);
        }
      })
    );
  };

  useEffect(() => {
    const userId = UUIDv4();
    const isProduction = window.location.protocol === "https:";
    
    const peerHost = import.meta.env.VITE_PEER_HOST || (isProduction ? window.location.hostname : "localhost");
    const peerPort = import.meta.env.VITE_PEER_PORT ? Number(import.meta.env.VITE_PEER_PORT) : (isProduction ? 443 : 5000);
    const peerPath = import.meta.env.VITE_PEER_PATH || "/peerjs/myapp";
    const peerSecure = import.meta.env.VITE_PEER_SECURE ? import.meta.env.VITE_PEER_SECURE === "true" : isProduction;

    const newPeer = new Peer(userId, {
      host: peerHost,
      port: peerPort,
      path: peerPath,
      secure: peerSecure,
    }); 

    setUser(newPeer);
    

    const enterRoom = ({ roomId }) => {
      navigate(`/room/${roomId}`);
    };

    socket.on("room-created", enterRoom);
    socket.on("get-users", fetchParticipantList);

    return () => {
      socket.off("room-created", enterRoom);
      socket.off("get-users", fetchParticipantList);
    };
  }, []);

  useEffect(() => {
    if (!user || !stream) return;

    user.on("call", (call) => {
      call.answer(stream);
      setupCallHandlers(call, call.peer);
    });

    socket.on("user-joined", ({ peerId }) => {
      if (!peerId || peerId === user.id) return;
      if (!callsRef.current[peerId]) {
        const call = user.call(peerId, stream);
        setupCallHandlers(call, peerId);
      }
    });

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

    socket.emit("ready");

    return () => {
      try { user.off("call"); } catch (e) {}
      socket.off("user-joined");
    };
  }, [user, stream]);

  const toggleMic = () => {
    if (!stream) return;
    stream.getAudioTracks().forEach(t => {
      t.enabled = !t.enabled;
    });
    setAudioEnabled(stream.getAudioTracks().some(t => t.enabled));
    setStream(new MediaStream(stream.getTracks()));
  };

  const toggleCamera = () => {
    if (!stream) return;
    if (isScreenSharing) {
      console.warn("Stop screen sharing before toggling camera.");
      return;
    }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
        console.warn("No video tracks to toggle (Audio Only mode)");
        return;
    }
    videoTracks.forEach(t => {
      t.enabled = !t.enabled;
    });
    setVideoEnabled(videoTracks.some(t => t.enabled));
    setStream(new MediaStream(stream.getTracks()));
  };

  const startScreenShare = async () => {
    if (!stream || isScreenSharing) return;

    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert("Screen sharing is not supported in this browser.");
      return;
    }

    const cameraTrack = stream.getVideoTracks()[0];
    if (!cameraTrack) {
      alert("Screen sharing is available only when you join with video.");
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      cameraTrackRef.current = cameraTrack;
      cameraTrackEnabledBeforeShareRef.current = cameraTrack.enabled;
      screenTrackRef.current = screenTrack;

      screenTrack.onended = () => {
        stopScreenShare();
      };

      await replaceVideoTrackForAllCalls(screenTrack);

      const updatedTracks = stream
        .getTracks()
        .map((track) => (track.kind === "video" ? screenTrack : track));
      setStream(new MediaStream(updatedTracks));
      setVideoEnabled(screenTrack.enabled);
      setIsScreenSharing(true);
    } catch (err) {
      console.error("getDisplayMedia failed:", err);
    }
  };

  const stopScreenShare = async () => {
    const screenTrack = screenTrackRef.current;
    const cameraTrack = cameraTrackRef.current;
    if (!screenTrack && !cameraTrack) return;

    if (cameraTrack) {
      await replaceVideoTrackForAllCalls(cameraTrack);

      if (stream) {
        const restoredTracks = stream
          .getTracks()
          .map((track) => (track.kind === "video" ? cameraTrack : track));
        setStream(new MediaStream(restoredTracks));
      }

      cameraTrack.enabled = cameraTrackEnabledBeforeShareRef.current;
      setVideoEnabled(cameraTrack.enabled);
    }

    if (screenTrack) {
      screenTrack.onended = null;
      try { screenTrack.stop(); } catch (e) {}
    }

    screenTrackRef.current = null;
    cameraTrackRef.current = null;
    setIsScreenSharing(false);
  };

  const endCall = (roomId) => {
    Object.keys(callsRef.current).forEach(peerId => {
      try { callsRef.current[peerId].close(); } catch (e) {}
      delete callsRef.current[peerId];
    });

    try { if (user) user.destroy(); } catch (e) {}

    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }

    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      try { screenTrackRef.current.stop(); } catch (e) {}
      screenTrackRef.current = null;
    }
    cameraTrackRef.current = null;
    setIsScreenSharing(false);

    Object.keys(peers).forEach(pid => {
      dispatch({ type: "REMOVE_PEER", payload: { peerId: pid } });
    });

    try { socket.emit("leave-room", { roomId, peerId: user?.id }); } catch (e) {}

    setStream(null);
    setUser(null);
    navigate("/");
    window.location.reload(); 
  };

  return (
    <SocketContext.Provider value={{
      socket,
      user,
      stream,
      peers,
      audioEnabled,
      videoEnabled,
      isScreenSharing,
      provideStream, 
      toggleMic,
      toggleCamera,
      startScreenShare,
      stopScreenShare,
      endCall
    }}>
      {children}
    </SocketContext.Provider>
  );
}
