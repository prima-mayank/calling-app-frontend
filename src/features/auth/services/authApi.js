import { WS_SERVER } from "../../../config/runtimeConfig";

const toHttpOrigin = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:5000";
    const parsed = new URL(raw, base);
    if (parsed.protocol === "ws:") parsed.protocol = "http:";
    if (parsed.protocol === "wss:") parsed.protocol = "https:";
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
};

const resolveAuthApiBase = () => {
  const configuredApiBase = toHttpOrigin(import.meta.env.VITE_API_BASE_URL);
  if (configuredApiBase) return `${configuredApiBase}/api/auth`;

  const socketBase = toHttpOrigin(WS_SERVER);
  if (socketBase) return `${socketBase}/api/auth`;

  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/+$/, "")}/api/auth`;
  }
  return "/api/auth";
};

const AUTH_API_BASE = resolveAuthApiBase();

const parseApiError = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const message =
    String(payload?.message || "").trim() ||
    String(payload?.error || "").trim() ||
    `Request failed (${response.status})`;

  const error = new Error(message);
  error.status = response.status;
  error.code = String(payload?.error || "").trim() || "request-failed";
  throw error;
};

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${AUTH_API_BASE}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    await parseApiError(response);
  }

  return response.json();
};

export const signupWithPassword = async ({ email, password, displayName }) => {
  return requestJson("/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
};

export const loginWithPassword = async ({ email, password }) => {
  return requestJson("/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
};

export const fetchCurrentUser = async ({ token }) => {
  return requestJson("/me", {
    method: "GET",
    headers: {
      authorization: `Bearer ${String(token || "").trim()}`,
    },
  });
};

export const fetchAuthStatus = async () => {
  return requestJson("/status", {
    method: "GET",
  });
};
