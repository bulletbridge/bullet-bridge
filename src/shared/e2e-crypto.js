const PBKDF2_ITERATIONS = 30000;
const DERIVED_KEY_BITS = 256;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const ENCODING_VERSION = 0x31;

export class PushbulletEncryptionError extends Error {
  constructor(message, code = "encryption_error", cause = null) {
    super(message, cause ? { cause } : undefined);
    this.name = "PushbulletEncryptionError";
    this.code = code;
  }
}

export async function derivePushbulletEncryptionKey(password, userIden, cryptoApi = globalThis.crypto) {
  const cleanPassword = String(password || "");
  const cleanUserIden = String(userIden || "").trim();
  if (!cleanPassword || !cleanUserIden) {
    throw new PushbulletEncryptionError("An encryption password and Pushbullet account are required.", "missing_input");
  }

  const crypto = requireCrypto(cryptoApi);
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(cleanPassword);
  const saltBytes = encoder.encode(cleanUserIden);
  let derivedBytes = null;

  try {
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits({
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS
    }, passwordKey, DERIVED_KEY_BITS);
    derivedBytes = new Uint8Array(derivedBits);

    const [key, fingerprintBuffer] = await Promise.all([
      crypto.subtle.importKey(
        "raw",
        derivedBytes,
        { name: "AES-GCM", length: DERIVED_KEY_BITS },
        false,
        ["encrypt", "decrypt"]
      ),
      crypto.subtle.digest("SHA-256", derivedBytes)
    ]);

    return {
      key,
      fingerprint: encodeBase64(new Uint8Array(fingerprintBuffer))
    };
  } catch (error) {
    throw new PushbulletEncryptionError("Unable to derive the Pushbullet encryption key.", "key_derivation_failed", error);
  } finally {
    passwordBytes.fill(0);
    saltBytes.fill(0);
    derivedBytes?.fill(0);
  }
}

export async function importPushbulletEncryptionKey(base64Key, cryptoApi = globalThis.crypto) {
  const crypto = requireCrypto(cryptoApi);
  const keyBytes = decodeBase64(base64Key);
  if (keyBytes.length !== DERIVED_KEY_BITS / 8) {
    keyBytes.fill(0);
    throw new PushbulletEncryptionError("The Pushbullet encryption key has an invalid length.", "invalid_key");
  }

  try {
    return await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM", length: DERIVED_KEY_BITS },
      false,
      ["encrypt", "decrypt"]
    );
  } finally {
    keyBytes.fill(0);
  }
}

export async function encryptPushbulletPayload(payload, key, cryptoApi = globalThis.crypto) {
  if (!isRecord(payload)) {
    throw new PushbulletEncryptionError("Only Pushbullet payload objects can be encrypted.", "invalid_payload");
  }

  const crypto = requireCrypto(cryptoApi);
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  try {
    const encryptedBuffer = await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv,
      tagLength: GCM_TAG_BYTES * 8
    }, key, plaintext);
    const encrypted = new Uint8Array(encryptedBuffer);
    if (encrypted.length < GCM_TAG_BYTES) {
      throw new PushbulletEncryptionError("Pushbullet encryption produced an invalid result.", "encryption_failed");
    }

    const ciphertextLength = encrypted.length - GCM_TAG_BYTES;
    const encoded = new Uint8Array(1 + GCM_TAG_BYTES + GCM_IV_BYTES + ciphertextLength);
    encoded[0] = ENCODING_VERSION;
    encoded.set(encrypted.subarray(ciphertextLength), 1);
    encoded.set(iv, 1 + GCM_TAG_BYTES);
    encoded.set(encrypted.subarray(0, ciphertextLength), 1 + GCM_TAG_BYTES + GCM_IV_BYTES);
    return encodeBase64(encoded);
  } catch (error) {
    if (error instanceof PushbulletEncryptionError) {
      throw error;
    }
    throw new PushbulletEncryptionError("Unable to encrypt the Pushbullet payload.", "encryption_failed", error);
  } finally {
    plaintext.fill(0);
    iv.fill(0);
  }
}

export async function decryptPushbulletPayload(ciphertext, key, cryptoApi = globalThis.crypto) {
  const message = await decryptPushbulletMessage(ciphertext, key, cryptoApi);
  let payload;
  try {
    payload = JSON.parse(message);
  } catch (error) {
    throw new PushbulletEncryptionError("The decrypted Pushbullet payload is not valid JSON.", "invalid_payload", error);
  }
  if (!isRecord(payload)) {
    throw new PushbulletEncryptionError("The decrypted Pushbullet payload is not an object.", "invalid_payload");
  }
  return payload;
}

export async function decryptPushbulletMessage(ciphertext, key, cryptoApi = globalThis.crypto) {
  const crypto = requireCrypto(cryptoApi);
  const encoded = decodeBase64(ciphertext);
  const headerLength = 1 + GCM_TAG_BYTES + GCM_IV_BYTES;
  if (encoded.length <= headerLength || encoded[0] !== ENCODING_VERSION) {
    encoded.fill(0);
    throw new PushbulletEncryptionError("The encrypted Pushbullet payload has an unsupported format.", "invalid_format");
  }

  const tag = encoded.slice(1, 1 + GCM_TAG_BYTES);
  const iv = encoded.slice(1 + GCM_TAG_BYTES, headerLength);
  const encryptedBody = encoded.slice(headerLength);
  const encryptedWithTag = new Uint8Array(encryptedBody.length + tag.length);
  encryptedWithTag.set(encryptedBody, 0);
  encryptedWithTag.set(tag, encryptedBody.length);

  try {
    const plaintextBuffer = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv,
      tagLength: GCM_TAG_BYTES * 8
    }, key, encryptedWithTag);
    const plaintext = new Uint8Array(plaintextBuffer);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
    } finally {
      plaintext.fill(0);
    }
  } catch (error) {
    if (error instanceof PushbulletEncryptionError) {
      throw error;
    }
    throw new PushbulletEncryptionError(
      "Unable to decrypt the Pushbullet payload. Check that the encryption password matches your other devices.",
      "decryption_failed",
      error
    );
  } finally {
    encoded.fill(0);
    tag.fill(0);
    iv.fill(0);
    encryptedBody.fill(0);
    encryptedWithTag.fill(0);
  }
}

export function isEncryptedPushbulletPayload(push) {
  return Boolean(push?.encrypted === true && typeof push.ciphertext === "string" && push.ciphertext);
}

export function encryptionFingerprintMatchesPeers(fingerprint, devices = [], localDeviceIden = "") {
  const cleanFingerprint = String(fingerprint || "").trim();
  const peerFingerprints = new Set(devices
    .filter((device) => device?.active !== false && device?.iden !== localDeviceIden)
    .map((device) => String(device?.key_fingerprint || "").trim())
    .filter(Boolean));
  return peerFingerprints.size === 0 || peerFingerprints.has(cleanFingerprint);
}

function requireCrypto(cryptoApi) {
  if (!cryptoApi?.subtle || typeof cryptoApi.getRandomValues !== "function") {
    throw new PushbulletEncryptionError("Web Crypto is not available in this browser.", "crypto_unavailable");
  }
  return cryptoApi;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function encodeBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value) {
  const clean = String(value || "").trim();
  if (!clean || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new PushbulletEncryptionError("The encrypted Pushbullet payload is not valid Base64.", "invalid_format");
  }

  try {
    const binary = atob(clean);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch (error) {
    throw new PushbulletEncryptionError("The encrypted Pushbullet payload is not valid Base64.", "invalid_format", error);
  }
}
