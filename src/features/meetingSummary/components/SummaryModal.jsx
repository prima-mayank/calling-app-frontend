import { useEffect } from "react";

const OVERLAY_STYLE = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};

const MODAL_STYLE = {
  background: "#1e1e2e",
  color: "#cdd6f4",
  borderRadius: "10px",
  padding: "28px 32px",
  maxWidth: "620px",
  width: "90%",
  maxHeight: "80vh",
  overflowY: "auto",
  boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
  position: "relative",
};

const CLOSE_BTN_STYLE = {
  position: "absolute",
  top: "14px",
  right: "18px",
  background: "none",
  border: "none",
  color: "#cdd6f4",
  fontSize: "20px",
  cursor: "pointer",
  lineHeight: 1,
};

const TITLE_STYLE = {
  margin: "0 0 16px 0",
  fontSize: "18px",
  fontWeight: 700,
  color: "#89b4fa",
};

const SUMMARY_STYLE = {
  margin: "0 0 16px 0",
  lineHeight: 1.6,
  fontSize: "14px",
};

const BULLETS_STYLE = {
  paddingLeft: "20px",
  margin: "0 0 16px 0",
};

const BULLET_STYLE = {
  marginBottom: "6px",
  fontSize: "14px",
  lineHeight: 1.5,
};

const TRUNCATED_STYLE = {
  fontSize: "12px",
  color: "#f38ba8",
  marginBottom: "12px",
};

const dispatchSummaryClosed = () => {
  try {
    window.dispatchEvent(new CustomEvent("meeting:summary:closed"));
  } catch {
    // noop
  }
};

const SummaryModal = ({ open, onClose, summary, bullets, truncated }) => {
  useEffect(() => {
    if (!open) return;

    const handleKey = (e) => {
      if (e.key === "Escape") {
        dispatchSummaryClosed();
        if (typeof onClose === "function") onClose();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleClose = () => {
    dispatchSummaryClosed();
    if (typeof onClose === "function") onClose();
  };

  const safeSummary = typeof summary === "string" ? summary : "";
  const safeBullets = Array.isArray(bullets)
    ? bullets.filter((b) => typeof b === "string")
    : [];

  return (
    <div style={OVERLAY_STYLE} role="dialog" aria-modal="true" aria-label="Meeting Summary">
      <div style={MODAL_STYLE}>
        <button
          style={CLOSE_BTN_STYLE}
          onClick={handleClose}
          aria-label="Close meeting summary"
          type="button"
        >
          &times;
        </button>

        <h2 style={TITLE_STYLE}>Meeting Summary</h2>

        {truncated && (
          <p style={TRUNCATED_STYLE}>
            Note: transcript was trimmed before summarization.
          </p>
        )}

        {safeSummary ? (
          <p style={SUMMARY_STYLE}>{safeSummary}</p>
        ) : (
          <p style={SUMMARY_STYLE}>No summary available.</p>
        )}

        {safeBullets.length > 0 && (
          <>
            <strong style={{ fontSize: "13px", color: "#a6e3a1" }}>Key points:</strong>
            <ul style={BULLETS_STYLE}>
              {safeBullets.map((bullet, index) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={index} style={BULLET_STYLE}>
                  {bullet}
                </li>
              ))}
            </ul>
          </>
        )}

        <button
          type="button"
          onClick={handleClose}
          style={{
            marginTop: "8px",
            padding: "8px 20px",
            background: "#89b4fa",
            color: "#1e1e2e",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "14px",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default SummaryModal;
