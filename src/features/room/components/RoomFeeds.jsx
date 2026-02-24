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
  registerVideoElement = () => {},
  togglePictureInPicture = async () => ({ ok: false, reason: "unavailable" }),
  isPictureInPictureSupported = () => false,
  isPictureInPictureActive = () => false,
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

  const tileHasVideo = (tile) => {
    const tileStream = tile?.stream;
    if (!tileStream || typeof tileStream.getVideoTracks !== "function") return false;
    const videoTracks = tileStream.getVideoTracks();
    if (!Array.isArray(videoTracks) || videoTracks.length === 0) return false;
    return videoTracks.some((track) => track?.enabled);
  };

  if (isVideoSpotlightActive) {
    const activePeerId = getPeerIdFromTile(activeVideoTile?.id);
    const showActiveMute = !!activePeerId;
    const activeMuted = getTileMutedState(activeVideoTile);
    const activePiPId = String(activeVideoTile?.id || "").trim();
    const showActivePiP = !!activePiPId && tileHasVideo(activeVideoTile);

    return (
      <div className="spotlight-layout">
        <div className="spotlight-main panel">
          <div className="spotlight-main-header">
            <h4 className="feed-title">{activeVideoTile.label}</h4>
            <ParticipantActions
              onZoom={() => setZoomTarget("")}
              zoomLabel="Unzoom"
              showPip={showActivePiP}
              pipActive={isPictureInPictureActive(activePiPId)}
              pipSupported={isPictureInPictureSupported(activePiPId)}
              onTogglePip={() => void togglePictureInPicture(activePiPId)}
              showMute={showActiveMute}
              isMuted={activeMuted}
              onToggleMute={() => togglePeerMuted(activePeerId)}
            />
          </div>
          <UserFeedPlayer
            stream={activeVideoTile.stream}
            muted={activeMuted}
            isLocal={activeVideoTile.isLocal}
            videoElementId={activePiPId}
            registerVideoElement={registerVideoElement}
          />
        </div>

        <div className="spotlight-strip">
          {videoTiles
            .filter((tile) => tile.id !== activeVideoTile.id)
            .map((tile) => {
              const peerId = getPeerIdFromTile(tile.id);
              const showMute = !!peerId;
              const isMuted = getTileMutedState(tile);
              const tilePiPId = String(tile.id || "").trim();
              const showPip = !!tilePiPId && tileHasVideo(tile);

              return (
                <div key={tile.id} className="spotlight-tile">
                  <div className="participant-card-header">
                    <div className="participant-name">{tile.label}</div>
                    <ParticipantActions
                      onZoom={() => setZoomTarget(tile.id)}
                      zoomLabel="Focus"
                      showPip={showPip}
                      pipActive={isPictureInPictureActive(tilePiPId)}
                      pipSupported={isPictureInPictureSupported(tilePiPId)}
                      onTogglePip={() => void togglePictureInPicture(tilePiPId)}
                      showMute={showMute}
                      isMuted={isMuted}
                      onToggleMute={() => togglePeerMuted(peerId)}
                    />
                  </div>
                  <UserFeedPlayer
                    stream={tile.stream}
                    muted={isMuted}
                    isLocal={tile.isLocal}
                    videoElementId={tilePiPId}
                    registerVideoElement={registerVideoElement}
                  />
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
            showPip={!!stream && !!hasVideoTrack}
            pipActive={isPictureInPictureActive("local")}
            pipSupported={isPictureInPictureSupported("local")}
            onTogglePip={() => void togglePictureInPicture("local")}
          />
        </div>
        <UserFeedPlayer
          stream={stream}
          muted={true}
          isLocal
          videoElementId="local"
          registerVideoElement={registerVideoElement}
        />
      </div>

      <div className="feed-section">
        <h4 className="feed-title">Participants</h4>
        <div className="participants-grid">
          {peerIds.length === 0 && participantsWithoutMedia.length === 0 && (
            <div className="muted-text">No other participants</div>
          )}

          {peerIds.map((peerId) => {
            const peerPiPId = `peer:${peerId}`;
            const peerStream = peers[peerId]?.stream || null;
            const peerHasVideo =
              !!peerStream &&
              typeof peerStream.getVideoTracks === "function" &&
              peerStream.getVideoTracks().some((track) => track?.enabled);

            return (
              <div key={peerId} className="participant-card">
                <div className="participant-card-header">
                  <div className="participant-name">{peerId}</div>
                  <ParticipantActions
                    onZoom={() => toggleZoom(peerPiPId)}
                    zoomLabel="Zoom"
                    showPip={peerHasVideo}
                    pipActive={isPictureInPictureActive(peerPiPId)}
                    pipSupported={isPictureInPictureSupported(peerPiPId)}
                    onTogglePip={() => void togglePictureInPicture(peerPiPId)}
                    showMute={true}
                    isMuted={isPeerMuted(peerId)}
                    onToggleMute={() => togglePeerMuted(peerId)}
                  />
                </div>
                <UserFeedPlayer
                  stream={peerStream}
                  muted={isPeerMuted(peerId)}
                  videoElementId={peerPiPId}
                  registerVideoElement={registerVideoElement}
                />
              </div>
            );
          })}

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
