import assert from "node:assert/strict";
import test from "node:test";

import {
  bulletBridgeDeviceFamily,
  findOldBulletBridgeDevices
} from "../src/shared/device-cleanup.js";

test("normalizes numbered Bullet Bridge browser device families", () => {
  assert.equal(
    bulletBridgeDeviceFamily({ nickname: "Bullet Bridge (Brave #4)" }),
    "Bullet Bridge (Brave)"
  );
  assert.equal(
    bulletBridgeDeviceFamily({ nickname: "Bullet Bridge (Chrome)" }),
    "Bullet Bridge (Chrome)"
  );
});

test("does not classify unrelated devices as Bullet Bridge devices", () => {
  assert.equal(bulletBridgeDeviceFamily({ nickname: "OnePlus CPH2747" }), "");
  assert.equal(bulletBridgeDeviceFamily({ nickname: "" }), "");
});

test("finds old duplicates for the same browser family and keeps the current local device", () => {
  const localDevice = device("local", "Bullet Bridge (Brave #4)");
  const duplicates = findOldBulletBridgeDevices([
    localDevice,
    device("old-1", "Bullet Bridge (Brave)"),
    device("old-2", "Bullet Bridge (Brave #2)"),
    device("chrome", "Bullet Bridge (Chrome)"),
    device("phone", "OnePlus CPH2747")
  ], localDevice);

  assert.deepEqual(duplicates.map((item) => item.iden), ["old-1", "old-2"]);
});

test("includes the legacy bare Bullet Bridge device name", () => {
  const duplicates = findOldBulletBridgeDevices([
    device("local", "Bullet Bridge (Brave)"),
    device("legacy", "Bullet Bridge")
  ], device("local", "Bullet Bridge (Brave)"));

  assert.deepEqual(duplicates.map((item) => item.iden), ["legacy"]);
});

test("ignores inactive duplicates", () => {
  const duplicates = findOldBulletBridgeDevices([
    device("local", "Bullet Bridge (Brave)"),
    { ...device("inactive", "Bullet Bridge (Brave #2)"), active: false }
  ], device("local", "Bullet Bridge (Brave)"));

  assert.deepEqual(duplicates, []);
});

function device(iden, nickname) {
  return {
    iden,
    nickname,
    type: "stream",
    active: true
  };
}
