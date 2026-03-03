import { resolveApiBase } from "../../shared/services/apiUrl";

const AUTH_API_BASE = resolveApiBase("/api/auth");

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
