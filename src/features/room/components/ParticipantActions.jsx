const ParticipantActions = ({
  onZoom,
  zoomLabel = "Zoom",
  showMute = false,
  isMuted = false,
  onToggleMute,
}) => {
  return (
    <div className="participant-actions">
      <button onClick={onZoom} className="btn btn-secondary feed-zoom-btn">
        {zoomLabel}
      </button>

      {showMute && (
        <button onClick={onToggleMute} className="btn btn-default feed-audio-btn">
          {isMuted ? "Unmute" : "Mute"}
        </button>
      )}
    </div>
  );
};

export default ParticipantActions;
