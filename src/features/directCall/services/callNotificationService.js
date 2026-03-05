const NOTIFICATION_TAG_PREFIX = "direct-call-";
const SERVICE_WORKER_PATH = "/call-notification-sw.js";
const SERVICE_WORKER_SCOPE = "/";
const ACTION_MESSAGE_TYPE = "direct-call-notification-action";
const URL_ACTION_PARAM = "dc_action";
const URL_REQUEST_ID_PARAM = "dc_request_id";
const TAB_INSTANCE_STORAGE_KEY = "direct-call-tab-instance-id";
const OWNER_STORAGE_PREFIX = "direct-call-notification-owner:";
const OWNER_BROADCAST_CHANNEL_NAME = "direct-call-notification-owner";
const OWNER_CLAIM_TTL_MS = 45_000;
const OWNER_CLAIM_CHECK_WAIT_MS = 140;

let serviceWorkerRegistrationPromise = null;
let ownerBroadcastChannel = null;
const pendingOwnerCheckResolvers = new Map();
const localOwnedRequests = new Map();

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
const normalizePermissionState = (value) => {
  const permission = normalizeText(value).toLowerCase();
  if (permission === "granted" || permission === "denied" || permission === "default") {
    return permission;
  }
  return "default";
};

const canUseWindowNotification = () =>
  typeof window !== "undefined" && typeof Notification !== "undefined";

const canUseServiceWorkerNotification = () =>
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  !!navigator.serviceWorker &&
  (window.isSecureContext || window.location?.hostname === "localhost");

const canUseLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const canUseSessionStorage = () =>
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const canUseBroadcastChannel = () => typeof BroadcastChannel !== "undefined";

const buildTag = (requestId) => `${NOTIFICATION_TAG_PREFIX}${normalizeText(requestId)}`;

