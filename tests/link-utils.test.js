import assert from "node:assert/strict";
import test from "node:test";

import { matchingPageTitle } from "../src/shared/link-utils.js";

test("uses the active page title for a matching link, ignoring fragments", () => {
  assert.equal(
    matchingPageTitle(
      "https://youtu.be/test#t=12",
      "https://youtu.be/test",
      "This Is A Test YouTube Video Title"
    ),
    "This Is A Test YouTube Video Title"
  );
});

test("does not borrow a title from a different page", () => {
  assert.equal(
    matchingPageTitle("https://youtu.be/test", "https://example.com/", "Example"),
    ""
  );
});

test("rejects titles and URLs that are empty or non-web", () => {
  assert.equal(matchingPageTitle("https://example.com", "https://example.com", "  "), "");
  assert.equal(matchingPageTitle("javascript:alert(1)", "https://example.com", "Example"), "");
});
