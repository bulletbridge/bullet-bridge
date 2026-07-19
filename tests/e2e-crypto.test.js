import assert from "node:assert/strict";
import {
  createHash,
  pbkdf2Sync,
  webcrypto
} from "node:crypto";
import test from "node:test";

import {
  PushbulletEncryptionError,
  decryptPushbulletMessage,
  decryptPushbulletPayload,
  derivePushbulletEncryptionKey,
  encryptPushbulletPayload,
  encryptionFingerprintMatchesPeers,
  importPushbulletEncryptionKey,
  isEncryptedPushbulletPayload
} from "../src/shared/e2e-crypto.js";

const OFFICIAL_KEY = "1sW28zp7CWv5TtGjlQpDHHG4Cbr9v36fG5o4f74LsKg=";
const OFFICIAL_CIPHERTEXT = "MSfJxxY5YdjttlfUkCaKA57qU9SuCN8+ZhYg/xieI+lDnQ==";

test("decrypts the official Pushbullet AES-GCM example", async () => {
  const key = await importPushbulletEncryptionKey(OFFICIAL_KEY, webcrypto);
  const message = await decryptPushbulletMessage(OFFICIAL_CIPHERTEXT, key, webcrypto);
  assert.equal(message, "meow!");
  assert.equal(key.extractable, false);
});

test("derives the documented PBKDF2 key and SHA-256 fingerprint", async () => {
  const password = "correct horse battery staple";
  const userIden = "user-iden-for-test";
  const expectedKey = pbkdf2Sync(password, userIden, 30000, 32, "sha256");
  const expectedFingerprint = createHash("sha256").update(expectedKey).digest("base64");

  const material = await derivePushbulletEncryptionKey(password, userIden, webcrypto);
  assert.equal(material.fingerprint, expectedFingerprint);
  assert.equal(material.key.algorithm.name, "AES-GCM");
  assert.equal(material.key.algorithm.length, 256);
  assert.equal(material.key.extractable, false);
});

test("round-trips a Pushbullet mirrored-notification payload", async () => {
  const material = await derivePushbulletEncryptionKey("test-password", "user-1", webcrypto);
  const payload = {
    type: "mirror",
    package_name: "com.example.mail",
    notification_id: "42",
    title: "New mail",
    body: "Security report ready"
  };

  const ciphertext = await encryptPushbulletPayload(payload, material.key, webcrypto);
  const decrypted = await decryptPushbulletPayload(ciphertext, material.key, webcrypto);

  assert.equal(atob(ciphertext).charAt(0), "1");
  assert.deepEqual(decrypted, payload);
});

test("rejects a modified authentication tag", async () => {
  const material = await derivePushbulletEncryptionKey("test-password", "user-1", webcrypto);
  const ciphertext = await encryptPushbulletPayload({ type: "mirror", body: "private" }, material.key, webcrypto);
  const bytes = Uint8Array.from(atob(ciphertext), (character) => character.charCodeAt(0));
  bytes[1] ^= 0xff;
  const tampered = btoa(String.fromCharCode(...bytes));

  await assert.rejects(
    decryptPushbulletPayload(tampered, material.key, webcrypto),
    (error) => error instanceof PushbulletEncryptionError && error.code === "decryption_failed"
  );
});

test("rejects a key derived from the wrong password", async () => {
  const correct = await derivePushbulletEncryptionKey("correct-password", "user-1", webcrypto);
  const wrong = await derivePushbulletEncryptionKey("wrong-password", "user-1", webcrypto);
  const ciphertext = await encryptPushbulletPayload({ type: "mirror", body: "private" }, correct.key, webcrypto);

  await assert.rejects(
    decryptPushbulletPayload(ciphertext, wrong.key, webcrypto),
    (error) => error instanceof PushbulletEncryptionError && error.code === "decryption_failed"
  );
});

test("rejects unsupported encoding versions and malformed Base64", async () => {
  const material = await derivePushbulletEncryptionKey("test-password", "user-1", webcrypto);
  const ciphertext = await encryptPushbulletPayload({ type: "mirror" }, material.key, webcrypto);
  const bytes = Uint8Array.from(atob(ciphertext), (character) => character.charCodeAt(0));
  bytes[0] = 0x32;

  await assert.rejects(
    decryptPushbulletPayload(btoa(String.fromCharCode(...bytes)), material.key, webcrypto),
    (error) => error instanceof PushbulletEncryptionError && error.code === "invalid_format"
  );
  await assert.rejects(
    decryptPushbulletPayload("not-base64", material.key, webcrypto),
    (error) => error instanceof PushbulletEncryptionError && error.code === "invalid_format"
  );
});

test("recognizes encrypted ephemeral envelopes", () => {
  assert.equal(isEncryptedPushbulletPayload({ encrypted: true, ciphertext: "MQ==" }), true);
  assert.equal(isEncryptedPushbulletPayload({ encrypted: true }), false);
  assert.equal(isEncryptedPushbulletPayload({ type: "mirror" }), false);
});

test("accepts a fingerprint when no peers advertise encryption or one peer matches", () => {
  const fingerprint = Buffer.alloc(32, 0xaa).toString("base64");
  const otherFingerprint = Buffer.alloc(32, 0xbb).toString("base64");
  assert.equal(encryptionFingerprintMatchesPeers(fingerprint, [
    { iden: "local", key_fingerprint: otherFingerprint },
    { iden: "phone" }
  ], "local"), true);
  assert.equal(encryptionFingerprintMatchesPeers(fingerprint, [
    { iden: "phone", key_fingerprint: fingerprint },
    { iden: "tablet", key_fingerprint: otherFingerprint }
  ]), true);
  assert.equal(encryptionFingerprintMatchesPeers(fingerprint, [
    { iden: "phone", key_fingerprint: otherFingerprint }
  ]), false);
});

test("treats Pushbullet key fingerprints as case-sensitive Base64", () => {
  const fingerprint = Buffer.alloc(32, 0xab).toString("base64");
  assert.equal(fingerprint.length, 44);
  assert.equal(encryptionFingerprintMatchesPeers(fingerprint, [
    { iden: "phone", key_fingerprint: fingerprint.toUpperCase() }
  ]), false);
});
