
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
      <h1 className="home-title">Video/Audio Meeting App</h1>

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
  );
};

export default Home;
