import { resolveApiBase } from "../../shared/services/apiUrl";

const USERS_API_BASE = resolveApiBase("/api/users");

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
