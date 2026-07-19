export function makeMirrorNotificationId(push) {
  const parts = [
    "mirror",
    push.source_device_iden || "",
    push.package_name || "",
    push.notification_id || "",
    push.notification_tag || ""
  ];

  return parts.join(":").replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 240);
}

export function findMirroredNotificationIds(push, notifications = []) {
  const exactId = makeMirrorNotificationId(push);
  if (notifications.some((notification) => notification.id === exactId)) {
    return [exactId];
  }

  const packageName = String(push.package_name || "").trim();
  const notificationId = normalizeMirrorValue(push.notification_id);
  const notificationTag = normalizeMirrorValue(push.notification_tag);
  if (!packageName || notificationId === "") {
    return [];
  }

  const sourceDeviceIden = String(push.source_device_iden || "").trim();
  const sourceUserIden = String(push.source_user_iden || push.sender_iden || push.receiver_iden || "").trim();
  const matches = notifications
    .map((notification) => ({
      id: notification.id || "",
      score: mirrorMatchScore(notification, {
        packageName,
        notificationId,
        notificationTag,
        sourceDeviceIden,
        sourceUserIden
      })
    }))
    .filter((match) => match.id && match.score > 0);

  if (!matches.length) {
    return [];
  }

  const bestScore = Math.max(...matches.map((match) => match.score));
  return matches
    .filter((match) => match.score === bestScore)
    .map((match) => match.id);
}

export function normalizeMirrorValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

export function removeMirroredNotificationState(notificationIds, notificationMap = {}, notifications = []) {
  const ids = [...new Set((notificationIds || [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
  const idSet = new Set(ids);
  const nextNotificationMap = { ...notificationMap };
  const notificationById = new Map(notifications.map((notification) => [notification.id, notification]));
  let badgeDecrement = 0;
  let removed = 0;

  for (const id of ids) {
    const details = notificationMap[id] || null;
    const notification = notificationById.get(id) || null;
    if (details || notification) {
      removed += 1;
    }
    if (details?.badgeCounted || notification?.dismissed === false) {
      badgeDecrement += 1;
    }
    delete nextNotificationMap[id];
  }

  return {
    ids,
    notificationMap: nextNotificationMap,
    notifications: notifications.filter((notification) => !idSet.has(notification.id)),
    badgeDecrement,
    removed
  };
}

function mirrorMatchScore(notification, push) {
  if (String(notification.packageName || "").trim() !== push.packageName) {
    return 0;
  }
  if (normalizeMirrorValue(notification.notificationId) !== push.notificationId) {
    return 0;
  }
  if (normalizeMirrorValue(notification.notificationTag) !== push.notificationTag) {
    return 0;
  }

  const storedDeviceIden = String(notification.sourceDeviceIden || "").trim();
  const storedUserIden = String(notification.sourceUserIden || "").trim();
  let score = 1;

  if (push.sourceDeviceIden && storedDeviceIden === push.sourceDeviceIden) {
    score += 4;
  }

  if (push.sourceUserIden && storedUserIden === push.sourceUserIden) {
    score += 2;
  }

  return score;
}
