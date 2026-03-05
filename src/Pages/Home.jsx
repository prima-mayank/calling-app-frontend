import { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SocketContext } from "../Context/socketContextValue";
import { WS_SERVER } from "../config/runtimeConfig";
import { isInsecureContextOnLanIp } from "../features/room/utils/roomAccessHelpers";
import {
  clearHomeJoinPreference,
  clearQuickRejoinRoom,
  readQuickRejoinRoom,
  saveHomeJoinPreference,
} from "../features/room/utils/roomSessionStorage";
import { refreshSocketAuthSession } from "../services/socketClient";
import { useAuthSessionState } from "../features/auth/hooks/useAuthSessionState";
import { isLocalTestAuthToken } from "../features/auth/utils/authStorage";
import { useUserDirectory } from "../features/home/hooks/useUserDirectory";
import HomeGuestSection from "../features/home/components/HomeGuestSection";
import HomeMeetSection from "../features/home/components/HomeMeetSection";
import HomeUserDirectorySection from "../features/home/components/HomeUserDirectorySection";
import HomeDirectCallPanel from "../features/home/components/HomeDirectCallPanel";

const Home = () => {
  const navigate = useNavigate();
  const {
    socket,
    provideStream,
    socketConnected,
    socketConnectError,
    incomingCall,
    outgoingCall,
    directCallNotice,
    notificationPermissionState,
    canShowCallNotifications,
    requestCallNotificationPermission,
    startDirectCall,
    cancelOutgoingCall,
    acceptIncomingCall,
    rejectIncomingCall,
    resetDirectCallState,
  } = useContext(SocketContext);
  const [quickRejoin, setQuickRejoin] = useState(() => readQuickRejoinRoom());
  const { session, isCheckingSession, logout } = useAuthSessionState();
  const authToken = String(session?.token || "").trim();
  const isLocalTestSession = isLocalTestAuthToken(authToken);
  const isLoggedIn = !!authToken && !!session?.user;
  const isDirectoryEnabled = isLoggedIn && !isLocalTestSession;
  const [notificationPermissionNotice, setNotificationPermissionNotice] = useState("");

  const {
    users,
    isLoadingUsers,
    usersError,
    isAuthUnavailable,
    refreshUsers,
  } = useUserDirectory({
    socket,
    token: authToken,
    isEnabled: isDirectoryEnabled,
  });
  const isSocketReady = socketConnected || !!socket?.connected;
  const isDirectCallEnabled =
    isLoggedIn && isSocketReady && !isLocalTestSession && !isAuthUnavailable;
  const showDirectory = isLoggedIn && !isLocalTestSession && !isAuthUnavailable;
  const shouldShowNotificationControls = isLoggedIn && !isLocalTestSession;

  const currentUserLabel = useMemo(() => {
    if (!session?.user) return "";
    return session.user.displayName || session.user.email || "";
  }, [session?.user]);

  const ensureSocketConnection = async () => {
    if (isSocketReady) return true;

    try {
      socket.connect();
    } catch {
      // noop
    }

    const timeoutMs = 2600;
    const stepMs = 120;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (socket.connected) return true;
      await new Promise((resolve) => window.setTimeout(resolve, stepMs));
    }

    return socket.connected;
  };

  const showSocketDisconnectedAlert = () => {
    const reason = String(socketConnectError || "").trim() || "socket unavailable";
    alert(
      `Backend is not connected yet.\nReason: ${reason}\nSocket URL: ${WS_SERVER}\nCheck backend and env, then retry.`
    );
  };

  const startCall = async (isVideo) => {
    const socketReady = await ensureSocketConnection();
    if (!socketReady) {
      showSocketDisconnectedAlert();
      return;
    }

    const mode = isVideo ? "video" : "audio";
    saveHomeJoinPreference(mode);

    if (isInsecureContextOnLanIp()) {
      clearHomeJoinPreference();
      alert(
        "Camera/mic on local IP needs HTTPS. Use localhost on this machine or open the app via an HTTPS tunnel/domain."
      );
      return;
    }

    const stream = await provideStream(isVideo);
    if (!stream) {
      clearHomeJoinPreference();
      alert("Camera/mic unavailable or blocked. Allow permissions and retry.");
      return;
    }

    socket.emit("create-room");
  };

  const quickRejoinCall = () => {
    if (!quickRejoin?.roomId) return;

    if (!socketConnected && !socket.connected) {
      showSocketDisconnectedAlert();
      return;
    }

    saveHomeJoinPreference(quickRejoin.mode || "none");
    clearQuickRejoinRoom();
    setQuickRejoin(null);
    navigate(`/room/${quickRejoin.roomId}`);
  };

  const dismissQuickRejoin = () => {
    clearQuickRejoinRoom();
    setQuickRejoin(null);
  };

  const onLogout = () => {
    logout();
    resetDirectCallState();
    refreshSocketAuthSession();
  };

  const onEnableCallNotifications = async () => {
    const result = await requestCallNotificationPermission();
    if (result === "granted") {
      setNotificationPermissionNotice("Call notifications are enabled.");
      return;
    }
    if (result === "denied") {
      setNotificationPermissionNotice(
        "Notifications are blocked. Enable browser notifications for this site."
      );
      return;
    }
    if (result === "unsupported") {
      setNotificationPermissionNotice(
        "Notifications are not supported in this browser/context."
      );
      return;
    }
    setNotificationPermissionNotice("Permission is still pending.");
  };

  const callUserAudio = (user) => {
    startDirectCall({
      targetUserId: user?.id,
      mode: "audio",
      isEnabled: isDirectCallEnabled,
    });
  };

  const callUserVideo = (user) => {
    startDirectCall({
      targetUserId: user?.id,
      mode: "video",
      isEnabled: isDirectCallEnabled,
    });
  };

  return (
    <div className="home-page">
      <div className="home-shell panel">
        <h1 className="home-title">Calling Workspace</h1>
        <p className="home-subtitle">
          Direct calls for logged-in users, and instant meet links for everyone.
        </p>

        <div className="home-account-row">
          {isCheckingSession ? (
            <span className="home-account-label">Checking session...</span>
          ) : isLoggedIn ? (
            <>
              <span className="home-account-label">
                Signed in as <strong>{currentUserLabel}</strong>
              </span>
              <button className="btn btn-default home-account-btn" onClick={onLogout}>
                Logout
              </button>
            </>
          ) : (
            <span className="home-account-label">No active account session</span>
          )}
        </div>

        {shouldShowNotificationControls && notificationPermissionState === "default" ? (
          <div className="home-notification-row panel">
            <span className="home-notification-label">
              Enable call notifications to get Accept/Reject popup when app is in background.
            </span>
            <button className="btn btn-default" onClick={onEnableCallNotifications}>
              Enable Call Notifications
            </button>
          </div>
        ) : null}

        {shouldShowNotificationControls && notificationPermissionState === "denied" ? (
          <div className="home-notification-row panel">
            <span className="home-notification-label">
              Browser notifications are blocked for this site.
            </span>
          </div>
        ) : null}

        {shouldShowNotificationControls && canShowCallNotifications ? (
          <div className="home-notification-row panel">
            <span className="home-notification-label">Call notifications are enabled.</span>
          </div>
        ) : null}

        {notificationPermissionNotice ? (
          <div className="home-notification-hint muted-text">{notificationPermissionNotice}</div>
        ) : null}

        <div className={`connection-pill ${isSocketReady ? "connection-pill--online" : ""}`}>
          {isSocketReady ? "Backend connected" : "Backend disconnected"}
        </div>

        {(isLoggedIn || incomingCall || outgoingCall || directCallNotice) && (
          <HomeDirectCallPanel
            incomingCall={incomingCall}
            outgoingCall={outgoingCall}
            directCallNotice={directCallNotice}
            onAcceptIncoming={acceptIncomingCall}
            onRejectIncoming={rejectIncomingCall}
            onCancelOutgoing={cancelOutgoingCall}
          />
        )}

        <div className="home-main-sections">
          {isLoggedIn ? (
            showDirectory ? (
              <HomeUserDirectorySection
                users={users}
                isLoadingUsers={isLoadingUsers}
                usersError={usersError}
                onRefresh={refreshUsers}
                onCallAudio={callUserAudio}
                onCallVideo={callUserVideo}
                outgoingCall={outgoingCall}
                canCall={isDirectCallEnabled}
              />
            ) : (
              <section className="home-section panel">
                <div className="home-section-head">
                  <h2 className="home-section-title">Call Logged-In Users</h2>
                  <p className="home-section-subtitle">
                    Direct user calls are unavailable because backend authentication is disabled.
                  </p>
                </div>
                <div className="home-call-notice panel">
                  Enable backend auth (`AUTH_ENABLED=1`) with MongoDB and JWT secret to use user
                  directory and direct calling.
                </div>
              </section>
            )
          ) : (
            <HomeGuestSection />
          )}

          <HomeMeetSection
            onStartVideoMeet={() => startCall(true)}
            onStartAudioMeet={() => startCall(false)}
          />
        </div>

        {quickRejoin?.roomId && (
          <div className="home-quick-rejoin panel">
            <div className="home-quick-rejoin-title">Call ended recently</div>
            <div className="home-quick-rejoin-subtitle">
              Rejoin room <strong>{quickRejoin.roomId}</strong> instantly.
            </div>
            <div className="home-quick-rejoin-actions">
              <button onClick={quickRejoinCall} className="btn btn-primary">
                Quick Rejoin
              </button>
              <button onClick={dismissQuickRejoin} className="btn btn-default">
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
