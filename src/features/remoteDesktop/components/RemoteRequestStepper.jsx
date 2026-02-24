const REMOTE_STEP_SEQUENCE = [
  { key: "requested", label: "Requested" },
  { key: "approved", label: "Approved" },
  { key: "connected", label: "Connected" },
];

const buildStepState = ({
  remoteDesktopSession,
  remoteDesktopPendingRequest,
  incomingRemoteDesktopRequest,
  remoteDesktopError,
}) => {
  const isConnected = !!remoteDesktopSession;
  const hasOutgoingRequest = !!remoteDesktopPendingRequest;
  const needsYourApproval = !!incomingRemoteDesktopRequest;
  const hasError = !!String(remoteDesktopError || "").trim() && !isConnected;

  const statuses = {
    requested: "pending",
    approved: "pending",
    connected: "pending",
  };
  let description = "Select host and request control.";

  if (needsYourApproval) {
    statuses.requested = "active";
    description = "Approval requested from you.";
  }

  if (hasOutgoingRequest) {
    statuses.requested = "completed";
    statuses.approved = hasError ? "error" : "active";
    description = hasError
      ? "Request failed. Try again."
      : "Request sent. Waiting for approval.";
  }

  if (isConnected) {
    statuses.requested = "completed";
    statuses.approved = "completed";
    statuses.connected = "completed";
    description = "Remote control session is active.";
  }

  if (hasError && !hasOutgoingRequest && !needsYourApproval) {
    statuses.approved = "error";
    statuses.connected = "error";
    description = "Remote connection failed. Retry request.";
  }

  return { statuses, description };
};

const RemoteRequestStepper = ({
  remoteDesktopSession,
  remoteDesktopPendingRequest,
  incomingRemoteDesktopRequest,
  remoteDesktopError,
}) => {
  const { statuses, description } = buildStepState({
    remoteDesktopSession,
    remoteDesktopPendingRequest,
    incomingRemoteDesktopRequest,
    remoteDesktopError,
  });

  return (
    <div className="remote-stepper" aria-live="polite">
      <div className="remote-stepper-track">
        {REMOTE_STEP_SEQUENCE.map((step, index) => (
          <div
            key={step.key}
            className={`remote-step remote-step--${statuses[step.key] || "pending"}`}
          >
            <div className="remote-step-indicator">{index + 1}</div>
            <div className="remote-step-label">{step.label}</div>
          </div>
        ))}
      </div>
      <div className="remote-stepper-caption">{description}</div>
    </div>
  );
};

export default RemoteRequestStepper;
