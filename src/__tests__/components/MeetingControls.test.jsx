import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before vi.mock() factories that reference them
// ---------------------------------------------------------------------------
const mockStartListening = vi.hoisted(() => vi.fn());
const mockStopListening = vi.hoisted(() => vi.fn());
const mockSummarize = vi.hoisted(() => vi.fn());
const mockTranscriptGet = vi.hoisted(() => vi.fn(() => "Hello world this is a transcript."));
const mockTranscriptClear = vi.hoisted(() => vi.fn());

vi.mock("../../features/meetingSummary/hooks/useSpeechRecognition", () => ({
  useSpeechRecognition: () => ({
    isListening: false,
    startListening: mockStartListening,
    stopListening: mockStopListening,
    lastChunk: "",
    __TEST_getRecogInstance: () => null,
  }),
}));

vi.mock("../../features/meetingSummary/state/transcriptStore", () => ({
  default: {
    add: vi.fn(),
    get: mockTranscriptGet,
    clear: mockTranscriptClear,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

vi.mock("../../features/meetingSummary/services/summarizeService", () => ({
  summarize: mockSummarize,
}));

// ---------------------------------------------------------------------------
// Import component after mocks are set up
// ---------------------------------------------------------------------------
import MeetingControls from "../../features/meetingSummary/components/MeetingControls";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MOCK_RESULT = {
  summary: "This was a productive meeting.",
  bullets: ["Point one", "Point two"],
  truncated: false,
};

beforeEach(() => {
  mockStartListening.mockReset();
  mockStopListening.mockReset();
  mockTranscriptGet.mockReturnValue("Hello world this is a transcript.");
  mockTranscriptClear.mockReset();
  mockSummarize.mockResolvedValue(MOCK_RESULT);
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
// Selectors use aria-labels defined in MeetingControls.jsx
const BTN_START = /start speech transcription/i;
const BTN_END   = /end meeting and summarize/i;
const BTN_SUM   = /generate meeting summary/i;

describe("MeetingControls", () => {
  it("renders three buttons", () => {
    render(<MeetingControls />);
    expect(screen.getByRole("button", { name: BTN_START })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: BTN_END })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: BTN_SUM })).toBeInTheDocument();
  });

  it("Start Listening calls startListening()", () => {
    render(<MeetingControls />);
    fireEvent.click(screen.getByRole("button", { name: BTN_START }));
    expect(mockStartListening).toHaveBeenCalledTimes(1);
  });

  it("End + Summarize calls stopListening() then summarize()", async () => {
    render(<MeetingControls />);
    fireEvent.click(screen.getByRole("button", { name: BTN_END }));

    expect(mockStopListening).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(mockSummarize).toHaveBeenCalledWith(
        "Hello world this is a transcript.",
        "/api/summarize"
      );
    });
  });

  it("Summarize button does NOT call stopListening()", async () => {
    render(<MeetingControls />);
    fireEvent.click(screen.getByRole("button", { name: BTN_SUM }));

    await waitFor(() => {
      expect(mockSummarize).toHaveBeenCalled();
    });

    expect(mockStopListening).not.toHaveBeenCalled();
  });

  it("opens SummaryModal after successful summarization", async () => {
    render(<MeetingControls />);
    fireEvent.click(screen.getByRole("button", { name: BTN_END }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("This was a productive meeting.")).toBeInTheDocument();
    });
  });

  it("displays bullet points in the modal", async () => {
    render(<MeetingControls />);
    fireEvent.click(screen.getByRole("button", { name: BTN_SUM }));

    await waitFor(() => {
      expect(screen.getByText("Point one")).toBeInTheDocument();
      expect(screen.getByText("Point two")).toBeInTheDocument();
    });
  });

  it("stores summary to localStorage after success", async () => {
    render(<MeetingControls />);
    fireEvent.click(screen.getByRole("button", { name: BTN_SUM }));

    await waitFor(() => {
      const stored = localStorage.getItem("meeting:lastSummary");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored);
      expect(parsed.summary).toBe("This was a productive meeting.");
    });
  });

  it("clears transcript after successful summarization", async () => {
    render(<MeetingControls />);
    fireEvent.click(screen.getByRole("button", { name: BTN_SUM }));

    await waitFor(() => {
      expect(mockTranscriptClear).toHaveBeenCalledTimes(1);
    });
  });

  it("dispatches meeting:summary event with result", async () => {
    const handler = vi.fn();
    window.addEventListener("meeting:summary", handler);

    render(<MeetingControls />);
    fireEvent.click(screen.getByRole("button", { name: BTN_SUM }));

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
      const { detail } = handler.mock.calls[0][0];
      expect(detail.summary).toBe("This was a productive meeting.");
    });

    window.removeEventListener("meeting:summary", handler);
  });

  it("calls onSummarize callback with result", async () => {
    const onSummarize = vi.fn();
    render(<MeetingControls onSummarize={onSummarize} />);
    fireEvent.click(screen.getByRole("button", { name: BTN_SUM }));

    await waitFor(() => {
      expect(onSummarize).toHaveBeenCalledWith(MOCK_RESULT);
    });
  });

  it("disables buttons while request is in-flight", async () => {
    // Never-resolving promise simulates in-flight
    mockSummarize.mockReturnValue(new Promise(() => {}));

    render(<MeetingControls />);
    fireEvent.click(screen.getByRole("button", { name: BTN_END }));

    // Aria-label stays the same; disabled attribute is what changes
    await waitFor(() => {
      expect(screen.getByRole("button", { name: BTN_END })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: BTN_SUM })).toBeDisabled();
  });

  it("dispatches meeting:summary:error on failure", async () => {
    mockSummarize.mockRejectedValue(new Error("network error"));
    window.alert = vi.fn();

    const handler = vi.fn();
    window.addEventListener("meeting:summary:error", handler);

    render(<MeetingControls />);
    fireEvent.click(screen.getByRole("button", { name: BTN_SUM }));

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].detail.message).toContain("network error");
    });

    window.removeEventListener("meeting:summary:error", handler);
  });

  it("does NOT clear transcript on failure", async () => {
    mockSummarize.mockRejectedValue(new Error("fail"));
    window.alert = vi.fn();

    render(<MeetingControls />);
    fireEvent.click(screen.getByRole("button", { name: BTN_SUM }));

    await waitFor(() => {
      expect(mockSummarize).toHaveBeenCalled();
    });

    expect(mockTranscriptClear).not.toHaveBeenCalled();
  });
});
