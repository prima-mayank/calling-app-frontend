import transcriptStore from "../state/transcriptStore";
import { summarize } from "../services/summarizeService";
import { SUMMARY_STORAGE_KEY, SUMMARY_ERROR_STORAGE_KEY } from "../constants";

const safeLocalStorageGet = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeLocalStorageSet = (key, value) => {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // noop
  }
};

const dispatchEvent = (name, detail = {}) => {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch {
    // noop
  }
};

/**
 * Run auto-summarization. Called on meeting-end triggers.
 * Safe to call multiple times — guards against double-run via localStorage key.
 */
const runAutoSummarize = async ({ stopListening, summarizeUrl, onAutoSummary }) => {
  try {
    if (typeof stopListening === "function") {
      try {
        stopListening();
      } catch {
        // noop
      }
    }

    const transcript = transcriptStore.get();
    if (!transcript) return;

    // Guard: if summary already saved this session, skip
    if (safeLocalStorageGet(SUMMARY_STORAGE_KEY)) return;

    const url = summarizeUrl || "/api/summarize";
    const result = await summarize(transcript, url, { keepalive: true });

    safeLocalStorageSet(SUMMARY_STORAGE_KEY, result);
    dispatchEvent("meeting:summary", {
      summary: result.summary,
      bullets: result.bullets,
      truncated: result.truncated,
    });

    if (typeof onAutoSummary === "function") {
      try {
        onAutoSummary(result);
      } catch {
        // noop
      }
    }

    transcriptStore.clear();
  } catch (error) {
    const message = error?.message || "auto-summarize failed";
    console.error("[meetingLifecycle] auto-summarize error:", message);

    // Store error marker so End Call page can show it
    safeLocalStorageSet(SUMMARY_ERROR_STORAGE_KEY, JSON.stringify({ error: message }));
  }
};

/**
 * Set up meeting lifecycle listeners.
 *
 * @param {object} opts
 * @param {object|null} opts.peerConnection - PeerJS call/connection object. Attach close listener if provided.
 * @param {Function} [opts.stopListening] - stopListening from useSpeechRecognition hook
 * @param {string} [opts.summarizeUrl]    - backend summarize URL
 * @param {Function} [opts.onAutoSummary] - callback when auto-summary completes
 * @returns {Function} cleanup - call on component unmount / route change
 */
export const setupMeetingLifecycle = (opts = {}) => {
  const { peerConnection, stopListening, summarizeUrl, onAutoSummary } = opts;

  let triggered = false;
  const triggerOnce = () => {
    if (triggered) return;
    triggered = true;
    void runAutoSummarize({ stopListening, summarizeUrl, onAutoSummary });
  };

  // Browser tab/window close or refresh
  const handleBeforeUnload = () => {
    triggerOnce();
  };

  window.addEventListener("beforeunload", handleBeforeUnload);

  // PeerJS call close
  if (peerConnection && typeof peerConnection.on === "function") {
    try {
      peerConnection.on("close", triggerOnce);
    } catch {
      // noop — peerConnection may not be available in all contexts
    }
  }

  // Return cleanup so caller can tear down on unmount / route change
  const cleanup = () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    triggerOnce();
  };

  return cleanup;
};

/**
 * Convenience: attach lifecycle to a React Router history/navigate.
 * Call the returned function inside a useEffect that watches location.
 */
export const handleRouteChange = (opts = {}) => {
  const { stopListening, summarizeUrl, onAutoSummary } = opts;
  void runAutoSummarize({ stopListening, summarizeUrl, onAutoSummary });
};
