import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SocketContext } from "../Context/socketContextValue";
import { isInsecureContextOnLanIp } from "../features/room/utils/roomAccessHelpers";
import {
  clearHomeJoinPreference,
  clearQuickRejoinRoom,
  readQuickRejoinRoom,
  saveHomeJoinPreference,
} from "../features/room/utils/roomSessionStorage";

const Home = () => {
  const navigate = useNavigate();
  const { socket, provideStream, socketConnected } = useContext(SocketContext);
  const [quickRejoin, setQuickRejoin] = useState(() => readQuickRejoinRoom());

  const startCall = async (isVideo) => {
    if (!socketConnected) {
      alert("Backend is not connected yet. Check VITE_SOCKET_URL and retry.");
      return;
    }

    const mode = isVideo ? "video" : "audio";
    saveHomeJoinPreference(mode);

    if (isInsecureContextOnLanIp()) {
      clearHomeJoinPreference();
      alert(
        "Camera/mic on local IP needs HTTPS. Use localhost on this machine or open the app via an HTTPS tunnel/domain."
      );
      return;
    }

    const stream = await provideStream(isVideo);
    if (!stream) {
      clearHomeJoinPreference();
      alert("Camera/mic unavailable or blocked. Allow permissions and retry.");
      return;
    }

    socket.emit("create-room");
  };

  const quickRejoinCall = () => {
    if (!quickRejoin?.roomId) return;

    if (!socketConnected) {
      alert("Backend is not connected yet. Check VITE_SOCKET_URL and retry.");
      return;
    }

    saveHomeJoinPreference(quickRejoin.mode || "none");
    clearQuickRejoinRoom();
    setQuickRejoin(null);
    navigate(`/room/${quickRejoin.roomId}`);
  };

  const dismissQuickRejoin = () => {
    clearQuickRejoinRoom();
    setQuickRejoin(null);
  };

  return (
    <div className="home-page">
      <div className="home-shell panel">
        <h1 className="home-title">Calling Workspace</h1>
        <p className="home-subtitle">Start a video or audio room.</p>
        <div className={`connection-pill ${socketConnected ? "connection-pill--online" : ""}`}>
          {socketConnected ? "Backend connected" : "Backend disconnected"}
        </div>

        {quickRejoin?.roomId && (
          <div className="home-quick-rejoin panel">
            <div className="home-quick-rejoin-title">Call ended recently</div>
            <div className="home-quick-rejoin-subtitle">
              Rejoin room <strong>{quickRejoin.roomId}</strong> instantly.
            </div>
            <div className="home-quick-rejoin-actions">
              <button onClick={quickRejoinCall} className="btn btn-primary">
                Quick Rejoin
              </button>
              <button onClick={dismissQuickRejoin} className="btn btn-default">
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="home-actions">
          <button
            onClick={() => startCall(true)}
            className="btn btn-call-video home-action-btn"
          >
            Start Video Call
          </button>

          <button
            onClick={() => startCall(false)}
            className="btn btn-call-audio home-action-btn"
          >
            Start Audio Call
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home;
