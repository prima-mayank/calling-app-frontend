import { useCallback, useEffect, useRef, useState } from "react";
import { STT_CONSENT_KEY } from "../constants";
import transcriptStore from "../state/transcriptStore";

const CONSENT_PROMPT = "Allow speech transcription for meeting summary?";

const resolveSpeechRecognitionConstructor = () => {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

const createNoopRecognition = () => ({
  continuous: true,
  interimResults: true,
  lang: "en-US",
  onresult: null,
  onerror: null,
  onend: null,
  start() {
    console.warn("SpeechRecognition API unavailable in this browser.");
    if (typeof this.onerror === "function") {
      this.onerror({ error: "not-supported" });
    }
  },
  stop() {
    if (typeof this.onend === "function") {
      this.onend();
    }
  },
});

const safeAlert = (message) => {
  try {
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(message);
    }
  } catch {
    // noop
  }
};

const safeConfirm = (message) => {
  try {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      return window.confirm(message);
    }
  } catch {
    // noop
  }
  return false;
};

const readConsent = () => {
  try {
    return localStorage.getItem(STT_CONSENT_KEY) === "1";
  } catch {
    return false;
  }
};

const writeConsent = () => {
  try {
    localStorage.setItem(STT_CONSENT_KEY, "1");
  } catch {
    // noop
  }
};

const buildChunkFromResultEvent = (event) => {
  const resultList = event?.results;
  if (!resultList || typeof resultList.length !== "number") return "";

  const startIndex = Number.isInteger(event?.resultIndex) ? event.resultIndex : 0;
  const chunks = [];

  for (let index = startIndex; index < resultList.length; index += 1) {
    const result = resultList[index];
    const transcriptText = String(result?.[0]?.transcript || "").trim();
    if (transcriptText) chunks.push(transcriptText);
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim();
};

export const useSpeechRecognition = () => {
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [lastChunk, setLastChunk] = useState("");

  const ensureRecognition = useCallback(() => {
    if (recognitionRef.current) {
      return recognitionRef.current;
    }

    try {
      const SpeechRecognition = resolveSpeechRecognitionConstructor();
      const recognition = SpeechRecognition ? new SpeechRecognition() : createNoopRecognition();

      if (!SpeechRecognition) {
        console.warn("SpeechRecognition API missing, using noop recognizer.");
      }

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event) => {
        const chunk = buildChunkFromResultEvent(event);
        if (!chunk) return;
        transcriptStore.add(chunk);
        setLastChunk(chunk);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      return recognition;
    } catch (error) {
      console.error("SpeechRecognition initialization failed:", error);
      const fallback = createNoopRecognition();
      recognitionRef.current = fallback;
      return fallback;
    }
  }, []);

  const requestConsent = useCallback(() => {
    if (readConsent()) return true;
    const allowed = safeConfirm(CONSENT_PROMPT);
    if (!allowed) {
      safeAlert("Speech transcription was not enabled. You can continue your meeting.");
      return false;
    }
    writeConsent();
    return true;
  }, []);

  const requestMicrophonePermission = useCallback(async () => {
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        safeAlert("Microphone access is not available in this browser.");
        return false;
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (mediaStream?.getTracks) {
        mediaStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // noop
          }
        });
      }
      return true;
    } catch {
      safeAlert("Microphone permission is required for meeting transcription.");
      return false;
    }
  }, []);

  const startListening = useCallback(async () => {
    if (isListening) return;
    if (!requestConsent()) return;

    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) return;

    const recognition = ensureRecognition();
    try {
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.start?.();
      setIsListening(true);
    } catch (error) {
      console.error("Failed to start speech recognition:", error);
      setIsListening(false);
      safeAlert("Unable to start speech recognition right now.");
    }
  }, [ensureRecognition, isListening, requestConsent, requestMicrophonePermission]);

  const stopListening = useCallback(() => {
    if (!isListening && !recognitionRef.current) return;
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // noop
    }
    setIsListening(false);
  }, [isListening]);

  useEffect(() => {
    return () => {
      const recognition = recognitionRef.current;
      if (!recognition) return;

      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop?.();
      } catch {
        // noop
      }
      recognitionRef.current = null;
    };
  }, []);

  const __TEST_getRecogInstance = useCallback(() => recognitionRef.current, []);

  return {
    isListening,
    startListening,
    stopListening,
    lastChunk,
    __TEST_getRecogInstance,
  };
};

export default useSpeechRecognition;
