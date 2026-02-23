const STABLE_PEER_ID_KEY = "peer_stable_id_v1";

const sanitizePeerId = (value, maxLength = 64) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, maxLength);

const canUseSessionStorage = () => {
  try {
    return (
      typeof window !== "undefined" &&
      !!window.sessionStorage &&
      typeof window.sessionStorage.getItem === "function"
    );
  } catch {
    return false;
  }
};

const randomSuffix = () => {
  try {
    if (
      typeof globalThis !== "undefined" &&
      globalThis.crypto &&
      typeof globalThis.crypto.randomUUID === "function"
    ) {
      return sanitizePeerId(globalThis.crypto.randomUUID(), 36) || "anon";
    }
  } catch {
    // noop
  }

  return Math.random().toString(36).slice(2, 10);
};

const createPeerId = (prefix = "peer") => {
  const safePrefix = sanitizePeerId(prefix, 20) || "peer";
  return sanitizePeerId(`${safePrefix}-${randomSuffix()}`, 64);
};

export const readStablePeerId = () => {
  if (!canUseSessionStorage()) return "";
  try {
    const value = window.sessionStorage.getItem(STABLE_PEER_ID_KEY);
    return sanitizePeerId(value, 64);
  } catch {
    return "";
  }
};

export const saveStablePeerId = (peerId) => {
  const normalized = sanitizePeerId(peerId, 64);
  if (!normalized || !canUseSessionStorage()) return "";
  try {
    window.sessionStorage.setItem(STABLE_PEER_ID_KEY, normalized);
    return normalized;
  } catch {
    return "";
  }
};

export const getOrCreateStablePeerId = (options = {}) => {
  const existing = readStablePeerId();
  if (existing) return existing;

  const nextId = createPeerId(options.prefix || "peer");
  saveStablePeerId(nextId);
  return nextId;
};

export const rotateStablePeerId = (options = {}) => {
  const nextId = createPeerId(options.prefix || "peer");
  saveStablePeerId(nextId);
  return nextId;
};
