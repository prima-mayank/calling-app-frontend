import UserFeedPlayer from "../../../components/UserFeedPlayer";
import ParticipantActions from "./ParticipantActions";

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
  isPeerMuted,
  togglePeerMuted,
}) => {
  const getPeerIdFromTile = (tileId = "") => {
    const normalizedTileId = String(tileId || "");
    return normalizedTileId.startsWith("peer:") ? normalizedTileId.slice(5) : "";
  };

  const getTileMutedState = (tile) => {
    if (!tile) return false;
    if (tile.isLocal) return !!tile.muted;
    const peerId = getPeerIdFromTile(tile.id);
    return !!tile.muted || !!isPeerMuted(peerId);
  };

  if (isVideoSpotlightActive) {
    const activePeerId = getPeerIdFromTile(activeVideoTile?.id);
    const showActiveMute = !!activePeerId;
    const activeMuted = getTileMutedState(activeVideoTile);

    return (
      <div className="spotlight-layout">
        <div className="spotlight-main panel">
          <div className="spotlight-main-header">
            <h4 className="feed-title">{activeVideoTile.label}</h4>
            <ParticipantActions
              onZoom={() => setZoomTarget("")}
              zoomLabel="Unzoom"
              showMute={showActiveMute}
              isMuted={activeMuted}
              onToggleMute={() => togglePeerMuted(activePeerId)}
            />
          </div>
          <UserFeedPlayer
            stream={activeVideoTile.stream}
            muted={activeMuted}
            isLocal={activeVideoTile.isLocal}
          />
        </div>

        <div className="spotlight-strip">
          {videoTiles
            .filter((tile) => tile.id !== activeVideoTile.id)
            .map((tile) => {
              const peerId = getPeerIdFromTile(tile.id);
              const showMute = !!peerId;
              const isMuted = getTileMutedState(tile);

              return (
                <div key={tile.id} className="spotlight-tile">
                  <div className="participant-card-header">
                    <div className="participant-name">{tile.label}</div>
                    <ParticipantActions
                      onZoom={() => setZoomTarget(tile.id)}
                      zoomLabel="Focus"
                      showMute={showMute}
                      isMuted={isMuted}
                      onToggleMute={() => togglePeerMuted(peerId)}
                    />
                  </div>
                  <UserFeedPlayer stream={tile.stream} muted={isMuted} isLocal={tile.isLocal} />
                </div>
              );
            })}
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
          <ParticipantActions
            onZoom={() => toggleZoom("local")}
            zoomLabel="Zoom"
          />
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
                <ParticipantActions
                  onZoom={() => toggleZoom(`peer:${peerId}`)}
                  zoomLabel="Zoom"
                  showMute={true}
                  isMuted={isPeerMuted(peerId)}
                  onToggleMute={() => togglePeerMuted(peerId)}
                />
              </div>
              <UserFeedPlayer stream={peers[peerId].stream} muted={isPeerMuted(peerId)} />
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
