# Chrome Web Store Privacy Fields

## Single Purpose

Bullet Bridge lets Pushbullet users send, receive, search, and manage their
Pushbullet pushes from a Chromium-based browser.

## Data Use Disclosure

Bullet Bridge handles Pushbullet account data, device metadata, push content,
selected files, mirrored Android notification text, and the active tab URL/title
only when needed for user-facing Pushbullet features.

Data is used only to:

- Sign in to Pushbullet.
- Display the user's Pushbullet devices.
- Send pushes and selected files.
- Receive and display pushes.
- Display and dismiss mirrored Android notifications.
- Open links or files the user chooses to open.
- Search loaded push history locally in the extension popup.

Bullet Bridge does not sell user data, use user data for advertising, transfer
user data for unrelated purposes, include analytics, include telemetry, or allow
humans to read user data.

## Data Transfer

Data is sent only to:

- Pushbullet OAuth and API endpoints.
- Pushbullet websocket endpoint.
- Pushbullet-provided file upload endpoints.
- Pushbullet-provided file, image, video, and favicon resources needed to show
  push previews.

## Permission Justifications

### `activeTab`

Used only after a user action to read the current tab URL/title when the user
clicks the current-tab send action.

### `alarms`

Used for periodic maintenance such as reconnecting realtime updates and syncing
recent push history while the extension is installed.

### `clipboardWrite`

Used when the user clicks a copy button on a push bubble to copy that exact push
content to the clipboard.

### `contextMenus`

Used to add the Bullet Bridge right-click menu for sending pages, links,
selected text, and image URLs to Pushbullet devices.

### `favicon`

Used to show website favicons in link previews inside push history.

### `identity`

Used for Pushbullet OAuth sign-in through `chrome.identity.launchWebAuthFlow`.

### `notifications`

Used to show received Pushbullet pushes and mirrored Android notifications as
browser notifications.

### `storage`

Used to store local extension settings, OAuth/access token state, device lists,
push sync cursor, unread count, and local mirrored notification records.

## Host Permission Justifications

### `https://api.pushbullet.com/*`

Used to call Pushbullet API endpoints for account, device, push, notification,
and upload metadata operations.

### `https://upload.pushbullet.com/*`

Used for Pushbullet file upload requests.

### `https://*.pushbullet.com/*`

Used for Pushbullet OAuth, API, upload, and Pushbullet-hosted resources required
by Pushbullet responses.

### `https://s3.amazonaws.com/*` and `https://*.s3.amazonaws.com/*`

Used only for Pushbullet-provided file upload URLs and file preview/download
URLs returned by Pushbullet.

## Remote Code Statement

Bullet Bridge does not load remote JavaScript. Runtime code is packaged inside
the extension.
