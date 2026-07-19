import {
  addDemoFilePush,
  addDemoPush,
  clearDemoNotifications,
  createDemoState,
  getDemoPushPage,
  isDemoModeEnabled,
  removeDemoNotification
} from "./shared/demo-data.js";
import {
  filterPushesBySearch,
  normalizeSearchQuery
} from "./shared/push-search.js";

const state = {
  settings: null,
  devices: [],
  localDeviceIden: "",
  pushes: [],
  pushCursor: "",
  pushesLoading: false,
  pushesLoadedAll: false,
  pushLoadError: "",
  streams: [],
  selectedStreamId: "all",
  activeView: "pushes",
  mirroredNotifications: [],
  encryption: null,
  uploadStatus: null,
  draftLink: null,
  pushSearchQuery: "",
  olderScrollArmed: true
};

const STATUS_REFRESH_DELAYS = [400, 1200, 2500];
const FILE_TRANSFER_CHANNEL = "bullet-bridge-file-transfer";
const PERSISTENT_WINDOW_DRAFT_KEY = "persistentPopupDraft";
const PUSH_PAGE_SIZE = 50;
const FEEDBACK_TIMEOUT_MS = 2600;
const ERROR_FEEDBACK_TIMEOUT_MS = 5200;
const SYNTHETIC_PUSH_TITLES = new Set([
  "File received",
  "Link received",
  "Push received"
]);
let statusRefreshTimers = [];
let pendingFileTransfer = null;
let feedbackTimer = 0;
let demoMode = false;
let demoState = null;
const standaloneMode = new URLSearchParams(window.location.search).get("window") === "1";

document.documentElement.classList.toggle("standalone-mode", standaloneMode);
document.body.classList.toggle("standalone-mode", standaloneMode);

const elements = {
  openWindowButton: document.querySelector("#openWindowButton"),
  optionsButton: document.querySelector("#optionsButton"),
  setupPanel: document.querySelector("#setupPanel"),
  setupSignInButton: document.querySelector("#setupSignInButton"),
  setupButton: document.querySelector("#setupButton"),
  setupHint: document.querySelector("#setupHint"),
  appPanel: document.querySelector("#appPanel"),
  pushesTab: document.querySelector("#pushesTab"),
  notificationsTab: document.querySelector("#notificationsTab"),
  pushesView: document.querySelector("#pushesView"),
  notificationsView: document.querySelector("#notificationsView"),
  clearNotificationsButton: document.querySelector("#clearNotificationsButton"),
  streamList: document.querySelector("#streamList"),
  streamTitle: document.querySelector("#streamTitle"),
  streamMeta: document.querySelector("#streamMeta"),
  pushSearchInput: document.querySelector("#pushSearchInput"),
  clearSearchButton: document.querySelector("#clearSearchButton"),
  notificationList: document.querySelector("#notificationList"),
  refreshInboxButton: document.querySelector("#refreshInboxButton"),
  pushList: document.querySelector("#pushList"),
  sendForm: document.querySelector("#sendForm"),
  deviceSelect: document.querySelector("#deviceSelect"),
  bodyInput: document.querySelector("#bodyInput"),
  useTabButton: document.querySelector("#useTabButton"),
  fileChooseButton: document.querySelector("#fileChooseButton"),
  fileNameText: document.querySelector("#fileNameText"),
  fileInput: document.querySelector("#fileInput"),
  uploadProgress: document.querySelector("#uploadProgress"),
  uploadProgressBar: document.querySelector("#uploadProgressBar"),
  uploadProgressText: document.querySelector("#uploadProgressText"),
  sendButton: document.querySelector("#sendButton"),
  feedback: document.querySelector("#feedback")
};

document.addEventListener("DOMContentLoaded", init);
elements.openWindowButton.addEventListener("click", openPersistentWindow);
elements.optionsButton.addEventListener("click", openOptions);
elements.setupSignInButton.addEventListener("click", signInWithPushbullet);
elements.setupButton.addEventListener("click", openOptions);
elements.pushesTab.addEventListener("click", () => switchView("pushes"));
elements.notificationsTab.addEventListener("click", () => switchView("notifications"));
elements.clearNotificationsButton.addEventListener("click", clearAllNotifications);
elements.refreshInboxButton.addEventListener("click", loadRecentPushes);
elements.pushSearchInput.addEventListener("input", handlePushSearchInput);
elements.clearSearchButton.addEventListener("click", clearPushSearch);
elements.pushList.addEventListener("scroll", handlePushListScroll);
elements.deviceSelect.addEventListener("change", syncStreamFromTarget);
elements.bodyInput.addEventListener("input", handleBodyInput);
elements.bodyInput.addEventListener("keydown", handleBodyKeydown);
elements.useTabButton.addEventListener("click", useCurrentTab);
elements.fileChooseButton.addEventListener("click", chooseFileForPush);
elements.fileInput.addEventListener("change", sendSelectedFile);
elements.sendForm.addEventListener("submit", sendPush);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.uploadStatus) {
    state.uploadStatus = changes.uploadStatus.newValue || null;
    renderUploadStatus(state.uploadStatus);
  }
  if (areaName === "local" && changes.mirroredNotifications) {
    state.mirroredNotifications = changes.mirroredNotifications.newValue || [];
    renderNotifications();
  }
  if (areaName === "local" && changes.encryptionIssue) {
    state.encryption = {
      ...(state.encryption || {}),
      issue: changes.encryptionIssue.newValue || null
    };
    renderNotifications();
  }
});

async function init() {
  try {
    elements.openWindowButton.classList.toggle("hidden", standaloneMode);
    demoMode = await isDemoModeEnabled();
    demoState = demoMode ? createDemoState() : null;
    const currentState = await request("getState");
    renderState(currentState);
    await restorePersistentWindowDraft();
    if (!demoMode) {
      await request("clearUnread");
      scheduleConnectionStatusRefresh(currentState);
    }
  } catch (error) {
    setFeedback(error.message, true);
  }
}

