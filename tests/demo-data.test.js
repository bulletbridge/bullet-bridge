import assert from "node:assert/strict";
import test from "node:test";

import {
  createDemoState,
  getDemoPushPage
} from "../src/shared/demo-data.js";

test("screenshot demo page includes visible image and video preview pushes", () => {
  const state = createDemoState();
  const page = getDemoPushPage(state, "", 6);

  const imagePush = page.pushes.find((push) => push.fileType === "image/jpeg");
  const videoPush = page.pushes.find((push) => push.fileType === "video/mp4");

  assert.equal(imagePush?.url, "src/assets/demo-image.svg");
  assert.equal(imagePush?.imageUrl, "src/assets/demo-image.svg");
  assert.equal(videoPush?.url, "src/assets/demo-video.mp4");
  assert.equal(videoPush?.imageUrl, "src/assets/demo-video-poster.svg");
});
