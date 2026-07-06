import {
  createDevice,
  createEphemeral,
  createPush,
  deleteDevice,
  deletePush,
  getDevices,
  getMe,
  getPushPage,
  getPushes,
  finishUpload,
  normalizeToken,
  requestUpload,
  redactToken,
  updateDevice,
  updatePush
} from "./shared/api.js";

import {
  PUSHBULLET_OAUTH_CLIENT_ID,
  PUSHBULLET_OAUTH_REDIRECT_PATH
} from "./shared/config.js";

import {
  buildContextMenuItems,
  buildContextMenuPush,
  parseContextMenuTargetId
} from "./shared/context-menu.js";

import {
  findOldBulletBridgeDevices
} from "./shared/device-cleanup.js";

import {
  findMirroredNotificationIds,
  makeMirrorNotificationId
} from "./shared/mirrored-notifications.js";

import {
  DEFAULT_SETTINGS,
  STORE_KEYS,
  forgetNotification,
  getNotificationMap,
  getSettings,
  getStatus,
  getStorage,
  getSuppressedPushes,
  rememberNotification,
  removeStorage,
  setStatus,
  setStorage,
  suppressPush,
  updateSettings
} from "./shared/storage.js";

const ALARM_NAME = "bullet-bridge-maintenance";
const MAINTENANCE_ALARM_PERIOD_MINUTES = 1;
const RECONNECT_DELAY_MS = 15000;
const MAX_SHOWN_PUSHES_PER_SYNC = 10;
const NOTIFICATION_ICON = "icons/icon-128.png";
const LOCAL_DEVICE_PREFIX = "Bullet Bridge";
const FILE_TRANSFER_CHANNEL = "bullet-bridge-file-transfer";
const FILE_TRANSFER_TIMEOUT_MS = 60000;
const OAUTH_AUTHORIZE_URL = "https://www.pushbullet.com/authorize";

let socket = null;
let reconnectTimer = null;
let syncInProgress = false;
let fileTransferChannel = null;
const pendingFileTransfers = new Map();

chrome.runtime.onInstalled.addListener(() => {
  installContextMenus().catch(console.error);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: MAINTENANCE_ALARM_PERIOD_MINUTES });
  refreshBadge().catch(console.error);
  ensureConnected();
});

chrome.runtime.onStartup.addListener(() => {
  installContextMenus().catch(console.error);
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: MAINTENANCE_ALARM_PERIOD_MINUTES });
  refreshBadge().catch(console.error);
  ensureConnected();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    ensureConnected();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      console.error(error);
      sendResponse({ ok: false, error: error.message || String(error) });
    });

  return true;
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  sendFromContextMenu(info, tab).catch(async (error) => {
    console.error(error);
    await showSystemNotification("context-error", "Push failed", error.message || String(error));
  });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  handleNotificationClicked(notificationId).catch(console.error);
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  handleNotificationButtonClicked(notificationId, buttonIndex).catch(console.error);
});

chrome.notifications.onClosed.addListener((notificationId, byUser) => {
  handleNotificationClosed(notificationId, byUser).catch(console.error);
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "getState":
      return getState();
    case "saveToken":
      return saveToken(message.token);
    case "saveOAuthClientId":
      return saveOAuthClientId(message.clientId);
    case "startOAuth":
      return startOAuth(message.clientId);
    case "clearToken":
      return clearToken();
    case "refreshDevices":
      return refreshDevices();
    case "cleanupOldDevices":
      return cleanupOldDevices();
    case "saveSettings":
      return saveSettings(message.settings || {});
    case "sendPush":
      return sendPush(message.push || {});
    case "deletePush":
      return deleteStoredPush(message.pushIden);
    case "getPushPage":
      return getPushPageForUi({
        limit: message.limit || 50,
        cursor: message.cursor || ""
      });
    case "getRecentPushes":
      return getRecentPushes(message.limit || 20);
    case "requestUpload":
      return getUploadRequest(message.fileName, message.fileType, message.fileSize);
    case "finishUpload":
      return finishUploadRequest(message.uploadId);
    case "prepareFilePush":
      return prepareFilePush(message);
    case "completeFilePush":
      return completeFilePush(message.transferId);
    case "getUploadStatus":
      return getUploadStatus();
    case "reconnect":
      return reconnectNow();
    case "clearUnread":
      return clearUnreadBadge();
    case "removeMirroredNotification":
      return removeMirroredNotification(message.id);
    case "clearMirroredNotifications":
      return clearMirroredNotifications();
    case "openUrl":
      return openUrl(message.url);
    case "openOptions":
      return chrome.runtime.openOptionsPage();
    case "getCurrentTab":
      return getCurrentTab();
    default:
      throw new Error("Unknown message.");
  }
}

async function getState() {
  const stored = await getStorage([
    STORE_KEYS.token,
    STORE_KEYS.authMethod,
    STORE_KEYS.oauthClientId,
    STORE_KEYS.me,
    STORE_KEYS.devices,
    STORE_KEYS.localDevice,
    STORE_KEYS.unreadCount,
    STORE_KEYS.cursor,
    STORE_KEYS.uploadStatus,
    STORE_KEYS.mirroredNotifications
  ]);
  const status = await getLiveStatus();

  return {
    hasToken: Boolean(stored[STORE_KEYS.token]),
    tokenPreview: redactToken(stored[STORE_KEYS.token]),
    authMethod: stored[STORE_KEYS.authMethod] || (stored[STORE_KEYS.token] ? "token" : ""),
    oauthAvailable: Boolean(getConfiguredOAuthClientId(stored[STORE_KEYS.oauthClientId])),
    oauthClientId: stored[STORE_KEYS.oauthClientId] || "",
    oauthClientIdBuiltIn: Boolean(PUSHBULLET_OAUTH_CLIENT_ID.trim()),
    oauthRedirectUri: getOAuthRedirectUri(),
    me: stored[STORE_KEYS.me] || null,
    devices: stored[STORE_KEYS.devices] || [],
    localDevice: stored[STORE_KEYS.localDevice] || null,
    unreadCount: Number(stored[STORE_KEYS.unreadCount] || 0),
    settings: await getSettings(),
    status,
    cursor: stored[STORE_KEYS.cursor] || null,
    uploadStatus: stored[STORE_KEYS.uploadStatus] || null,
    mirroredNotifications: stored[STORE_KEYS.mirroredNotifications] || []
  };
}

