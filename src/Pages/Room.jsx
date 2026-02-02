// Pages/Room.jsx
import { useContext, useEffect, useState } from "react";
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
    provideStream, // Need this to initialize stream if joining via link
    toggleMic,
    toggleCamera,
    endCall,
  } = useContext(SocketContext);

  // State to track if user has selected media type (for direct link joins)
  const [hasJoined, setHasJoined] = useState(false);

  // Handle joining logic
  const handleJoinRoom = async (isVideo) => {
    // Initialize stream
    await provideStream(isVideo);
    setHasJoined(true);
  };

  // Effect to notify server ONCE we have both user (peer) and stream ready
  useEffect(() => {
    if (user && stream && id && hasJoined) {
      socket.emit("joined-room", {
        roomId: id,
        peerId: user.id,
      });
    }
  }, [id, user, stream, hasJoined]);

  // If stream is not ready (user accessed link directly), show Pre-Join Lobby
  if (!stream) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "20px" }}>
        <h2>Join Room: {id}</h2>
        <p>Choose how you want to join:</p>
        <div style={{ display: "flex", gap: "20px" }}>
          <button 
            onClick={() => handleJoinRoom(true)}
            style={{ padding: "12px 24px", background: "#3182CE", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
          >
            Join with Video
          </button>
          <button 
            onClick={() => handleJoinRoom(false)}
            style={{ padding: "12px 24px", background: "#48BB78", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" }}
          >
            Join Audio Only
          </button>
        </div>
      </div>
    );
  }

  // Main Room UI
  return (
    <div style={{ padding: 12 }}>
      <h3>Room : {id}</h3>

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <button onClick={toggleMic} style={{ marginRight: 8 }}>
          {audioEnabled ? "Mute Mic" : "Unmute Mic"}
        </button>
        
        {/* Only show camera toggle if we actually have video tracks */}
        {stream.getVideoTracks().length > 0 && (
           <button onClick={toggleCamera} style={{ marginRight: 8 }}>
             {videoEnabled ? "Turn Camera Off" : "Turn Camera On"}
           </button>
        )}

        <button
          onClick={() => endCall(id)}
          style={{ background: "#E53E3E", color: "#fff", marginRight: 8 }}
        >
          End Call
        </button>

        <button
          onClick={async () => {
             // ... existing share logic
             const url = window.location.href;
             if (navigator.share) {
               try { await navigator.share({ url }); } catch(e){}
             } else {
               navigator.clipboard.writeText(url);
               alert("Link copied!");
             }
          }}
          style={{ background: "#3182CE", color: "#fff" }}
        >
          Share Link
        </button>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        {/* Local Feed */}
        <div>
          <h4>You {stream.getVideoTracks().length === 0 && "(Audio Only)"}</h4>
          <UserFeedPlayer stream={stream} muted={true} isLocal />
        </div>

        {/* Remote Feeds */}
        <div>
          <h4>Participants</h4>
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