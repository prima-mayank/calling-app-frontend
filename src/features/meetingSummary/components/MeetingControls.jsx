import { useCallback, useState } from "react";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import transcriptStore from "../state/transcriptStore";
import { summarize } from "../services/summarizeService";
import { SUMMARY_STORAGE_KEY } from "../constants";
import SummaryModal from "./SummaryModal";

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

const CONTAINER_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  flexWrap: "wrap",
};

const MeetingControls = ({ onSummarize, summarizeUrl = "/api/summarize" }) => {
  const { isListening, startListening, stopListening } = useSpeechRecognition();
  const [isBusy, setIsBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [summaryResult, setSummaryResult] = useState(null);

  const runSummarize = useCallback(
    async (opts = {}) => {
      const transcript = transcriptStore.get();
      if (!transcript) {
        try {
          window.alert("No transcript available yet. Try speaking first.");
        } catch {
          // noop
        }
        return;
      }

      if (opts.dispatchEnd) {
        dispatchEvent("meeting:end", { transcript });
      }

      setIsBusy(true);
      try {
        const result = await summarize(transcript, summarizeUrl);

        safeLocalStorageSet(SUMMARY_STORAGE_KEY, result);
        dispatchEvent("meeting:summary", {
          summary: result.summary,
          bullets: result.bullets,
          truncated: result.truncated,
        });

        if (typeof onSummarize === "function") {
          try {
            onSummarize(result);
          } catch {
            // noop
          }
        }

        setSummaryResult(result);
        setModalOpen(true);
        transcriptStore.clear();
      } catch (error) {
        const message = error?.message || "Summarization failed.";
        console.error("[MeetingControls] summarize error:", message);
        dispatchEvent("meeting:summary:error", { message });
        try {
          window.alert(`Could not generate summary: ${message}`);
        } catch {
          // noop
        }
      } finally {
        setIsBusy(false);
      }
    },
    [onSummarize, summarizeUrl]
  );

  const handleStart = useCallback(() => {
    startListening();
  }, [startListening]);

  const handleEnd = useCallback(async () => {
    stopListening();
    await runSummarize({ dispatchEnd: true });
  }, [stopListening, runSummarize]);

  const handleSummarize = useCallback(async () => {
    await runSummarize({ dispatchEnd: false });
  }, [runSummarize]);

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
  }, []);

  return (
    <>
      <div style={CONTAINER_STYLE} className="meeting-controls">
        <button
          type="button"
          className="btn btn-default"
          onClick={handleStart}
          disabled={isListening || isBusy}
          aria-label="Start speech transcription"
          aria-pressed={isListening}
        >
          {isListening ? "Listening..." : "Start Listening"}
        </button>

        <button
          type="button"
          className="btn btn-danger"
          onClick={handleEnd}
          disabled={isBusy}
          aria-label="End meeting and summarize transcript"
        >
          {isBusy ? "Summarizing..." : "End + Summarize"}
        </button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSummarize}
          disabled={isBusy}
          aria-label="Generate meeting summary"
        >
          Summarize
        </button>
      </div>

      {summaryResult && (
        <SummaryModal
          open={modalOpen}
          onClose={handleModalClose}
          summary={summaryResult.summary}
          bullets={summaryResult.bullets}
          truncated={summaryResult.truncated}
        />
      )}
    </>
  );
};

export default MeetingControls;
