const DATABASE_NAME = "bullet-bridge-encryption";
const DATABASE_VERSION = 1;
const KEY_STORE_NAME = "account-keys";

let databasePromise = null;

export async function getEncryptionKeyRecord(userIden) {
  const key = normalizeUserIden(userIden);
  if (!key) {
    return null;
  }
  return runRequest("readonly", (store) => store.get(key));
}

export async function storeEncryptionKeyRecord(record) {
  const userIden = normalizeUserIden(record?.userIden);
  const fingerprint = normalizeEncryptionFingerprint(record?.fingerprint);
  if (!userIden || !record?.key || !fingerprint) {
    throw new Error("The encryption key record is invalid.");
  }

  await runRequest("readwrite", (store) => store.put({
    userIden,
    fingerprint,
    key: record.key,
    updatedAt: new Date().toISOString()
  }));
}

export async function deleteEncryptionKeyRecord(userIden) {
  const key = normalizeUserIden(userIden);
  if (!key) {
    return;
  }
  await runRequest("readwrite", (store) => store.delete(key));
}

export async function clearEncryptionKeyStore() {
  await runRequest("readwrite", (store) => store.clear());
}

async function runRequest(mode, createRequest) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(KEY_STORE_NAME, mode);
    const store = transaction.objectStore(KEY_STORE_NAME);
    let request;

    try {
      request = createRequest(store);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }

    transaction.oncomplete = () => resolve(request?.result ?? null);
    transaction.onabort = () => reject(transaction.error || request?.error || new Error("Encryption key storage was aborted."));
    transaction.onerror = () => reject(transaction.error || request?.error || new Error("Encryption key storage failed."));
  });
}

function openDatabase() {
  if (databasePromise) {
    return databasePromise;
  }
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("IndexedDB is not available in this browser."));
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(KEY_STORE_NAME)) {
        database.createObjectStore(KEY_STORE_NAME, { keyPath: "userIden" });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error("Unable to open encryption key storage."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Encryption key storage is blocked by another extension page."));
    };
  });

  return databasePromise;
}

function normalizeUserIden(value) {
  return String(value || "").trim();
}

export function normalizeEncryptionFingerprint(value) {
  const fingerprint = String(value || "").trim();
  return /^[A-Za-z0-9+/]{43}=$/.test(fingerprint) ? fingerprint : "";
}
