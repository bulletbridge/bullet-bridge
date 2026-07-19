export const DEMO_MODE_KEY = "demoMode";

const DEMO_NOW = 1783161600;
const DEMO_LINK_PREVIEW_URL = "src/assets/demo-preview.svg";
const DEMO_IMAGE_URL = "src/assets/demo-image.svg";
const DEMO_VIDEO_URL = "src/assets/demo-video.mp4";
const DEMO_VIDEO_POSTER_URL = "src/assets/demo-video-poster.svg";

const DEMO_DEVICES = [
  {
    iden: "demo-browser-brave",
    type: "stream",
    nickname: "Bullet Bridge (Brave)",
    active: true
  },
  {
    iden: "demo-phone-pixel",
    type: "android",
    nickname: "Pixel 8",
    manufacturer: "Google",
    model: "Pixel 8",
    active: true
  },
  {
    iden: "demo-work-chrome",
    type: "chrome",
    nickname: "Work Chrome",
    manufacturer: "Google",
    model: "Chrome",
    active: true
  },
  {
    iden: "demo-tablet",
    type: "android",
    nickname: "Tablet",
    manufacturer: "Samsung",
    model: "Galaxy Tab",
    active: true
  }
];

const DEMO_PUSHES = [
  notePush("demo-push-001", DEMO_NOW - 420, "Work Chrome", "demo-work-chrome", "Bullet Bridge", "demo-browser-brave", "received", "Design QA notes are ready."),
  linkPush("demo-push-002", DEMO_NOW - 360, "Bullet Bridge", "demo-browser-brave", "All devices", "", "sent", "Example dashboard", "https://example.com/dashboard", DEMO_LINK_PREVIEW_URL),
  notePush("demo-push-003", DEMO_NOW - 300, "Pixel 8", "demo-phone-pixel", "Bullet Bridge", "demo-browser-brave", "received", "Review release notes before publishing."),
  filePush("demo-push-004", DEMO_NOW - 180, "Bullet Bridge", "demo-browser-brave", "Pixel 8", "demo-phone-pixel", "sent", "launch-preview.jpg", "image/jpeg", DEMO_IMAGE_URL, DEMO_IMAGE_URL),
  filePush("demo-push-005", DEMO_NOW - 60, "Pixel 8", "demo-phone-pixel", "Bullet Bridge", "demo-browser-brave", "received", "walkthrough-preview.mp4", "video/mp4", DEMO_VIDEO_URL, DEMO_VIDEO_POSTER_URL),
  notePush("demo-push-006", DEMO_NOW - 2100, "Tablet", "demo-tablet", "Bullet Bridge", "demo-browser-brave", "received", "Bring charger and badge."),
  filePush("demo-push-007", DEMO_NOW - 3600, "Pixel 8", "demo-phone-pixel", "All devices", "", "broadcast", "release-notes.pdf", "application/pdf"),
  notePush("demo-push-008", DEMO_NOW - 5400, "Bullet Bridge", "demo-browser-brave", "Work Chrome", "demo-work-chrome", "sent", "Desktop test message."),
  linkPush("demo-push-009", DEMO_NOW - 7200, "Work Chrome", "demo-work-chrome", "Pixel 8", "demo-phone-pixel", "received", "Issue tracker", "https://example.com/issues/42"),
  notePush("demo-push-010", DEMO_NOW - 9000, "Pixel 8", "demo-phone-pixel", "Bullet Bridge", "demo-browser-brave", "received", "Older push loaded from demo history.")
];

const DEMO_NOTIFICATIONS = [
  {
    id: "demo-notification-001",
    appName: "Calendar",
    title: "Release review",
    body: "Review starts in 15 minutes.",
    sourceDevice: "Pixel 8",
    created: DEMO_NOW - 240,
    receivedAt: DEMO_NOW - 240
  },
  {
    id: "demo-notification-002",
    appName: "Messages",
    title: "Build received",
    body: "The test file arrived on Pixel 8.",
    sourceDevice: "Pixel 8",
    created: DEMO_NOW - 180,
    receivedAt: DEMO_NOW - 180
  },
  {
    id: "demo-notification-003",
    appName: "Mail",
    title: "Draft ready",
    body: "Store listing copy is ready for review.",
    sourceDevice: "Pixel 8",
    created: DEMO_NOW - 90,
    receivedAt: DEMO_NOW - 90
  }
];

export function createDemoState() {
  return clone({
    hasToken: true,
    tokenPreview: "demo...mode",
    authMethod: "oauth",
    oauthAvailable: true,
    oauthClientId: "demo-client-id",
    oauthClientIdBuiltIn: true,
    oauthRedirectUri: "https://demo.chromiumapp.org/pushbullet",
    me: {
      name: "Demo User",
      email: "demo@example.com"
    },
    devices: DEMO_DEVICES,
    localDevice: DEMO_DEVICES[0],
    unreadCount: DEMO_NOTIFICATIONS.length,
    settings: {
      defaultDeviceIden: "",
      sendShortcut: "ctrlEnter",
      showPushNotifications: true,
      showMirroredNotifications: true,
      openLinksOnNotificationClick: true,
      closeNotificationsAsDismiss: false
    },
    status: {
      connected: true,
      lastConnectedAt: (DEMO_NOW - 360) * 1000,
      lastError: "",
      websocketState: "open",
      lastStreamEventAt: (DEMO_NOW - 90) * 1000,
      lastStreamEventType: "nop",
      lastPushSyncAt: (DEMO_NOW - 60) * 1000,
      lastPushCount: DEMO_PUSHES.length,
      lastReceivedPushAt: (DEMO_NOW - 180) * 1000
    },
    cursor: "older",
    uploadStatus: null,
    encryption: {
      enabled: true,
      fingerprint: "demo",
      issue: null
    },
    mirroredNotifications: DEMO_NOTIFICATIONS,
    demoPushes: DEMO_PUSHES
  });
}

