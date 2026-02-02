import { useEffect, useRef } from "react";

/**
 * Props:
 * - stream: MediaStream
 * - muted: boolean (if true, mute playback e.g., local preview)
 * - isLocal: boolean (optional) - local preview
 */
const UserFeedPlayer = ({ stream, muted = false, isLocal = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (stream) {
      try {
        el.srcObject = stream;
      } catch (err) {
        // fallback for older browsers
        el.src = window.URL.createObjectURL(stream);
      }

      // local preview should be muted to prevent echo
      el.muted = !!muted || !!isLocal;
      el.playsInline = true;
      el.autoplay = true;

      // attempt to play and catch errors (autoplay policies)
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

  // --- NEW LOGIC: Check if the stream has enabled video tracks ---
  const hasVideo = stream && 
    stream.getVideoTracks().length > 0 && 
    stream.getVideoTracks().some(track => track.enabled);

  return (
    <div style={{ 
      display: "flex", 
      flexDirection: "column", 
      alignItems: "center",
      position: "relative" // Added for absolute positioning of overlay
    }}>
      <video
        ref={videoRef}
        style={{
          width: 320,
          height: 200,
          background: "#000",
          objectFit: "cover",
          borderRadius: 6,
          // If no video, we can dim the element slightly or keep it black
          opacity: hasVideo ? 1 : 0.5 
        }}
      />

      {/* --- NEW UI: Overlay for Audio Only --- */}
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