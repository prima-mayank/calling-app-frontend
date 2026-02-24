const RoomHeaderBar = ({
  roomId,
  modeLabel,
  participantCount,
  socketConnected,
  browserOnline,
  connectionQualityStatus,
}) => {
  const qualityLabel = connectionQualityStatus?.label || "Checking";
  const qualityTone = connectionQualityStatus?.tone || "checking";
  const qualityDetail = connectionQualityStatus?.detail || "";

  return (
    <div className="room-header panel">
      <div className="room-header-main">
        <h3 className="room-title">Room: {roomId}</h3>
        <p className="room-meta">
          <span className="room-badge">{modeLabel}</span>
          <span className="room-meta-sep">•</span>
          <span>
            {participantCount} participant{participantCount === 1 ? "" : "s"}
          </span>
        </p>
        <div className={`connection-pill ${socketConnected && browserOnline ? "connection-pill--online" : ""}`}>
          {!browserOnline
            ? "Internet offline"
            : socketConnected
            ? "Realtime connected"
            : "Reconnecting to server..."}
        </div>
        <div className={`quality-pill quality-pill--${qualityTone}`}>
          Network Quality: {qualityLabel}
        </div>
        {qualityDetail && <div className="room-quality-detail">{qualityDetail}</div>}
      </div>
    </div>
  );
};

export default RoomHeaderBar;
