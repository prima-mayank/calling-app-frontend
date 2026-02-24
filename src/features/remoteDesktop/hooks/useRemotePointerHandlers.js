import { useCallback } from "react";
import {
  MOVE_EVENT_THROTTLE_MS,
  TOUCH_TAP_MAX_MOVE,
  clamp01,
  mapMouseButton,
  preventDefaultIfCancelable,
} from "../utils/remoteInputHelpers";

export const useRemotePointerHandlers = ({
  remoteDesktopSession,
  isControlActive,
  sendRemoteDesktopInput,
  setRemoteInputActive,
  moveThrottleRef,
  remoteSurfaceRef,
  remoteFrameRef,
  touchStateRef,
  ignoreNextClickRef,
}) => {
  const buildPointerPayloadFromClient = useCallback((clientX, clientY) => {
    const frame = remoteFrameRef.current;
    const surface = remoteSurfaceRef.current;
    if (!surface) return null;

    const surfaceRect = surface.getBoundingClientRect();
    if (!surfaceRect.width || !surfaceRect.height) return null;

    if (
      clientX < surfaceRect.left ||
      clientX > surfaceRect.left + surfaceRect.width ||
      clientY < surfaceRect.top ||
      clientY > surfaceRect.top + surfaceRect.height
    ) {
      return null;
    }

    let activeRect = surfaceRect;

    if (frame) {
      const frameRect = frame.getBoundingClientRect();
      const naturalWidth = Number(frame.naturalWidth);
      const naturalHeight = Number(frame.naturalHeight);

      if (
        frameRect.width > 0 &&
        frameRect.height > 0 &&
        Number.isFinite(naturalWidth) &&
        Number.isFinite(naturalHeight) &&
        naturalWidth > 0 &&
        naturalHeight > 0
      ) {
        const frameRatio = frameRect.width / frameRect.height;
        const imageRatio = naturalWidth / naturalHeight;

        let width = frameRect.width;
        let height = frameRect.height;
        let offsetX = 0;
        let offsetY = 0;

        if (frameRatio > imageRatio) {
          height = frameRect.height;
          width = height * imageRatio;
          offsetX = (frameRect.width - width) / 2;
        } else if (frameRatio < imageRatio) {
          width = frameRect.width;
          height = width / imageRatio;
          offsetY = (frameRect.height - height) / 2;
        }

        activeRect = {
          left: frameRect.left + offsetX,
          top: frameRect.top + offsetY,
          width,
          height,
        };
      }
    }

    const x = clamp01((clientX - activeRect.left) / activeRect.width);
    const y = clamp01((clientY - activeRect.top) / activeRect.height);

    return { x, y };
  }, [remoteFrameRef, remoteSurfaceRef]);

  const buildPointerPayload = useCallback((event) =>
    buildPointerPayloadFromClient(event.clientX, event.clientY), [buildPointerPayloadFromClient]);

  const handleRemoteMove = useCallback((event) => {
    if (!remoteDesktopSession || !isControlActive) return;

    const now = Date.now();
    if (now - moveThrottleRef.current < MOVE_EVENT_THROTTLE_MS) return;
    moveThrottleRef.current = now;

    const pointer = buildPointerPayload(event);
    if (!pointer) return;

    sendRemoteDesktopInput({
      type: "move",
      ...pointer,
    });
  }, [buildPointerPayload, isControlActive, moveThrottleRef, remoteDesktopSession, sendRemoteDesktopInput]);

  const handleRemoteClick = useCallback((event) => {
    if (ignoreNextClickRef.current) {
      ignoreNextClickRef.current = false;
      return;
    }
    if (!remoteDesktopSession) return;

    preventDefaultIfCancelable(event);
    const pointer = buildPointerPayload(event);
    if (!pointer) return;

    sendRemoteDesktopInput({
      type: "click",
      button: mapMouseButton(event.button),
      ...pointer,
    });
  }, [buildPointerPayload, ignoreNextClickRef, remoteDesktopSession, sendRemoteDesktopInput]);

  const handleRemoteMouseDown = useCallback((event) => {
    if (!remoteDesktopSession || !isControlActive) return;

    preventDefaultIfCancelable(event);
    const pointer = buildPointerPayload(event);
    if (!pointer) return;

    sendRemoteDesktopInput({
      type: "mouse-down",
      button: mapMouseButton(event.button),
      ...pointer,
    });
  }, [buildPointerPayload, isControlActive, remoteDesktopSession, sendRemoteDesktopInput]);

  const handleRemoteMouseUp = useCallback((event) => {
    if (!remoteDesktopSession || !isControlActive) return;

    preventDefaultIfCancelable(event);
    const pointer = buildPointerPayload(event);
    if (!pointer) return;

    sendRemoteDesktopInput({
      type: "mouse-up",
      button: mapMouseButton(event.button),
      ...pointer,
    });
  }, [buildPointerPayload, isControlActive, remoteDesktopSession, sendRemoteDesktopInput]);

  const handleRemoteWheel = useCallback((event) => {
    if (!remoteDesktopSession || !isControlActive) return;

    preventDefaultIfCancelable(event);
    const pointer = buildPointerPayload(event);
    if (!pointer) return;

    sendRemoteDesktopInput({
      type: "wheel",
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      ...pointer,
    });
  }, [buildPointerPayload, isControlActive, remoteDesktopSession, sendRemoteDesktopInput]);

  const getPrimaryTouch = useCallback((event) => event.touches?.[0] || event.changedTouches?.[0], []);

  const handleTouchStart = useCallback((event) => {
    if (!remoteDesktopSession) return;

    const touch = getPrimaryTouch(event);
    if (!touch) return;
    preventDefaultIfCancelable(event);

    const pointer = buildPointerPayloadFromClient(touch.clientX, touch.clientY);
    if (!pointer) return;

    setRemoteInputActive(true);
    touchStateRef.current = {
      active: true,
      moved: false,
      x: pointer.x,
      y: pointer.y,
      startX: pointer.x,
      startY: pointer.y,
    };

    sendRemoteDesktopInput({
      type: "mouse-down",
      button: "left",
      ...pointer,
    });
  }, [buildPointerPayloadFromClient, getPrimaryTouch, remoteDesktopSession, sendRemoteDesktopInput, setRemoteInputActive, touchStateRef]);

  const handleTouchMove = useCallback((event) => {
    if (!remoteDesktopSession || !touchStateRef.current.active) return;

    const touch = getPrimaryTouch(event);
    if (!touch) return;
    preventDefaultIfCancelable(event);

    const now = Date.now();
    if (now - moveThrottleRef.current < MOVE_EVENT_THROTTLE_MS) return;
    moveThrottleRef.current = now;

    const pointer = buildPointerPayloadFromClient(touch.clientX, touch.clientY);
    if (!pointer) return;

    const deltaX = Math.abs(pointer.x - touchStateRef.current.startX);
    const deltaY = Math.abs(pointer.y - touchStateRef.current.startY);
    if (deltaX > TOUCH_TAP_MAX_MOVE || deltaY > TOUCH_TAP_MAX_MOVE) {
      touchStateRef.current.moved = true;
    }

    touchStateRef.current.x = pointer.x;
    touchStateRef.current.y = pointer.y;

    sendRemoteDesktopInput({
      type: "move",
      ...pointer,
    });
  }, [buildPointerPayloadFromClient, getPrimaryTouch, moveThrottleRef, remoteDesktopSession, sendRemoteDesktopInput, touchStateRef]);

  const finishTouchInteraction = useCallback((event) => {
    if (!remoteDesktopSession || !touchStateRef.current.active) return;
    preventDefaultIfCancelable(event);

    const touch = getPrimaryTouch(event);
    const pointer = touch
      ? buildPointerPayloadFromClient(touch.clientX, touch.clientY)
      : { x: touchStateRef.current.x, y: touchStateRef.current.y };
    if (!pointer) {
      touchStateRef.current.active = false;
      return;
    }

    sendRemoteDesktopInput({
      type: "mouse-up",
      button: "left",
      ...pointer,
    });

    if (!touchStateRef.current.moved) {
      sendRemoteDesktopInput({
        type: "click",
        button: "left",
        ...pointer,
      });
      ignoreNextClickRef.current = true;
    }

    touchStateRef.current.active = false;
  }, [buildPointerPayloadFromClient, getPrimaryTouch, ignoreNextClickRef, remoteDesktopSession, sendRemoteDesktopInput, touchStateRef]);

  const handleTouchEnd = useCallback((event) => {
    finishTouchInteraction(event);
  }, [finishTouchInteraction]);

  const handleTouchCancel = useCallback((event) => {
    finishTouchInteraction(event);
  }, [finishTouchInteraction]);

  return {
    handleRemoteMove,
    handleRemoteClick,
    handleRemoteMouseDown,
    handleRemoteMouseUp,
    handleRemoteWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
  };
};
