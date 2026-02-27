import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchUserDirectory } from "../services/userDirectoryApi";

const toOnlineSet = (onlineUserIds) => {
  const ids = Array.isArray(onlineUserIds)
    ? onlineUserIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return new Set(ids);
};

export const useUserDirectory = ({ socket, token, isEnabled }) => {
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [isAuthUnavailable, setIsAuthUnavailable] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());

  const refreshUsers = useCallback(async () => {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken || !isEnabled) {
      setUsers([]);
      setUsersError("");
      setIsAuthUnavailable(false);
      return [];
    }

    setIsLoadingUsers(true);
    setUsersError("");

    try {
      const result = await fetchUserDirectory({ token: normalizedToken });
      const nextUsers = Array.isArray(result?.users) ? result.users : [];
      setUsers(nextUsers);
      setIsAuthUnavailable(false);
      return nextUsers;
    } catch (error) {
      const errorCode = String(error?.code || "").trim().toLowerCase();
      if (errorCode === "auth-unavailable") {
        setUsers([]);
        setUsersError("");
        setIsAuthUnavailable(true);
        return [];
      }
      setUsers([]);
      setIsAuthUnavailable(false);
      setUsersError(String(error?.message || "Failed to load users.").trim());
      return [];
    } finally {
      setIsLoadingUsers(false);
    }
  }, [isEnabled, token]);

  useEffect(() => {
    if (!isEnabled || !token) {
      setUsers([]);
      setOnlineUserIds(new Set());
      setUsersError("");
      setIsAuthUnavailable(false);
      return () => {};
    }

    const onPresenceSnapshot = ({ onlineUserIds: nextIds }) => {
      setOnlineUserIds(toOnlineSet(nextIds));
    };

    const onPresenceUpdated = ({ onlineUserIds: nextIds }) => {
      setOnlineUserIds(toOnlineSet(nextIds));
    };

    socket.on("presence-snapshot", onPresenceSnapshot);
    socket.on("presence-updated", onPresenceUpdated);
    socket.emit("presence-subscribe");

    const onConnect = () => {
      socket.emit("presence-subscribe");
    };
    socket.on("connect", onConnect);

    return () => {
      socket.off("presence-snapshot", onPresenceSnapshot);
      socket.off("presence-updated", onPresenceUpdated);
      socket.off("connect", onConnect);
    };
  }, [isEnabled, socket, token]);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    if (!isEnabled || !token) return () => {};
    const intervalId = window.setInterval(() => {
      void refreshUsers();
    }, 20_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isEnabled, refreshUsers, token]);

  const usersWithPresence = useMemo(() => {
    return users.map((user) => {
      const id = String(user?.id || "").trim();
      return {
        ...user,
        id,
        online: onlineUserIds.has(id) || !!user?.online,
      };
    });
  }, [onlineUserIds, users]);

  return {
    users: usersWithPresence,
    isLoadingUsers,
    usersError,
    isAuthUnavailable,
    refreshUsers,
  };
};
