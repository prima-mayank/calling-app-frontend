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

export const resolveApiBase = (apiPath) => {
  const normalizedApiPath = String(apiPath || "").trim();
  if (!normalizedApiPath.startsWith("/api/")) {
    throw new Error("apiPath must start with /api/");
  }

  const configuredApiBase = toHttpOrigin(import.meta.env.VITE_API_BASE_URL);
  if (configuredApiBase) return `${configuredApiBase}${normalizedApiPath}`;

  const socketBase = toHttpOrigin(WS_SERVER);
  if (socketBase) return `${socketBase}${normalizedApiPath}`;

  if (typeof window !== "undefined") {
    return `${window.location.origin.replace(/\/+$/, "")}${normalizedApiPath}`;
  }

  return normalizedApiPath;
};
