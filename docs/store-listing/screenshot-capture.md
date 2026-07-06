# Screenshot Capture Notes

Chrome Web Store screenshots should be real UI captures at `1280x800`.

## Required Screenshots

1. `docs/screenshots/01-settings.png`
   Settings page with demo account, connection, delivery options, and devices.
2. `docs/screenshots/02-pushes.png`
   Push history popup showing media preview and composer.
3. `docs/screenshots/03-notifications.png`
   Mirrored Android notifications tab.
4. `docs/screenshots/04-search.png`
   Search bar filtering loaded pushes.
5. `docs/screenshots/05-context-menu.png`
   Real browser right-click menu showing Bullet Bridge send targets.

## Context Menu Screenshot

The context menu screenshot must be captured from the browser/OS, not generated
inside the extension.

Recommended capture:

1. Load the current unpacked extension.
2. Sign in or use demo-safe device names before capturing.
3. Open a neutral page such as `https://example.com`.
4. Right-click the page, a link, selected text, or an image.
5. Open the `Bullet Bridge` submenu.
6. Capture the full browser window at `1280x800`.
7. Save it as `docs/screenshots/05-context-menu.png`.

The screenshot should show:

- The browser context menu.
- The `Bullet Bridge` menu item.
- At least one send action, such as `Send page to`.
- Target choices such as `All devices` and one example device.

Avoid showing:

- Personal browsing history.
- Personal Pushbullet device names.
- Personal URLs, emails, names, or notification text.
- Any Pushbullet official logo or branding beyond compatibility text already
  present in browser/Pushbullet UI.
