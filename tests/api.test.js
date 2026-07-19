import assert from "node:assert/strict";
import test from "node:test";

import {
  createEphemeral,
  deleteDevice,
  deletePush,
  updateDevice
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

test("updateDevice sends the encryption fingerprint to the device endpoint", async () => {
  const calls = [];
  const fingerprint = Buffer.alloc(32, 0xaa).toString("base64");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({
      iden: "device/id",
      active: true,
      key_fingerprint: fingerprint
    });
  };

  try {
    await updateDevice("test-token", "device/id", {
      key_fingerprint: fingerprint
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.pushbullet.com/v2/devices/device%2Fid");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    key_fingerprint: fingerprint
  });
});

test("createEphemeral wraps encrypted payloads in the documented Pushbullet envelope", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({});
  };

  try {
    await createEphemeral("test-token", {
      encrypted: true,
      ciphertext: "encrypted-message"
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.pushbullet.com/v2/ephemerals");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    type: "push",
    push: {
      encrypted: true,
      ciphertext: "encrypted-message"
    }
  });
});
