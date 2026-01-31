// UserFeedPlayer.jsx
import { useEffect, useRef } from "react";

/**
 * Props:
 *  - stream: MediaStream
 *  - muted: boolean (if true, mute playback e.g., local preview)
 *  - isLocal: boolean (optional) - local preview
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

  // Set video element type:
  // If the stream has audio-only (no video), still show a small video element with black background.
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <video
        ref={videoRef}
        style={{
          width: 320,
          height: 200,
          background: "#000",
          objectFit: "cover",
          borderRadius: 6
        }}
      />
    </div>
  );
};

export default UserFeedPlayer;