async function saveOAuthClientId(clientId) {
  const cleanClientId = String(clientId || "").trim();
  if (!cleanClientId) {
    throw new Error("Enter a Pushbullet OAuth client id.");
  }

  await setStorage({ [STORE_KEYS.oauthClientId]: cleanClientId });
  return getState();
}

async function startOAuth(clientId) {
  if (!chrome.identity?.launchWebAuthFlow) {
    throw new Error("This browser does not support Chrome extension OAuth sign-in.");
  }

  const stored = await getStorage(STORE_KEYS.oauthClientId);
  const providedClientId = String(clientId || "").trim();
  const cleanClientId = providedClientId || getConfiguredOAuthClientId(stored[STORE_KEYS.oauthClientId]);
  if (!cleanClientId) {
    throw new Error("Pushbullet OAuth is not configured for this build.");
  }

  if (providedClientId) {
    await setStorage({ [STORE_KEYS.oauthClientId]: providedClientId });
  }

  const redirectUri = getOAuthRedirectUri();
  if (!redirectUri) {
    throw new Error("Unable to create a Chrome extension OAuth redirect URI.");
  }

  const oauthState = createOAuthState();
  const redirectWithState = new URL(redirectUri);
  redirectWithState.searchParams.set("state", oauthState);

  const authUrl = new URL(OAUTH_AUTHORIZE_URL);
  authUrl.searchParams.set("client_id", cleanClientId);
  authUrl.searchParams.set("redirect_uri", redirectWithState.toString());
  authUrl.searchParams.set("response_type", "token");

  const redirectResult = await chrome.identity.launchWebAuthFlow({
    url: authUrl.toString(),
    interactive: true
  });

  if (!redirectResult) {
    throw new Error("Pushbullet OAuth did not return a redirect URL.");
  }

  const accessToken = parseOAuthRedirect(redirectResult, oauthState);
  return saveToken(accessToken, { authMethod: "oauth" });
}

function getOAuthRedirectUri() {
  if (!chrome.identity?.getRedirectURL) {
    return "";
  }

  return chrome.identity.getRedirectURL(PUSHBULLET_OAUTH_REDIRECT_PATH);
}

function getConfiguredOAuthClientId(storedClientId = "") {
  return PUSHBULLET_OAUTH_CLIENT_ID.trim() || String(storedClientId || "").trim();
}

