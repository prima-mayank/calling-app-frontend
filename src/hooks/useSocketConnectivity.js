import { useEffect, useState } from "react";

/**
 * Tracks socket connection state and browser online/offline state.
 * Re-connects peer and refreshes remote hosts whenever the socket reconnects.
 */
export const useSocketConnectivity = ({ socket, reconnectPeerIfNeeded, refreshRemoteHosts }) => {
  const [socketConnected, setSocketConnected] = useState(socket.connected);
  const [socketConnectError, setSocketConnectError] = useState("");
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine !== false
  );

  useEffect(() => {
    const onConnect = () => {
      setSocketConnected(true);
      setSocketConnectError("");
      refreshRemoteHosts();
      reconnectPeerIfNeeded();
    };
    const onDisconnect = () => setSocketConnected(false);
    const onConnectError = (error) => {
      setSocketConnected(false);
      const message = String(error?.message || "").trim();
      setSocketConnectError(message || "connect-error");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, [reconnectPeerIfNeeded, refreshRemoteHosts, socket]);

  useEffect(() => {
    if (typeof window === "undefined") return () => {};

    const onOnline = () => {
      setBrowserOnline(true);
      reconnectPeerIfNeeded();
      if (!socket.connected && typeof socket.connect === "function") {
        socket.connect();
      }
    };
    const onOffline = () => setBrowserOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [reconnectPeerIfNeeded, socket]);

  return { socketConnected, socketConnectError, browserOnline };
};
