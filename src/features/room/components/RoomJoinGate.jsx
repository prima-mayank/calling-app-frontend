import LowNetworkWarning from "../../../components/LowNetworkWarning";

const RoomJoinGate = ({ roomId, joinRoomWithMode, getPeerConnections, isAutoJoining }) => {
  return (
    <div className="room-join-page">
      <LowNetworkWarning getPeerConnections={getPeerConnections} />
      <div className="room-join-shell panel">
        <h2>Join Room: {roomId}</h2>
        <p className="room-join-subtitle">
          {isAutoJoining
            ? "Restoring your meeting session..."
            : "Choose how you want to join this room."}
        </p>
        <div className="room-join-actions">
          <button
            onClick={() => joinRoomWithMode("video")}
            className="btn btn-call-video btn-join"
            disabled={isAutoJoining}
          >
            Join with Video
          </button>
          <button
            onClick={() => joinRoomWithMode("audio")}
            className="btn btn-call-audio btn-join"
            disabled={isAutoJoining}
          >
            Join Audio Only
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomJoinGate;
