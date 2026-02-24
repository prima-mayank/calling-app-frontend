import UserFeedPlayer from "../../../components/UserFeedPlayer";

const RoomFeeds = ({
  isVideoSpotlightActive,
  activeVideoTile,
  videoTiles,
  setZoomTarget,
  stream,
  hasVideoTrack,
  peerIds,
  peers,
  participantsWithoutMedia,
  toggleZoom,
}) => {
  if (isVideoSpotlightActive) {
    return (
      <div className="spotlight-layout">
        <div className="spotlight-main panel">
          <div className="spotlight-main-header">
            <h4 className="feed-title">{activeVideoTile.label}</h4>
            <button onClick={() => setZoomTarget("")} className="btn btn-secondary feed-zoom-btn">
              Unzoom
            </button>
          </div>
          <UserFeedPlayer
            stream={activeVideoTile.stream}
            muted={activeVideoTile.muted}
            isLocal={activeVideoTile.isLocal}
          />
        </div>

        <div className="spotlight-strip">
          {videoTiles
            .filter((tile) => tile.id !== activeVideoTile.id)
            .map((tile) => (
              <div key={tile.id} className="spotlight-tile">
                <div className="participant-card-header">
                  <div className="participant-name">{tile.label}</div>
                  <button onClick={() => setZoomTarget(tile.id)} className="btn btn-secondary feed-zoom-btn">
                    Focus
                  </button>
                </div>
                <UserFeedPlayer stream={tile.stream} muted={tile.muted} isLocal={tile.isLocal} />
              </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="feeds-layout">
      <div className="feed-section">
        <div className="feed-title-row">
          <h4 className="feed-title">
            You {!stream && "(No Media)"} {stream && !hasVideoTrack && "(Audio Only)"}
          </h4>
          <button onClick={() => toggleZoom("local")} className="btn btn-secondary feed-zoom-btn">
            Zoom
          </button>
        </div>
        <UserFeedPlayer stream={stream} muted={true} isLocal />
      </div>

      <div className="feed-section">
        <h4 className="feed-title">Participants</h4>
        <div className="participants-grid">
          {peerIds.length === 0 && participantsWithoutMedia.length === 0 && (
            <div className="muted-text">No other participants</div>
          )}

          {peerIds.map((peerId) => (
            <div key={peerId} className="participant-card">
              <div className="participant-card-header">
                <div className="participant-name">{peerId}</div>
                <button onClick={() => toggleZoom(`peer:${peerId}`)} className="btn btn-secondary feed-zoom-btn">
                  Zoom
                </button>
              </div>
              <UserFeedPlayer stream={peers[peerId].stream} muted={false} />
            </div>
          ))}

          {participantsWithoutMedia.map((participantId) => (
            <div key={`nomedia:${participantId}`} className="participant-card">
              <div className="participant-card-header">
                <div className="participant-name">{participantId}</div>
              </div>
              <div className="muted-text">Joined without media</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RoomFeeds;
