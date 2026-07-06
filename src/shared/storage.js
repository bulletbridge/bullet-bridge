export const STORE_KEYS = {
  token: "token",
  authMethod: "authMethod",
  oauthClientId: "oauthClientId",
  me: "me",
  devices: "devices",
  localDevice: "localDevice",
  settings: "settings",
  cursor: "cursor",
  status: "status",
  notificationMap: "notificationMap",
  mirroredNotifications: "mirroredNotifications",
  suppressedPushes: "suppressedPushes",
  unreadCount: "unreadCount",
  uploadStatus: "uploadStatus"
};

export const DEFAULT_SETTINGS = {
  defaultDeviceIden: "",
  sendShortcut: "ctrlEnter",
  showPushNotifications: true,
  showMirroredNotifications: true,
  openLinksOnNotificationClick: true,
  closeNotificationsAsDismiss: false
};

export const DEFAULT_STATUS = {
  connected: false,
  lastConnectedAt: null,
  lastError: "",
  websocketState: "idle",
  lastStreamEventAt: null,
  lastStreamEventType: "",
  lastPushSyncAt: null,
  lastPushCount: 0,
  lastReceivedPushAt: null
};

const NOTIFICATION_MAP_MAX_ENTRIES = 200;
const NOTIFICATION_MAP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

export async function setStorage(values) {
  return chrome.storage.local.set(values);
}

export async function removeStorage(keys) {
  return chrome.storage.local.remove(keys);
}

export async function getSettings() {
  const stored = await getStorage(STORE_KEYS.settings);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored[STORE_KEYS.settings] || {})
  };
}

export async function updateSettings(patch) {
  const settings = {
    ...(await getSettings()),
    ...patch
  };
  await setStorage({ [STORE_KEYS.settings]: settings });
  return settings;
}

export async function getStatus() {
  const stored = await getStorage(STORE_KEYS.status);
  return {
    ...DEFAULT_STATUS,
    ...(stored[STORE_KEYS.status] || {})
  };
}

export async function setStatus(patch) {
  const status = {
    ...(await getStatus()),
    ...patch
  };
  await setStorage({ [STORE_KEYS.status]: status });
  return status;
}

export async function getNotificationMap() {
  const stored = await getStorage(STORE_KEYS.notificationMap);
  return stored[STORE_KEYS.notificationMap] || {};
}

export async function setNotificationMap(map) {
  await setStorage({ [STORE_KEYS.notificationMap]: map });
}

export async function rememberNotification(notificationId, details) {
  const map = pruneNotificationMap(await getNotificationMap());
  map[notificationId] = {
    ...(details || {}),
    createdAt: details?.createdAt || new Date().toISOString()
  };
  await setNotificationMap(pruneNotificationMap(map));
}

export async function forgetNotification(notificationId) {
  const map = await getNotificationMap();
  delete map[notificationId];
  await setNotificationMap(map);
}

export function pruneNotificationMap(map = {}, now = Date.now()) {
  const entries = Object.entries(map || {})
    .filter(([, details]) => {
      const createdAt = notificationCreatedAt(details);
      return createdAt === 0 || now - createdAt <= NOTIFICATION_MAP_MAX_AGE_MS;
    })
    .sort((left, right) => notificationCreatedAt(right[1]) - notificationCreatedAt(left[1]))
    .slice(0, NOTIFICATION_MAP_MAX_ENTRIES);

  return Object.fromEntries(entries);
}

function notificationCreatedAt(details) {
  const timestamp = Date.parse(details?.createdAt || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export async function getSuppressedPushes() {
  const stored = await getStorage(STORE_KEYS.suppressedPushes);
  return stored[STORE_KEYS.suppressedPushes] || {};
}

export async function suppressPush(iden) {
  if (!iden) {
    return;
  }

  const now = Date.now();
  const suppressed = await getSuppressedPushes();
  suppressed[iden] = now;

  for (const [pushIden, timestamp] of Object.entries(suppressed)) {
    if (now - timestamp > 10 * 60 * 1000) {
      delete suppressed[pushIden];
    }
  }

  await setStorage({ [STORE_KEYS.suppressedPushes]: suppressed });
}
