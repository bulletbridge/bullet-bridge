# Chrome Web Store Maintenance Checklist

## Current Listing

Published listing:

```text
https://chromewebstore.google.com/detail/bullet-bridge/iadffmbdjdnnnpdmackjpoieokimphbn
```

Chrome Web Store extension ID:

```text
iadffmbdjdnnnpdmackjpoieokimphbn
```

## Before Each Package Upload

- Confirm `npm run check` passes.
- Confirm `npm run build:webstore` creates a zip with `manifest.json` at the
  zip root.
- Confirm the Web Store zip does not include `manifest.key`.
- Confirm the Web Store zip includes the Web Store Pushbullet OAuth client ID.
- Confirm screenshots are current, real UI captures, and `1280x800`.
- Confirm a right-click context menu screenshot is captured as
  `docs/screenshots/05-context-menu.png`.
- Confirm GitHub Pages serves
  `https://bulletbridge.github.io/bullet-bridge/privacy.html`.
- Confirm the support email is active and monitored.
- Confirm the listing copy says Bullet Bridge is independent and unofficial.
- Confirm the listing does not use Pushbullet logos, icons, or official branding.
- Confirm no secrets, `.pem` files, `.env` files, local tokens, or packaged zip
  files are committed.

## Manual Smoke Test

- Install the Chrome Web Store version.
- Confirm OAuth sign-in uses the Web Store extension ID.
- Send a note to all devices.
- Send a note to one device.
- Send a file.
- Send the current tab.
- Send from the right-click context menu.
- Receive a push.
- Receive and dismiss a mirrored Android notification.
- Search loaded push history.
- Delete a push.
- Load older pushes.

## Future Updates

- Increase `manifest.json` and `package.json` versions before uploading a new
  package.
- Run `npm run check`.
- Run `npm run build:webstore`.
- Upload the new zip in the Chrome Web Store package flow.
- Update the listing metadata only if the user-facing behavior changed.
- Add a concise "What's New" note for meaningful releases.
- Watch the support email for Chrome Web Store review messages.
