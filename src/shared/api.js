const API_ROOT = "https://api.pushbullet.com/v2";
const API_ORIGIN = "https://api.pushbullet.com";

export class PushbulletError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = "PushbulletError";
    this.status = status;
    this.details = details;
  }
}

export function normalizeToken(token) {
  return String(token || "").trim();
}

export function redactToken(token) {
  const clean = normalizeToken(token);
  if (clean.length <= 8) {
    return clean ? "********" : "";
  }

  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

export async function pushbulletRequest(token, path, options = {}) {
  const cleanToken = normalizeToken(token);
  if (!cleanToken) {
    throw new PushbulletError("Pushbullet token is not configured.");
  }

  const url = new URL(path.startsWith("https://") ? path : `${API_ROOT}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${cleanToken}`);
  headers.set("Accept", "application/json");
  headers.set("X-User-Agent", "Bullet Bridge");

  const init = {
    method: options.method || "GET",
    headers
  };

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), init);
  let payload = null;
  const text = await response.text();

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Pushbullet request failed with HTTP ${response.status}.`;
    throw new PushbulletError(message, response.status, payload);
  }

  return payload;
}

export async function getMe(token) {
  return pushbulletRequest(token, "/users/me");
}

export async function getDevices(token) {
  const result = await pushbulletRequest(token, "/devices", {
    query: {
      active: true
    }
  });

  return (result.devices || [])
    .filter((device) => device.active !== false)
    .sort((a, b) => {
      const left = (a.nickname || a.manufacturer || a.type || "").toLowerCase();
      const right = (b.nickname || b.manufacturer || b.type || "").toLowerCase();
      return left.localeCompare(right);
    });
}

export async function createDevice(token, device) {
  return pushbulletRequest(token, "/devices", {
    method: "POST",
    body: device
  });
}

export async function updateDevice(token, deviceIden, patch) {
  return pushbulletRequest(token, `/devices/${encodeURIComponent(deviceIden)}`, {
    method: "POST",
    body: patch
  });
}

export async function deleteDevice(token, deviceIden) {
  return pushbulletRequest(token, `/devices/${encodeURIComponent(deviceIden)}`, {
    method: "DELETE"
  });
}

export async function getPushPage(token, options = {}) {
  const result = await pushbulletRequest(token, "/pushes", {
    query: {
      active: true,
      limit: options.limit || 20,
      modified_after: options.modifiedAfter ?? 0,
      cursor: options.cursor || ""
    }
  });

  return {
    pushes: result.pushes || [],
    cursor: result.cursor || ""
  };
}

export async function getPushes(token, options = {}) {
  const page = await getPushPage(token, options);
  return page.pushes;
}

export async function createPush(token, push) {
  return pushbulletRequest(token, "/pushes", {
    method: "POST",
    body: push
  });
}

export async function updatePush(token, pushIden, patch) {
  return pushbulletRequest(token, `/pushes/${encodeURIComponent(pushIden)}`, {
    method: "POST",
    body: patch
  });
}

export async function deletePush(token, pushIden) {
  return pushbulletRequest(token, `/pushes/${encodeURIComponent(pushIden)}`, {
    method: "DELETE"
  });
}

export async function createEphemeral(token, push) {
  return pushbulletRequest(token, "/ephemerals", {
    method: "POST",
    body: {
      type: "push",
      push
    }
  });
}

export async function requestUpload(token, fileName, fileType, fileSize = 0) {
  try {
    const upload = await pushbulletRequest(token, `${API_ORIGIN}/v3/start-upload`, {
      method: "POST",
      body: {
        name: fileName,
        size: Math.max(0, Number(fileSize || 0)),
        suggested_type: fileType || "application/octet-stream"
      }
    });
    return {
      upload_type: "chunked",
      ...upload
    };
  } catch (error) {
    const upload = await pushbulletRequest(token, "/upload-request", {
      method: "POST",
      body: {
        file_name: fileName,
        file_type: fileType || "application/octet-stream"
      }
    });
    return {
      upload_type: "multipart",
      ...upload
    };
  }
}

export async function finishUpload(token, uploadId) {
  return pushbulletRequest(token, `${API_ORIGIN}/v3/finish-upload`, {
    method: "POST",
    body: {
      id: uploadId
    }
  });
}
