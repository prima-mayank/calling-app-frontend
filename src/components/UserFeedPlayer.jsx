import { useEffect, useRef } from "react";

const UserFeedPlayer = ({ stream, muted = false, isLocal = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (stream) {
      try {
        el.srcObject = stream;
      } catch {
        el.src = window.URL.createObjectURL(stream);
      }

      el.muted = !!muted || !!isLocal;
      el.playsInline = true;
      el.autoplay = true;

      el.play().catch((err) => {
        if (err?.name === "AbortError") return;
        console.warn("play() failed on video/audio element:", err);
      });
    } else {
      try {
        el.srcObject = null;
        el.src = "";
      } catch {
        // noop
      }
    }
  }, [stream, muted, isLocal]);

  const hasVideo =
    stream &&
    stream.getVideoTracks().length > 0 &&
    stream.getVideoTracks().some((track) => track.enabled);

  return (
    <div className="user-feed">
      <video
        ref={videoRef}
        className={`user-feed-video ${hasVideo ? "" : "user-feed-video--audio-only"}`}
      />

      {!hasVideo && (
        <div className="user-feed-audio-overlay">
          <span>Audio Only</span>
        </div>
      )}
    </div>
  );
};

export default UserFeedPlayer;
