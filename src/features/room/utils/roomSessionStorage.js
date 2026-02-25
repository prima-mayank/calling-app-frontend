export const HOME_JOIN_PREF_KEY = "home_join_pref_v1";
export const HOME_JOIN_PREF_MAX_AGE_MS = 5 * 60 * 1000;
export const HOME_QUICK_REJOIN_KEY = "home_quick_rejoin_v1";
export const HOME_QUICK_REJOIN_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const ACTIVE_ROOM_SESSION_KEY = "active_room_session_v1";
export const ACTIVE_ROOM_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const normalizeMode = (value) => {
  const mode = String(value || "").trim();
  if (mode === "video" || mode === "audio" || mode === "none") {
    return mode;
  }
  return "";
};

const readJson = (key) => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveHomeJoinPreference = (mode) => {
  const normalizedMode = normalizeMode(mode);
  if (!normalizedMode) return false;
  try {
    sessionStorage.setItem(
      HOME_JOIN_PREF_KEY,
      JSON.stringify({ mode: normalizedMode, ts: Date.now() })
    );
    return true;
  } catch {
    return false;
  }
};

export const clearHomeJoinPreference = () => {
  try {
    sessionStorage.removeItem(HOME_JOIN_PREF_KEY);
  } catch {
    // noop
  }
};

export const readHomeJoinPreference = () => {
  const parsed = readJson(HOME_JOIN_PREF_KEY);
  if (!parsed) return "";

  const mode = normalizeMode(parsed.mode);
  const ts = Number(parsed.ts || 0);
  const isFresh =
    Number.isFinite(ts) && ts > 0 && Date.now() - ts <= HOME_JOIN_PREF_MAX_AGE_MS;

  if (!mode || !isFresh) {
    clearHomeJoinPreference();
    return "";
  }
  return mode;
};

export const consumeHomeJoinPreference = () => {
  const mode = readHomeJoinPreference();
  clearHomeJoinPreference();
  return mode;
};

export const saveQuickRejoinRoom = ({ roomId, mode }) => {
  const normalizedRoomId = String(roomId || "").trim();
  const normalizedMode = normalizeMode(mode) || "none";
  if (!normalizedRoomId) return false;

  try {
    sessionStorage.setItem(
      HOME_QUICK_REJOIN_KEY,
      JSON.stringify({
        roomId: normalizedRoomId,
        mode: normalizedMode,
        ts: Date.now(),
      })
    );
    return true;
  } catch {
    return false;
  }
};

export const clearQuickRejoinRoom = () => {
  try {
    sessionStorage.removeItem(HOME_QUICK_REJOIN_KEY);
  } catch {
    // noop
  }
};

export const readQuickRejoinRoom = () => {
  const parsed = readJson(HOME_QUICK_REJOIN_KEY);
  if (!parsed) return null;

  const roomId = String(parsed.roomId || "").trim();
  const mode = normalizeMode(parsed.mode) || "none";
  const ts = Number(parsed.ts || 0);
  const isFresh =
    Number.isFinite(ts) && ts > 0 && Date.now() - ts <= HOME_QUICK_REJOIN_MAX_AGE_MS;

  if (!roomId || !isFresh) {
    clearQuickRejoinRoom();
    return null;
  }

  return { roomId, mode };
};

export const saveActiveRoomSession = ({ roomId, mode }) => {
  const normalizedRoomId = String(roomId || "").trim();
  const normalizedMode = normalizeMode(mode) || "none";
  if (!normalizedRoomId) return false;

  try {
    sessionStorage.setItem(
      ACTIVE_ROOM_SESSION_KEY,
      JSON.stringify({
        roomId: normalizedRoomId,
        mode: normalizedMode,
        ts: Date.now(),
      })
    );
    return true;
  } catch {
    return false;
  }
};

export const clearActiveRoomSession = () => {
  try {
    sessionStorage.removeItem(ACTIVE_ROOM_SESSION_KEY);
  } catch {
    // noop
  }
};

export const readActiveRoomSession = () => {
  const parsed = readJson(ACTIVE_ROOM_SESSION_KEY);
  if (!parsed) return null;

  const roomId = String(parsed.roomId || "").trim();
  const mode = normalizeMode(parsed.mode) || "none";
  const ts = Number(parsed.ts || 0);
  const isFresh =
    Number.isFinite(ts) && ts > 0 && Date.now() - ts <= ACTIVE_ROOM_SESSION_MAX_AGE_MS;

  if (!roomId || !isFresh) {
    clearActiveRoomSession();
    return null;
  }

  return { roomId, mode };
};

export const readActiveRoomSessionModeForRoom = (roomId) => {
  const normalizedRoomId = String(roomId || "").trim();
  if (!normalizedRoomId) return "";

  const activeRoomSession = readActiveRoomSession();
  if (!activeRoomSession) return "";
  if (activeRoomSession.roomId !== normalizedRoomId) return "";

  return normalizeMode(activeRoomSession.mode) || "";
};