export function getDemoPushPage(demoState, cursor = "", limit = 50) {
  const pushes = demoState.demoPushes || [];
  const pageSize = Math.min(Number(limit || 50), 6);
  const start = cursor === "older" ? pageSize : 0;
  const page = pushes.slice(start, start + pageSize);
  const nextCursor = start + pageSize < pushes.length ? "older" : "";

  return {
    pushes: clone(page),
    cursor: nextCursor
  };
}

export function addDemoPush(demoState, rawPush) {
  const created = Math.floor(Date.now() / 1000);
  const targetDevice = DEMO_DEVICES.find((device) => device.iden === rawPush.device_iden);
  const targetName = targetDevice?.nickname || "All devices";
  const base = {
    iden: `demo-push-${created}`,
    created,
    modified: created,
    active: true,
    dismissed: false,
    direction: "sent",
    sourceName: "Bullet Bridge",
    sourceDeviceIden: "demo-browser-brave",
    targetName,
    targetDeviceIden: rawPush.device_iden || "",
    detail: `To ${targetName}`
  };

  const push = {
    ...base,
    type: rawPush.type || "note",
    title: rawPush.title || "",
    body: rawPush.body || "",
    url: rawPush.url || ""
  };

  demoState.demoPushes = [push, ...(demoState.demoPushes || [])];
  demoState.status.lastPushSyncAt = Date.now();
  demoState.status.lastPushCount = demoState.demoPushes.length;
  return clone(push);
}

export function addDemoFilePush(demoState, file, rawPush = {}) {
  const created = Math.floor(Date.now() / 1000);
  const targetDevice = DEMO_DEVICES.find((device) => device.iden === rawPush.device_iden);
  const targetName = targetDevice?.nickname || "All devices";
  const push = {
    iden: `demo-file-${created}`,
    type: "file",
    created,
    modified: created,
    active: true,
    dismissed: false,
    direction: "sent",
    sourceName: "Bullet Bridge",
    sourceDeviceIden: "demo-browser-brave",
    targetName,
    targetDeviceIden: rawPush.device_iden || "",
    detail: `To ${targetName}`,
    title: rawPush.title || "",
    body: rawPush.body || "",
    fileName: file.name || "demo-file.zip",
    fileType: file.type || "application/octet-stream",
    url: "https://example.com/files/demo-download"
  };

  demoState.demoPushes = [push, ...(demoState.demoPushes || [])];
  demoState.status.lastPushSyncAt = Date.now();
  demoState.status.lastPushCount = demoState.demoPushes.length;
  return clone(push);
}

export function removeDemoNotification(demoState, id) {
  demoState.mirroredNotifications = (demoState.mirroredNotifications || []).filter((notification) => notification.id !== id);
}

export function clearDemoNotifications(demoState) {
  const count = (demoState.mirroredNotifications || []).length;
  demoState.mirroredNotifications = [];
  return { cleared: count };
}

export async function isDemoModeEnabled() {
  const stored = await chrome.storage.local.get(DEMO_MODE_KEY);
  return stored[DEMO_MODE_KEY] === true;
}

export async function syncDemoModeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("demo")) {
    return isDemoModeEnabled();
  }

  const enabled = params.get("demo") !== "0";
  if (enabled) {
    await chrome.storage.local.set({ [DEMO_MODE_KEY]: true });
  } else {
    await chrome.storage.local.remove(DEMO_MODE_KEY);
  }
  return enabled;
}

function notePush(iden, created, sourceName, sourceDeviceIden, targetName, targetDeviceIden, direction, body) {
  return basePush(iden, created, sourceName, sourceDeviceIden, targetName, targetDeviceIden, direction, {
    type: "note",
    body
  });
}

function linkPush(iden, created, sourceName, sourceDeviceIden, targetName, targetDeviceIden, direction, title, url, imageUrl = "") {
  return basePush(iden, created, sourceName, sourceDeviceIden, targetName, targetDeviceIden, direction, {
    type: "link",
    title,
    url,
    imageUrl
  });
}

function filePush(iden, created, sourceName, sourceDeviceIden, targetName, targetDeviceIden, direction, fileName, fileType, url = "https://example.com/files/demo-download", imageUrl = "") {
  return basePush(iden, created, sourceName, sourceDeviceIden, targetName, targetDeviceIden, direction, {
    type: "file",
    fileName,
    fileType,
    url,
    imageUrl
  });
}

function basePush(iden, created, sourceName, sourceDeviceIden, targetName, targetDeviceIden, direction, values) {
  return {
    iden,
    created,
    modified: created,
    active: true,
    dismissed: false,
    direction,
    sourceName,
    sourceDeviceIden,
    targetName,
    targetDeviceIden,
    detail: direction === "broadcast" ? `From ${sourceName}` : `To ${targetName}`,
    ...values
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
