
import { useContext } from "react";
import { SocketContext } from "../Context/socketContextValue";

const Home = () => {
  const { socket, provideStream, socketConnected } = useContext(SocketContext);

  const startCall = async (isVideo) => {
    if (!socketConnected) {
      alert("Backend is not connected yet. Check VITE_SOCKET_URL and retry.");
      return;
    }

    const stream = await provideStream(isVideo);
    if (!stream) {
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
