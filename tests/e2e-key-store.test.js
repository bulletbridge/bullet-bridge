import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeEncryptionFingerprint
} from "../src/shared/e2e-key-store.js";

test("accepts and preserves Pushbullet SHA-256 Base64 fingerprints", () => {
  const fingerprint = Buffer.from(Array.from({ length: 32 }, (_, index) => index)).toString("base64");

  assert.equal(fingerprint.length, 44);
  assert.equal(normalizeEncryptionFingerprint(`  ${fingerprint}  `), fingerprint);
});

test("rejects legacy hex and malformed encryption fingerprints", () => {
  assert.equal(normalizeEncryptionFingerprint("a".repeat(64)), "");
  assert.equal(normalizeEncryptionFingerprint("A".repeat(44)), "");
  assert.equal(normalizeEncryptionFingerprint("not-base64"), "");
  assert.equal(normalizeEncryptionFingerprint(""), "");
});
