# Changelog

## Unreleased

Nothing yet.

## 0.4.1 - 2026-07-08

- Changed the Chrome Web Store package title to `Bullet Bridge for Pushbullet`
  while keeping the in-app name as `Bullet Bridge`.
- Improved the Chrome Web Store package summary for Pushbullet search
  visibility and clearer user expectations.
- Updated store-listing documentation for the `0.4.1` metadata update.

## 0.4.0 - 2026-07-06

- Changed project licensing from MIT to the Bullet Bridge Source Available License.
- Added trademark and unofficial Pushbullet compatibility guidance.
- Added icons to the logged-out popup setup buttons for UI consistency.
- Added loaded push-history search in the popup.
- Fixed the popup header shifting when search results are shown.
- Improved screenshot demo mode with visible image and video preview pushes.
- Reduced background maintenance wakeups and capped stored notification metadata.
- Expanded release validation to cover all shipped shared modules and public documents.
- Added device-target submenus for right-click page, link, selected text, and image URL pushes.
- Added per-push delete controls in chat history.
- Fixed mirrored Android notifications staying visible after they are dismissed on the source device.
- Hardened mirrored Android notification dismissal matching and added unit tests for dismissal edge cases.
- Added a setting to choose whether the popup sends messages with `Ctrl+Enter` or plain `Enter`.
- Removed success notifications and status text after sending pushes.
- Simplified the settings connection panel wording and layout.
- Added manual cleanup for old duplicate Bullet Bridge browser entries and reduced green-heavy UI states.

## 0.3.0 - 2026-07-04

- Added Pushbullet OAuth sign-in through the Chrome extension identity flow.
- Added a normal sign-in button with developer OAuth setup hidden from the primary settings UI.
- Added a compact logged-out popup state.
- Added a stable GitHub-only unpacked extension ID and release zip build script.
- Bundled the GitHub-only Bullet Bridge OAuth client ID.
- Registered browser devices with browser-specific names and migrated the old `Bullet Bridge` name on reload.
- Removed developer OAuth controls from the normal settings UI.
- Renamed user-facing push lanes from streams to devices.
- Added screenshot demo mode with fake local account, device, push, and notification data.
- Added final `1280x800` screenshots captured from screenshot demo mode.
- Added browser notification action buttons for opening and dismissing received pushes.
- Added mirrored Android notification dismissal from browser notification action buttons.
- Added an opt-in setting to treat closing browser notifications as dismiss.
- Softened the dark palette so green is used as an accent instead of broad content fill.
- Improved popup message rendering, link previews, scrollbars, and composer polish.
- Moved popup refresh into the device header to reclaim message space.
- Tightened popup typography for a denser utility layout.
- Improved options page account layout, fallback token controls, settings typography, and two-column spacing.
- Kept manual access-token setup as a fallback.
- Updated privacy and release documentation for OAuth storage and network use.

## 0.2.0 - 2026-07-03

- Added chat-style push history by device.
- Added cursor-based loading for older pushes.
- Added toolbar popup file sending with upload progress.
- Added current-tab link sending.
- Added push copy action in chat bubbles.
- Added mirrored Android notification list.
- Added individual and bulk local notification clearing.
- Added unread badge handling.
- Added custom Bullet Bridge icon set.
- Improved popup layout, focus styling, and composer controls.
- Improved options/settings layout.
- Fixed stale upload progress after file sends.
- Fixed synthetic push titles appearing in chat/copy content.
- Fixed loaded history being reset after sending.
- Fixed repeated history loading when switching devices.

## 0.1.0 - 2026-07-03

- Initial local Manifest V3 Pushbullet client.
- Added personal token settings.
- Added device list and local browser device registration.
- Added note/link sending.
- Added context menu sending.
- Added websocket receive path and browser notifications.
