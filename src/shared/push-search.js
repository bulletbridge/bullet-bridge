const SYNTHETIC_TITLES = new Set([
  "File received",
  "Link received",
  "Push received"
]);

export function normalizeSearchQuery(query) {
  return String(query || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function filterPushesBySearch(pushes, query) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) {
    return pushes;
  }

  const tokens = normalized.split(" ");
  return pushes.filter((push) => {
    const text = pushSearchText(push);
    return tokens.every((token) => text.includes(token));
  });
}

export function pushMatchesSearch(push, query) {
  return filterPushesBySearch([push], query).length === 1;
}

export function pushSearchText(push = {}) {
  const title = String(push.title || "").trim();
  const searchableTitle = SYNTHETIC_TITLES.has(title) ? "" : title;

  return [
    searchableTitle,
    push.body,
    push.url,
    push.imageUrl,
    push.fileName,
    push.fileType,
    push.sourceName,
    push.senderName,
    push.targetName,
    push.receiverEmail,
    push.detail,
    push.type
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}
