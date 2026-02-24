const TOKEN_KEY = "calling-app.auth.token";
const USER_KEY = "calling-app.auth.user";

const safeParseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const readAuthSession = () => {
  if (typeof window === "undefined") return null;

  const token = String(window.localStorage.getItem(TOKEN_KEY) || "").trim();
  if (!token) return null;

  const userRaw = String(window.localStorage.getItem(USER_KEY) || "").trim();
  const user = userRaw ? safeParseJson(userRaw) : null;
  return { token, user };
};

export const saveAuthSession = ({ token, user }) => {
  if (typeof window === "undefined") return;

  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return;

  window.localStorage.setItem(TOKEN_KEY, normalizedToken);
  if (user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(USER_KEY);
  }
};

export const clearAuthSession = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
};