const getTabInstanceId = () => {
  if (!canUseSessionStorage()) {
    return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const existing = normalizeText(window.sessionStorage.getItem(TAB_INSTANCE_STORAGE_KEY));
  if (existing) return existing;

  const created = `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  try {
    window.sessionStorage.setItem(TAB_INSTANCE_STORAGE_KEY, created);
  } catch {
    // noop
  }
  return created;
};

const CURRENT_TAB_ID = getTabInstanceId();

const isOwnershipPayload = (value) => {
  return (
    !!value &&
    typeof value === "object" &&
    normalizeText(value.ownerId) !== "" &&
    Number.isFinite(Number(value.expiresAt))
  );
};

const getOwnershipStorageKey = (requestId) =>
  `${OWNER_STORAGE_PREFIX}${normalizeText(requestId)}`;

const readStoredOwnership = (requestId) => {
  if (!canUseLocalStorage()) return null;
  const normalizedRequestId = normalizeText(requestId);
  if (!normalizedRequestId) return null;

  try {
    const raw = window.localStorage.getItem(getOwnershipStorageKey(normalizedRequestId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isOwnershipPayload(parsed)) return null;
    return {
      ownerId: normalizeText(parsed.ownerId),
      expiresAt: Number(parsed.expiresAt),
    };
  } catch {
    return null;
  }
};

const clearStoredOwnership = (requestId) => {
  if (!canUseLocalStorage()) return;
  const normalizedRequestId = normalizeText(requestId);
  if (!normalizedRequestId) return;
  try {
    window.localStorage.removeItem(getOwnershipStorageKey(normalizedRequestId));
  } catch {
    // noop
  }
};

const writeStoredOwnership = ({ requestId, ownerId, expiresAt }) => {
  if (!canUseLocalStorage()) return false;
  const normalizedRequestId = normalizeText(requestId);
  const normalizedOwnerId = normalizeText(ownerId);
  if (!normalizedRequestId || !normalizedOwnerId || !Number.isFinite(Number(expiresAt))) {
    return false;
  }

  try {
    window.localStorage.setItem(
      getOwnershipStorageKey(normalizedRequestId),
      JSON.stringify({
        ownerId: normalizedOwnerId,
        expiresAt: Number(expiresAt),
      })
    );
    return true;
  } catch {
    return false;
  }
};

const releasePendingOwnerCheckResolvers = (requestId, hasRemoteOwner) => {
  const normalizedRequestId = normalizeText(requestId);
  if (!normalizedRequestId) return;
  const resolvers = pendingOwnerCheckResolvers.get(normalizedRequestId);
  if (!resolvers || resolvers.size === 0) return;
  pendingOwnerCheckResolvers.delete(normalizedRequestId);
  resolvers.forEach((resolve) => {
    try {
      resolve(!!hasRemoteOwner);
    } catch {
      // noop
    }
  });
};

const isCurrentTabOwner = (requestId) => {
  const normalizedRequestId = normalizeText(requestId);
  if (!normalizedRequestId) return false;
  const now = Date.now();

  const localExpiry = Number(localOwnedRequests.get(normalizedRequestId) || 0);
  if (localExpiry > now) return true;
  if (localExpiry > 0 && localExpiry <= now) {
    localOwnedRequests.delete(normalizedRequestId);
  }

  const stored = readStoredOwnership(normalizedRequestId);
  if (!stored) return false;
  if (stored.expiresAt <= now) {
    clearStoredOwnership(normalizedRequestId);
    return false;
  }
  if (stored.ownerId !== CURRENT_TAB_ID) return false;

  localOwnedRequests.set(normalizedRequestId, stored.expiresAt);
  return true;
};

const releaseDirectCallNotificationOwnership = (requestId = "") => {
  const normalizedRequestId = normalizeText(requestId);
  if (!normalizedRequestId) {
    Array.from(localOwnedRequests.keys()).forEach((ownedRequestId) => {
      releaseDirectCallNotificationOwnership(ownedRequestId);
    });
    return;
  }

  localOwnedRequests.delete(normalizedRequestId);

  const stored = readStoredOwnership(normalizedRequestId);
  if (!stored || stored.ownerId === CURRENT_TAB_ID) {
    clearStoredOwnership(normalizedRequestId);
  }

  if (ownerBroadcastChannel) {
    try {
      ownerBroadcastChannel.postMessage({
        type: "claim-release",
        requestId: normalizedRequestId,
        ownerId: CURRENT_TAB_ID,
        timestamp: Date.now(),
      });
    } catch {
      // noop
    }
  }
};

export const isDirectCallNotificationOwnedByCurrentTab = (requestId = "") =>
  isCurrentTabOwner(requestId);

const handleOwnerBroadcastMessage = (event) => {
  const payload = event?.data || {};
  const type = normalizeText(payload.type);
  const requestId = normalizeText(payload.requestId);
  const ownerId = normalizeText(payload.ownerId);
  const senderId = normalizeText(payload.senderId);

  if (!requestId) return;

  if (type === "claim-check") {
    if (!senderId || senderId === CURRENT_TAB_ID) return;
    if (!isCurrentTabOwner(requestId)) return;
    if (!ownerBroadcastChannel) return;
    try {
      ownerBroadcastChannel.postMessage({
        type: "claim-announce",
        requestId,
        ownerId: CURRENT_TAB_ID,
        timestamp: Date.now(),
      });
    } catch {
      // noop
    }
    return;
  }

  if (type === "claim-announce" && ownerId && ownerId !== CURRENT_TAB_ID) {
    releasePendingOwnerCheckResolvers(requestId, true);
    return;
  }

  if (type === "claim-release" && ownerId && ownerId !== CURRENT_TAB_ID) {
    releasePendingOwnerCheckResolvers(requestId, false);
  }
};

const ensureOwnerBroadcastChannel = () => {
  if (!canUseBroadcastChannel()) return null;
  if (ownerBroadcastChannel) return ownerBroadcastChannel;

  try {
    ownerBroadcastChannel = new BroadcastChannel(OWNER_BROADCAST_CHANNEL_NAME);
    ownerBroadcastChannel.onmessage = handleOwnerBroadcastMessage;
    return ownerBroadcastChannel;
  } catch {
    ownerBroadcastChannel = null;
    return null;
  }
};

const waitForRemoteOwnershipAnnouncement = (requestId) => {
  const normalizedRequestId = normalizeText(requestId);
  if (!normalizedRequestId) return Promise.resolve(false);
  const channel = ensureOwnerBroadcastChannel();
  if (!channel) return Promise.resolve(false);

  return new Promise((resolve) => {
    const resolverSet =
      pendingOwnerCheckResolvers.get(normalizedRequestId) || new Set();
    resolverSet.add(resolve);
    pendingOwnerCheckResolvers.set(normalizedRequestId, resolverSet);

    try {
      channel.postMessage({
        type: "claim-check",
        requestId: normalizedRequestId,
        senderId: CURRENT_TAB_ID,
        timestamp: Date.now(),
      });
    } catch {
      releasePendingOwnerCheckResolvers(normalizedRequestId, false);
      return;
    }

    window.setTimeout(() => {
      releasePendingOwnerCheckResolvers(normalizedRequestId, false);
    }, OWNER_CLAIM_CHECK_WAIT_MS);
  });
};

const broadcastOwnershipAnnouncement = (requestId) => {
  const normalizedRequestId = normalizeText(requestId);
  if (!normalizedRequestId) return;
  const channel = ensureOwnerBroadcastChannel();
  if (!channel) return;

  try {
    channel.postMessage({
      type: "claim-announce",
      requestId: normalizedRequestId,
      ownerId: CURRENT_TAB_ID,
      timestamp: Date.now(),
    });
  } catch {
    // noop
  }
};

const claimDirectCallNotificationOwnership = async (requestId) => {
  const normalizedRequestId = normalizeText(requestId);
  if (!normalizedRequestId) return false;
  const now = Date.now();

  if (isCurrentTabOwner(normalizedRequestId)) {
    const extendedExpiry = now + OWNER_CLAIM_TTL_MS;
    localOwnedRequests.set(normalizedRequestId, extendedExpiry);
    writeStoredOwnership({
      requestId: normalizedRequestId,
      ownerId: CURRENT_TAB_ID,
      expiresAt: extendedExpiry,
    });
    return true;
  }

  const storageEnabled = canUseLocalStorage();
  if (storageEnabled) {
    const storedOwnership = readStoredOwnership(normalizedRequestId);
    if (
      storedOwnership &&
      storedOwnership.expiresAt > now &&
      storedOwnership.ownerId !== CURRENT_TAB_ID
    ) {
      return false;
    }
    if (storedOwnership && storedOwnership.expiresAt <= now) {
      clearStoredOwnership(normalizedRequestId);
    }
  }

  const hasRemoteOwner = await waitForRemoteOwnershipAnnouncement(normalizedRequestId);
  if (hasRemoteOwner) {
    return false;
  }

  const expiresAt = Date.now() + OWNER_CLAIM_TTL_MS;
  if (!storageEnabled) {
    localOwnedRequests.set(normalizedRequestId, expiresAt);
    broadcastOwnershipAnnouncement(normalizedRequestId);
    return true;
  }

  const latestOwnership = readStoredOwnership(normalizedRequestId);
  if (
    latestOwnership &&
    latestOwnership.expiresAt > now &&
    latestOwnership.ownerId !== CURRENT_TAB_ID
  ) {
    return false;
  }
  if (latestOwnership && latestOwnership.expiresAt <= now) {
    clearStoredOwnership(normalizedRequestId);
  }

  const stored = writeStoredOwnership({
    requestId: normalizedRequestId,
    ownerId: CURRENT_TAB_ID,
    expiresAt,
  });
  if (!stored) return false;

  const verifiedOwnership = readStoredOwnership(normalizedRequestId);
  if (!verifiedOwnership || verifiedOwnership.ownerId !== CURRENT_TAB_ID) {
    return false;
  }

  localOwnedRequests.set(normalizedRequestId, verifiedOwnership.expiresAt);

  broadcastOwnershipAnnouncement(normalizedRequestId);

  return true;
};

export const isDirectCallNotificationSupported = () => canUseWindowNotification();

export const getDirectCallNotificationPermissionState = () => {
  if (!isDirectCallNotificationSupported()) return "unsupported";
  return normalizePermissionState(Notification.permission);
};

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
  if (!isDirectCallNotificationSupported()) return "unsupported";

  const currentPermission = normalizePermissionState(Notification.permission);
  if (currentPermission === "granted" || currentPermission === "denied") {
    return currentPermission;
  }

  try {
    const nextPermission = await Notification.requestPermission();
    return normalizePermissionState(nextPermission);
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
  if (!normalizedRequestId) {
    return { kind: "none", notification: null, reason: "missing-request-id" };
  }

  const permission = getDirectCallNotificationPermissionState();
  if (permission !== "granted") {
    return { kind: "none", notification: null, reason: "permission-not-granted" };
  }

  const claimed = await claimDirectCallNotificationOwnership(normalizedRequestId);
  if (!claimed) {
    return { kind: "none", notification: null, reason: "owned-by-other-tab" };
  }

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
      return { kind: "service-worker", notification: null, reason: "" };
    } catch {
      // fallback to page notification below
    }
  }

  if (!canUseWindowNotification()) {
    releaseDirectCallNotificationOwnership(normalizedRequestId);
    return { kind: "none", notification: null, reason: "unsupported" };
  }

  try {
    const notification = new Notification(title, options);
    if (typeof onClickFallback === "function") {
      notification.onclick = () => {
        onClickFallback();
      };
    }

    const onNotificationClose = () => {
      releaseDirectCallNotificationOwnership(normalizedRequestId);
    };

    if (typeof notification.addEventListener === "function") {
      notification.addEventListener("close", onNotificationClose);
    } else {
      const existingOnClose = notification.onclose;
      notification.onclose = (...args) => {
        onNotificationClose();
        if (typeof existingOnClose === "function") {
          existingOnClose(...args);
        }
      };
    }

    return { kind: "page", notification, reason: "" };
  } catch {
    releaseDirectCallNotificationOwnership(normalizedRequestId);
    return { kind: "none", notification: null, reason: "notification-failed" };
  }
};

export const closeDirectCallIncomingNotification = async ({
  requestId,
  fallbackNotification = null,
  onlyIfOwnedByCurrentTab = true,
} = {}) => {
  const normalizedRequestId = normalizeText(requestId);

  if (fallbackNotification) {
    try {
      fallbackNotification.close();
    } catch {
      // noop
    }
  }

  if (normalizedRequestId) {
    const canCloseRequest =
      !onlyIfOwnedByCurrentTab ||
      isDirectCallNotificationOwnedByCurrentTab(normalizedRequestId);
    if (!canCloseRequest) {
      return;
    }

    releaseDirectCallNotificationOwnership(normalizedRequestId);

    const registration = await ensureDirectCallNotificationServiceWorker();
    if (!registration || typeof registration.getNotifications !== "function") {
      return;
    }

    try {
      const notifications = await registration.getNotifications({
        tag: buildTag(normalizedRequestId),
      });
      notifications
        .filter((item) => item?.tag === buildTag(normalizedRequestId))
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
    return;
  }

  const ownedRequestIds = Array.from(localOwnedRequests.keys()).filter((ownedRequestId) => {
    if (!onlyIfOwnedByCurrentTab) return true;
    return isDirectCallNotificationOwnedByCurrentTab(ownedRequestId);
  });

  if (ownedRequestIds.length === 0) {
    return;
  }

  ownedRequestIds.forEach((ownedRequestId) => {
    releaseDirectCallNotificationOwnership(ownedRequestId);
  });

  const registration = await ensureDirectCallNotificationServiceWorker();
  if (!registration || typeof registration.getNotifications !== "function") {
    return;
  }

  await Promise.all(
    ownedRequestIds.map(async (ownedRequestId) => {
      try {
        const notifications = await registration.getNotifications({
          tag: buildTag(ownedRequestId),
        });
        notifications
          .filter((item) => item?.tag === buildTag(ownedRequestId))
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
    })
  );
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
