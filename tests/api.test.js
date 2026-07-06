import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteDevice,
  deletePush
} from "../src/shared/api.js";

test("deleteDevice uses the Pushbullet device DELETE endpoint", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  };

  try {
    await deleteDevice("test-token", "device/id");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.pushbullet.com/v2/devices/device%2Fid");
  assert.equal(calls[0].init.method, "DELETE");
});

test("deletePush uses the Pushbullet push DELETE endpoint", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    });
  };

  try {
    await deletePush("test-token", "push/id");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.pushbullet.com/v2/pushes/push%2Fid");
  assert.equal(calls[0].init.method, "DELETE");
});