async function openPersistentWindow() {
  const draft = {
    body: elements.bodyInput.value,
    deviceIden: elements.deviceSelect.value,
    activeView: state.activeView,
    draftLink: state.draftLink
  };

  elements.openWindowButton.disabled = true;
  try {
    await chrome.storage.session.set({ [PERSISTENT_WINDOW_DRAFT_KEY]: draft });
    const url = new URL(window.location.href);
    url.searchParams.set("window", "1");
    await chrome.windows.create({
      url: url.href,
      type: "popup",
      focused: true,
      width: 820,
      height: 680
    });
    window.close();
  } catch (error) {
    await chrome.storage.session.remove(PERSISTENT_WINDOW_DRAFT_KEY);
    elements.openWindowButton.disabled = false;
    setFeedback(error.message || "Unable to open Bullet Bridge in a window.", true);
  }
}

async function restorePersistentWindowDraft() {
  if (!standaloneMode) {
    return;
  }

  const stored = await chrome.storage.session.get(PERSISTENT_WINDOW_DRAFT_KEY);
  const draft = stored[PERSISTENT_WINDOW_DRAFT_KEY];
  await chrome.storage.session.remove(PERSISTENT_WINDOW_DRAFT_KEY);
  if (!draft || typeof draft !== "object") {
    return;
  }

  elements.bodyInput.value = String(draft.body || "");
  state.draftLink = draft.draftLink && typeof draft.draftLink === "object" ? draft.draftLink : null;

  const deviceIden = String(draft.deviceIden || "");
  if (!deviceIden || state.devices.some((device) => device.iden === deviceIden)) {
    elements.deviceSelect.value = deviceIden;
    state.selectedStreamId = deviceIden ? streamIdForDevice(deviceIden) : "all";
  }

  const activeView = draft.activeView === "notifications" ? "notifications" : "pushes";
  switchView(activeView);
  renderStreams();
  renderSelectedStream();
}

function renderState(currentState) {
  state.settings = currentState.settings;
  state.devices = currentState.devices || [];
  state.localDeviceIden = currentState.localDevice?.iden || "";
  state.mirroredNotifications = currentState.mirroredNotifications || [];
  state.encryption = currentState.encryption || null;
  state.uploadStatus = currentState.uploadStatus || null;
  const loggedOut = !currentState.hasToken;

  renderStatus(currentState.status);
  renderSendShortcut();
  renderUploadStatus(state.uploadStatus);
  renderNotifications();

  elements.deviceSelect.value = state.settings?.defaultDeviceIden || "";
  state.selectedStreamId = elements.deviceSelect.value ? streamIdForDevice(elements.deviceSelect.value) : "all";

  document.documentElement.classList.toggle("setup-mode", loggedOut);
  document.body.classList.toggle("setup-mode", loggedOut);
  elements.setupPanel.classList.toggle("hidden", !loggedOut);
  elements.appPanel.classList.toggle("hidden", loggedOut);
  elements.setupSignInButton.disabled = !currentState.oauthAvailable;
  elements.setupHint.textContent = currentState.oauthAvailable
    ? "OAuth opens Pushbullet sign-in in a browser window."
    : "OAuth is not configured in this build. Open settings to use a manual token.";
  if (currentState.hasToken) {
    elements.sendForm.classList.remove("hidden");
    switchView(state.activeView);
    renderStreams();
    renderSelectedStream();
    loadRecentPushes().catch((error) => setFeedback(error.message, true));
  } else {
    elements.sendForm.classList.add("hidden");
  }

  renderUploadStatus(state.uploadStatus);
}

async function signInWithPushbullet() {
  if (demoMode) {
    setFeedback("Demo mode is using fake account data.");
    return;
  }

  clearFeedback();

  try {
    elements.setupSignInButton.disabled = true;
    const nextState = await request("startOAuth");
    renderState(nextState);
    await request("clearUnread");
    scheduleConnectionStatusRefresh(nextState);
    setFeedback("Signed in.");
  } catch (error) {
    setFeedback(error.message, true);
  } finally {
    elements.setupSignInButton.disabled = false;
  }
}

function switchView(viewName) {
  state.activeView = viewName;
  const pushesActive = viewName === "pushes";

  elements.pushesTab.classList.toggle("active", pushesActive);
  elements.notificationsTab.classList.toggle("active", !pushesActive);
  elements.pushesTab.setAttribute("aria-selected", String(pushesActive));
  elements.notificationsTab.setAttribute("aria-selected", String(!pushesActive));
  elements.pushesView.classList.toggle("hidden", !pushesActive);
  elements.notificationsView.classList.toggle("hidden", pushesActive);
}

function renderStatus(status) {
  const connected = status?.connected || status?.websocketState === "open";
  document.body.dataset.connection = connected ? "connected" : status?.websocketState || "disconnected";

  if (status?.lastError && status?.websocketState === "error") {
    setFeedback(status.lastError, true);
  }
}

function scheduleConnectionStatusRefresh(currentState) {
  clearStatusRefreshTimers();

  if (!currentState.hasToken || currentState.status?.connected) {
    return;
  }

  for (const delay of STATUS_REFRESH_DELAYS) {
    const timer = window.setTimeout(async () => {
      try {
        const nextState = await request("getState");
        renderStatus(nextState.status);

        if (nextState.status?.connected) {
          clearStatusRefreshTimers();
        }
      } catch (error) {
        setFeedback(error.message, true);
      }
    }, delay);
    statusRefreshTimers.push(timer);
  }
}

function clearStatusRefreshTimers() {
  for (const timer of statusRefreshTimers) {
    window.clearTimeout(timer);
  }
  statusRefreshTimers = [];
}

function renderUploadStatus(uploadStatus) {
  if (!uploadStatus || !uploadStatus.state || ["idle", "waiting", "sent"].includes(uploadStatus.state)) {
    resetFilePicker();
    return;
  }

  if (uploadStatus.fileName) {
    elements.fileNameText.textContent = uploadStatus.fileName;
  }

  setUploadProgress(uploadStatus.progress || 0, uploadStatus.message || uploadStatus.state);

  if (uploadStatus.state === "failed") {
    setFeedback(uploadStatus.error || uploadStatus.message || "File upload failed.", true);
  }
}

function resetFilePicker() {
  elements.uploadProgress.classList.add("hidden");
  elements.uploadProgressBar.style.width = "0%";
  elements.uploadProgressText.textContent = "0%";
  elements.fileNameText.textContent = "";
  elements.fileInput.value = "";
}

