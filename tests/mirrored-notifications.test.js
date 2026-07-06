import assert from "node:assert/strict";
import test from "node:test";

import {
  findMirroredNotificationIds,
  makeMirrorNotificationId,
  normalizeMirrorValue
} from "../src/shared/mirrored-notifications.js";

test("builds stable mirrored notification ids", () => {
  assert.equal(
    makeMirrorNotificationId({
      source_device_iden: "phone-1",
      package_name: "com.whatsapp",
      notification_id: "42",
      notification_tag: "chat:family"
    }),
    "mirror:phone-1:com_whatsapp:42:chat:family"
  );
});

test("normalizes missing mirror values to empty strings", () => {
  assert.equal(normalizeMirrorValue(null), "");
  assert.equal(normalizeMirrorValue(undefined), "");
  assert.equal(normalizeMirrorValue(42), "42");
});

test("matches the exact stored id when source device is present", () => {
  const push = mirrorPush();
  const exactId = makeMirrorNotificationId(push);
  const ids = findMirroredNotificationIds(push, [
    storedNotification({ id: "other", sourceDeviceIden: "phone-2" }),
    storedNotification({ id: exactId })
  ]);

  assert.deepEqual(ids, [exactId]);
});

test("matches documented dismissal ephemerals without source device id", () => {
  const ids = findMirroredNotificationIds(dismissalPush(), [
    storedNotification({ id: "mirror:phone-1:com_whatsapp:42:" })
  ]);

  assert.deepEqual(ids, ["mirror:phone-1:com_whatsapp:42:"]);
});

test("matches numeric and string notification ids as the same notification", () => {
  const ids = findMirroredNotificationIds(dismissalPush({ notification_id: 42 }), [
    storedNotification({
      id: "mirror:phone-1:com_whatsapp:42:",
      notificationId: "42"
    })
  ]);

  assert.deepEqual(ids, ["mirror:phone-1:com_whatsapp:42:"]);
});

test("matches when stored notification lacks source user metadata", () => {
  const ids = findMirroredNotificationIds(dismissalPush({ source_user_iden: "user-1" }), [
    storedNotification({
      id: "mirror:phone-1:com_whatsapp:42:",
      sourceUserIden: ""
    })
  ]);

  assert.deepEqual(ids, ["mirror:phone-1:com_whatsapp:42:"]);
});

test("prefers source user matches when duplicate package/id/tag entries exist", () => {
  const ids = findMirroredNotificationIds(dismissalPush({ source_user_iden: "user-1" }), [
    storedNotification({
      id: "mirror:phone-1:com_whatsapp:42:",
      sourceUserIden: ""
    }),
    storedNotification({
      id: "mirror:phone-2:com_whatsapp:42:",
      sourceUserIden: "user-1"
    })
  ]);

  assert.deepEqual(ids, ["mirror:phone-2:com_whatsapp:42:"]);
});

test("does not match a different package, id, or tag", () => {
  assert.deepEqual(findMirroredNotificationIds(dismissalPush(), [
    storedNotification({ id: "wrong-package", packageName: "com.mail" })
  ]), []);

  assert.deepEqual(findMirroredNotificationIds(dismissalPush(), [
    storedNotification({ id: "wrong-id", notificationId: "43" })
  ]), []);

  assert.deepEqual(findMirroredNotificationIds(dismissalPush({ notification_tag: "chat-a" }), [
    storedNotification({ id: "wrong-tag", notificationTag: "chat-b" })
  ]), []);
});

test("returns all indistinguishable matches when Pushbullet gives no disambiguating device data", () => {
  const ids = findMirroredNotificationIds(dismissalPush({ source_user_iden: "" }), [
    storedNotification({ id: "mirror:phone-1:com_whatsapp:42:", sourceUserIden: "" }),
    storedNotification({ id: "mirror:phone-2:com_whatsapp:42:", sourceUserIden: "" })
  ]);

  assert.deepEqual(ids, [
    "mirror:phone-1:com_whatsapp:42:",
    "mirror:phone-2:com_whatsapp:42:"
  ]);
});

function mirrorPush(overrides = {}) {
  return {
    type: "mirror",
    source_device_iden: "phone-1",
    source_user_iden: "user-1",
    package_name: "com.whatsapp",
    notification_id: "42",
    notification_tag: null,
    ...overrides
  };
}

function dismissalPush(overrides = {}) {
  return {
    type: "dismissal",
    source_user_iden: "user-1",
    package_name: "com.whatsapp",
    notification_id: "42",
    notification_tag: null,
    ...overrides
  };
}

function storedNotification(overrides = {}) {
  return {
    id: "mirror:phone-1:com_whatsapp:42:",
    packageName: "com.whatsapp",
    sourceDeviceIden: "phone-1",
    sourceUserIden: "user-1",
    notificationId: "42",
    notificationTag: null,
    dismissed: false,
    ...overrides
  };
}
