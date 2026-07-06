import assert from "node:assert/strict";
import test from "node:test";

import {
  pruneNotificationMap
} from "../src/shared/storage.js";

const NOW = Date.parse("2026-07-06T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

test("prunes old notification metadata", () => {
  const pruned = pruneNotificationMap({
    fresh: notification({ createdAt: new Date(NOW - 2 * DAY).toISOString() }),
    stale: notification({ createdAt: new Date(NOW - 8 * DAY).toISOString() })
  }, NOW);

  assert.deepEqual(Object.keys(pruned), ["fresh"]);
});

test("caps notification metadata to the newest entries", () => {
  const map = {};
  for (let index = 0; index < 205; index += 1) {
    map[`notification-${index}`] = notification({
      createdAt: new Date(NOW - index * 1000).toISOString()
    });
  }

  const pruned = pruneNotificationMap(map, NOW);

  assert.equal(Object.keys(pruned).length, 200);
  assert.equal(Boolean(pruned["notification-0"]), true);
  assert.equal(Boolean(pruned["notification-204"]), false);
});

test("keeps legacy notification metadata unless the hard cap removes it", () => {
  const pruned = pruneNotificationMap({
    legacy: notification({ createdAt: undefined })
  }, NOW);

  assert.deepEqual(Object.keys(pruned), ["legacy"]);
});

function notification(overrides = {}) {
  return {
    id: "notification",
    pushIden: "push",
    createdAt: new Date(NOW).toISOString(),
    ...overrides
  };
}
