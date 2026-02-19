
import { useContext } from "react";
import { SocketContext } from "../Context/socketContextValue";

const HOME_JOIN_PREF_KEY = "home_join_pref_v1";

const Home = () => {
  const { socket, provideStream, socketConnected } = useContext(SocketContext);

  const startCall = async (isVideo) => {
    if (!socketConnected) {
      alert("Backend is not connected yet. Check VITE_SOCKET_URL and retry.");
      return;
    }

    const mode = isVideo ? "video" : "audio";
    try {
      sessionStorage.setItem(
        HOME_JOIN_PREF_KEY,
        JSON.stringify({ mode, ts: Date.now() })
      );
    } catch {
      // noop
    }

    const stream = await provideStream(isVideo);
    if (!stream) {
      try {
        sessionStorage.removeItem(HOME_JOIN_PREF_KEY);
      } catch {
        // noop
      }
      alert("Camera/mic unavailable or blocked. Allow permissions, or use Start Remote Only.");
      return;
    }

    socket.emit("create-room");
  };

  const startRemoteOnly = () => {
    if (!socketConnected) {
      alert("Backend is not connected yet. Check VITE_SOCKET_URL and retry.");
      return;
    }

    try {
      sessionStorage.setItem(
        HOME_JOIN_PREF_KEY,
        JSON.stringify({ mode: "none", ts: Date.now() })
      );
    } catch {
      // noop
    }

    socket.emit("create-room");
  };

  return (
    <div className="home-page">
      <div className="home-shell panel">
        <h1 className="home-title">Calling Workspace</h1>
        <p className="home-subtitle">
          Start a video or audio room, or open a remote-only room for desktop control workflows.
        </p>
        <div className={`connection-pill ${socketConnected ? "connection-pill--online" : ""}`}>
          {socketConnected ? "Backend connected" : "Backend disconnected"}
        </div>

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

          <button
            onClick={startRemoteOnly}
            className="btn btn-default home-action-btn"
          >
            Start Remote Only
          </button>
        </div>
      </div>
    </div>
  );
};

export default Home;
