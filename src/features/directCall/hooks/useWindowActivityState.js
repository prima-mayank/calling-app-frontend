import { useEffect, useState } from "react";

const readWindowActivity = () => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return {
      isDocumentVisible: true,
      hasWindowFocus: true,
      isAppActive: true,
      shouldUseSystemNotification: false,
    };
  }

  const isDocumentVisible = document.visibilityState === "visible";
  const hasWindowFocus = typeof document.hasFocus === "function" ? document.hasFocus() : true;
  const isAppActive = isDocumentVisible && hasWindowFocus;

  return {
    isDocumentVisible,
    hasWindowFocus,
    isAppActive,
    shouldUseSystemNotification: !isAppActive,
  };
};

export const useWindowActivityState = () => {
  const [activityState, setActivityState] = useState(() => readWindowActivity());

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return () => {};
    }

    const refresh = () => {
      setActivityState(readWindowActivity());
    };

    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("blur", refresh);
    window.addEventListener("pageshow", refresh);

    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("blur", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  return activityState;
};