function createOAuthState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseOAuthRedirect(redirectResult, expectedState) {
  const redirectUrl = new URL(redirectResult);
  const fragment = new URLSearchParams((redirectUrl.hash || "").replace(/^#/, ""));
  const error = redirectUrl.searchParams.get("error") || fragment.get("error");
  const errorDescription = redirectUrl.searchParams.get("error_description") || fragment.get("error_description");
  const returnedState = redirectUrl.searchParams.get("state") || fragment.get("state");

  if (returnedState !== expectedState) {
    throw new Error("OAuth state did not match.");
  }

  if (error) {
    throw new Error(`Pushbullet OAuth failed: ${errorDescription || error}.`);
  }

  const accessToken = fragment.get("access_token");
  if (!accessToken) {
    throw new Error("Pushbullet OAuth did not return an access token.");
  }

  return accessToken;
}

async function saveToken(token, options = {}) {
  const cleanToken = normalizeToken(token);
  if (!cleanToken) {
    throw new Error("Enter a Pushbullet access token.");
  }

  await setStatus({
    connected: false,
    lastError: "",
    websocketState: "testing"
  });

  const [me, initialDevices] = await Promise.all([
    getMe(cleanToken),
    getDevices(cleanToken)
  ]);
  const { localDevice, devices } = await ensureLocalDevice(cleanToken, initialDevices);

  await setStorage({
    [STORE_KEYS.token]: cleanToken,
    [STORE_KEYS.authMethod]: options.authMethod || "token",
    [STORE_KEYS.me]: me,
    [STORE_KEYS.devices]: devices,
    [STORE_KEYS.localDevice]: localDevice,
    [STORE_KEYS.settings]: {
      ...DEFAULT_SETTINGS,
      ...(await getSettings())
    }
  });

  await bootstrapPushCursor(cleanToken);
  await installContextMenus();
  await reconnectNow();

  return getState();
}

async function clearToken() {
  closeSocket();
  await removeStorage([
    STORE_KEYS.token,
    STORE_KEYS.authMethod,
    STORE_KEYS.me,
    STORE_KEYS.devices,
    STORE_KEYS.localDevice,
    STORE_KEYS.cursor,
    STORE_KEYS.notificationMap,
    STORE_KEYS.mirroredNotifications,
    STORE_KEYS.suppressedPushes,
    STORE_KEYS.unreadCount,
    STORE_KEYS.uploadStatus
  ]);
  await refreshBadge();
  await setStatus({
    connected: false,
    lastError: "",
    websocketState: "idle"
  });
  await installContextMenus();
  return getState();
}

async function refreshDevices() {
  const token = await requireToken();
  const initialDevices = await getDevices(token);
  const { localDevice, devices } = await ensureLocalDevice(token, initialDevices);
  await setStorage({
    [STORE_KEYS.devices]: devices,
    [STORE_KEYS.localDevice]: localDevice
  });
  await installContextMenus();
  return getState();
}

async function cleanupOldDevices() {
  const token = await requireToken();
  const stored = await getStorage(STORE_KEYS.localDevice);
  const initialDevices = await getDevices(token);
  const currentLocalDevice = stored[STORE_KEYS.localDevice]?.iden
    ? initialDevices.find((device) => device.iden === stored[STORE_KEYS.localDevice].iden && device.active !== false)
    : null;
  const { localDevice } = currentLocalDevice
    ? { localDevice: currentLocalDevice }
    : await ensureLocalDevice(token, initialDevices);
  const oldDevices = findOldBulletBridgeDevices(initialDevices, localDevice);

  await Promise.all(oldDevices.map((device) => (
    deleteDevice(token, device.iden)
  )));

  const activeDevices = await getDevices(token);
  const activeLocalDevice = activeDevices.find((device) => device.iden === localDevice.iden) || localDevice;
  await setStorage({
    [STORE_KEYS.devices]: activeDevices,
    [STORE_KEYS.localDevice]: activeLocalDevice
  });
  await installContextMenus();

  return {
    removed: oldDevices.length,
    state: await getState()
  };
}

async function saveSettings(settingsPatch) {
  const settings = await updateSettings(settingsPatch);
  return { settings };
}

async function sendPush(rawPush) {
  const token = await requireToken();
  const push = sanitizePush(rawPush);
  const stored = await getStorage(STORE_KEYS.localDevice);
  if (stored[STORE_KEYS.localDevice]?.iden) {
    push.source_device_iden = stored[STORE_KEYS.localDevice].iden;
  }

  const result = await createPush(token, push);
  await suppressPush(result.iden);
  return result;
}

async function getRecentPushes(limit = 20) {
  const page = await getPushPageForUi({ limit });
  return page.pushes;
}

async function getPushPageForUi(options = {}) {
  const token = await requireToken();
  const stored = await getStorage([
    STORE_KEYS.localDevice,
    STORE_KEYS.devices
  ]);
  const localDeviceIden = stored[STORE_KEYS.localDevice]?.iden || "";
  const devices = stored[STORE_KEYS.devices] || [];
  const deviceMap = Object.fromEntries(devices.map((device) => [device.iden, device]));
  const page = await getPushPage(token, {
    limit: Math.min(Math.max(Number(options.limit) || 50, 1), 100),
    modifiedAfter: 0,
    cursor: options.cursor || ""
  });

  return {
    pushes: page.pushes
      .filter((push) => push.active !== false)
      .map((push) => serializePushForUi(push, localDeviceIden, deviceMap)),
    cursor: page.cursor,
    hasMore: Boolean(page.cursor)
  };
}

async function getUploadRequest(fileName, fileType, fileSize) {
  const name = String(fileName || "").trim();
  if (!name) {
    throw new Error("Select a file first.");
  }

  const token = await requireToken();
  return requestUpload(token, name, String(fileType || "").trim() || "application/octet-stream", fileSize);
}

async function finishUploadRequest(uploadId) {
  const id = String(uploadId || "").trim();
  if (!id) {
    throw new Error("Upload id is missing.");
  }

  const token = await requireToken();
  return finishUpload(token, id);
}

async function prepareFilePush(message = {}) {
  const transferId = String(message.transferId || "").trim();
  if (!transferId) {
    throw new Error("File transfer id is missing.");
  }

  if (pendingFileTransfers.has(transferId)) {
    cleanupFileTransfer(transferId);
  }

  ensureFileTransferChannel();

  const pending = createPendingFileTransfer(transferId, message.push || {});
  pendingFileTransfers.set(transferId, pending);

  await saveUploadStatus({
    state: "waiting",
    progress: 0,
    transferId,
    fileName: "",
    message: "Choose a file.",
    error: ""
  });

  return { transferId };
}

async function completeFilePush(transferId) {
  const id = String(transferId || "").trim();
  const pending = pendingFileTransfers.get(id);
  if (!pending) {
    throw new Error("File transfer was not prepared.");
  }

  try {
    const file = await pending.filePromise;
    const fileName = pending.fileName || file.name || "upload";
    const fileType = pending.fileType || file.type || "application/octet-stream";
    const fileSize = Number(pending.fileSize || file.size || 0);

    await saveUploadStatus({
      state: "preparing",
      progress: 2,
      transferId: id,
      fileName,
      message: "Preparing upload.",
      error: ""
    });

    const filePush = await uploadFileForPush(file, {
      fileName,
      fileType,
      fileSize,
      transferId: id
    });

    const result = await sendPush({
      ...pending.push,
      type: "file",
      ...filePush
    });

    await saveUploadStatus({
      state: "idle",
      progress: 0,
      transferId: "",
      fileName: "",
      message: "",
      error: "",
      completedAt: new Date().toISOString()
    });

    return result;
  } catch (error) {
    const message = error.message || String(error);
    await saveUploadStatus({
      state: "failed",
      progress: 0,
      transferId: id,
      message,
      error: message,
      completedAt: new Date().toISOString()
    });
    await showSystemNotification(`file-error-${Date.now()}`, "File push failed", message);
    throw error;
  } finally {
    cleanupFileTransfer(id);
  }
}

function createPendingFileTransfer(transferId, push) {
  let resolveFile;
  let rejectFile;
  const filePromise = new Promise((resolve, reject) => {
    resolveFile = resolve;
    rejectFile = reject;
  });

  const timer = setTimeout(() => {
    cleanupFileTransfer(transferId);
    rejectFile(new Error("File selection timed out."));
  }, FILE_TRANSFER_TIMEOUT_MS);

  return {
    push,
    fileName: "",
    fileType: "",
    fileSize: 0,
    filePromise,
    resolveFile,
    rejectFile,
    timer
  };
}

function ensureFileTransferChannel() {
  if (fileTransferChannel) {
    return;
  }

  if (typeof BroadcastChannel === "undefined") {
    throw new Error("This browser does not support extension file transfer channels.");
  }

  fileTransferChannel = new BroadcastChannel(FILE_TRANSFER_CHANNEL);
  fileTransferChannel.onmessage = (event) => {
    const data = event.data || {};
    if (data.type !== "file-transfer") {
      return;
    }

    const pending = pendingFileTransfers.get(data.transferId);
    if (!pending) {
      return;
    }

    if (!data.file || typeof data.file.slice !== "function") {
      pending.rejectFile(new Error("The selected file could not be transferred."));
      cleanupFileTransfer(data.transferId);
      return;
    }

    pending.fileName = String(data.fileName || data.file.name || "upload");
    pending.fileType = String(data.fileType || data.file.type || "application/octet-stream");
    pending.fileSize = Number(data.fileSize || data.file.size || 0);
    pending.resolveFile(data.file);
  };
}

function cleanupFileTransfer(transferId) {
  const pending = pendingFileTransfers.get(transferId);
  if (pending?.timer) {
    clearTimeout(pending.timer);
  }
  pendingFileTransfers.delete(transferId);
}

async function uploadFileForPush(file, metadata) {
  const token = await requireToken();
  const upload = await requestUpload(token, metadata.fileName, metadata.fileType, metadata.fileSize);

  if (upload.upload_type === "multipart" || upload.upload_url) {
    return uploadMultipartFile(upload, file, metadata);
  }

  return uploadChunkedFile(upload, file, metadata);
}

async function uploadChunkedFile(upload, file, metadata) {
  if (!upload.id || !Array.isArray(upload.piece_urls) || !upload.piece_urls.length || !upload.piece_size) {
    throw new Error("Pushbullet did not return a complete upload request.");
  }

  const totalBytes = Math.max(metadata.fileSize || file.size || 0, 1);
  let offset = 0;
  let completedBytes = 0;

  for (const [index, pieceUrl] of upload.piece_urls.entries()) {
    const parsedUrl = new URL(pieceUrl);
    if (parsedUrl.protocol !== "https:") {
      throw new Error(`Pushbullet returned an unsafe upload URL: ${parsedUrl.protocol}`);
    }

    const nextOffset = Math.min(offset + upload.piece_size, metadata.fileSize || file.size || 0);
    const piece = file.slice(offset, nextOffset);
    const progress = Math.min(96, 4 + (completedBytes / totalBytes) * 92);

    await saveUploadStatus({
      state: "uploading",
      progress,
      transferId: metadata.transferId,
      fileName: metadata.fileName,
      message: `Uploading ${index + 1}/${upload.piece_urls.length}.`,
      error: ""
    });

    const response = await fetch(pieceUrl, {
      method: "POST",
      body: piece
    });

    if (!response.ok) {
      throw new Error(`File upload failed with HTTP ${response.status}.`);
    }

    completedBytes += piece.size;
    offset = nextOffset;

    await saveUploadStatus({
      state: "uploading",
      progress: Math.min(96, 4 + (completedBytes / totalBytes) * 92),
      transferId: metadata.transferId,
      fileName: metadata.fileName,
      message: `Uploaded ${index + 1}/${upload.piece_urls.length}.`,
      error: ""
    });
  }

  await saveUploadStatus({
    state: "finalizing",
    progress: 97,
    transferId: metadata.transferId,
    fileName: metadata.fileName,
    message: "Finalizing upload.",
    error: ""
  });

  const token = await requireToken();
  const finished = await finishUpload(token, upload.id);
  if (!finished.file_url) {
    throw new Error("Pushbullet did not return a file URL after upload.");
  }

  return {
    file_name: finished.file_name || metadata.fileName,
    file_type: finished.file_type || metadata.fileType,
    file_url: finished.file_url
  };
}

async function uploadMultipartFile(upload, file, metadata) {
  if (!upload.upload_url || !upload.file_url || !upload.data || typeof upload.data !== "object") {
    throw new Error("Pushbullet did not return a complete upload request.");
  }

  const parsedUrl = new URL(upload.upload_url);
  if (parsedUrl.protocol !== "https:") {
    throw new Error(`Pushbullet returned an unsafe upload URL: ${parsedUrl.protocol}`);
  }

  const formData = new FormData();
  for (const [key, value] of Object.entries(upload.data)) {
    formData.append(key, value);
  }
  formData.append("file", file, metadata.fileName);

  await saveUploadStatus({
    state: "uploading",
    progress: 50,
    transferId: metadata.transferId,
    fileName: metadata.fileName,
    message: "Uploading file.",
    error: ""
  });

  const response = await fetch(upload.upload_url, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`File upload failed with HTTP ${response.status}.`);
  }

  return {
    file_name: upload.file_name || metadata.fileName,
    file_type: upload.file_type || metadata.fileType,
    file_url: upload.file_url
  };
}

async function getUploadStatus() {
  const stored = await getStorage(STORE_KEYS.uploadStatus);
  return stored[STORE_KEYS.uploadStatus] || null;
}

async function saveUploadStatus(patch) {
  const next = {
    ...(await getUploadStatus()),
    ...patch,
    updatedAt: new Date().toISOString()
  };
  await setStorage({ [STORE_KEYS.uploadStatus]: next });
  await updateUploadBadge(next);
  return next;
}

async function updateUploadBadge(uploadStatus) {
  if (["preparing", "uploading", "finalizing"].includes(uploadStatus.state)) {
    const progress = Math.max(0, Math.min(99, Math.round(uploadStatus.progress || 0)));
    await chrome.action.setBadgeBackgroundColor({ color: "#1f8f4d" });
    await chrome.action.setBadgeText({ text: progress ? `${progress}%` : "UP" });
    return;
  }

  if (uploadStatus.state === "failed") {
    await chrome.action.setBadgeBackgroundColor({ color: "#d9480f" });
    await chrome.action.setBadgeText({ text: "!" });
    return;
  }

  await refreshBadge();
}

async function reconnectNow() {
  closeSocket();
  await ensureConnected({ force: true });
  return getStatus();
}

async function openUrl(url) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
    throw new Error("Only HTTP and HTTPS links can be opened.");
  }

  await chrome.tabs.create({ url: cleanUrl });
}

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0] || {};
  return {
    title: tab.title || "",
    url: tab.url || ""
  };
}

