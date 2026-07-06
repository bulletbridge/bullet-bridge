export const CONTEXT_MENU_ROOT_ID = "bullet-bridge-root";

const TARGET_MENU_PREFIX = "bullet-bridge-target";
const CONTEXT_MENU_ACTIONS = [
  {
    action: "page",
    title: "Send page to",
    contexts: ["page"]
  },
  {
    action: "link",
    title: "Send link to",
    contexts: ["link"]
  },
  {
    action: "selection",
    title: "Send selected text to",
    contexts: ["selection"]
  },
  {
    action: "image",
    title: "Send image URL to",
    contexts: ["image"]
  }
];

export function buildContextMenuItems(devices = []) {
  const targets = buildContextMenuTargets(devices);
  const items = [
    {
      id: CONTEXT_MENU_ROOT_ID,
      title: "Bullet Bridge",
      contexts: unique(CONTEXT_MENU_ACTIONS.flatMap((item) => item.contexts))
    }
  ];

  for (const action of CONTEXT_MENU_ACTIONS) {
    const actionParentId = actionParentMenuId(action.action);
    items.push({
      id: actionParentId,
      parentId: CONTEXT_MENU_ROOT_ID,
      title: action.title,
      contexts: action.contexts
    });

    for (const target of targets) {
      items.push({
        id: targetMenuId(action.action, target.deviceIden),
        parentId: actionParentId,
        title: target.label,
        contexts: action.contexts
      });
    }
  }

  return items;
}

export function buildContextMenuTargets(devices = []) {
  const seen = new Set();
  const targets = [
    {
      deviceIden: "",
      label: "All devices"
    }
  ];

  for (const device of devices) {
    const deviceIden = String(device?.iden || "").trim();
    if (!deviceIden || seen.has(deviceIden) || device?.active === false || device?.pushable === false) {
      continue;
    }

    seen.add(deviceIden);
    targets.push({
      deviceIden,
      label: trimMenuTitle(labelForDevice(device), 42)
    });
  }

  return targets;
}

export function parseContextMenuTargetId(menuItemId) {
  const parts = String(menuItemId || "").split(":");
  if (parts.length !== 3 || parts[0] !== TARGET_MENU_PREFIX) {
    return null;
  }

  const action = parts[1];
  if (!CONTEXT_MENU_ACTIONS.some((item) => item.action === action)) {
    return null;
  }

  return {
    action,
    deviceIden: decodeURIComponent(parts[2] || "")
  };
}

export function buildContextMenuPush(action, info = {}, tab = {}, deviceIden = "") {
  const push = pushForContextAction(action, info, tab);
  const targetDeviceIden = String(deviceIden || "").trim();
  if (targetDeviceIden) {
    push.device_iden = targetDeviceIden;
  }
  return push;
}

function pushForContextAction(action, info, tab) {
  if (action === "link") {
    const url = assertHttpUrl(info.linkUrl, "This link cannot be pushed.");
    return {
      type: "link",
      title: cleanTitle(info.linkText) || cleanTitle(tab.title) || readableUrlHost(url) || "Link",
      url
    };
  }

  if (action === "selection") {
    const body = cleanTitle(info.selectionText);
    if (!body) {
      throw new Error("Select text before pushing it.");
    }

    return {
      type: "note",
      title: cleanTitle(tab.title) || "Selected text",
      body
    };
  }

  if (action === "image") {
    const url = assertHttpUrl(info.srcUrl, "This image cannot be pushed as a web link.");
    return {
      type: "link",
      title: cleanTitle(tab.title) || "Image",
      url
    };
  }

  const url = assertHttpUrl(tab.url, "This page cannot be pushed as a web link.");
  return {
    type: "link",
    title: cleanTitle(tab.title) || "Current page",
    url
  };
}

function actionParentMenuId(action) {
  return `bullet-bridge-action:${action}`;
}

function targetMenuId(action, deviceIden) {
  return `${TARGET_MENU_PREFIX}:${action}:${encodeURIComponent(String(deviceIden || ""))}`;
}

function labelForDevice(device) {
  return String(device?.nickname || device?.manufacturer || device?.model || device?.type || "Unnamed device").trim();
}

function trimMenuTitle(text, maxLength) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}

function cleanTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function assertHttpUrl(value, message) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(message);
  }
  return url;
}

function readableUrlHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function unique(values) {
  return [...new Set(values)];
}
