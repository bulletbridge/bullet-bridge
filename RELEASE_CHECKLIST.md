# Release Checklist

## Local 0.4.x QA

- Confirm the loaded extension ID is `ibhimmdnfbnhjdidoofgmlmngjdbneal`.
- Confirm Pushbullet OAuth uses `https://ibhimmdnfbnhjdidoofgmlmngjdbneal.chromiumapp.org/pushbullet`.
- Send note to all devices.
- Send note to one selected device.
- Send current active tab as a link.
- Send pasted URL as a link.
- Send file and verify upload progress clears after completion.
- Send a page from the right-click context menu to all devices.
- Send a link from the right-click context menu to one selected device.
- Send selected text from the right-click context menu.
- Send an image URL from the right-click context menu.
- Confirm context menus disappear after clearing the account and return after signing in.
- Receive a push from another Pushbullet device.
- Receive mirrored Android notification.
- Open a received link/file push from its browser notification action button.
- Dismiss a received push from its browser notification action button.
- Dismiss a mirrored Android notification from its browser notification action button.
- Toggle close-as-dismiss and verify manually closing a browser notification dismisses it.
- Copy note/link/file push content from a chat bubble.
- Delete one push from chat history and confirm it disappears after refresh.
- Clear one mirrored notification.
- Clear all mirrored notifications.
- Load older push history.
- Switch devices without extra history loads.
- Verify options page OAuth sign-in.
- Verify logged-out popup layout and OAuth unavailable state.
- Verify options page token save/clear/reconnect/refresh devices.

## Public GitHub Readiness

- Review README and privacy wording.
- Confirm README and privacy wording clearly say Bullet Bridge is independent, unofficial, and not affiliated with Pushbullet.
- Confirm `LICENSE` is the Bullet Bridge Source Available License and `package.json` does not claim MIT/Apache/GPL/open-source licensing.
- Confirm `TRADEMARK.md` is present and Pushbullet compatibility wording is conservative.
- Confirm `PUSHBULLET_OAUTH_CLIENT_ID` is set in `src/shared/config.js`.
- Confirm the Pushbullet OAuth client name, website URL, and public image URL show as Bullet Bridge in Pushbullet mobile clients.
- Run `npm run check`.
- Run `npm run build`.
- Confirm final screenshots are current and captured from screenshot demo mode.
- Confirm issue and pull request templates are present.
- Confirm no secrets, local tokens, packaged zips, or generated CRX keys are committed.
- Confirm icon and visual identity are distinct from other services.

## Chrome Web Store Readiness

- Register a Bullet Bridge OAuth client and set `PUSHBULLET_OAUTH_CLIENT_ID`.
- Configure the OAuth client display name, website URL, and public image URL for the store build.
- Prepare hosted privacy policy.
- Prepare store listing text and screenshots.
- Confirm the store listing uses `Bullet Bridge` as the product name and describes Pushbullet only as service compatibility.
- Confirm the store listing does not use Pushbullet logos, icons, or wording that implies affiliation, endorsement, sponsorship, or official status.
- Review permissions and host permissions for least privilege.
- Run Chrome Web Store policy review.
- Package and test a clean release build.
