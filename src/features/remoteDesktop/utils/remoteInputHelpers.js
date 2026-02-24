export const mapMouseButton = (button) => {
  if (button === 2) return "right";
  if (button === 1) return "middle";
  return "left";
};

export const MOVE_EVENT_THROTTLE_MS = 20;
export const TOUCH_TAP_MAX_MOVE = 0.015;
export const clamp01 = (value) => Math.min(1, Math.max(0, value));

export const preventDefaultIfCancelable = (event) => {
  if (!event || typeof event.preventDefault !== "function") return;
  if (typeof event.cancelable === "boolean" && !event.cancelable) return;
  event.preventDefault();
};
