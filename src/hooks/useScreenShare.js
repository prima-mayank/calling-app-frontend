import { useCallback, useEffect, useRef, useState } from "react";
import { startAdaptiveVideo } from "../utils/peerAdaptiveVideo";

/**
 * Manages screen sharing lifecycle and adaptive video quality adjustment.
 *
 * @param {object} deps
 * @param {MediaStream|null} deps.stream        - Current media stream (for effect dep + audio tracks).
 * @param {object}           deps.streamRef     - Synced ref to the current stream for async callbacks.
 * @param {Function}         deps.setStream     - Setter from useMediaStream.
 * @param {Function}         deps.setVideoEnabled - Setter from useMediaStream.
 * @param {object}           deps.callsRef      - Ref to active PeerJS calls map.
 * @param {Function}         deps.getPeerConnections - Returns active RTCPeerConnections.
 */
export const useScreenShare = ({
  stream,
  streamRef,
  setStream,
  setVideoEnabled,
  callsRef,
  getPeerConnections,
}) => {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenShareTrackRef = useRef(null);
  const cameraTrackBeforeShareRef = useRef(null);
  const adaptiveVideoControllerRef = useRef(null);

  const stopAdaptiveVideo = useCallback(() => {
    const controller = adaptiveVideoControllerRef.current;
    if (!controller) return;
    try {
      controller.stop();
    } catch {
      // noop
    }
    adaptiveVideoControllerRef.current = null;
  }, []);

  const replaceOutgoingVideoTrack = useCallback(
    async (nextTrack) => {
      const calls = Object.values(callsRef.current);
      await Promise.all(
        calls.map(async (call) => {
          const senders = call?.peerConnection?.getSenders?.() || [];
          const videoSender = senders.find((sender) => sender?.track?.kind === "video");
          if (!videoSender) return;
          try {
            await videoSender.replaceTrack(nextTrack || null);
          } catch (err) {
            void err;
          }
        })
      );
    },
    [callsRef]
  );

  const stopScreenShare = useCallback(async () => {
    const activeShareTrack = screenShareTrackRef.current;
    const previousCameraTrack = cameraTrackBeforeShareRef.current;

    if (!activeShareTrack && !isScreenSharing) return;

    screenShareTrackRef.current = null;
    cameraTrackBeforeShareRef.current = null;
    setIsScreenSharing(false);

    const restoredCameraTrack =
      previousCameraTrack && previousCameraTrack.readyState === "live"
        ? previousCameraTrack
        : null;

    await replaceOutgoingVideoTrack(restoredCameraTrack);

    const currentStream = streamRef.current;
    const audioTracks = currentStream ? currentStream.getAudioTracks() : [];
    const nextTracks = [...audioTracks];
    if (restoredCameraTrack) {
      nextTracks.push(restoredCameraTrack);
    }

    setStream(nextTracks.length > 0 ? new MediaStream(nextTracks) : null);
    setVideoEnabled(!!restoredCameraTrack && restoredCameraTrack.enabled);

    if (activeShareTrack && activeShareTrack.readyState === "live") {
      activeShareTrack.stop();
    }
  }, [isScreenSharing, replaceOutgoingVideoTrack, setStream, setVideoEnabled, streamRef]);

  const startScreenShare = useCallback(async () => {
    if (isScreenSharing) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert("Screen sharing is not supported in this browser.");
      return;
    }

    const currentStream = streamRef.current;
    const currentCameraTrack = currentStream?.getVideoTracks?.()[0] || null;
    if (!currentStream || !currentCameraTrack) {
      alert("Join with video first to start screen sharing.");
      return;
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const displayTrack = displayStream.getVideoTracks?.()[0] || null;
      if (!displayTrack) return;

      cameraTrackBeforeShareRef.current = currentCameraTrack;
      screenShareTrackRef.current = displayTrack;

      await replaceOutgoingVideoTrack(displayTrack);

      const nextTracks = [...currentStream.getAudioTracks(), displayTrack];
      setStream(new MediaStream(nextTracks));
      setVideoEnabled(true);
      setIsScreenSharing(true);

      displayTrack.addEventListener(
        "ended",
        () => {
          void stopScreenShare();
        },
        { once: true }
      );
    } catch (err) {
      if (err?.name === "NotAllowedError") return;
      console.error("getDisplayMedia failed:", err);
      alert("Failed to start screen sharing.");
    }
  }, [
    isScreenSharing,
    replaceOutgoingVideoTrack,
    setStream,
    setVideoEnabled,
    stopScreenShare,
    streamRef,
  ]);

  // Adaptive video quality: throttle resolution/fps when connections are degraded.
  useEffect(() => {
    stopAdaptiveVideo();

    if (!stream || isScreenSharing) return;
    if (stream.getVideoTracks().length === 0) return;

    adaptiveVideoControllerRef.current = startAdaptiveVideo(stream, {
      checkIntervalMs: 3500,
      getPeerConnections,
      lowConstraints: {
        width: { ideal: 426, max: 640 },
        height: { ideal: 240, max: 360 },
        frameRate: { ideal: 12, max: 15 },
      },
      veryLowConstraints: {
        width: { ideal: 320, max: 426 },
        height: { ideal: 180, max: 240 },
        frameRate: { ideal: 8, max: 10 },
      },
    });

    return () => {
      stopAdaptiveVideo();
    };
  }, [getPeerConnections, isScreenSharing, stopAdaptiveVideo, stream]);

  /**
   * Hard-stops any active screen share track and resets all refs. Used by
   * endCall when the session is torn down completely.
   */
  const cleanupScreenShare = useCallback(() => {
    if (screenShareTrackRef.current) {
      try {
        screenShareTrackRef.current.stop();
      } catch {
        // noop
      }
      screenShareTrackRef.current = null;
    }
    cameraTrackBeforeShareRef.current = null;
    setIsScreenSharing(false);
  }, []);

  return {
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    stopAdaptiveVideo,
    cleanupScreenShare,
  };
};
