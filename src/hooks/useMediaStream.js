import { useState } from "react";

/**
 * Manages local media stream state: acquiring the stream, toggling mic,
 * and exposing stream/audioEnabled/videoEnabled for the rest of the app.
 *
 * setStream and setVideoEnabled are exposed so useScreenShare can swap
 * tracks without going through this hook's higher-level helpers.
 */
export const useMediaStream = () => {
  const [stream, setStream] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const provideStream = async (isVideoCall = true) => {
    if (!navigator.mediaDevices?.getUserMedia) return null;

    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideoCall,
      });

      setStream(media);
      setAudioEnabled(media.getAudioTracks().some((t) => t.enabled));
      setVideoEnabled(isVideoCall ? media.getVideoTracks().some((t) => t.enabled) : false);

      return media;
    } catch (err) {
      console.error("getUserMedia failed:", err?.name || err, err);
      return null;
    }
  };

  const toggleMic = () => {
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setAudioEnabled(stream.getAudioTracks().some((t) => t.enabled));
    setStream(new MediaStream(stream.getTracks()));
  };

  return {
    stream,
    setStream,
    audioEnabled,
    videoEnabled,
    setVideoEnabled,
    provideStream,
    toggleMic,
  };
};
