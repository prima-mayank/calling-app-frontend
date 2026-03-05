import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ensureDirectCallNotificationServiceWorker,
  getDirectCallNotificationPermissionState,
  requestDirectCallNotificationPermission,
} from "../services/callNotificationService";

export const useDirectCallNotificationPermission = () => {
  const [notificationPermissionState, setNotificationPermissionState] = useState(() =>
    getDirectCallNotificationPermissionState()
  );

  const refreshPermissionState = useCallback(() => {
    setNotificationPermissionState(getDirectCallNotificationPermissionState());
  }, []);

  const requestCallNotificationPermission = useCallback(async () => {
    const nextState = await requestDirectCallNotificationPermission();
    setNotificationPermissionState(nextState);
    if (nextState === "granted") {
      await ensureDirectCallNotificationServiceWorker();
    }
    return nextState;
  }, []);

  useEffect(() => {
    if (notificationPermissionState === "granted") {
      void ensureDirectCallNotificationServiceWorker();
    }
  }, [notificationPermissionState]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return () => {};
    }

    const onVisibilityOrFocus = () => {
      refreshPermissionState();
    };

    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("focus", onVisibilityOrFocus);
    };
  }, [refreshPermissionState]);

  const canShowCallNotifications = useMemo(
    () => notificationPermissionState === "granted",
    [notificationPermissionState]
  );

  return {
    notificationPermissionState,
    canShowCallNotifications,
    refreshNotificationPermissionState: refreshPermissionState,
    requestCallNotificationPermission,
  };
};
