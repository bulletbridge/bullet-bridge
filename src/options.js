import {
  createDemoState,
  syncDemoModeFromUrl
} from "./shared/demo-data.js";

import {
  findOldBulletBridgeDevices
} from "./shared/device-cleanup.js";

const elements = {
  accountSummary: document.querySelector("#accountSummary"),
  oauthStatusText: document.querySelector("#oauthStatusText"),
  oauthSignInButton: document.querySelector("#oauthSignInButton"),
  tokenInput: document.querySelector("#tokenInput"),
  saveTokenButton: document.querySelector("#saveTokenButton"),
  clearTokenButton: document.querySelector("#clearTokenButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  connectionSummary: document.querySelector("#connectionSummary"),
  lastStreamEvent: document.querySelector("#lastStreamEvent"),
  lastPushSync: document.querySelector("#lastPushSync"),
  localDevice: document.querySelector("#localDevice"),
  connectionError: document.querySelector("#connectionError"),
  reconnectButton: document.querySelector("#reconnectButton"),
  refreshDevicesButton: document.querySelector("#refreshDevicesButton"),
  defaultDeviceSelect: document.querySelector("#defaultDeviceSelect"),
  sendShortcutInputs: [...document.querySelectorAll('input[name="sendShortcut"]')],
  showPushNotifications: document.querySelector("#showPushNotifications"),
  showMirroredNotifications: document.querySelector("#showMirroredNotifications"),
  openLinksOnNotificationClick: document.querySelector("#openLinksOnNotificationClick"),
  closeNotificationsAsDismiss: document.querySelector("#closeNotificationsAsDismiss"),
  encryptionStatus: document.querySelector("#encryptionStatus"),
  encryptionSetupFields: document.querySelector("#encryptionSetupFields"),
  encryptionPasswordInput: document.querySelector("#encryptionPasswordInput"),
  encryptionIssue: document.querySelector("#encryptionIssue"),
  enableEncryptionButton: document.querySelector("#enableEncryptionButton"),
  clearEncryptionButton: document.querySelector("#clearEncryptionButton"),
  cleanupOldDevicesButton: document.querySelector("#cleanupOldDevicesButton"),
  deviceCleanupHint: document.querySelector("#deviceCleanupHint"),
  deviceList: document.querySelector("#deviceList"),
  feedback: document.querySelector("#feedback")
};

let loading = false;
let demoMode = false;
let demoState = null;
let refreshTimer = 0;
const followUpRefreshTimers = new Set();

document.addEventListener("DOMContentLoaded", loadState);
elements.oauthSignInButton.addEventListener("click", signInWithPushbullet);
elements.saveTokenButton.addEventListener("click", saveToken);
elements.clearTokenButton.addEventListener("click", clearToken);
elements.reconnectButton.addEventListener("click", reconnect);
elements.refreshDevicesButton.addEventListener("click", refreshDevices);
elements.cleanupOldDevicesButton.addEventListener("click", cleanupOldDevices);
elements.defaultDeviceSelect.addEventListener("change", saveSettingsFromForm);
for (const input of elements.sendShortcutInputs) {
  input.addEventListener("change", saveSettingsFromForm);
}
elements.showPushNotifications.addEventListener("change", saveSettingsFromForm);
elements.showMirroredNotifications.addEventListener("change", saveSettingsFromForm);
elements.openLinksOnNotificationClick.addEventListener("change", saveSettingsFromForm);
elements.closeNotificationsAsDismiss.addEventListener("change", saveSettingsFromForm);
elements.enableEncryptionButton.addEventListener("click", enableEncryption);
elements.clearEncryptionButton.addEventListener("click", disableEncryption);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (demoMode || areaName !== "local") {
    return;
  }

  if ([
    "authMethod",
    "devices",
    "encryptionIssue",
    "localDevice",
    "me",
    "settings",
    "status",
    "token"
  ].some((key) => changes[key])) {
    scheduleStateRefresh();
  }
});

