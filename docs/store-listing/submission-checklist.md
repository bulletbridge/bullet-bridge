# Chrome Web Store Submission Checklist

## Before First Upload

- Confirm `npm run check` passes.
- Confirm `npm run build` creates a zip with `manifest.json` at the zip root.
- Confirm screenshots are current, real UI captures, and `1280x800`.
- Confirm a right-click context menu screenshot is captured as
  `docs/screenshots/05-context-menu.png`.
- Confirm `PRIVACY.md` is hosted at a public HTTPS URL.
- Confirm the support email is active and monitored.
- Confirm the listing copy says Bullet Bridge is independent and unofficial.
- Confirm the listing does not use Pushbullet logos, icons, or official branding.
- Confirm no secrets, `.pem` files, `.env` files, local tokens, or packaged zip
  files are committed.

## First Chrome Web Store Draft

- Upload the package as a draft or private trusted-tester item.
- Copy the assigned Chrome Web Store extension ID.
- Add this redirect URI to the Bullet Bridge Pushbullet OAuth client:

  ```text
  https://<chrome-web-store-extension-id>.chromiumapp.org/pushbullet
  ```

- Build a package that uses the OAuth client intended for the store build.
- Install the trusted-tester item and test OAuth sign-in.
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

## Public Submission

- Recheck listing text, screenshots, privacy policy, and permission
  justifications.
- Set distribution to public only after trusted-tester install and OAuth are
  confirmed.
- Submit for review.
- Watch the support email for Chrome Web Store review messages.

## Future Updates

- Increase `manifest.json` and `package.json` versions before uploading a new
  package.
- Run `npm run check`.
- Run `npm run build`.
- Upload the new zip in the Package tab.
- Update the listing metadata only if the user-facing behavior changed.
- Add a concise "What's New" note for meaningful releases.
