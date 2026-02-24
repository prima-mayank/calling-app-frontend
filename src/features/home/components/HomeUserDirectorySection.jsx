const HomeUserDirectorySection = ({
  users,
  isLoadingUsers,
  usersError,
  onRefresh,
  onCallAudio,
  onCallVideo,
  outgoingCall,
  canCall = true,
}) => {
  const activeTargetUserId = String(outgoingCall?.targetUserId || "").trim();

  return (
    <section className="home-section panel">
      <div className="home-section-head">
        <h2 className="home-section-title">Call Logged-In Users</h2>
        <p className="home-section-subtitle">
          Start direct audio/video calls. Online users can receive immediately.
        </p>
      </div>

      <div className="home-directory-head">
        <span className="home-directory-count">
          {isLoadingUsers ? "Loading users..." : `${users.length} users`}
        </span>
        <button className="btn btn-default" onClick={onRefresh} disabled={isLoadingUsers}>
          Refresh
        </button>
      </div>

      {usersError ? <div className="error-text">{usersError}</div> : null}

      {users.length === 0 && !isLoadingUsers ? (
        <div className="muted-text">No other users found yet.</div>
      ) : (
        <div className="home-directory-list">
          {users.map((user) => {
            const isOnline = !!user.online;
            const isActiveTarget = user.id === activeTargetUserId;

            return (
              <div key={user.id} className="home-user-row">
                <div className="home-user-meta">
                  <div className="home-user-name">
                    {user.displayName || user.email || "Unknown user"}
                  </div>
                  <div className="home-user-email">{user.email}</div>
                </div>

                <div className="home-user-status">
                  <span
                    className={`presence-dot ${isOnline ? "presence-dot--online" : "presence-dot--offline"}`}
                    aria-hidden="true"
                  />
                  <span>{isOnline ? "Online" : "Offline"}</span>
                </div>

                <div className="home-user-actions">
                  <button
                    className="btn btn-call-audio"
                    onClick={() => onCallAudio(user)}
                    disabled={!canCall || !isOnline || isActiveTarget}
                    title={!canCall ? "Socket disconnected" : !isOnline ? "User is offline" : ""}
                  >
                    Audio
                  </button>
                  <button
                    className="btn btn-call-video"
                    onClick={() => onCallVideo(user)}
                    disabled={!canCall || !isOnline || isActiveTarget}
                    title={!canCall ? "Socket disconnected" : !isOnline ? "User is offline" : ""}
                  >
                    Video
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default HomeUserDirectorySection;
