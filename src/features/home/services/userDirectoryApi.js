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

const resolveUsersApiBase = () => {
  const configuredApiBase = toHttpOrigin(import.meta.env.VITE_API_BASE_URL);
  if (configuredApiBase) return `${configuredApiBase}/api/users`;

  const socketBase = toHttpOrigin(WS_SERVER);
  if (socketBase) return `${socketBase}/api/users`;

  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/+$/, "")}/api/users`;
  }

  return "/api/users";
};

const USERS_API_BASE = resolveUsersApiBase();

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

export const fetchUserDirectory = async ({ token }) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return { users: [] };
  }

  const response = await fetch(`${USERS_API_BASE}/directory`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${normalizedToken}`,
    },
  });

  if (!response.ok) {
    await parseApiError(response);
  }

  return response.json();
};
