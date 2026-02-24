const ParticipantActions = ({
  onZoom,
  zoomLabel = "Zoom",
  showPip = false,
  pipActive = false,
  pipSupported = true,
  onTogglePip,
  showMute = false,
  isMuted = false,
  onToggleMute,
}) => {
  return (
    <div className="participant-actions">
      <button onClick={onZoom} className="btn btn-secondary feed-zoom-btn">
        {zoomLabel}
      </button>

      {showPip && (
        <button
          onClick={onTogglePip}
          disabled={!pipSupported}
          className="btn btn-default feed-pip-btn"
        >
          {!pipSupported ? "PiP N/A" : pipActive ? "Exit PiP" : "PiP"}
        </button>
      )}

      {showMute && (
        <button onClick={onToggleMute} className="btn btn-default feed-audio-btn">
          {isMuted ? "Unmute" : "Mute"}
        </button>
      )}
    </div>
  );
};

export default ParticipantActions;