async function loadState() {
  try {
    demoMode = await syncDemoModeFromUrl();
    demoState = demoMode ? createDemoState() : null;
    const state = await request("getState");
    renderState(state);
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderState(state) {
  const me = state.me;
  const authMethod = state.authMethod === "oauth" ? "OAuth" : "access token";
  elements.accountSummary.textContent = me
    ? `${me.name || me.email || "Pushbullet account"} connected with ${authMethod} (${state.tokenPreview}).`
    : "Not connected.";

  elements.oauthStatusText.textContent = accountStatusText(state);
  setButtonText(elements.oauthSignInButton, me ? "Reconnect with Pushbullet" : "Sign In with Pushbullet");
  elements.oauthSignInButton.classList.toggle("primary", !me);
  elements.oauthSignInButton.classList.toggle("secondary", Boolean(me));
  elements.oauthSignInButton.disabled = !state.oauthAvailable;
  elements.clearTokenButton.disabled = !state.hasToken;

  const connection = connectionState(state.status || {});
  elements.connectionStatus.textContent = connection.label;
  elements.connectionStatus.dataset.state = connection.state;
  elements.connectionSummary.textContent = connection.summary;
  elements.lastStreamEvent.textContent = state.status?.lastStreamEventAt
    ? formatDateTime(state.status.lastStreamEventAt)
    : "No realtime activity yet.";
  elements.lastPushSync.textContent = state.status?.lastPushSyncAt
    ? `${formatDateTime(state.status.lastPushSyncAt)} / ${state.status.lastPushCount || 0} checked`
    : "No history sync yet.";
  elements.localDevice.textContent = state.localDevice?.iden
    ? labelForDevice(state.localDevice)
    : "Not set up yet";
  elements.connectionError.textContent = state.status?.lastError || "";

  const devices = state.devices || [];
  const settings = state.settings || {};

  elements.defaultDeviceSelect.replaceChildren(new Option("All devices", ""));
  for (const device of devices) {
    elements.defaultDeviceSelect.append(new Option(labelForDevice(device), device.iden));
  }

  elements.defaultDeviceSelect.value = settings.defaultDeviceIden || "";
  const sendShortcut = settings.sendShortcut === "enter" ? "enter" : "ctrlEnter";
  for (const input of elements.sendShortcutInputs) {
    input.checked = input.value === sendShortcut;
  }
  elements.showPushNotifications.checked = settings.showPushNotifications !== false;
  elements.showMirroredNotifications.checked = settings.showMirroredNotifications !== false;
  elements.openLinksOnNotificationClick.checked = settings.openLinksOnNotificationClick !== false;
  elements.closeNotificationsAsDismiss.checked = Boolean(settings.closeNotificationsAsDismiss);

  renderEncryptionState(state);

  renderDeviceCleanup(devices, state.localDevice);
  renderDevices(devices, state.localDevice?.iden || "");
}

function renderEncryptionState(state) {
  const encryption = state.encryption || {};
  const connected = Boolean(state.me);
  const issue = encryption.issue?.message || "";
  const needsAttention = Boolean(issue);
  const enabled = Boolean(encryption.enabled);

  elements.encryptionStatus.textContent = needsAttention
    ? "Needs attention"
    : enabled ? "Enabled" : "Not configured";
  elements.encryptionStatus.dataset.state = needsAttention
    ? "offline"
    : enabled ? "online" : "connecting";
  elements.encryptionSetupFields.classList.toggle("hidden", enabled);
  elements.enableEncryptionButton.classList.toggle("hidden", enabled);
  elements.clearEncryptionButton.classList.toggle("hidden", !enabled);
  elements.encryptionPasswordInput.disabled = !connected || enabled;
  elements.enableEncryptionButton.disabled = !connected;
  elements.clearEncryptionButton.disabled = !connected || !enabled;
  setButtonText(elements.enableEncryptionButton, "Enable Encryption");
  elements.encryptionIssue.textContent = issue;
}

function accountStatusText(state) {
  if (state.me && state.authMethod === "oauth") {
    return "Signed in through Pushbullet OAuth.";
  }

  if (state.me) {
    return "Connected with a manual access token.";
  }

  if (state.oauthAvailable) {
    return "Sign in with your Pushbullet account.";
  }

  return "OAuth is not configured for this build. Manual token setup still works.";
}

function connectionState(status) {
  if (status.connected) {
    return {
      state: "online",
      label: "Online",
      summary: status.lastConnectedAt
        ? `Realtime updates active since ${formatDateTime(status.lastConnectedAt)}.`
        : "Realtime updates are active."
    };
  }

  if (status.websocketState === "connecting" || status.websocketState === "testing") {
    return {
      state: "connecting",
      label: "Connecting",
      summary: "Bullet Bridge is trying to reach Pushbullet."
    };
  }

  if (status.websocketState === "error") {
    return {
      state: "offline",
      label: "Needs attention",
      summary: "Realtime updates are not connected."
    };
  }

  return {
    state: "offline",
    label: "Offline",
    summary: "Realtime updates are not connected."
  };
}

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderDevices(devices, localDeviceIden) {
  if (!devices.length) {
    elements.deviceList.replaceChildren(emptyState("No active devices loaded."));
    return;
  }

  elements.deviceList.replaceChildren(
    ...devices.map((device) => {
      const item = document.createElement("article");
      item.className = "device";
      item.append(deviceIconForDevice(device));

      const body = document.createElement("div");
      body.className = "device-body";
      const name = document.createElement("h3");
      name.textContent = device.iden === localDeviceIden
        ? `${labelForDevice(device)} (this browser)`
        : labelForDevice(device);

      const meta = document.createElement("p");
      meta.textContent = descriptionForDevice(device);

      body.append(name, meta);
      item.append(body);
      return item;
    })
  );
}

function emptyState(text) {
  const message = document.createElement("p");
  message.className = "muted";
  message.textContent = text;
  return message;
}

function renderDeviceCleanup(devices, localDevice) {
  const oldDevices = findOldBulletBridgeDevices(devices, localDevice);
  elements.cleanupOldDevicesButton.classList.toggle("hidden", oldDevices.length === 0);
  elements.cleanupOldDevicesButton.disabled = loading || oldDevices.length === 0;
  setButtonText(
    elements.cleanupOldDevicesButton,
    oldDevices.length === 1 ? "Clean Up 1 Old Entry" : `Clean Up ${oldDevices.length} Old Entries`
  );
  elements.deviceCleanupHint.textContent = oldDevices.length
    ? "Removes old Bullet Bridge entries for this browser from Pushbullet."
    : "";
}

function setButtonText(button, text) {
  const label = button.querySelector("span");
  if (label) {
    label.textContent = text;
    return;
  }

  button.textContent = text;
}

async function signInWithPushbullet() {
  if (loading) {
    return;
  }

  setLoading(true);
  try {
    const state = await request("startOAuth");
    renderState(state);
    scheduleFollowUpStateRefresh(800);
    scheduleFollowUpStateRefresh(1800);
    showToast("Pushbullet sign-in complete.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function saveToken() {
  if (loading) {
    return;
  }

  setLoading(true);
  try {
    const token = elements.tokenInput.value;
    const state = await request("saveToken", { token });
    elements.tokenInput.value = "";
    renderState(state);
    scheduleFollowUpStateRefresh(800);
    scheduleFollowUpStateRefresh(1800);
    showToast("Token saved and tested.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function clearToken() {
  if (loading) {
    return;
  }

  setLoading(true);
  try {
    const state = await request("clearToken");
    renderState(state);
    showToast("Account cleared.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function reconnect() {
  if (loading) {
    return;
  }

  setLoading(true);
  try {
    await request("reconnect");
    await loadState();
    scheduleFollowUpStateRefresh(800);
    scheduleFollowUpStateRefresh(1800);
    showToast("Reconnect requested.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function refreshDevices() {
  if (loading) {
    return;
  }

  setLoading(true);
  try {
    const state = await request("refreshDevices");
    renderState(state);
    showToast("Devices refreshed.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function cleanupOldDevices() {
  if (loading) {
    return;
  }

  setLoading(true);
  try {
    if (demoMode) {
      const oldDevices = findOldBulletBridgeDevices(demoState.devices || [], demoState.localDevice);
      demoState.devices = (demoState.devices || []).filter((device) => !oldDevices.some((oldDevice) => oldDevice.iden === device.iden));
      renderState(demoState);
      showToast(oldDevices.length ? "Old device entries cleaned up." : "No old entries found.");
      return;
    }

    const result = await request("cleanupOldDevices");
    renderState(result.state);
    showToast(result.removed ? "Old device entries cleaned up." : "No old entries found.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function enableEncryption() {
  if (loading) {
    return;
  }

  const password = elements.encryptionPasswordInput.value;
  if (!password) {
    showToast("Enter the encryption password used by your other Pushbullet devices.", true);
    elements.encryptionPasswordInput.focus();
    return;
  }

  setLoading(true);
  try {
    const state = await request("setEncryptionPassword", { password });
    elements.encryptionPasswordInput.value = "";
    renderState(state);
    showToast("End-to-end encryption enabled.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function disableEncryption() {
  if (loading) {
    return;
  }

  setLoading(true);
  try {
    const state = await request("clearEncryption");
    elements.encryptionPasswordInput.value = "";
    renderState(state);
    showToast("End-to-end encryption disabled for this browser.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setLoading(false);
  }
}

async function saveSettingsFromForm() {
  const settings = {
    defaultDeviceIden: elements.defaultDeviceSelect.value,
    sendShortcut: selectedSendShortcut(),
    showPushNotifications: elements.showPushNotifications.checked,
    showMirroredNotifications: elements.showMirroredNotifications.checked,
    openLinksOnNotificationClick: elements.openLinksOnNotificationClick.checked,
    closeNotificationsAsDismiss: elements.closeNotificationsAsDismiss.checked
  };

  try {
    await request("saveSettings", { settings });
    showToast("Settings saved.");
  } catch (error) {
    showToast(error.message, true);
  }
}

function selectedSendShortcut() {
  return elements.sendShortcutInputs.find((input) => input.checked)?.value === "enter"
    ? "enter"
    : "ctrlEnter";
}

function labelForDevice(device) {
  return device.nickname || device.manufacturer || device.model || device.type || "Unnamed device";
}

function descriptionForDevice(device) {
  if (device.type === "stream") {
    return "Browser extension";
  }

  return [device.type, device.manufacturer, device.model].filter(Boolean).join(" / ") || "Device";
}

function deviceIconForDevice(device) {
  const icon = document.createElement("span");
  icon.className = "device-icon";
  icon.append(svgIcon(deviceIconPaths(device)));
  return icon;
}

function deviceIconPaths(device = {}) {
  const type = String(device.type || "").toLowerCase();
  const model = `${device.manufacturer || ""} ${device.model || ""} ${device.nickname || ""}`.toLowerCase();

  if (type.includes("android") || type.includes("ios") || model.includes("phone") || model.includes("pixel")) {
    return [
      "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z",
      "M11 18h2"
    ];
  }

  if (type.includes("chrome") || type.includes("firefox") || type.includes("opera") || type.includes("safari") || type.includes("stream")) {
    return [
      "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
      "M8 5v14",
      "M2 9h20"
    ];
  }

  return [
    "M5 4h14v16H5z",
    "M9 8h6",
    "M9 12h6",
    "M9 16h4"
  ];
}

function svgIcon(paths) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("button-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 24 24");

  for (const pathData of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  }

  return svg;
}

function setLoading(value) {
  loading = value;
  document.body.classList.toggle("is-loading", value);
}

function showToast(message, isError = false) {
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle("error", isError);
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.feedback.textContent = "";
    elements.feedback.classList.remove("error");
  }, 3500);
}

function scheduleStateRefresh(delayMs = 120) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = 0;
    loadState();
  }, delayMs);
}

function scheduleFollowUpStateRefresh(delayMs) {
  const timer = window.setTimeout(() => {
    followUpRefreshTimers.delete(timer);
    loadState();
  }, delayMs);
  followUpRefreshTimers.add(timer);
}

async function request(type, payload = {}) {
  if (demoMode) {
    return handleDemoRequest(type, payload);
  }

  const response = await chrome.runtime.sendMessage({ type, ...payload });
  if (!response?.ok) {
    throw new Error(response?.error || "Extension request failed.");
  }
  return response.result;
}

async function handleDemoRequest(type, payload = {}) {
  switch (type) {
    case "getState":
      return demoState;
    case "saveSettings":
      demoState.settings = {
        ...demoState.settings,
        ...(payload.settings || {})
      };
      return demoState.settings;
    case "setEncryptionPassword":
      demoState.encryption = {
        enabled: true,
        fingerprint: "demo",
        issue: null
      };
      return demoState;
    case "clearEncryption":
      demoState.encryption = {
        enabled: false,
        fingerprint: "",
        issue: null
      };
      return demoState;
    case "clearToken":
    case "refreshDevices":
    case "reconnect":
    case "saveToken":
    case "startOAuth":
      return demoState;
    default:
      return demoState;
  }
}
