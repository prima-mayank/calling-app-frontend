const normalizeSocketServerUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
};

const resolveDefaultSocketServer = () => {
  const configuredSocketUrl = normalizeSocketServerUrl(import.meta.env.VITE_SOCKET_URL);
  if (configuredSocketUrl) {
    return configuredSocketUrl;
  }

  if (import.meta.env.DEV) {
    try {
      const host =
        typeof window !== "undefined" && window.location?.hostname
          ? window.location.hostname
          : "localhost";
      return normalizeSocketServerUrl(`http://${host}:5000`);
    } catch {
      return normalizeSocketServerUrl("http://localhost:5000");
    }
  }

  return normalizeSocketServerUrl("https://calling-app-backend-1.onrender.com");
};

const normalizeHttpDownloadUrl = (url) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(raw, base);
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const parsePort = (value) => {
  const port = Number(value);
  if (!Number.isFinite(port) || port <= 0) return null;
  return port;
};

export const WS_SERVER = resolveDefaultSocketServer();
export const REMOTE_CONTROL_TOKEN = String(import.meta.env.VITE_REMOTE_CONTROL_TOKEN || "").trim();
export const HOST_APP_REQUIRED_ERROR_CODES = new Set(["host-not-found", "host-offline"]);
export const REMOTE_DEBUG_ENABLED = String(import.meta.env.VITE_REMOTE_DEBUG || "").trim() === "1";
export const SOCKET_RECONNECT_DELAY_MS = 1000;
export const SOCKET_RECONNECT_DELAY_MAX_MS = 8000;
export const SOCKET_RECONNECT_ATTEMPTS = Infinity;

const socketWsUpgradeEnv = String(import.meta.env.VITE_SOCKET_WS_UPGRADE || "")
  .trim()
  .toLowerCase();

export const SOCKET_ENABLE_WS_UPGRADE =
  socketWsUpgradeEnv === "1" ||
  socketWsUpgradeEnv === "true" ||
  (socketWsUpgradeEnv !== "0" &&
    socketWsUpgradeEnv !== "false" &&
    !import.meta.env.DEV);

const hostAppDownloadUrl = String(
  import.meta.env.VITE_HOST_APP_DOWNLOAD_URL ||
    "https://github.com/prima-mayank/remote-agent/releases/latest/download/host-app-win.zip"
).trim();

export const buildHostAppDownloadUrl = () => {
  const configuredUrl = normalizeHttpDownloadUrl(hostAppDownloadUrl);
  if (configuredUrl) return configuredUrl;

  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(WS_SERVER, base);
    parsed.pathname = "/downloads/host-app-win.zip";
    parsed.search = "";
    parsed.hash = "";
    return normalizeHttpDownloadUrl(parsed.toString());
  } catch {
    return "";
  }
};

export const buildPeerConnectionConfig = () => {
  const isBrowser = typeof window !== "undefined";
  const isProduction = isBrowser ? window.location.protocol === "https:" : false;

  let socketHost = null;
  let socketPort = null;
  let socketSecure = isProduction;

  if (isBrowser) {
    try {
      const socketUrl = new URL(WS_SERVER, window.location.origin);
      socketHost = socketUrl.hostname || null;
      socketPort = socketUrl.port
        ? parsePort(socketUrl.port)
        : socketUrl.protocol === "https:"
        ? 443
        : 80;
      socketSecure = socketUrl.protocol === "https:";
    } catch {
      // noop: fallback values below
    }
  }

  const envHost = String(import.meta.env.VITE_PEER_HOST || "").trim();
  const envPort = parsePort(import.meta.env.VITE_PEER_PORT);
  const envSecureRaw = String(import.meta.env.VITE_PEER_SECURE || "")
    .trim()
    .toLowerCase();
  const envPath = String(import.meta.env.VITE_PEER_PATH || "/peerjs/myapp").trim();

  return {
    host:
      envHost ||
      socketHost ||
      (isProduction && isBrowser ? window.location.hostname : "localhost"),
    port: envPort || socketPort || (isProduction ? 443 : 5000),
    path: envPath || "/peerjs/myapp",
    secure:
      envSecureRaw === "true" || envSecureRaw === "1"
        ? true
        : envSecureRaw === "false" || envSecureRaw === "0"
        ? false
        : socketSecure,
  };
};
