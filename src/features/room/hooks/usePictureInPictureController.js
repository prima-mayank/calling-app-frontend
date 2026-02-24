import { useCallback, useEffect, useRef, useState } from "react";

const canUseStandardPiP = (videoElement) => {
  if (!videoElement) return false;
  if (typeof document === "undefined") return false;
  if (!document.pictureInPictureEnabled) return false;
  if (videoElement.disablePictureInPicture) return false;
  return typeof videoElement.requestPictureInPicture === "function";
};

const canUseWebkitPiP = (videoElement) => {
  if (!videoElement) return false;
  if (typeof videoElement.webkitSetPresentationMode !== "function") return false;
  if (typeof videoElement.webkitSupportsPresentationMode === "function") {
    return videoElement.webkitSupportsPresentationMode("picture-in-picture");
  }
  return true;
};

const getWebkitPresentationMode = (videoElement) =>
  String(videoElement?.webkitPresentationMode || "").toLowerCase();

export const usePictureInPictureController = () => {
  const videoElementsRef = useRef(new Map());
  const listenersRef = useRef(new Map());
  const [activeTargetId, setActiveTargetId] = useState("");

  const unregisterVideoElementListeners = useCallback((targetId) => {
    const normalizedTargetId = String(targetId || "").trim();
    if (!normalizedTargetId) return;

    const registration = listenersRef.current.get(normalizedTargetId);
    if (!registration) return;

    const { videoElement, onEnter, onLeave, onWebkitModeChange } = registration;
    if (videoElement) {
      videoElement.removeEventListener("enterpictureinpicture", onEnter);
      videoElement.removeEventListener("leavepictureinpicture", onLeave);
      videoElement.removeEventListener("webkitpresentationmodechanged", onWebkitModeChange);
    }

    listenersRef.current.delete(normalizedTargetId);
  }, []);

  const registerVideoElement = useCallback(
    (targetId, videoElement) => {
      const normalizedTargetId = String(targetId || "").trim();
      if (!normalizedTargetId) return;

      const currentVideoElement = videoElementsRef.current.get(normalizedTargetId);
      if (currentVideoElement === videoElement) return;

      unregisterVideoElementListeners(normalizedTargetId);

      if (!videoElement) {
        videoElementsRef.current.delete(normalizedTargetId);
        setActiveTargetId((prev) => (prev === normalizedTargetId ? "" : prev));
        return;
      }

      videoElementsRef.current.set(normalizedTargetId, videoElement);

      const onEnter = () => {
        setActiveTargetId(normalizedTargetId);
      };

      const onLeave = () => {
        setActiveTargetId((prev) => (prev === normalizedTargetId ? "" : prev));
      };

      const onWebkitModeChange = () => {
        const mode = getWebkitPresentationMode(videoElement);
        if (mode === "picture-in-picture") {
          setActiveTargetId(normalizedTargetId);
          return;
        }
        setActiveTargetId((prev) => (prev === normalizedTargetId ? "" : prev));
      };

      videoElement.addEventListener("enterpictureinpicture", onEnter);
      videoElement.addEventListener("leavepictureinpicture", onLeave);
      videoElement.addEventListener("webkitpresentationmodechanged", onWebkitModeChange);

      listenersRef.current.set(normalizedTargetId, {
        videoElement,
        onEnter,
        onLeave,
        onWebkitModeChange,
      });
    },
    [unregisterVideoElementListeners]
  );

  useEffect(() => {
    const listeners = listenersRef.current;
    const videoElements = videoElementsRef.current;

    return () => {
      Array.from(listeners.values()).forEach((registration) => {
        const { videoElement, onEnter, onLeave, onWebkitModeChange } = registration;
        if (!videoElement) return;
        videoElement.removeEventListener("enterpictureinpicture", onEnter);
        videoElement.removeEventListener("leavepictureinpicture", onLeave);
        videoElement.removeEventListener(
          "webkitpresentationmodechanged",
          onWebkitModeChange
        );
      });

      listeners.clear();
      videoElements.clear();
    };
  }, []);

  const isPictureInPictureSupported = useCallback((targetId) => {
    const normalizedTargetId = String(targetId || "").trim();
    if (!normalizedTargetId) return false;

    const videoElement = videoElementsRef.current.get(normalizedTargetId);
    if (!videoElement) return false;
    return canUseStandardPiP(videoElement) || canUseWebkitPiP(videoElement);
  }, []);

  const isPictureInPictureActive = useCallback(
    (targetId) => String(targetId || "").trim() === activeTargetId,
    [activeTargetId]
  );

  const togglePictureInPicture = useCallback(async (targetId) => {
    const normalizedTargetId = String(targetId || "").trim();
    if (!normalizedTargetId) {
      return { ok: false, reason: "missing-target" };
    }

    const videoElement = videoElementsRef.current.get(normalizedTargetId);
    if (!videoElement) {
      return { ok: false, reason: "missing-video" };
    }

    const useStandard = canUseStandardPiP(videoElement);
    const useWebkit = canUseWebkitPiP(videoElement);
    if (!useStandard && !useWebkit) {
      return { ok: false, reason: "unsupported" };
    }

    try {
      await videoElement.play().catch(() => {});

      if (useStandard) {
        const currentPiPElement = document.pictureInPictureElement;
        if (currentPiPElement === videoElement) {
          await document.exitPictureInPicture();
          setActiveTargetId("");
          return { ok: true, reason: "exited" };
        }

        if (currentPiPElement && currentPiPElement !== videoElement) {
          await document.exitPictureInPicture();
        }

        await videoElement.requestPictureInPicture();
        setActiveTargetId(normalizedTargetId);
        return { ok: true, reason: "entered" };
      }

      const presentationMode = getWebkitPresentationMode(videoElement);
      if (presentationMode === "picture-in-picture") {
        videoElement.webkitSetPresentationMode("inline");
        setActiveTargetId("");
        return { ok: true, reason: "exited" };
      }

      videoElement.webkitSetPresentationMode("picture-in-picture");
      setActiveTargetId(normalizedTargetId);
      return { ok: true, reason: "entered" };
    } catch {
      return { ok: false, reason: "failed" };
    }
  }, []);

  return {
    registerVideoElement,
    isPictureInPictureSupported,
    isPictureInPictureActive,
    togglePictureInPicture,
  };
};
