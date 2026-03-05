import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpeechRecognition } from "../../features/meetingSummary/hooks/useSpeechRecognition";

// ---------------------------------------------------------------------------
// Fake SpeechRecognition — a real class so `new` works correctly
// ---------------------------------------------------------------------------
class FakeRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = "";
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    this.started = false;
    this.stopped = false;
  }

  start() {
    this.started = true;
    this.stopped = false;
  }

  stop() {
    this.stopped = true;
    this.started = false;
    if (typeof this.onend === "function") this.onend();
  }

  triggerResult(transcriptText) {
    if (typeof this.onresult !== "function") return;
    this.onresult({
      resultIndex: 0,
      results: [Object.assign([{ transcript: transcriptText }], { isFinal: true })],
    });
  }

  triggerError(errorCode = "network") {
    if (typeof this.onerror === "function") this.onerror({ error: errorCode });
  }
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../../features/meetingSummary/state/transcriptStore", () => ({
  default: {
    add: vi.fn(),
    get: vi.fn(() => ""),
    clear: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

import transcriptStore from "../../features/meetingSummary/state/transcriptStore";

// We keep a reference to the last created FakeRecognition instance so tests
// can poke onresult/onerror handlers on it.
let lastFakeInstance;

beforeEach(() => {
  localStorage.setItem("meeting:stt:consent", "1");

  // Each test gets a fresh FakeRecognition instance.
  // We use a class that captures `this` so we can reference it later.
  lastFakeInstance = undefined;
  window.SpeechRecognition = class extends FakeRecognition {
    constructor() {
      super();
      // eslint-disable-next-line no-constructor-return
      lastFakeInstance = this;
    }
  };

  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
    },
    writable: true,
    configurable: true,
  });

  vi.clearAllMocks();
  // Re-wire mocks cleared above
  transcriptStore.get.mockReturnValue("");
});

afterEach(() => {
  localStorage.clear();
  delete window.SpeechRecognition;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("useSpeechRecognition", () => {
  it("starts with isListening=false", () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.isListening).toBe(false);
  });

  it("startListening sets isListening=true and calls recognition.start()", async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.startListening();
    });

    expect(result.current.isListening).toBe(true);
    expect(lastFakeInstance.started).toBe(true);
  });

  it("is idempotent — calling startListening twice only creates one instance", async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.startListening();
    });
    const firstInstance = lastFakeInstance;

    await act(async () => {
      await result.current.startListening(); // second call — should no-op
    });

    // No new instance should have been created
    expect(lastFakeInstance).toBe(firstInstance);
  });

  it("onresult calls transcriptStore.add with the chunk", async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.startListening();
    });

    act(() => {
      lastFakeInstance.triggerResult("hello world");
    });

    expect(transcriptStore.add).toHaveBeenCalledWith("hello world");
  });

  it("onresult updates lastChunk", async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.startListening();
    });

    act(() => {
      lastFakeInstance.triggerResult("test chunk");
    });

    expect(result.current.lastChunk).toBe("test chunk");
  });

  it("stopListening calls recognition.stop() and sets isListening=false", async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.startListening();
    });

    act(() => {
      result.current.stopListening();
    });

    expect(lastFakeInstance.stopped).toBe(true);
    expect(result.current.isListening).toBe(false);
  });

  it("onerror sets isListening=false", async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.startListening();
    });

    act(() => {
      lastFakeInstance.triggerError("network");
    });

    expect(result.current.isListening).toBe(false);
  });

  it("__TEST_getRecogInstance returns the internal recognition instance", async () => {
    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.startListening();
    });

    expect(result.current.__TEST_getRecogInstance()).toBe(lastFakeInstance);
  });

  it("does not start if consent is denied", async () => {
    localStorage.removeItem("meeting:stt:consent");
    window.confirm = vi.fn(() => false);

    const { result } = renderHook(() => useSpeechRecognition());

    await act(async () => {
      await result.current.startListening();
    });

    expect(result.current.isListening).toBe(false);
    expect(lastFakeInstance).toBeUndefined();
  });
});