async function requireToken() {
  const stored = await getStorage(STORE_KEYS.token);
  const token = normalizeToken(stored[STORE_KEYS.token]);
  if (!token) {
    throw new Error("Pushbullet token is not configured.");
  }
  return token;
}

function sanitizePush(rawPush) {
  const type = rawPush.type || "note";
  const title = String(rawPush.title || "").trim();
  const body = String(rawPush.body || "").trim();
  const url = String(rawPush.url || "").trim();
  const fileName = String(rawPush.file_name || "").trim();
  const fileType = String(rawPush.file_type || "").trim();
  const fileUrl = String(rawPush.file_url || "").trim();
  const deviceIden = String(rawPush.device_iden || "").trim();

  if (!["note", "link", "file"].includes(type)) {
    throw new Error("This extension currently supports note, link, and file pushes.");
  }

  if (type === "link" && !url) {
    throw new Error("A link push needs a URL.");
  }

  if (type === "note" && !title && !body) {
    throw new Error("A note push needs a title or message.");
  }

  if (type === "file" && (!fileName || !fileType || !fileUrl)) {
    throw new Error("A file push needs an uploaded file.");
  }

  const push = { type };

  if (title) {
    push.title = title;
  }
  if (body) {
    push.body = body;
  }
  if (url) {
    push.url = url;
  }
  if (fileName) {
    push.file_name = fileName;
  }
  if (fileType) {
    push.file_type = fileType;
  }
  if (fileUrl) {
    push.file_url = fileUrl;
  }
  if (deviceIden) {
    push.device_iden = deviceIden;
  }

  return push;
}

async function installContextMenus() {
  const stored = await getStorage([
    STORE_KEYS.token,
    STORE_KEYS.devices
  ]);

  await removeAllContextMenus();

  if (!normalizeToken(stored[STORE_KEYS.token])) {
    return;
  }

  const items = buildContextMenuItems(stored[STORE_KEYS.devices] || []);
  for (const item of items) {
    await createContextMenuItem(item);
  }
}

