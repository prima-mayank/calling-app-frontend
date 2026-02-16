
import { useContext } from "react";
import { SocketContext } from "../Context/socketContextValue";

const Home = () => {
  const { socket, provideStream } = useContext(SocketContext);

  const startCall = async (isVideo) => {
    const stream = await provideStream(isVideo);
    
    if (stream) {
      socket.emit("create-room");
    }
  };

  const startRemoteOnly = () => {
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
