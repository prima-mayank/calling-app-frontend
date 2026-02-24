import { preventDefaultIfCancelable } from "../utils/remoteInputHelpers";
import RemoteRequestStepper from "./RemoteRequestStepper";

const RemoteDesktopPanel = ({
  isVideoSpotlightActive,
  remoteDesktopSession,
  remoteHosts,
  effectiveSelectedRemoteHostId,
  selectedRemoteHostOwnership,
  selectedRemoteHost,
  canClaimSelectedHost,
  canRequestSelectedHost,
  remoteDesktopPendingRequest,
  hostSelectOptions,
  setSelectedRemoteHostId,
  claimRemoteHost,
  connectRemoteDesktop,
  stopRemoteDesktopSession,
  otherParticipants,
  effectiveSetupPeerId,
  setSelectedSetupPeerId,
  setupParticipantOptions,
  requestRemoteHostSetup,
  remoteHostSetupPending,
  remoteDesktopError,
  remoteHostSetupStatus,
  hostAppInstallPrompt,
  dismissHostAppInstallPrompt,
  incomingRemoteDesktopRequest,
  respondToRemoteDesktopRequest,
  incomingRemoteHostSetupRequest,
  respondToRemoteHostSetupRequest,
  remoteSurfaceRef,
  hasRemoteDesktopFrame,
  remoteFrameRef,
  isControlActive,
  setRemoteInputActive,
  handleRemoteClick,
  handleRemoteMove,
  handleRemoteMouseDown,
  handleRemoteMouseUp,
  handleRemoteWheel,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  handleTouchCancel,
}) => {
  return (
    <div className={`remote-card ${isVideoSpotlightActive ? "remote-card--dimmed" : ""}`}>
      <div className="remote-card-header">
        <div className="remote-card-top">
          <h4 className="remote-card-title">Full Remote Desktop (Host Agent)</h4>
        </div>
        <p className="remote-card-subtitle">
          Request remote control from an available host agent.
        </p>
      </div>

      <div className="remote-card-body">
        <RemoteRequestStepper
          remoteDesktopSession={remoteDesktopSession}
          remoteDesktopPendingRequest={remoteDesktopPendingRequest}
          incomingRemoteDesktopRequest={incomingRemoteDesktopRequest}
          remoteDesktopError={remoteDesktopError}
        />

        {!remoteDesktopSession && (
          <>
            {remoteHosts.length > 0 ? (
              <div className="remote-connect-row">
                <select
                  value={effectiveSelectedRemoteHostId}
                  onChange={(event) => setSelectedRemoteHostId(event.target.value)}
                  className="remote-host-select"
                >
                  <option value="">Select Host</option>
                  {hostSelectOptions.map((hostOption) => (
                    <option key={hostOption.value} value={hostOption.value}>
                      {hostOption.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => claimRemoteHost(effectiveSelectedRemoteHostId)}
                  disabled={!canClaimSelectedHost}
                  className="btn btn-secondary remote-claim-btn"
                >
                  {selectedRemoteHostOwnership === "other"
                    ? "Claimed by Other"
                    : selectedRemoteHostOwnership === "you"
                    ? "Host Claimed"
                    : "Claim As My Host"}
                </button>
                <button
                  onClick={connectRemoteDesktop}
                  disabled={!canRequestSelectedHost}
                  className="btn btn-primary remote-connect-btn"
                >
                  {remoteDesktopPendingRequest
                    ? "Waiting for Approval..."
                    : !effectiveSelectedRemoteHostId
                    ? "Select Host"
                    : selectedRemoteHost?.busy
                    ? "Host Busy"
                    : selectedRemoteHostOwnership === "unclaimed"
                    ? "Host Must Be Claimed"
                    : selectedRemoteHostOwnership === "you"
                    ? "Other User Must Request"
                    : "Request Remote Control"}
                </button>
                {remoteDesktopPendingRequest && (
                  <button onClick={stopRemoteDesktopSession} className="btn btn-danger remote-connect-btn">
                    Cancel Request
                  </button>
                )}
                <div className="muted-text">
                  Host tags: <strong>You</strong> means claimed by you, <strong>Other</strong>{" "}
                  means claimed by the other participant, <strong>Unclaimed</strong> means
                  someone still needs to claim the host before requesting control.
                </div>
              </div>
            ) : (
              <div className="remote-setup-row">
                <select
                  value={effectiveSetupPeerId}
                  onChange={(event) => setSelectedSetupPeerId(event.target.value)}
                  className="remote-host-select"
                  disabled={otherParticipants.length <= 1}
                >
                  <option value="">
                    {otherParticipants.length === 0
                      ? "No participant available"
                      : "Select Other"}
                  </option>
                  {setupParticipantOptions.map((participantOption) => (
                    <option key={participantOption.value} value={participantOption.value}>
                      {participantOption.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => requestRemoteHostSetup(effectiveSetupPeerId)}
                  disabled={!effectiveSetupPeerId || !!remoteHostSetupPending}
                  className="btn btn-primary remote-connect-btn"
                >
                  {remoteHostSetupPending
                    ? "Waiting Setup Approval..."
                    : "Request Host Setup"}
                </button>
              </div>
            )}
          </>
        )}

        {remoteDesktopSession && (
          <div className="remote-status-row">
            <div className="remote-host-label">Connected to host: {remoteDesktopSession.hostId}</div>
            <button onClick={stopRemoteDesktopSession} className="btn btn-danger">
              Disconnect Desktop
            </button>
          </div>
        )}

        {remoteDesktopError && <div className="error-text">{remoteDesktopError}</div>}
        {remoteHostSetupStatus && <div className="muted-text">{remoteHostSetupStatus}</div>}
        {hostAppInstallPrompt && (
          <div className="host-app-prompt">
            <div className="host-app-prompt-title">Host App Required</div>
            <div className="host-app-prompt-text">
              {hostAppInstallPrompt.message}
            </div>
            <div className="host-app-prompt-text">
              Ask the other user to install and run the host app, then continue.
            </div>
            <div className="host-app-prompt-actions">
              {!!hostAppInstallPrompt.downloadUrl && (
                <button
                  onClick={() =>
                    window.open(hostAppInstallPrompt.downloadUrl, "_blank", "noopener,noreferrer")
                  }
                  className="btn btn-primary"
                >
                  Download Host App
                </button>
              )}
              <button
                onClick={dismissHostAppInstallPrompt}
                className="btn btn-default"
              >
                Close
              </button>
            </div>
          </div>
        )}
        {incomingRemoteDesktopRequest && (
          <div className="remote-status-row">
            <div className="remote-host-label">
              {incomingRemoteDesktopRequest.requesterId} requested remote control for host{" "}
              {incomingRemoteDesktopRequest.hostId || "unknown"}.
            </div>
            <button
              onClick={() => respondToRemoteDesktopRequest(true)}
              className="btn btn-primary"
            >
              Accept
            </button>
            <button
              onClick={() => respondToRemoteDesktopRequest(false)}
              className="btn btn-danger"
            >
              Reject
            </button>
          </div>
        )}
        {incomingRemoteHostSetupRequest && (
          <div className="remote-status-row">
            <div className="remote-host-label">
              {incomingRemoteHostSetupRequest.requesterId} asked to start host app on your
              device.
            </div>
            <button
              onClick={() => respondToRemoteHostSetupRequest(true)}
              className="btn btn-primary"
            >
              Accept & Setup
            </button>
            <button
              onClick={() => respondToRemoteHostSetupRequest(false)}
              className="btn btn-danger"
            >
              Reject
            </button>
          </div>
        )}
        {remoteDesktopPendingRequest && !remoteDesktopSession && (
          <div className="muted-text">
            Request sent to host {remoteDesktopPendingRequest.hostId}. Waiting for other participant approval.
          </div>
        )}
        {remoteHostSetupPending && !remoteDesktopSession && (
          <div className="muted-text">
            Host setup request sent to {remoteHostSetupPending.targetPeerId}. Waiting for
            acceptance.
          </div>
        )}

        <div
          ref={remoteSurfaceRef}
          tabIndex={0}
          onClick={(event) => {
            if (!remoteDesktopSession) return;
            setRemoteInputActive(true);
            handleRemoteClick(event);
          }}
          onMouseMove={handleRemoteMove}
          onMouseDown={handleRemoteMouseDown}
          onMouseUp={handleRemoteMouseUp}
          onWheel={handleRemoteWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          onContextMenu={preventDefaultIfCancelable}
          className={`remote-surface ${isControlActive ? "remote-surface--active" : ""}`}
        >
          {hasRemoteDesktopFrame ? (
            <img
              ref={remoteFrameRef}
              alt="Remote desktop"
              className={`remote-surface-frame ${
                isControlActive ? "remote-surface-frame--active" : ""
              }`}
              draggable={false}
            />
          ) : (
            <div className="remote-surface-empty">
              <div className="remote-surface-empty-title">
                {remoteDesktopSession ? "Waiting for host frames..." : "No active desktop session"}
              </div>
              <div className="remote-surface-empty-subtitle">
                Click the panel after connect to start keyboard and mouse control.
              </div>
            </div>
          )}

          {remoteDesktopSession && (
            <div className="remote-surface-badge">
              {isControlActive ? "Control Active (Esc to release)" : "Click to Control"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RemoteDesktopPanel;