async function sendFromContextMenu(info, tab) {
  const target = parseContextMenuTargetId(info.menuItemId);
  if (!target) {
    return;
  }

  const push = buildContextMenuPush(target.action, info, tab, target.deviceIden);
  await sendPush(push);
}

function removeAllContextMenus() {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      resolve();
    });
  });
}

function createContextMenuItem(item) {
  return new Promise((resolve) => {
    chrome.contextMenus.create(item, () => {
      if (chrome.runtime.lastError) {
        console.warn("Unable to create context menu item.", chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

async function ensureConnected(options = {}) {
  const token = await getConfiguredToken();
  if (!token) {
    return;
  }

  const stored = await getStorage(STORE_KEYS.localDevice);
  const storedDevice = stored[STORE_KEYS.localDevice];
  if (!storedDevice || options.force || hasLegacyLocalDeviceName(storedDevice)) {
    await ensureLocalDeviceRegistered(token);
  }

  if (!options.force && socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(socket.readyState)) {
    if (socket.readyState === WebSocket.OPEN) {
      await setStatus({
        connected: true,
        lastError: "",
        websocketState: "open"
      });
    }
    return;
  }

  connectWebSocket(token);
}

async function getLiveStatus() {
  const status = await getStatus();
  if (!socket) {
    return status;
  }

  if (socket.readyState === WebSocket.OPEN) {
    return {
      ...status,
      connected: true,
      lastError: "",
      websocketState: "open"
    };
  }

  if (socket.readyState === WebSocket.CONNECTING) {
    return {
      ...status,
      connected: false,
      websocketState: "connecting"
    };
  }

  return status;
}

async function getConfiguredToken() {
  const stored = await getStorage(STORE_KEYS.token);
  return normalizeToken(stored[STORE_KEYS.token]);
}

function connectWebSocket(token) {
  closeSocket();

  setStatus({
    connected: false,
    lastError: "",
    websocketState: "connecting"
  }).catch(console.error);

  socket = new WebSocket(`wss://stream.pushbullet.com/websocket/${encodeURIComponent(token)}`);

  socket.addEventListener("open", () => {
    setStatus({
      connected: true,
      lastConnectedAt: new Date().toISOString(),
      lastError: "",
      websocketState: "open"
    }).catch(console.error);
  });

  socket.addEventListener("message", (event) => {
    handleStreamMessage(event.data).catch(console.error);
  });

  socket.addEventListener("error", () => {
    setStatus({
      connected: false,
      lastError: "WebSocket connection error.",
      websocketState: "error"
    }).catch(console.error);
  });

  socket.addEventListener("close", () => {
    socket = null;
    setStatus({
      connected: false,
      websocketState: "closed"
    }).catch(console.error);
    scheduleReconnect();
  });
}

function closeSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (socket) {
    const existing = socket;
    socket = null;
    existing.close();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureConnected().catch(console.error);
  }, RECONNECT_DELAY_MS);
}

async function handleStreamMessage(rawData) {
  const data = JSON.parse(rawData);
  await setStatus({
    lastStreamEventAt: new Date().toISOString(),
    lastStreamEventType: [data.type, data.subtype].filter(Boolean).join(":")
  });

  if (data.type === "nop") {
    return;
  }

  if (data.type === "tickle" && data.subtype === "push") {
    await syncPushes();
    return;
  }

  if (data.type === "push" && data.push) {
    await handleEphemeralPush(data.push);
  }
}

async function bootstrapPushCursor(token) {
  const pushes = await getPushes(token, { limit: 1, modifiedAfter: 0 });
  const latestModified = pushes.reduce((max, push) => Math.max(max, Number(push.modified || 0)), 0);
  await setStorage({
    [STORE_KEYS.cursor]: {
      modifiedAfter: latestModified || Date.now() / 1000,
      bootstrappedAt: new Date().toISOString()
    }
  });
}

async function syncPushes() {
  if (syncInProgress) {
    return;
  }

  syncInProgress = true;

  try {
    const token = await requireToken();
    const stored = await getStorage(STORE_KEYS.cursor);
    const cursor = stored[STORE_KEYS.cursor] || {};
    const modifiedAfter = Number(cursor.modifiedAfter || 0);

    if (!modifiedAfter) {
      await bootstrapPushCursor(token);
      return;
    }

    const pushes = await getPushes(token, {
      limit: 25,
      modifiedAfter
    });
    await setStatus({
      lastPushSyncAt: new Date().toISOString(),
      lastPushCount: pushes.length
    });

    const latestModified = pushes.reduce((max, push) => Math.max(max, Number(push.modified || 0)), modifiedAfter);
    if (latestModified > modifiedAfter) {
      await setStorage({
        [STORE_KEYS.cursor]: {
          modifiedAfter: latestModified,
          syncedAt: new Date().toISOString()
        }
      });
    }

    const settings = await getSettings();
    if (!settings.showPushNotifications) {
      return;
    }

    const localStored = await getStorage(STORE_KEYS.localDevice);
    const localDeviceIden = localStored[STORE_KEYS.localDevice]?.iden || "";
    const suppressed = await getSuppressedPushes();
    const visiblePushes = pushes
      .filter((push) => push.active !== false)
      .filter((push) => !push.dismissed)
      .filter((push) => shouldNotifyForPush(push, localDeviceIden))
      .filter((push) => !suppressed[push.iden])
      .sort((a, b) => Number(a.modified || 0) - Number(b.modified || 0))
      .slice(-MAX_SHOWN_PUSHES_PER_SYNC);

    for (const push of visiblePushes) {
      await notifyStoredPush(push);
    }

    if (visiblePushes.length) {
      await setStatus({
        lastReceivedPushAt: new Date().toISOString()
      });
    }
  } finally {
    syncInProgress = false;
  }
}

async function handleEphemeralPush(push) {
  if (push.type === "dismissal") {
    const notificationIds = await findStoredMirroredNotificationIds(push);
    await Promise.all(notificationIds.map((notificationId) => (
      removeMirroredNotificationRecord(notificationId, {
        clearSystemNotification: true,
        decrementBadge: true
      })
    )));
    return;
  }

  if (push.type !== "mirror") {
    return;
  }

  const settings = await getSettings();
  if (!settings.showMirroredNotifications) {
    return;
  }

  if (!isMirrorDismissable(push) && push.body === undefined && push.title === undefined) {
    return;
  }

  const notificationId = makeMirrorNotificationId(push);
  const notificationMap = await getNotificationMap();
  const alreadyCounted = Boolean(notificationMap[notificationId]?.badgeCounted);

  if (push.dismissed) {
    const notificationIds = await findStoredMirroredNotificationIds(push);
    await Promise.all((notificationIds.length ? notificationIds : [notificationId]).map((id) => (
      removeMirroredNotificationRecord(id, {
        clearSystemNotification: true,
        decrementBadge: true
      })
    )));
    return;
  }

  const appName = push.application_name || "Android";
  const title = push.title || appName;
  const message = push.body || appName;
  const buttonActions = isMirrorDismissable(push) ? ["dismiss"] : [];
  const notificationOptions = {
    type: "basic",
    iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
    title,
    message,
    contextMessage: appName,
    priority: 1
  };
  if (buttonActions.length) {
    notificationOptions.buttons = buttonActions.map((action) => ({ title: labelForNotificationAction(action) }));
  }

  await rememberMirroredNotification(notificationId, push);

  await chrome.notifications.create(notificationId, notificationOptions);

  await rememberNotification(notificationId, {
    kind: "mirror",
    url: push.url || "",
    buttonActions,
    packageName: push.package_name || "",
    sourceUserIden: push.source_user_iden || push.sender_iden || push.receiver_iden || "",
    notificationId: push.notification_id ?? "",
    notificationTag: push.notification_tag ?? null,
    dismissable: isMirrorDismissable(push),
    badgeCounted: true,
    createdAt: new Date().toISOString()
  });
  if (!alreadyCounted) {
    await incrementUnreadBadge();
  }
}

async function rememberMirroredNotification(notificationId, push) {
  const stored = await getStorage([
    STORE_KEYS.mirroredNotifications,
    STORE_KEYS.devices
  ]);
  const notifications = stored[STORE_KEYS.mirroredNotifications] || [];
  const devices = stored[STORE_KEYS.devices] || [];
  const deviceMap = Object.fromEntries(devices.map((device) => [device.iden, device]));
  const sourceDevice = deviceDisplayName(deviceMap[push.source_device_iden]) || push.source_device_iden || "Android";
  const now = Date.now() / 1000;
  const entry = {
    id: notificationId,
    title: push.title || push.application_name || "Android",
    body: push.body || "",
    appName: push.application_name || "Android",
    packageName: push.package_name || "",
    sourceUserIden: push.source_user_iden || push.sender_iden || push.receiver_iden || "",
    sourceDeviceIden: push.source_device_iden || "",
    notificationId: push.notification_id ?? "",
    notificationTag: push.notification_tag ?? null,
    dismissable: isMirrorDismissable(push),
    sourceDevice,
    url: push.url || "",
    created: Number(push.created || push.notification_created || now),
    receivedAt: now,
    dismissed: false
  };

  await setStorage({
    [STORE_KEYS.mirroredNotifications]: [
      entry,
      ...notifications.filter((item) => item.id !== notificationId)
    ].slice(0, 100)
  });
}

async function findStoredMirroredNotificationIds(push) {
  const stored = await getStorage(STORE_KEYS.mirroredNotifications);
  const notifications = stored[STORE_KEYS.mirroredNotifications] || [];
  return findMirroredNotificationIds(push, notifications);
}

async function removeMirroredNotificationRecord(notificationId, options = {}) {
  const id = String(notificationId || "").trim();
  if (!id) {
    return { id: "", removed: false };
  }

  const stored = await getStorage([
    STORE_KEYS.notificationMap,
    STORE_KEYS.mirroredNotifications
  ]);
  const notificationMap = stored[STORE_KEYS.notificationMap] || {};
  const notifications = stored[STORE_KEYS.mirroredNotifications] || [];
  const details = notificationMap[id] || null;
  const notification = notifications.find((item) => item.id === id) || null;

  if (details) {
    delete notificationMap[id];
  }

  await setStorage({
    [STORE_KEYS.notificationMap]: notificationMap,
    [STORE_KEYS.mirroredNotifications]: notifications.filter((item) => item.id !== id)
  });

  if (options.clearSystemNotification !== false) {
    await chrome.notifications.clear(id);
  }

  if (options.decrementBadge && (details?.badgeCounted || notification?.dismissed === false)) {
    await decrementUnreadBadge();
  }

  return {
    id,
    removed: Boolean(details || notification)
  };
}

async function removeMirroredNotification(notificationId) {
  const id = String(notificationId || "").trim();
  if (!id) {
    throw new Error("Notification id is missing.");
  }

  await removeMirroredNotificationRecord(id, {
    clearSystemNotification: true,
    decrementBadge: false
  });
  return { id };
}

async function clearMirroredNotifications() {
  const stored = await getStorage(STORE_KEYS.mirroredNotifications);
  const notifications = stored[STORE_KEYS.mirroredNotifications] || [];
  await Promise.all(notifications.map(async (notification) => {
    if (!notification.id) {
      return;
    }
    await chrome.notifications.clear(notification.id);
    await forgetNotification(notification.id);
  }));
  await setStorage({ [STORE_KEYS.mirroredNotifications]: [] });
  return { cleared: notifications.length };
}

async function notifyStoredPush(push) {
  const title = push.title || titleForPush(push);
  const message = push.body || push.url || "Push received.";
  const url = push.url || push.file_url || "";
  const notificationId = `push-${push.iden || Date.now()}`;
  const notificationMap = await getNotificationMap();
  const alreadyCounted = Boolean(notificationMap[notificationId]?.badgeCounted);
  const buttonActions = url ? ["open", "dismiss"] : ["dismiss"];
  const notificationOptions = {
    type: "basic",
    iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
    title,
    message,
    contextMessage: "Pushbullet",
    priority: 1,
    buttons: buttonActions.map((action) => ({ title: labelForNotificationAction(action) }))
  };

  await chrome.notifications.create(notificationId, notificationOptions);

  await rememberNotification(notificationId, {
    kind: "push",
    pushIden: push.iden || "",
    url,
    buttonActions,
    badgeCounted: true,
    createdAt: new Date().toISOString()
  });
  if (!alreadyCounted) {
    await incrementUnreadBadge();
  }
}

function titleForPush(push) {
  if (push.type === "link") {
    return "Link received";
  }
  if (push.type === "file") {
    return "File received";
  }
  return "Push received";
}

function labelForNotificationAction(action) {
  if (action === "open") {
    return "Open";
  }

  return "Dismiss";
}

function isMirrorDismissable(push) {
  return push.dismissable !== false && push.dismissible !== false;
}

function shouldNotifyForPush(push, localDeviceIden) {
  if (!localDeviceIden) {
    return true;
  }

  if (push.source_device_iden === localDeviceIden) {
    return false;
  }

  if (!push.target_device_iden) {
    return true;
  }

  return push.target_device_iden === localDeviceIden;
}

function serializePushForUi(push, localDeviceIden, deviceMap = {}) {
  const created = Number(push.created || push.modified || 0);
  const targetDevice = push.target_device_iden || "";
  const sourceDevice = push.source_device_iden || "";
  let direction = "received";

  if (localDeviceIden && sourceDevice === localDeviceIden) {
    direction = "sent";
  } else if (localDeviceIden && targetDevice === localDeviceIden) {
    direction = "received";
  } else if (!targetDevice) {
    direction = sourceDevice === localDeviceIden ? "sent" : "broadcast";
  }
  const sourceName = deviceDisplayName(deviceMap[sourceDevice]) || push.sender_name || push.sender_email || "";
  const targetName = targetDevice ? deviceDisplayName(deviceMap[targetDevice]) : "All devices";
  const detail = direction === "sent"
    ? `To ${targetName || "unknown device"}`
    : direction === "broadcast"
      ? "To all devices"
      : sourceName
        ? `From ${sourceName}`
        : "Received";

  return {
    iden: push.iden || "",
    type: push.type || "note",
    title: push.title || push.file_name || "",
    body: push.body || "",
    url: push.url || push.file_url || "",
    imageUrl: push.image_url || "",
    fileName: push.file_name || "",
    fileType: push.file_type || "",
    created,
    direction,
    detail,
    sourceName,
    targetName,
    sourceDeviceIden: sourceDevice,
    targetDeviceIden: targetDevice,
    senderName: push.sender_name || push.sender_email || "",
    receiverEmail: push.receiver_email || ""
  };
}

function deviceDisplayName(device) {
  if (!device) {
    return "";
  }

  return device.nickname || device.manufacturer || device.model || device.type || "";
}

async function showSystemNotification(id, title, message) {
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL(NOTIFICATION_ICON),
    title,
    message,
    priority: 0
  });
}

async function handleNotificationClicked(notificationId) {
  const details = await consumeNotification(notificationId);
  if (!details?.url) {
    return;
  }

  const settings = await getSettings();
  if (settings.openLinksOnNotificationClick) {
    await openNotificationDetails(details);
    await dismissNotificationDetails(details, notificationId);
  }
}

async function handleNotificationButtonClicked(notificationId, buttonIndex) {
  const map = await getNotificationMap();
  const details = map[notificationId];
  const action = details?.buttonActions?.[buttonIndex] || "";
  if (!details || !action) {
    return;
  }

  await consumeNotification(notificationId);

  if (action === "open") {
    await openNotificationDetails(details);
    await dismissNotificationDetails(details, notificationId);
    return;
  }

  if (action === "dismiss") {
    await dismissNotificationDetails(details, notificationId);
  }
}

async function handleNotificationClosed(notificationId, byUser) {
  if (byUser) {
    const settings = await getSettings();
    if (settings.closeNotificationsAsDismiss) {
      const details = await consumeNotification(notificationId, { clear: false });
      await dismissNotificationDetails(details, notificationId);
      return;
    }
  }

  await takeNotificationDetails(notificationId);
}

async function consumeNotification(notificationId, options = {}) {
  const details = await takeNotificationDetails(notificationId);
  if (options.clear !== false) {
    await chrome.notifications.clear(notificationId);
  }

  if (details?.badgeCounted && options.decrementBadge !== false) {
    await decrementUnreadBadge();
  }

  return details;
}

async function takeNotificationDetails(notificationId) {
  const map = await getNotificationMap();
  const details = map[notificationId] || null;
  if (details) {
    delete map[notificationId];
    await setStorage({ [STORE_KEYS.notificationMap]: map });
  }
  return details;
}

async function openNotificationDetails(details) {
  if (!details?.url) {
    return;
  }

  await openUrl(details.url);
}

async function dismissNotificationDetails(details, notificationId) {
  if (!details) {
    return;
  }

  if (details.kind === "push") {
    await dismissStoredPush(details.pushIden);
    return;
  }

  if (details.kind === "mirror") {
    await dismissMirroredNotification(notificationId, details);
  }
}

async function dismissStoredPush(pushIden) {
  const iden = String(pushIden || "").trim();
  if (!iden) {
    return;
  }

  const token = await requireToken();
  await updatePush(token, iden, { dismissed: true });
  await suppressPush(iden);
}

async function deleteStoredPush(pushIden) {
  const iden = String(pushIden || "").trim();
  if (!iden) {
    throw new Error("Push id is missing.");
  }

  const token = await requireToken();
  await deletePush(token, iden);
  await suppressPush(iden);
  return {
    deleted: true,
    pushIden: iden
  };
}

async function dismissMirroredNotification(notificationId, fallback = null) {
  const stored = await getStorage([
    STORE_KEYS.me,
    STORE_KEYS.mirroredNotifications
  ]);
  const notifications = stored[STORE_KEYS.mirroredNotifications] || [];
  const notification = {
    ...(fallback || {}),
    ...(notifications.find((item) => item.id === notificationId) || {})
  };

  if (notification.dismissable === false) {
    await removeMirroredNotificationRecord(notificationId, {
      clearSystemNotification: true,
      decrementBadge: false
    });
    return;
  }

  const packageName = String(notification.packageName || "").trim();
  const notificationPushId = notification.notificationId;
  const hasNotificationId = notificationPushId !== undefined && notificationPushId !== null && notificationPushId !== "";
  const sourceUserIden = String(notification.sourceUserIden || stored[STORE_KEYS.me]?.iden || "").trim();
  if (!packageName || !hasNotificationId || !sourceUserIden) {
    await removeMirroredNotificationRecord(notificationId, {
      clearSystemNotification: true,
      decrementBadge: false
    });
    return;
  }

  const token = await requireToken();
  await createEphemeral(token, {
    type: "dismissal",
    package_name: packageName,
    notification_id: String(notificationPushId),
    notification_tag: notification.notificationTag ?? null,
    source_user_iden: sourceUserIden
  });
  await removeMirroredNotificationRecord(notificationId, {
    clearSystemNotification: true,
    decrementBadge: false
  });
}

async function getUnreadCount() {
  const stored = await getStorage(STORE_KEYS.unreadCount);
  return Math.max(0, Number(stored[STORE_KEYS.unreadCount] || 0));
}

async function setUnreadCount(count) {
  const unreadCount = Math.max(0, Number(count || 0));
  await setStorage({ [STORE_KEYS.unreadCount]: unreadCount });
  await chrome.action.setBadgeBackgroundColor({ color: "#d9480f" });
  await chrome.action.setBadgeText({
    text: unreadCount ? (unreadCount > 99 ? "99+" : String(unreadCount)) : ""
  });
  return unreadCount;
}

async function incrementUnreadBadge() {
  return setUnreadCount((await getUnreadCount()) + 1);
}

async function decrementUnreadBadge() {
  return setUnreadCount((await getUnreadCount()) - 1);
}

async function clearUnreadBadge() {
  return setUnreadCount(0);
}

async function refreshBadge() {
  return setUnreadCount(await getUnreadCount());
}

async function ensureLocalDeviceRegistered(token) {
  const initialDevices = await getDevices(token);
  const { localDevice, devices } = await ensureLocalDevice(token, initialDevices);
  await setStorage({
    [STORE_KEYS.localDevice]: localDevice,
    [STORE_KEYS.devices]: devices
  });
  return localDevice;
}

function hasLegacyLocalDeviceName(device) {
  return device?.type === "stream" && device.nickname === LOCAL_DEVICE_PREFIX;
}

async function ensureLocalDevice(token, devices) {
  const localDeviceBaseName = await getLocalDeviceBaseName();
  const stored = await getStorage(STORE_KEYS.localDevice);
  const storedDevice = stored[STORE_KEYS.localDevice];
  const activeStoredDevice = storedDevice?.iden
    ? devices.find((device) => device.iden === storedDevice.iden && device.active !== false)
    : null;

  if (activeStoredDevice) {
    const nickname = uniqueLocalDeviceName(devices, localDeviceBaseName, activeStoredDevice.iden);
    const localDevice = await renameLocalDeviceIfNeeded(token, activeStoredDevice, nickname);
    const updatedDevices = replaceDevice(devices, localDevice);

    return {
      localDevice,
      devices: sortDevices(updatedDevices)
    };
  }

  const reusableDevice = findReusableLocalDevice(devices, localDeviceBaseName);
  if (reusableDevice) {
    const localDevice = await renameLocalDeviceIfNeeded(token, reusableDevice, localDeviceBaseName);
    const updatedDevices = replaceDevice(devices, localDevice);

    return {
      localDevice,
      devices: sortDevices(updatedDevices)
    };
  }

  const nickname = uniqueLocalDeviceName(devices, localDeviceBaseName);

  const localDevice = await createDevice(token, {
    nickname,
    type: "stream"
  });

  return {
    localDevice,
    devices: sortDevices([...devices, localDevice])
  };
}

async function renameLocalDeviceIfNeeded(token, device, nickname) {
  if (device.type !== "stream" || device.nickname === nickname) {
    return device;
  }

  try {
    return await updateDevice(token, device.iden, { nickname });
  } catch (error) {
    console.warn("Unable to rename local Pushbullet device.", error);
    return device;
  }
}

function replaceDevice(devices, updatedDevice) {
  return devices.map((device) => device.iden === updatedDevice.iden ? updatedDevice : device);
}

function sortDevices(devices) {
  return [...devices].sort((a, b) => {
    const left = (a.nickname || a.manufacturer || a.type || "").toLowerCase();
    const right = (b.nickname || b.manufacturer || b.type || "").toLowerCase();
    return left.localeCompare(right);
  });
}

async function getLocalDeviceBaseName() {
  const browserName = await detectBrowserName();
  return `${LOCAL_DEVICE_PREFIX} (${browserName || "Browser"})`;
}

function findReusableLocalDevice(devices, baseName) {
  const activeStreamDevices = devices.filter((device) => device.type === "stream" && device.active !== false);
  const exactMatch = activeStreamDevices.find((device) => device.nickname === baseName);
  if (exactMatch) {
    return exactMatch;
  }

  const legacyMatches = activeStreamDevices.filter((device) => device.nickname === LOCAL_DEVICE_PREFIX);
  return legacyMatches.length === 1 ? legacyMatches[0] : null;
}

function uniqueLocalDeviceName(devices, baseName, currentDeviceIden = "") {
  const usedNames = new Set(
    devices
      .filter((device) => device.active !== false && device.iden !== currentDeviceIden)
      .map((device) => String(device.nickname || "").trim().toLowerCase())
      .filter(Boolean)
  );

  if (!usedNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidate = appendDeviceNameSuffix(baseName, index);
    if (!usedNames.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return appendDeviceNameSuffix(baseName, Date.now().toString().slice(-4));
}

function appendDeviceNameSuffix(baseName, suffix) {
  if (baseName.endsWith(")")) {
    return `${baseName.slice(0, -1)} #${suffix})`;
  }

  return `${baseName} #${suffix}`;
}

async function detectBrowserName() {
  if (await isBraveBrowser()) {
    return "Brave";
  }

  const userAgent = globalThis.navigator?.userAgent || "";
  const brands = globalThis.navigator?.userAgentData?.brands || [];
  const brandNames = brands.map((brand) => brand.brand);

  if (brandNames.includes("Microsoft Edge") || /\bEdg\//.test(userAgent)) {
    return "Edge";
  }
  if (brandNames.includes("Opera") || /\b(OPR|Opera)\//.test(userAgent)) {
    return "Opera";
  }
  if (brandNames.includes("Vivaldi") || /\bVivaldi\//.test(userAgent)) {
    return "Vivaldi";
  }
  if (brandNames.includes("Google Chrome")) {
    return "Chrome";
  }
  if (brandNames.includes("Chromium")) {
    return "Chromium";
  }
  if (/\bFirefox\//.test(userAgent)) {
    return "Firefox";
  }
  if (/\bChrome\//.test(userAgent)) {
    return "Chrome";
  }
  if (/\bChromium\//.test(userAgent)) {
    return "Chromium";
  }

  return "Browser";
}

async function isBraveBrowser() {
  try {
    return Boolean(globalThis.navigator?.brave && await globalThis.navigator.brave.isBrave());
  } catch {
    return false;
  }
}

ensureConnected().catch(console.error);
refreshBadge().catch(console.error);
