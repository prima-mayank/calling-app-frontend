import { TRANSCRIPT_MAX_CHARS } from "../constants";

let transcript = "";
const listeners = new Set();

const normalizeChunk = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
};

const trimToLimit = (value) => {
  const text = String(value || "");
  if (text.length <= TRANSCRIPT_MAX_CHARS) return text;
  return text.slice(text.length - TRANSCRIPT_MAX_CHARS);
};

const notify = () => {
  listeners.forEach((listener) => {
    try {
      listener(transcript);
    } catch {
      // noop
    }
  });
};

export const transcriptStore = {
  add(value) {
    try {
      const chunk = normalizeChunk(value);
      if (!chunk) return transcript;
      const joined = transcript ? `${transcript} ${chunk}` : chunk;
      transcript = trimToLimit(joined);
      notify();
      return transcript;
    } catch {
      return transcript;
    }
  },
  get() {
    try {
      return String(transcript || "");
    } catch {
      return "";
    }
  },
  clear() {
    try {
      transcript = "";
      notify();
    } catch {
      // noop
    }
  },
  subscribe(listener) {
    try {
      if (typeof listener !== "function") return;
      listeners.add(listener);
    } catch {
      // noop
    }
  },
  unsubscribe(listener) {
    try {
      listeners.delete(listener);
    } catch {
      // noop
    }
  },
};

export default transcriptStore;
