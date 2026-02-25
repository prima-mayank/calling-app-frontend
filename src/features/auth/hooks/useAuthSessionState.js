import { useCallback, useEffect, useState } from "react";
import { fetchCurrentUser } from "../services/authApi";
import { clearAuthSession, readAuthSession, saveAuthSession } from "../utils/authStorage";

const isLocalTestToken = (token) =>
  String(token || "").trim().toLowerCase().startsWith("local-test-");

export const useAuthSessionState = () => {
  const [session, setSession] = useState(() => readAuthSession());
  const [isCheckingSession, setIsCheckingSession] = useState(() =>
    !!readAuthSession()?.token
  );

  const applySession = useCallback((nextSession) => {
    const token = String(nextSession?.token || "").trim();
    if (!token) {
      clearAuthSession();
      setSession(null);
      return;
    }

    saveAuthSession({
      token,
      user: nextSession?.user || null,
    });
    setSession({
      token,
      user: nextSession?.user || null,
    });
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
    setSession(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const activeSession = readAuthSession();
    const token = String(activeSession?.token || "").trim();
    if (!token) {
      setSession(null);
      return null;
    }

    if (isLocalTestToken(token)) {
      const nextSession = {
        token,
        user: activeSession?.user || null,
      };
      setSession(nextSession);
      return nextSession;
    }

    try {
      const me = await fetchCurrentUser({ token });
      const nextSession = {
        token,
        user: me?.user || activeSession?.user || null,
      };
      applySession(nextSession);
      return nextSession;
    } catch {
      clearAuthSession();
      setSession(null);
      return null;
    }
  }, [applySession]);

  useEffect(() => {
    let isActive = true;

    const run = async () => {
      setIsCheckingSession(true);
      await refreshSession();
      if (isActive) {
        setIsCheckingSession(false);
      }
    };

    void run();

    return () => {
      isActive = false;
    };
  }, [refreshSession]);

  return {
    session,
    isCheckingSession,
    applySession,
    refreshSession,
    logout,
  };
};
