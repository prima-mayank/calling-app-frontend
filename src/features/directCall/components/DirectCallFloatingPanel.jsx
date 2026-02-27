import { useContext } from "react";
import { useLocation } from "react-router-dom";
import { SocketContext } from "../../../Context/socketContextValue";
import HomeDirectCallPanel from "../../home/components/HomeDirectCallPanel";

const DirectCallFloatingPanel = () => {
  const location = useLocation();
  const {
    incomingCall,
    outgoingCall,
    directCallNotice,
    acceptIncomingCall,
    rejectIncomingCall,
    cancelOutgoingCall,
  } = useContext(SocketContext);

  const hasDirectCallUi =
    !!incomingCall?.requestId || !!outgoingCall?.requestId || !!directCallNotice;
  const isHomeRoute = location.pathname === "/";
  if (!hasDirectCallUi || isHomeRoute) return null;

  return (
    <div className="direct-call-floating-panel">
      <HomeDirectCallPanel
        incomingCall={incomingCall}
        outgoingCall={outgoingCall}
        directCallNotice={directCallNotice}
        onAcceptIncoming={acceptIncomingCall}
        onRejectIncoming={rejectIncomingCall}
        onCancelOutgoing={cancelOutgoingCall}
      />
    </div>
  );
};

export default DirectCallFloatingPanel;
