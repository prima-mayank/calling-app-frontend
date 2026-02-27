const ACTION_MESSAGE_TYPE = "direct-call-notification-action";
const URL_ACTION_PARAM = "dc_action";
const URL_REQUEST_ID_PARAM = "dc_request_id";

const normalizeText = (value) => String(value || "").trim();
const normalizeAction = (value) => {
  const action = normalizeText(value).toLowerCase();
  if (action === "accept" || action === "reject") return action;
  return "";
};

const buildActionUrl = ({ action, requestId } = {}) => {
  const url = new URL("/", self.location.origin);
  const normalizedAction = normalizeAction(action);
  const normalizedRequestId = normalizeText(requestId);
  if (normalizedAction) {
    url.searchParams.set(URL_ACTION_PARAM, normalizedAction);
  }
  if (normalizedRequestId) {
    url.searchParams.set(URL_REQUEST_ID_PARAM, normalizedRequestId);
  }
  return url.toString();
};

const postActionToClients = async ({ action, requestId } = {}) => {
  const clientsList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  if (!clientsList.length) {
    return false;
  }

  clientsList.forEach((client) => {
    client.postMessage({
      type: ACTION_MESSAGE_TYPE,
      action,
      requestId,
      timestamp: Date.now(),
    });
  });

  const firstClient = clientsList[0];
  if (firstClient && typeof firstClient.focus === "function") {
    try {
      await firstClient.focus();
    } catch {
      // noop
    }
  }

  return true;
};

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const action = normalizeAction(event.action);
  const requestId = normalizeText(notification?.data?.requestId);

  notification?.close();

  event.waitUntil(
    (async () => {
      if (!action || !requestId) {
        await self.clients.openWindow("/");
        return;
      }

      const delivered = await postActionToClients({ action, requestId });
      if (delivered) return;

      await self.clients.openWindow(
        buildActionUrl({
          action,
          requestId,
        })
      );
    })()
  );
});
