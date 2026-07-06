import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPushesBySearch,
  normalizeSearchQuery,
  pushMatchesSearch,
  pushSearchText
} from "../src/shared/push-search.js";

test("normalizes search queries", () => {
  assert.equal(normalizeSearchQuery("  Pixel   Notes  "), "pixel notes");
});

test("empty search returns all pushes without changing order", () => {
  const pushes = [
    push({ iden: "one", body: "First" }),
    push({ iden: "two", body: "Second" })
  ];

  assert.equal(filterPushesBySearch(pushes, ""), pushes);
  assert.deepEqual(filterPushesBySearch(pushes, " ").map((item) => item.iden), ["one", "two"]);
});

test("matches body, real title, url, file, and device labels case-insensitively", () => {
  const pushes = [
    push({
      iden: "note",
      title: "Release Notes",
      body: "Review before publishing.",
      sourceName: "Work Chrome"
    }),
    push({
      iden: "link",
      title: "Example dashboard",
      url: "https://example.com/status",
      targetName: "Pixel 8"
    }),
    push({
      iden: "file",
      fileName: "quarterly-summary.zip",
      fileType: "application/zip"
    })
  ];

  assert.deepEqual(filterPushesBySearch(pushes, "release").map((item) => item.iden), ["note"]);
  assert.deepEqual(filterPushesBySearch(pushes, "EXAMPLE.COM").map((item) => item.iden), ["link"]);
  assert.deepEqual(filterPushesBySearch(pushes, "pixel").map((item) => item.iden), ["link"]);
  assert.deepEqual(filterPushesBySearch(pushes, "summary zip").map((item) => item.iden), ["file"]);
});

test("multi-word search requires every token", () => {
  const pushes = [
    push({ iden: "one", body: "Design QA notes are ready." }),
    push({ iden: "two", body: "Design release checklist." })
  ];

  assert.deepEqual(filterPushesBySearch(pushes, "design ready").map((item) => item.iden), ["one"]);
  assert.deepEqual(filterPushesBySearch(pushes, "design missing"), []);
});

test("ignores synthetic Pushbullet titles", () => {
  const item = push({
    title: "Push received",
    body: "Actual message"
  });

  assert.equal(pushSearchText(item).includes("push received"), false);
  assert.equal(pushMatchesSearch(item, "actual"), true);
  assert.equal(pushMatchesSearch(item, "push received"), false);
});

function push(values) {
  return {
    iden: "",
    type: "note",
    title: "",
    body: "",
    url: "",
    imageUrl: "",
    fileName: "",
    fileType: "",
    sourceName: "",
    senderName: "",
    targetName: "",
    receiverEmail: "",
    detail: "",
    ...values
  };
}
