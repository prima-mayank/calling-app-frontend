import { DEFAULT_SUMMARY_TIMEOUT_MS } from "../constants";

const isNetworkError = (error) =>
  !!error && !error.status && (error.name === "TypeError" || error.code === "network_error");

const safeParseJsonResponse = async (response) => {
  const contentType = String(response.headers?.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new Error("summarize response is not JSON");
  }

  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid JSON response from summarize endpoint");
  }
};

const normalizeResult = (payload = {}) => ({
  summary: typeof payload.summary === "string" ? payload.summary : "",
  bullets: Array.isArray(payload.bullets)
    ? payload.bullets.filter((item) => typeof item === "string")
    : [],
  truncated: !!payload.truncated,
});

const requestSummary = async (transcript, url, options) => {
  const timeoutMs =
    Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_SUMMARY_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const fetchImpl = typeof options.fetchImpl === "function" ? options.fetchImpl : fetch;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        text: typeof transcript === "string" ? transcript : "",
      }),
      keepalive: !!options.keepalive,
      signal: controller.signal,
    });

    const payload = await safeParseJsonResponse(response);
    if (!response.ok) {
      const message =
        String(payload?.error || payload?.message || response.statusText || "request_failed").trim();
      const error = new Error(`summarize request failed (${response.status}): ${message}`);
      error.status = response.status;
      throw error;
    }

    return normalizeResult(payload);
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`summarize request timed out after ${timeoutMs}ms`);
      timeoutError.code = "timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export async function summarize(transcript, url = "/api/summarize", options = {}) {
  const maxRetries = Number(options.maxRetries) >= 0 ? Number(options.maxRetries) : 1;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      return await requestSummary(transcript, url, options);
    } catch (error) {
      const shouldRetry = isNetworkError(error) && attempt < maxRetries;
      if (!shouldRetry) {
        throw error;
      }
      attempt += 1;
    }
  }

  throw new Error("summarize request failed");
}
