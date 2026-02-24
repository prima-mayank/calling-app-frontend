const HomeDirectCallPanel = ({
  incomingCall,
  outgoingCall,
  directCallNotice,
  onAcceptIncoming,
  onRejectIncoming,
  onCancelOutgoing,
}) => {
  return (
    <div className="home-direct-call-stack">
      {directCallNotice ? <div className="home-call-notice panel">{directCallNotice}</div> : null}

      {outgoingCall?.requestId ? (
        <div className="home-call-panel panel">
          <div className="home-call-panel-title">Calling...</div>
          <div className="home-call-panel-subtitle">
            Waiting for response ({outgoingCall.mode || "call"}).
          </div>
          <div className="home-call-panel-actions">
            <button className="btn btn-danger" onClick={onCancelOutgoing}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {incomingCall?.requestId ? (
        <div className="home-call-panel panel">
          <div className="home-call-panel-title">Incoming {incomingCall.mode || ""} call</div>
          <div className="home-call-panel-subtitle">
            {incomingCall?.caller?.displayName || incomingCall?.caller?.email || "A user"} is
            calling you.
          </div>
          <div className="home-call-panel-actions">
            <button className="btn btn-call-video" onClick={onAcceptIncoming}>
              Accept
            </button>
            <button className="btn btn-danger" onClick={onRejectIncoming}>
              Reject
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default HomeDirectCallPanel;
