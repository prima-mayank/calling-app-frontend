import { preventDefaultIfCancelable } from "./remoteInputHelpers";

export const registerRemoteKeyboardControl = ({
  remoteInputActive,
  remoteDesktopSession,
  sendRemoteDesktopInput,
  setRemoteInputActive,
}) => {
  const isControlActive = remoteInputActive && !!remoteDesktopSession;
  if (!isControlActive || !remoteDesktopSession) return () => {};

  const isTypingTarget = (element) => {
    if (!element) return false;
    const tag = element.tagName?.toLowerCase();
    if (!tag) return false;
    if (element.isContentEditable) return true;
    return tag === "input" || tag === "textarea" || tag === "select";
  };

  const releaseModifierKeys = () => {
    const modifierReleases = [
      { key: "Shift", code: "ShiftLeft" },
      { key: "Shift", code: "ShiftRight" },
      { key: "Control", code: "ControlLeft" },
      { key: "Control", code: "ControlRight" },
      { key: "Alt", code: "AltLeft" },
      { key: "Alt", code: "AltRight" },
      { key: "Meta", code: "MetaLeft" },
      { key: "Meta", code: "MetaRight" },
    ];

    modifierReleases.forEach((modifier) => {
      sendRemoteDesktopInput({
        type: "key-up",
        key: modifier.key,
        code: modifier.code,
      });
    });
  };

  const onKeyDown = (event) => {
    if (isTypingTarget(event.target)) return;
    if (event.key === "Escape") {
      preventDefaultIfCancelable(event);
      releaseModifierKeys();
      setRemoteInputActive(false);
      return;
    }

    preventDefaultIfCancelable(event);
    sendRemoteDesktopInput({
      type: "key-down",
      key: event.key,
      code: event.code,
      repeat: event.repeat,
    });
  };

  const onKeyUp = (event) => {
    if (isTypingTarget(event.target)) return;
    preventDefaultIfCancelable(event);
    sendRemoteDesktopInput({
      type: "key-up",
      key: event.key,
      code: event.code,
    });
  };

  const onWindowBlur = () => {
    releaseModifierKeys();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      releaseModifierKeys();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onWindowBlur);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    releaseModifierKeys();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onWindowBlur);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
};