async function sendPush(event) {
  event.preventDefault();
  clearFeedback();

  const body = elements.bodyInput.value.trim();
  if (!body) {
    setFeedback("Enter a message.", true);
    return;
  }

  const push = buildPush();

  try {
    setSending(true);
    await request("sendPush", { push });
    elements.bodyInput.value = "";
    state.draftLink = null;
    await refreshRecentPushes();
  } catch (error) {
    setFeedback(error.message, true);
  } finally {
    setSending(false);
  }
}

function buildPush(forcedType = "") {
  const body = elements.bodyInput.value.trim();
  const type = forcedType || (isLikelyUrl(body) ? "link" : "note");
  const push = {
    type,
    device_iden: currentTargetDeviceIden()
  };

  if (type === "link") {
    const url = normalizeUrl(body);
    push.url = url;
    if (state.draftLink?.url === url && state.draftLink.title) {
      push.title = state.draftLink.title;
    }
  } else if (body) {
    push.body = body;
  }

  return push;
}

function currentTargetDeviceIden() {
  return currentStream()?.deviceIden || "";
}

function isLikelyUrl(text) {
  return /^(https?:\/\/|www\.)\S+$/i.test(text);
}

function normalizeUrl(text) {
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function safeMediaUrl(url) {
  const value = String(url || "").trim();
  if (!value) {
    return "";
  }

  if (/^data:image\//i.test(value) || /^blob:/i.test(value)) {
    return value;
  }

  if (/^(src\/assets\/|assets\/)[a-z0-9._/-]+$/i.test(value) && !value.includes("..")) {
    return chrome.runtime.getURL(value.startsWith("src/") ? value : `src/${value}`);
  }

  try {
    const parsed = new URL(normalizeUrl(value));
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function handleBodyInput() {
  if (!state.draftLink) {
    return;
  }

  const body = elements.bodyInput.value.trim();
  if (!isLikelyUrl(body) || normalizeUrl(body) !== state.draftLink.url) {
    state.draftLink = null;
  }
}

function handleBodyKeydown(event) {
  if (event.key !== "Enter" || event.isComposing) {
    return;
  }

  const sendShortcut = state.settings?.sendShortcut === "enter" ? "enter" : "ctrlEnter";
  const ctrlOrMeta = event.ctrlKey || event.metaKey;
  const shouldSend = sendShortcut === "enter"
    ? !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
    : ctrlOrMeta && !event.shiftKey && !event.altKey;

  if (!shouldSend) {
    return;
  }

  event.preventDefault();
  if (elements.sendButton.disabled) {
    return;
  }

  elements.sendForm.requestSubmit();
}

function renderSendShortcut() {
  const sendShortcut = state.settings?.sendShortcut === "enter" ? "Enter" : "Ctrl+Enter";
  elements.bodyInput.title = `Send with ${sendShortcut}`;
  elements.sendButton.title = `Send (${sendShortcut})`;
  elements.sendButton.setAttribute("aria-label", `Send (${sendShortcut})`);
}

async function useCurrentTab() {
  clearFeedback();

  try {
    elements.useTabButton.disabled = true;
    const tab = await request("getCurrentTab");
    const url = String(tab.url || "").trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("Current tab is not a web page link.");
    }

    state.draftLink = {
      title: String(tab.title || "").trim(),
      url
    };
    elements.bodyInput.value = url;
    elements.bodyInput.focus();
  } catch (error) {
    setFeedback(error.message, true);
  } finally {
    elements.useTabButton.disabled = false;
  }
}

async function chooseFileForPush() {
  clearFeedback();

  const transferId = crypto.randomUUID();
  pendingFileTransfer = {
    transferId,
    push: buildPush("file")
  };

  elements.fileNameText.textContent = "Choose a file...";
  elements.fileInput.value = "";
  elements.sendButton.disabled = true;

  try {
    const prepared = request("prepareFilePush", pendingFileTransfer);
    elements.fileInput.click();
    await prepared;
  } catch (error) {
    pendingFileTransfer = null;
    setFeedback(error.message, true);
  } finally {
    elements.sendButton.disabled = false;
  }
}

async function sendSelectedFile() {
  const file = elements.fileInput.files[0];
  if (!file) {
    return;
  }

  if (demoMode) {
    await sendDemoFile(file);
    return;
  }

  if (!pendingFileTransfer) {
    pendingFileTransfer = {
      transferId: crypto.randomUUID(),
      push: buildPush("file")
    };
    await request("prepareFilePush", pendingFileTransfer);
  }

  const { transferId } = pendingFileTransfer;
  elements.fileNameText.textContent = file.name;
  setUploadProgress(2, "Queued");
  setFeedback("Sending file...", false, { persist: true });

  const channel = new BroadcastChannel(FILE_TRANSFER_CHANNEL);
  channel.postMessage({
    type: "file-transfer",
    transferId,
    file,
    fileName: file.name,
    fileType: file.type || "application/octet-stream",
    fileSize: file.size
  });
  channel.close();

  const completion = request("completeFilePush", { transferId });
  pendingFileTransfer = null;

  try {
    setSending(true);
    await completion;
    clearFeedback();
    elements.bodyInput.value = "";
    state.draftLink = null;
    resetFilePicker();
    await refreshRecentPushes();
  } catch (error) {
    setFeedback(error.message, true);
  } finally {
    setSending(false);
  }
}

function setUploadProgress(percent, label) {
  const rounded = Math.max(0, Math.min(100, Math.round(percent)));
  elements.uploadProgress.classList.remove("hidden");
  elements.uploadProgressBar.style.width = `${rounded}%`;
  elements.uploadProgressText.textContent = label ? `${label} ${rounded}%` : `${rounded}%`;
}

function setSending(isSending) {
  elements.sendButton.disabled = isSending;
  elements.deviceSelect.disabled = isSending;
  elements.bodyInput.disabled = isSending;
  elements.useTabButton.disabled = isSending;
  elements.fileChooseButton.disabled = isSending;
  elements.fileInput.disabled = isSending;
}

async function loadRecentPushes() {
  state.olderScrollArmed = true;
  return loadPushPage({ reset: true });
}

async function refreshRecentPushes() {
  return loadPushPage({ refresh: true, scrollMode: "bottom" });
}

async function loadOlderPushes() {
  if (state.pushesLoading || state.pushesLoadedAll) {
    return;
  }

  state.olderScrollArmed = false;
  return loadPushPage({ reset: false, preserveScroll: true });
}

async function loadPushPage(options = {}) {
  const reset = Boolean(options.reset);
  const refresh = Boolean(options.refresh);
  const preserveScroll = Boolean(options.preserveScroll);
  if (state.pushesLoading || (!reset && !refresh && state.pushesLoadedAll)) {
    return;
  }

  const hadLoadedPushes = state.pushes.length > 0;
  const previousCursor = state.pushCursor;
  const previousLoadedAll = state.pushesLoadedAll;
  const previousScrollHeight = elements.pushList.scrollHeight;
  const previousScrollTop = elements.pushList.scrollTop;

  state.pushesLoading = true;
  state.pushLoadError = "";
  elements.refreshInboxButton.disabled = true;

  if (reset) {
    state.pushes = [];
    state.pushCursor = "";
    state.pushesLoadedAll = false;
    renderPushListLoading();
  } else if (preserveScroll) {
    renderSelectedStream({
      scrollMode: "preserve",
      previousScrollHeight,
      previousScrollTop
    });
  }

  let renderOptions = {
    scrollMode: options.scrollMode || (reset ? "bottom" : "preserve"),
    previousScrollHeight,
    previousScrollTop
  };
  let emptyLoadError = "";

  try {
    const page = await request("getPushPage", {
      limit: PUSH_PAGE_SIZE,
      cursor: reset || refresh ? "" : state.pushCursor
    });
    const nextPushes = page.pushes || [];
    state.pushes = mergePushes(reset ? nextPushes : [...state.pushes, ...nextPushes]);
    if (reset || (refresh && !hadLoadedPushes)) {
      state.pushCursor = page.cursor || "";
      state.pushesLoadedAll = !state.pushCursor;
    } else if (!refresh) {
      state.pushCursor = page.cursor || "";
      state.pushesLoadedAll = !state.pushCursor;
    } else {
      state.pushCursor = previousCursor;
      state.pushesLoadedAll = previousLoadedAll;
    }
  } catch (error) {
    state.pushLoadError = error.message || "Unable to load pushes.";
    if (state.pushes.length) {
      setFeedback(state.pushLoadError, true);
      renderOptions = {
        scrollMode: preserveScroll ? "preserve" : "none",
        previousScrollHeight,
        previousScrollTop
      };
    } else {
      emptyLoadError = state.pushLoadError;
    }
  } finally {
    state.pushesLoading = false;
    elements.refreshInboxButton.disabled = false;
    if (emptyLoadError) {
      renderPushListError(emptyLoadError);
    } else {
      renderStreams();
      renderSelectedStream(renderOptions);
    }
  }
}

async function sendDemoFile(file) {
  clearFeedback();
  elements.fileNameText.textContent = file.name;
  setUploadProgress(64, "Demo upload");
  addDemoFilePush(demoState, file, pendingFileTransfer?.push || buildPush("file"));
  pendingFileTransfer = null;
  state.pushes = [];
  state.pushCursor = "";
  state.pushesLoadedAll = false;
  await refreshRecentPushes();
}

function renderPushListLoading() {
  elements.pushList.replaceChildren(emptyState("Loading..."));
}

function renderPushListError(message) {
  const item = emptyState(message || "Unable to load pushes.");
  item.classList.add("error");
  elements.pushList.replaceChildren(item);
}

function renderStreams() {
  state.streams = buildStreams();
  if (!state.streams.some((stream) => stream.id === state.selectedStreamId)) {
    state.selectedStreamId = "all";
  }

  elements.streamList.replaceChildren(...state.streams.map((stream) => {
    const button = document.createElement("button");
    button.className = "stream-row";
    button.type = "button";
    button.dataset.streamId = stream.id;
    button.classList.toggle("selected", stream.id === state.selectedStreamId);
    button.addEventListener("click", () => selectStream(stream.id));

    const text = document.createElement("span");
    text.className = "stream-text";

    const name = document.createElement("strong");
    name.textContent = stream.name;

    const meta = document.createElement("small");
    meta.textContent = stream.latestPush
      ? `${stream.latestPush.detail} / ${formatTime(stream.latestPush.created)}`
      : stream.description;

    text.append(name, meta);

    const count = document.createElement("span");
    count.className = "stream-count";
    count.textContent = String(stream.count || 0);

    button.append(streamIconForStream(stream), text, count);
    return button;
  }));
}

function buildStreams() {
  const allStream = {
    id: "all",
    kind: "all",
    name: "All devices",
    description: "Everything",
    deviceIden: "",
    pushes: [...state.pushes],
    count: state.pushes.length,
    latestPush: latestPush(state.pushes)
  };

  const deviceStreams = state.devices.map((device) => {
    const deviceIden = device.iden || "";
    const pushes = state.pushes.filter((push) => pushBelongsToDeviceStream(push, deviceIden));
    return {
      id: streamIdForDevice(deviceIden),
      kind: "device",
      name: device.iden === state.localDeviceIden ? `${labelForDevice(device)} (this browser)` : labelForDevice(device),
      description: descriptionForDevice(device),
      device,
      deviceIden,
      pushes,
      count: pushes.length,
      latestPush: latestPush(pushes)
    };
  });

  deviceStreams.sort((a, b) => {
    const latestA = a.latestPush?.created || 0;
    const latestB = b.latestPush?.created || 0;
    if (latestA !== latestB) {
      return latestB - latestA;
    }
    return a.name.localeCompare(b.name);
  });

  return [allStream, ...deviceStreams];
}

function latestPush(pushes) {
  return pushes.reduce((latest, push) => {
    if (!latest || Number(push.created || 0) > Number(latest.created || 0)) {
      return push;
    }
    return latest;
  }, null);
}

function pushBelongsToDeviceStream(push, deviceIden) {
  if (!deviceIden) {
    return false;
  }

  return push.sourceDeviceIden === deviceIden || push.targetDeviceIden === deviceIden;
}

function selectStream(streamId) {
  if (state.selectedStreamId === streamId) {
    return;
  }

  state.selectedStreamId = streamId;
  state.olderScrollArmed = true;
  const stream = currentStream();
  elements.deviceSelect.value = stream?.deviceIden || "";
  renderStreams();
  renderSelectedStream();
}

function syncStreamFromTarget() {
  state.selectedStreamId = elements.deviceSelect.value ? streamIdForDevice(elements.deviceSelect.value) : "all";
  state.olderScrollArmed = true;
  renderStreams();
  renderSelectedStream();
}

function renderSelectedStream(options = {}) {
  const stream = currentStream();
  if (!stream) {
    renderSearchControls();
    renderPushList([], options);
    return;
  }

  const searchActive = Boolean(normalizeSearchQuery(state.pushSearchQuery));
  const filteredPushes = filterPushesBySearch(stream.pushes, state.pushSearchQuery);
  elements.streamTitle.textContent = stream.name;
  elements.streamMeta.textContent = searchActive
    ? searchSummaryText(stream.pushes.length, filteredPushes.length)
    : streamMetaText(stream);
  renderSearchControls();
  renderPushList(filteredPushes, {
    ...options,
    searchActive
  });
}

function currentStream() {
  return state.streams.find((stream) => stream.id === state.selectedStreamId) || state.streams[0] || null;
}

function streamIdForDevice(deviceIden) {
  return `device:${deviceIden || ""}`;
}

function streamIconForStream(stream) {
  const icon = document.createElement("span");
  icon.className = `stream-icon ${stream.kind}`;
  icon.append(svgIcon(deviceIconPaths(stream.kind === "all" ? { type: "all" } : stream.device)));
  return icon;
}

function deviceIconPaths(device = {}) {
  const type = String(device.type || "").toLowerCase();
  const model = `${device.manufacturer || ""} ${device.model || ""} ${device.nickname || ""}`.toLowerCase();

  if (type === "all") {
    return [
      "M4 6h16v11H4z",
      "M8 21h8",
      "M12 17v4"
    ];
  }

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

function renderPushList(pushes, options = {}) {
  if (!pushes.length) {
    if (state.pushesLoading) {
      elements.pushList.replaceChildren(emptyState("Loading pushes..."));
    } else {
      const emptyText = options.searchActive
        ? "No loaded pushes match this search."
        : state.pushesLoadedAll
          ? "No pushes found for this device."
          : "No pushes loaded for this device yet.";
      const empty = emptyState(emptyText);
      const nodes = [empty];
      if (!state.pushesLoadedAll) {
        nodes.push(loadOlderButton());
      }
      elements.pushList.replaceChildren(...nodes);
    }
    applyPushListScroll(options);
    return;
  }

  const sortedPushes = [...pushes].sort((a, b) => Number(a.created || 0) - Number(b.created || 0));
  const nodes = [];
  if (state.pushesLoading) {
    nodes.push(historyMarker("Loading older pushes..."));
  } else if (!state.pushesLoadedAll) {
    nodes.push(loadOlderButton());
  } else {
    nodes.push(historyMarker("Beginning of loaded history."));
  }

  nodes.push(...sortedPushes.map((push) => {
    const item = document.createElement("article");
    item.className = `message-row ${push.direction}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    const content = messageContent(push);
    bubble.append(messageActionsForPush(push));

    if (content.title) {
      const title = document.createElement("h3");
      title.textContent = content.title;
      bubble.append(title);
    }

    for (const node of messageBodyNodes(push, content)) {
      bubble.append(node);
    }

    const route = document.createElement("p");
    route.className = "message-meta";
    route.textContent = `${routeLabel(push)} / ${formatTime(push.created)}`;
    bubble.append(route);

    if (push.url) {
      const button = document.createElement("button");
      button.className = "link-button";
      button.type = "button";
      button.textContent = push.type === "file" ? "Open File" : "Open Link";
      button.addEventListener("click", () => openPushUrl(push.url));
      bubble.append(button);
    }

    item.append(bubble);
    return item;
  }));

  elements.pushList.replaceChildren(...nodes);
  applyPushListScroll(options.scrollMode ? options : { ...options, scrollMode: "bottom" });
}

function streamMetaText(stream) {
  return stream.latestPush
    ? `${stream.count} push${stream.count === 1 ? "" : "es"} / Latest ${formatTime(stream.latestPush.created)}`
    : stream.description;
}

function searchSummaryText(total, shown) {
  const matchLabel = shown === 1 ? "match" : "matches";
  const pushLabel = total === 1 ? "push" : "pushes";
  return `${shown} ${matchLabel} in ${total} loaded ${pushLabel}`;
}

function renderSearchControls() {
  const query = normalizeSearchQuery(state.pushSearchQuery);
  elements.clearSearchButton.classList.toggle("hidden", !query);
}

function handlePushSearchInput() {
  state.pushSearchQuery = elements.pushSearchInput.value;
  renderSelectedStream({ scrollMode: "none" });
}

function clearPushSearch() {
  state.pushSearchQuery = "";
  elements.pushSearchInput.value = "";
  elements.pushSearchInput.focus();
  renderSelectedStream({ scrollMode: "none" });
}

function historyMarker(text) {
  const item = document.createElement("p");
  item.className = "history-marker";
  item.textContent = text;
  return item;
}

function loadOlderButton() {
  const button = document.createElement("button");
  button.className = "secondary compact load-older-button";
  button.type = "button";
  button.textContent = "Load older pushes";
  button.addEventListener("click", () => {
    loadOlderPushes().catch((error) => setFeedback(error.message, true));
  });
  return button;
}

function applyPushListScroll(options = {}) {
  if (options.scrollMode === "preserve") {
    const previousScrollHeight = Number(options.previousScrollHeight || 0);
    const previousScrollTop = Number(options.previousScrollTop || 0);
    window.requestAnimationFrame(() => {
      state.olderScrollArmed = false;
      elements.pushList.scrollTop = Math.max(0, elements.pushList.scrollHeight - previousScrollHeight + previousScrollTop);
    });
    return;
  }

  if (options.scrollMode === "bottom") {
    window.requestAnimationFrame(() => {
      elements.pushList.scrollTop = elements.pushList.scrollHeight;
      state.olderScrollArmed = true;
    });
  }
}

function handlePushListScroll() {
  if (state.activeView !== "pushes" || state.pushesLoading || state.pushesLoadedAll) {
    return;
  }

  if (elements.pushList.scrollTop > 120) {
    state.olderScrollArmed = true;
    return;
  }

  if (state.olderScrollArmed && elements.pushList.scrollTop <= 40) {
    loadOlderPushes().catch((error) => setFeedback(error.message, true));
  }
}

function mergePushes(pushes) {
  const byId = new Map();
  for (const push of pushes) {
    const key = push.iden || [
      push.type,
      push.created,
      push.sourceDeviceIden,
      push.targetDeviceIden,
      push.url,
      push.body
    ].join("|");
    byId.set(key, { ...(byId.get(key) || {}), ...push });
  }

  return [...byId.values()].sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
}

function messageContent(push) {
  const title = realPushTitle(push);
  if (push.type === "file") {
    return {
      title: "",
      body: push.body || ""
    };
  }

  if (push.type === "link") {
    const linkTitle = cleanLinkTitle(push, title);
    return {
      title: linkTitle,
      body: push.body && push.body !== linkTitle ? push.body : ""
    };
  }

  if (title && push.body) {
    return {
      title,
      body: push.body
    };
  }

  return {
    title: "",
    body: push.body || title || ""
  };
}

function messageBodyNodes(push, content) {
  if (push.type === "link" && push.url) {
    const nodes = [];
    if (shouldShowLinkBody(push, content.body)) {
      nodes.push(messageParagraph(content.body));
    }
    nodes.push(linkPreview(push, content));
    return nodes;
  }

  if (push.type === "file") {
    const nodes = [];
    if (push.body) {
      nodes.push(messageParagraph(push.body));
    }

    if (isImageFile(push)) {
      nodes.push(fileImagePreview(push));
    } else if (isVideoFile(push)) {
      nodes.push(fileVideoPreview(push));
    } else {
      nodes.push(fileCard(push));
    }

    return nodes;
  }

  if (!content.body) {
    return [];
  }

  return [messageParagraph(content.body)];
}

function messageParagraph(text) {
  const body = document.createElement("p");
  body.className = "message-body";
  body.textContent = text;
  return body;
}

function shouldShowLinkBody(push, body) {
  const text = String(body || "").trim();
  if (!text) {
    return false;
  }

  const url = String(push.url || "").trim();
  if (text === url || text === realPushTitle(push)) {
    return false;
  }

  if (looksLikeUrlFragment(text) || (text.length > 24 && normalizeUrl(url).includes(text))) {
    return false;
  }

  return !(isLikelyUrl(text) && normalizeUrl(text) === normalizeUrl(url));
}

function cleanLinkTitle(push, title) {
  const text = String(title || "").trim();
  if (!text || text === String(push.url || "").trim() || isLikelyUrl(text) || looksLikeUrlFragment(text)) {
    return "";
  }

  return text;
}

function looksLikeUrlFragment(text) {
  const value = String(text || "").trim();
  return value.length > 48 && /[/?&=]|%[0-9a-f]{2}/i.test(value);
}

function linkPreview(push, content) {
  const preview = document.createElement("button");
  preview.className = "link-preview";
  preview.type = "button";
  preview.title = push.url;
  preview.addEventListener("click", () => openPushUrl(push.url));

  const visual = linkPreviewVisual(push);
  if (visual) {
    preview.append(visual);
  }

  const text = document.createElement("span");
  text.className = "link-preview-text";

  const label = document.createElement("span");
  label.className = "link-preview-title";
  label.textContent = content.title || readableUrlLabel(push.url);

  const meta = document.createElement("span");
  meta.className = "link-preview-meta";
  meta.textContent = readableUrlMeta(push.url);

  text.append(label, meta);
  preview.append(text);
  return preview;
}

function linkPreviewVisual(push) {
  const imageUrl = safeMediaUrl(push.imageUrl);
  if (imageUrl) {
    const frame = document.createElement("span");
    frame.className = "link-preview-visual link-preview-visual-large";
    frame.append(previewImage(imageUrl, realPushTitle(push) || readableUrlLabel(push.url)));
    return frame;
  }

  const faviconUrl = faviconUrlFor(push.url);
  if (!faviconUrl) {
    return null;
  }

  const frame = document.createElement("span");
  frame.className = "link-preview-visual";
  frame.append(previewImage(faviconUrl, ""));
  return frame;
}

function faviconUrlFor(url) {
  try {
    const pageUrl = new URL(normalizeUrl(url));
    return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl.href)}&size=32`);
  } catch {
    return "";
  }
}

function previewImage(src, alt) {
  const image = document.createElement("img");
  image.loading = "lazy";
  image.decoding = "async";
  image.src = src;
  image.alt = alt;
  image.addEventListener("error", () => {
    const frame = image.closest(".link-preview-visual, .file-preview-media");
    if (!frame) {
      return;
    }
    frame.classList.add("preview-unavailable");
    frame.replaceChildren(previewUnavailableText());
  });
  return image;
}

function previewUnavailableText() {
  const label = document.createElement("span");
  label.className = "preview-unavailable-text";
  label.textContent = "Preview unavailable";
  return label;
}

function fileImagePreview(push) {
  const button = document.createElement("button");
  button.className = "file-preview file-preview-image";
  button.type = "button";
  button.title = push.fileName || "Open image";
  button.addEventListener("click", () => openPushUrl(push.url));

  const media = document.createElement("span");
  media.className = "file-preview-media";
  media.append(previewImage(safeMediaUrl(push.imageUrl) || safeMediaUrl(push.url), push.fileName || "Image file"));

  button.append(media, fileCardText(push));
  return button;
}

function fileVideoPreview(push) {
  const card = document.createElement("div");
  card.className = "file-preview file-preview-video";

  const media = document.createElement("span");
  media.className = "file-preview-media";

  const video = document.createElement("video");
  video.controls = false;
  video.preload = "metadata";
  video.src = safeMediaUrl(push.url);
  const poster = safeMediaUrl(push.imageUrl);
  if (poster) {
    video.poster = poster;
  }
  video.setAttribute("aria-label", push.fileName || "Video file");
  video.addEventListener("error", () => {
    media.remove();
  });
  video.addEventListener("click", () => toggleVideoPlayback(video));

  const frame = document.createElement("span");
  frame.className = "video-preview-frame";
  frame.append(video, videoControlButton(video));

  media.append(frame);
  card.append(media, fileCardText(push));
  return card;
}

function videoControlButton(video) {
  const button = document.createElement("button");
  button.className = "video-control";
  button.type = "button";

  const update = () => {
    const isPlaying = !video.paused && !video.ended;
    button.classList.toggle("is-playing", isPlaying);
    button.title = isPlaying ? "Pause video" : "Play video";
    button.setAttribute("aria-label", button.title);
    button.replaceChildren(svgIcon(isPlaying ? pauseIconPaths() : playIconPaths()));
  };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleVideoPlayback(video);
  });
  video.addEventListener("play", update);
  video.addEventListener("pause", update);
  video.addEventListener("ended", update);

  update();
  return button;
}

async function toggleVideoPlayback(video) {
  if (video.paused || video.ended) {
    try {
      await video.play();
    } catch (error) {
      setFeedback(error.message || "Unable to play video.", true);
    }
    return;
  }

  video.pause();
}

function playIconPaths() {
  return ["M8 5v14l11-7-11-7Z"];
}

function pauseIconPaths() {
  return [
    "M10 6v12",
    "M14 6v12"
  ];
}

function fileCard(push) {
  const button = document.createElement("button");
  button.className = "file-preview file-preview-card";
  button.type = "button";
  button.title = push.fileName || "Open file";
  button.addEventListener("click", () => openPushUrl(push.url));

  const icon = document.createElement("span");
  icon.className = "file-preview-icon";
  icon.textContent = fileIconLabel(push.fileType);

  button.append(icon, fileCardText(push));
  return button;
}

function fileCardText(push) {
  const text = document.createElement("span");
  text.className = "file-preview-text";

  const name = document.createElement("span");
  name.className = "file-preview-name";
  name.textContent = push.fileName || "File";

  const meta = document.createElement("span");
  meta.className = "file-preview-meta";
  meta.textContent = push.fileType || readableUrlMeta(push.url);

  text.append(name, meta);
  return text;
}

function fileIconLabel(fileType) {
  const value = String(fileType || "").toLowerCase();
  if (value.includes("pdf")) {
    return "PDF";
  }
  if (value.includes("zip") || value.includes("compressed") || value.includes("archive")) {
    return "ZIP";
  }
  if (value.startsWith("audio/")) {
    return "AUD";
  }
  if (value.includes("text") || value.includes("json") || value.includes("xml")) {
    return "TXT";
  }
  return "FILE";
}

function isImageFile(push) {
  return String(push.fileType || "").toLowerCase().startsWith("image/") && Boolean(safeMediaUrl(push.url));
}

function isVideoFile(push) {
  return String(push.fileType || "").toLowerCase().startsWith("video/") && Boolean(safeMediaUrl(push.url));
}

function readableUrlLabel(url) {
  try {
    const parsed = new URL(normalizeUrl(url));
    const path = `${parsed.pathname}${parsed.search}`;
    return path && path !== "/" ? trimMiddle(path, 46) : parsed.hostname.replace(/^www\./, "");
  } catch {
    return trimMiddle(String(url || ""), 46);
  }
}

function readableUrlMeta(url) {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

function trimMiddle(text, maxLength) {
  const value = String(text || "");
  if (value.length <= maxLength) {
    return value;
  }

  const marker = "...";
  const left = Math.ceil((maxLength - marker.length) / 2);
  const right = Math.floor((maxLength - marker.length) / 2);
  return `${value.slice(0, left)}${marker}${value.slice(-right)}`;
}

function realPushTitle(push) {
  const title = String(push.title || "").trim();
  return SYNTHETIC_PUSH_TITLES.has(title) ? "" : title;
}

function routeLabel(push) {
  const source = push.sourceName || push.senderName || "Unknown source";
  const target = push.targetName || "All devices";
  if (push.direction === "sent") {
    return `Sent to ${target}`;
  }
  if (push.direction === "broadcast") {
    return `Broadcast from ${source}`;
  }
  return `From ${source} to ${target}`;
}

function copyButtonForPush(push) {
  const button = document.createElement("button");
  button.className = "message-copy";
  button.type = "button";
  button.title = "Copy push";
  button.setAttribute("aria-label", "Copy push");
  button.append(svgIcon([
    "M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z",
    "M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
  ]));
  button.addEventListener("click", () => copyPush(push));
  return button;
}

function messageActionsForPush(push) {
  const actions = document.createElement("span");
  actions.className = "message-actions";
  actions.append(copyButtonForPush(push));

  if (push.iden) {
    actions.append(deleteButtonForPush(push));
  }

  return actions;
}

function deleteButtonForPush(push) {
  const button = document.createElement("button");
  button.className = "message-delete";
  button.type = "button";
  button.title = "Delete push";
  button.setAttribute("aria-label", "Delete push");
  button.append(svgIcon([
    "M18 6 6 18",
    "M6 6l12 12"
  ]));
  button.addEventListener("click", () => deletePushFromHistory(push));
  return button;
}

async function copyPush(push) {
  const text = copyTextForPush(push);
  if (!text) {
    setFeedback("Nothing to copy.", true);
    return;
  }

  try {
    await writeClipboardText(text);
    setFeedback("Copied.");
  } catch (error) {
    setFeedback(error.message || "Unable to copy push.", true);
  }
}

async function deletePushFromHistory(push) {
  const pushIden = String(push.iden || "").trim();
  if (!pushIden) {
    setFeedback("This push cannot be deleted.", true);
    return;
  }

  try {
    await request("deletePush", { pushIden });
    state.pushes = state.pushes.filter((item) => item.iden !== pushIden);
    renderStreams();
    renderSelectedStream({ scrollMode: "none" });
    setFeedback("Push deleted.");
  } catch (error) {
    setFeedback(error.message || "Unable to delete push.", true);
  }
}

function copyTextForPush(push) {
  const lines = [];

  for (const value of [
    realPushTitle(push),
    push.fileName,
    push.body,
    push.url
  ]) {
    const text = String(value || "").trim();
    if (text && !lines.includes(text)) {
      lines.push(text);
    }
  }

  return lines.join("\n");
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Browser refused clipboard access.");
    }
  } finally {
    textarea.remove();
  }
}

function renderNotifications() {
  const notifications = [...state.mirroredNotifications]
    .filter((notification) => !notification.dismissed)
    .sort((a, b) => Number(b.receivedAt || b.created || 0) - Number(a.receivedAt || a.created || 0));
  elements.clearNotificationsButton.disabled = !notifications.length;
  elements.notificationsTab.textContent = notifications.length
    ? `Notifications (${notifications.length})`
    : "Notifications";

  const children = [];
  if (state.encryption?.issue?.message) {
    children.push(encryptionNotice(state.encryption.issue.message));
  }
  if (!notifications.length) {
    children.push(emptyState("No mirrored notifications yet."));
    elements.notificationList.replaceChildren(...children);
    return;
  }

  children.push(...notifications.map((notification) => {
    const item = document.createElement("article");
    item.className = "notification-item";
    item.classList.toggle("dismissed", Boolean(notification.dismissed));

    const header = document.createElement("div");
    header.className = "notification-item-heading";

    const app = document.createElement("span");
    app.className = "notification-app";
    app.textContent = notification.appName || "Android";

    const closeButton = document.createElement("button");
    closeButton.className = "notification-close";
    closeButton.type = "button";
    closeButton.title = "Clear notification";
    closeButton.setAttribute("aria-label", "Clear notification");
    closeButton.append(svgIcon([
      "M18 6 6 18",
      "m6 6 12 12"
    ]));
    closeButton.addEventListener("click", () => removeNotification(notification.id));

    header.append(app, closeButton);

    const title = document.createElement("h3");
    title.textContent = notification.title || notification.appName || "Notification";

    const body = document.createElement("p");
    body.className = "notification-body";
    body.textContent = notification.body || "";

    const meta = document.createElement("p");
    meta.className = "notification-meta";
    meta.textContent = [
      notification.sourceDevice || "Android",
      formatTime(notification.receivedAt || notification.created),
      notification.dismissed ? "Dismissed" : ""
    ].filter(Boolean).join(" / ");

    item.append(header, title);
    if (notification.body) {
      item.append(body);
    }
    item.append(meta);

    if (notification.url) {
      const button = document.createElement("button");
      button.className = "link-button";
      button.type = "button";
      button.textContent = "Open";
      button.addEventListener("click", () => openPushUrl(notification.url));
      item.append(button);
    }

    return item;
  }));
  elements.notificationList.replaceChildren(...children);
}

function encryptionNotice(message) {
  const notice = document.createElement("div");
  notice.className = "encryption-notice";

  const text = document.createElement("p");
  text.textContent = message;

  const button = document.createElement("button");
  button.className = "secondary compact";
  button.type = "button";
  button.textContent = "Open Settings";
  button.addEventListener("click", openOptions);

  notice.append(text, button);
  return notice;
}

async function removeNotification(notificationId) {
  if (demoMode) {
    removeDemoNotification(demoState, notificationId);
    state.mirroredNotifications = demoState.mirroredNotifications || [];
    renderNotifications();
    setFeedback("Notification cleared.");
    return;
  }

  try {
    await request("removeMirroredNotification", { id: notificationId });
    state.mirroredNotifications = state.mirroredNotifications.filter((notification) => notification.id !== notificationId);
    renderNotifications();
    setFeedback("Notification cleared.");
  } catch (error) {
    setFeedback(error.message, true);
  }
}

async function clearAllNotifications() {
  if (!state.mirroredNotifications.length) {
    return;
  }

  if (demoMode) {
    const result = clearDemoNotifications(demoState);
    state.mirroredNotifications = [];
    renderNotifications();
    setFeedback(result.cleared ? "Notifications cleared." : "No notifications to clear.");
    return;
  }

  try {
    elements.clearNotificationsButton.disabled = true;
    const result = await request("clearMirroredNotifications");
    state.mirroredNotifications = [];
    renderNotifications();
    setFeedback(result.cleared ? "Notifications cleared." : "No notifications to clear.");
  } catch (error) {
    setFeedback(error.message, true);
  } finally {
    elements.clearNotificationsButton.disabled = !state.mirroredNotifications.length;
  }
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

function emptyState(text) {
  const item = document.createElement("p");
  item.className = "empty-state";
  item.textContent = text;
  return item;
}

async function openPushUrl(url) {
  try {
    await request("openUrl", { url });
  } catch (error) {
    setFeedback(error.message, true);
  }
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "";
  }
  return new Date(timestamp * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function openOptions() {
  await request("openOptions");
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

function setFeedback(message, isError = false, options = {}) {
  window.clearTimeout(feedbackTimer);
  elements.feedback.textContent = message;
  elements.feedback.classList.toggle("error", isError);

  if (!message || options.persist) {
    return;
  }

  feedbackTimer = window.setTimeout(() => {
    clearFeedback();
  }, options.timeoutMs || (isError ? ERROR_FEEDBACK_TIMEOUT_MS : FEEDBACK_TIMEOUT_MS));
}

function clearFeedback() {
  window.clearTimeout(feedbackTimer);
  feedbackTimer = 0;
  elements.feedback.textContent = "";
  elements.feedback.classList.remove("error");
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
    case "getPushPage":
      return getDemoPushPage(demoState, payload.cursor || "", payload.limit || PUSH_PAGE_SIZE);
    case "sendPush":
      return addDemoPush(demoState, payload.push || {});
    case "deletePush":
      demoState.demoPushes = (demoState.demoPushes || []).filter((push) => push.iden !== payload.pushIden);
      demoState.status.lastPushCount = demoState.demoPushes.length;
      return {
        deleted: true,
        pushIden: payload.pushIden
      };
    case "clearUnread":
      demoState.unreadCount = 0;
      return {};
    case "getCurrentTab":
      return {
        title: "Example dashboard",
        url: "https://example.com/dashboard"
      };
    case "openOptions":
      return chrome.runtime.openOptionsPage();
    case "openUrl":
      return {};
    default:
      return {};
  }
}
