const RoomToolbar = ({
  stream,
  hasVideoTrack,
  audioEnabled,
  videoEnabled,
  isScreenSharing,
  toggleMic,
  toggleCamera,
  startScreenShare,
  stopScreenShare,
  onEndCall,
  shouldShowRemotePanel,
  setShowRemotePanel,
  onShareLink,
}) => {
  return (
    <div className="room-toolbar">
      <div className="room-toolbar-group">
        <button onClick={toggleMic} disabled={!stream} className="btn btn-default">
          {audioEnabled ? "Mute Mic" : "Unmute Mic"}
        </button>

        {hasVideoTrack && (
          <button onClick={toggleCamera} className="btn btn-default">
            {videoEnabled ? "Turn Camera Off" : "Turn Camera On"}
          </button>
        )}

        {hasVideoTrack && !isScreenSharing && (
          <button onClick={startScreenShare} className="btn btn-primary">
            Share Screen
          </button>
        )}

        {isScreenSharing && (
          <button onClick={stopScreenShare} className="btn btn-danger">
            Stop Sharing
          </button>
        )}

        <button onClick={onEndCall} className="btn btn-danger">
          End Call
        </button>
      </div>

      <div className="room-toolbar-group room-toolbar-group--secondary">
        <button onClick={() => setShowRemotePanel((prev) => !prev)} className="btn btn-default">
          {shouldShowRemotePanel ? "Hide Remote Panel" : "Remote Control"}
        </button>

        <button onClick={onShareLink} className="btn btn-primary">
          Share Link
        </button>
      </div>
    </div>
  );
};

export default RoomToolbar;
