import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContextMenuItems,
  buildContextMenuPush,
  buildContextMenuTargets,
  CONTEXT_MENU_ROOT_ID,
  parseContextMenuTargetId
} from "../src/shared/context-menu.js";

test("builds target menus for all devices and active pushable devices", () => {
  const devices = [
    device("phone", "Pixel 8", "android"),
    device("browser", "Bullet Bridge (Brave)", "stream"),
    { ...device("inactive", "Old Browser", "stream"), active: false },
    { ...device("blocked", "Read Only", "stream"), pushable: false }
  ];

  assert.deepEqual(buildContextMenuTargets(devices), [
    {
      deviceIden: "",
      label: "All devices"
    },
    {
      deviceIden: "phone",
      label: "Pixel 8"
    },
    {
      deviceIden: "browser",
      label: "Bullet Bridge (Brave)"
    }
  ]);
});

test("builds nested menu items for page, link, selection, and image pushes", () => {
  const items = buildContextMenuItems([device("phone", "Pixel 8", "android")]);
  const ids = items.map((item) => item.id);

  assert.equal(items[0].id, CONTEXT_MENU_ROOT_ID);
  assert.ok(ids.includes("bullet-bridge-action:page"));
  assert.ok(ids.includes("bullet-bridge-action:link"));
  assert.ok(ids.includes("bullet-bridge-action:selection"));
  assert.ok(ids.includes("bullet-bridge-action:image"));
  assert.ok(ids.includes("bullet-bridge-target:image:phone"));
});

test("parses context menu target ids", () => {
  assert.deepEqual(parseContextMenuTargetId("bullet-bridge-target:link:device%2Fid"), {
    action: "link",
    deviceIden: "device/id"
  });
  assert.deepEqual(parseContextMenuTargetId("bullet-bridge-target:page:"), {
    action: "page",
    deviceIden: ""
  });
  assert.equal(parseContextMenuTargetId("push-link"), null);
});

test("builds page link pushes for selected targets", () => {
  assert.deepEqual(
    buildContextMenuPush("page", {}, {
      title: "Example",
      url: "https://example.com/docs"
    }, "phone"),
    {
      type: "link",
      title: "Example",
      url: "https://example.com/docs",
      device_iden: "phone"
    }
  );
});

test("builds link, selection, and image pushes", () => {
  assert.deepEqual(
    buildContextMenuPush("link", {
      linkText: "Docs",
      linkUrl: "https://example.com/docs"
    }, {}),
    {
      type: "link",
      title: "Docs",
      url: "https://example.com/docs"
    }
  );

  assert.deepEqual(
    buildContextMenuPush("selection", {
      selectionText: "Remember this text"
    }, {
      title: "Notes"
    }),
    {
      type: "note",
      title: "Notes",
      body: "Remember this text"
    }
  );

  assert.deepEqual(
    buildContextMenuPush("image", {
      srcUrl: "https://example.com/image.png"
    }, {
      title: "Gallery"
    }),
    {
      type: "link",
      title: "Gallery",
      url: "https://example.com/image.png"
    }
  );
});

test("rejects non-web context menu URLs", () => {
  assert.throws(
    () => buildContextMenuPush("image", { srcUrl: "data:image/png;base64,AAAA" }, {}),
    /cannot be pushed/
  );
  assert.throws(
    () => buildContextMenuPush("page", {}, { url: "chrome://extensions" }),
    /cannot be pushed/
  );
});

function device(iden, nickname, type) {
  return {
    iden,
    nickname,
    type,
    active: true,
    pushable: true
  };
}
