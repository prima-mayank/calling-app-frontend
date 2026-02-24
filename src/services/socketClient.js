import SocketIoClient from "socket.io-client";
import {
  REMOTE_CONTROL_TOKEN,
  SOCKET_ENABLE_WS_UPGRADE,
  SOCKET_RECONNECT_ATTEMPTS,
  SOCKET_RECONNECT_DELAY_MAX_MS,
  SOCKET_RECONNECT_DELAY_MS,
  WS_SERVER,
} from "../config/runtimeConfig";
import { readAuthSession } from "../features/auth/utils/authStorage";

const resolveSocketAuthPayload = () => {
  const payload = {};

  if (REMOTE_CONTROL_TOKEN) {
    payload.token = REMOTE_CONTROL_TOKEN;
  }

  const authSession = readAuthSession();
  if (authSession?.token) {
    payload.accessToken = authSession.token;
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
};

export const socket = SocketIoClient(WS_SERVER, {
  auth: (cb) => {
    cb(resolveSocketAuthPayload());
  },
  withCredentials: false,
  // Keep polling enabled so signaling still works when WebSocket upgrade is blocked.
  // In local dev, WebSocket upgrade is disabled by default to avoid noisy probe failures
  // like "Invalid frame header" on unstable/local network setups.
  transports: ["polling", "websocket"],
  upgrade: SOCKET_ENABLE_WS_UPGRADE,
  rememberUpgrade: SOCKET_ENABLE_WS_UPGRADE,
  timeout: 20000,
  reconnection: true,
  reconnectionAttempts: SOCKET_RECONNECT_ATTEMPTS,
  reconnectionDelay: SOCKET_RECONNECT_DELAY_MS,
  reconnectionDelayMax: SOCKET_RECONNECT_DELAY_MAX_MS,
  randomizationFactor: 0.4,
});

export const refreshSocketAuthSession = () => {
  if (typeof socket.disconnect === "function" && socket.connected) {
    socket.disconnect();
  }
  if (typeof socket.connect === "function") {
    socket.connect();
  }
};
