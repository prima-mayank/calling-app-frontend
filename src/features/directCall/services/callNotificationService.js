const NOTIFICATION_TAG_PREFIX = "direct-call-";
const SERVICE_WORKER_PATH = "/call-notification-sw.js";
const SERVICE_WORKER_SCOPE = "/";
const ACTION_MESSAGE_TYPE = "direct-call-notification-action";
const URL_ACTION_PARAM = "dc_action";
const URL_REQUEST_ID_PARAM = "dc_request_id";

let serviceWorkerRegistrationPromise = null;
let permissionPromptAttempted = false;

const normalizeText = (value) => String(value || "").trim();
const normalizeAction = (value) => {
  const action = normalizeText(value).toLowerCase();
  if (action === "accept" || action === "reject") return action;
  return "";
};
const normalizeMode = (value) => {
  const mode = normalizeText(value).toLowerCase();
  if (mode === "audio" || mode === "video") return mode;
  return "call";
};

const canUseWindowNotification = () =>
  typeof window !== "undefined" && typeof Notification !== "undefined";

const canUseServiceWorkerNotification = () =>
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  !!navigator.serviceWorker &&
  (window.isSecureContext || window.location?.hostname === "localhost");

const buildTag = (requestId) => `${NOTIFICATION_TAG_PREFIX}${normalizeText(requestId)}`;

export const ensureDirectCallNotificationServiceWorker = async () => {
  if (!canUseServiceWorkerNotification()) return null;
  if (serviceWorkerRegistrationPromise) {
    return serviceWorkerRegistrationPromise;
  }

  serviceWorkerRegistrationPromise = navigator.serviceWorker
    .register(SERVICE_WORKER_PATH, { scope: SERVICE_WORKER_SCOPE })
    .then(async (registration) => {
      try {
        await navigator.serviceWorker.ready;
      } catch {
        // noop
      }
      return registration;
    })
    .catch(() => null);

  return serviceWorkerRegistrationPromise;
};

export const requestDirectCallNotificationPermission = async () => {
  if (!canUseWindowNotification()) return "denied";

  const currentPermission = Notification.permission;
  if (currentPermission === "granted" || currentPermission === "denied") {
    return currentPermission;
  }

  if (permissionPromptAttempted) {
    return Notification.permission;
  }

  permissionPromptAttempted = true;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
};

export const showDirectCallIncomingNotification = async ({
  requestId,
  mode,
  callerLabel,
  onClickFallback,
} = {}) => {
  const normalizedRequestId = normalizeText(requestId);
  if (!normalizedRequestId) return { kind: "none", notification: null };

  const permission = await requestDirectCallNotificationPermission();
  if (permission !== "granted") return { kind: "none", notification: null };

  const title = `Incoming ${normalizeMode(mode)} call`;
  const body = `${normalizeText(callerLabel) || "Someone"} is calling you.`;
  const tag = buildTag(normalizedRequestId);
  const options = {
    body,
    tag,
    renotify: true,
    requireInteraction: true,
    data: {
      requestId: normalizedRequestId,
      type: "direct-call",
    },
    actions: [
      { action: "accept", title: "Accept" },
      { action: "reject", title: "Reject" },
    ],
  };

  const registration = await ensureDirectCallNotificationServiceWorker();
  if (registration && typeof registration.showNotification === "function") {
    try {
      await registration.showNotification(title, options);
      return { kind: "service-worker", notification: null };
    } catch {
      // fallback to page notification below
    }
  }

  if (!canUseWindowNotification()) {
    return { kind: "none", notification: null };
  }

  try {
    const notification = new Notification(title, options);
    if (typeof onClickFallback === "function") {
      notification.onclick = () => {
        onClickFallback();
      };
    }
    return { kind: "page", notification };
  } catch {
    return { kind: "none", notification: null };
  }
};

export const closeDirectCallIncomingNotification = async ({
  requestId,
  fallbackNotification = null,
} = {}) => {
  if (fallbackNotification) {
    try {
      fallbackNotification.close();
    } catch {
      // noop
    }
  }

  const registration = await ensureDirectCallNotificationServiceWorker();
  if (!registration || typeof registration.getNotifications !== "function") {
    return;
  }

  try {
    const normalizedRequestId = normalizeText(requestId);
    const notifications = normalizedRequestId
      ? await registration.getNotifications({ tag: buildTag(normalizedRequestId) })
      : await registration.getNotifications();

    notifications
      .filter((item) =>
        normalizedRequestId
          ? item?.tag === buildTag(normalizedRequestId)
          : String(item?.tag || "").startsWith(NOTIFICATION_TAG_PREFIX)
      )
      .forEach((item) => {
        try {
          item.close();
        } catch {
          // noop
        }
      });
  } catch {
    // noop
  }
};

export const listenToDirectCallNotificationActions = (handler) => {
  if (
    typeof navigator === "undefined" ||
    !navigator.serviceWorker ||
    typeof handler !== "function"
  ) {
    return () => {};
  }

  const onMessage = (event) => {
    const payload = event?.data || {};
    if (normalizeText(payload.type) !== ACTION_MESSAGE_TYPE) return;

    const action = normalizeAction(payload.action);
    const requestId = normalizeText(payload.requestId);
    if (!action || !requestId) return;

    handler({ action, requestId });
  };

  navigator.serviceWorker.addEventListener("message", onMessage);
  return () => {
    navigator.serviceWorker.removeEventListener("message", onMessage);
  };
};

export const consumeDirectCallActionFromUrl = () => {
  if (typeof window === "undefined") return null;

  try {
    const url = new URL(window.location.href);
    const action = normalizeAction(url.searchParams.get(URL_ACTION_PARAM));
    const requestId = normalizeText(url.searchParams.get(URL_REQUEST_ID_PARAM));
    const hasActionParam = url.searchParams.has(URL_ACTION_PARAM);
    const hasRequestIdParam = url.searchParams.has(URL_REQUEST_ID_PARAM);

    if (hasActionParam) {
      url.searchParams.delete(URL_ACTION_PARAM);
    }
    if (hasRequestIdParam) {
      url.searchParams.delete(URL_REQUEST_ID_PARAM);
    }
    if (hasActionParam || hasRequestIdParam) {
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }

    if (!action || !requestId) return null;
    return { action, requestId };
  } catch {
    return null;
  }
};
