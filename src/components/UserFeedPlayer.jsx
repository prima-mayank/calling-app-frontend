import { useEffect, useRef } from "react";


const UserFeedPlayer = ({ stream, muted = false, isLocal = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (stream) {
      try {
        el.srcObject = stream;
      } catch (err) {
        el.src = window.URL.createObjectURL(stream);
      }

      el.muted = !!muted || !!isLocal;
      el.playsInline = true;
      el.autoplay = true;

      el.play().catch(err => {
        console.warn("play() failed on video/audio element:", err);
      });
    } else {
      // clear
      try {
        el.srcObject = null;
        el.src = "";
      } catch (e) {}
    }
  }, [stream, muted, isLocal]);

  const hasVideo = stream && 
    stream.getVideoTracks().length > 0 && 
    stream.getVideoTracks().some(track => track.enabled);

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center",
      position: "relative" 
    }}>
      <video
        ref={videoRef}
        style={{
          width: 320,
          height: 200,
          background: "#000",
          objectFit: "cover",
          borderRadius: 6,
          opacity: hasVideo ? 1 : 0.5 
        }}
      />

      {!hasVideo && (
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          color: "white",
          fontWeight: "bold",
          zIndex: 10
        }}>
          <span>Audio Only</span>
        </div>
      )}
    </div>
  );
};

export default UserFeedPlayer;