// Pages/Home.jsx
import { useContext } from "react";
import { SocketContext } from "../Context/SocketContext";

const Home = () => {
  const { socket, provideStream } = useContext(SocketContext);

  const startCall = async (isVideo) => {
    // 1. Initialize stream based on choice
    const stream = await provideStream(isVideo);
    
    // 2. Only if stream is successfully acquired, ask server to create room
    if (stream) {
      socket.emit("create-room");
    }
  };

  return (
    <div style={{ 
      height: "100vh", 
      display: "flex", 
      flexDirection: "column",
      justifyContent: "center", 
      alignItems: "center",
      gap: "20px" 
    }}>
      <h1>Video/Audio Meeting App</h1>
      
      <div style={{ display: "flex", gap: "20px" }}>
        {/* Option 1: Video Call */}
        <button 
          onClick={() => startCall(true)}
          style={{ padding: "15px 30px", fontSize: "1.2rem", cursor: "pointer", background: "#3182CE", color: "white", border: "none", borderRadius: "8px" }}
        >
          Start Video Call
        </button>

        {/* Option 2: Audio Only Call */}
        <button 
          onClick={() => startCall(false)}
          style={{ padding: "15px 30px", fontSize: "1.2rem", cursor: "pointer", background: "#48BB78", color: "white", border: "none", borderRadius: "8px" }}
        >
          Start Audio Call
        </button>
      </div>
    </div>
  );
};

export default Home;