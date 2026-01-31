import { useContext, useEffect } from "react";
import { useParams } from "react-router-dom";
import { SocketContext } from "../Context/SocketContext";
import UserFeedPlayer from "../components/UserFeedPlayer";

const Room = () => {
  const { id } = useParams();
  const {
    socket,
    user,
    stream,
    peers,
    audioEnabled,
    videoEnabled,
    toggleMic,
    toggleCamera,
    endCall,
  } = useContext(SocketContext);

  useEffect(() => {
    if (user && id) {
      // console.log("New user with id", user.id, "has joined room", id);

      socket.emit("joined-room", {
        roomId: id,
        peerId: user.id,
      });
    } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  return (
    <div style={{ padding: 12 }}>
      <h3>Room : {id}</h3>

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <button onClick={toggleMic} style={{ marginRight: 8 }}>
          {audioEnabled ? "Mute Mic" : "Unmute Mic"}
        </button>
        <button onClick={toggleCamera} style={{ marginRight: 8 }}>
          {videoEnabled ? "Turn Camera Off" : "Turn Camera On"}
        </button>
        <button
          onClick={() => endCall(id)}
          style={{ background: "#E53E3E", color: "#fff", marginRight: 8 }}
        >
          End Call
        </button>
        <button
          onClick={async () => {
            const url = window.location.href;
            if (navigator.share) {
              try {
                await navigator.share({ url });
              } catch (err) {
                console.log("Share failed", err);
              }
            } else {
              navigator.clipboard.writeText(url);
              alert("Room link copied to clipboard!");
            }
          }}
          style={{ background: "#3182CE", color: "#fff" }}
        >
          Share Link
        </button>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div>
          <h4>Your own user feed</h4>

          <UserFeedPlayer stream={stream} muted={true} isLocal />
        </div>
        <div>
          <h4>Other Users feed</h4>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Object.keys(peers).length === 0 && (
              <div style={{ color: "#666" }}>No other participants</div>
            )}

            {Object.keys(peers).map((peerId) => (
              <UserFeedPlayer
                key={peerId}
                stream={peers[peerId].stream}
                muted={false}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Room;
