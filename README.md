# Bullet Bridge

Independent Manifest V3 browser extension for Pushbullet users.

Bullet Bridge is built for Brave and Chrome-compatible browsers after the old Pushbullet extension stopped working. It can connect through the bundled Bullet Bridge Pushbullet OAuth client or a personal Pushbullet access token stored in extension-local browser storage.

Bullet Bridge is an independent, unofficial client for Pushbullet users. It is not affiliated with, endorsed by, sponsored by, or provided by Pushbullet.

This repository is source-available for transparency and user trust. It is not open source in the OSI sense, and the license does not allow republishing modified copies or submitting derivative browser extensions to extension stores without permission.

> [!IMPORTANT]
> **Release availability:** Bullet Bridge v0.5.0 is available from GitHub while
> access to the Chrome Web Store publisher account is being restored. The
> Chrome Web Store currently remains on v0.4.1; existing Web Store
> installations continue to work. GitHub installations must be updated
> manually.

Install the current Chrome Web Store release (v0.4.1):

https://chromewebstore.google.com/detail/bullet-bridge/iadffmbdjdnnnpdmackjpoieokimphbn

GitHub/unpacked builds use a fixed extension ID for unpacked installs:

```text
ibhimmdnfbnhjdidoofgmlmngjdbneal
```

## Current Features

- Sign in with Pushbullet OAuth by using a configured OAuth client ID.
- Save and test a Pushbullet access token as a manual fallback.
- Register this browser as a Pushbullet device with a browser-specific name, such as `Bullet Bridge (Brave)`.
- Send notes, links, current-tab links, and files.
- Open the popup in a persistent window when a Linux compositor closes browser-action popups during file selection.
- Send to all devices or a selected device.
- Browse recent push history in a chat-style popup.
- Load older pushes on demand.
- Search the loaded push history by message, URL, file, and device text.
- Preview image, video, file, and link pushes in the chat history.
- Copy exact push content from chat bubbles.
- Delete individual pushes from chat history.
- Push pages, links, selected text, and image URLs from the right-click context menu.
- Choose the target device directly from the right-click context menu.
- Receive Pushbullet websocket events.
- Show received pushes as browser notifications.
- Show mirrored Android notifications in the popup and as browser notifications.
- Decrypt Pushbullet end-to-end encrypted mirrored notifications using a locally derived, non-extractable key.
- Encrypt mirrored-notification dismissals when end-to-end encryption is enabled.
- Open or dismiss pushes from browser notification action buttons.
- Dismiss mirrored Android notifications from browser notification action buttons.
- Clear individual mirrored notifications or clear all local mirrored notifications.
- Open pushed links from browser notifications.

## End-to-End Encryption

Bullet Bridge supports Pushbullet's end-to-end encryption protocol for mirrored Android notifications and their dismissal messages. Enable end-to-end encryption in the Pushbullet Android app first, then enter the same encryption password in Bullet Bridge settings.

The password is used only to derive the encryption key locally. It is never stored or sent. Bullet Bridge stores the derived key as a non-extractable Web Crypto key in extension-local IndexedDB and registers only its SHA-256 fingerprint with the Bullet Bridge Pushbullet device.

Pushbullet's protocol does not apply end-to-end encryption to ordinary notes, links, files, or push history. Those continue to use Pushbullet's HTTPS API. Decrypted mirrored notification records are kept locally so they can be shown in the Notifications tab, and can be cleared there or by clearing the Bullet Bridge account.

## Screenshots

<img src="docs/screenshots/01-settings.png" alt="Bullet Bridge settings page" width="640">

<img src="docs/screenshots/02-pushes.png" alt="Bullet Bridge push history popup" width="640">

<img src="docs/screenshots/03-notifications.png" alt="Bullet Bridge mirrored notifications popup" width="640">

<img src="docs/screenshots/04-search.png" alt="Bullet Bridge loaded push search" width="640">

<img src="docs/screenshots/05-context-menu.png" alt="Bullet Bridge right-click context menu" width="640">

## Not Included

- SMS.

## Hosted Privacy Policy

The extension store privacy policy page is:

https://bulletbridge.github.io/bullet-bridge/privacy.html

## Install From Chrome Web Store

Install the currently published v0.4.1 extension:

https://chromewebstore.google.com/detail/bullet-bridge/iadffmbdjdnnnpdmackjpoieokimphbn

## Install From GitHub

The GitHub and Chrome Web Store builds have different extension IDs. Before
installing the GitHub build, disable or remove the Web Store build to avoid
duplicate devices and notifications. Extension settings and sign-in state do
not transfer between the two builds.

1. Download `bullet-bridge-0.5.0.zip` from the
   [v0.5.0 GitHub release](https://github.com/bulletbridge/bullet-bridge/releases/tag/v0.5.0).
2. Extract the zip to a permanent folder. Do not delete that folder after
   loading the extension.
3. Open `brave://extensions` or `chrome://extensions`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the extracted folder that contains `manifest.json`.
7. Open Bullet Bridge, click `Sign In`, and approve Bullet Bridge on the
   Pushbullet authorization page.

To update a GitHub installation, download the newer release zip, replace the
files in the same permanent folder, and click `Reload` for Bullet Bridge on the
browser extensions page.

Developers can instead clone the repository:

   ```bash
   git clone https://github.com/bulletbridge/bullet-bridge.git
   ```

If device state looks stale after an update, click `Refresh Devices` in
options.

Get a personal Pushbullet access token from:

https://www.pushbullet.com/#settings/account

## Maintainer OAuth Configuration

The GitHub/unpacked build includes the Bullet Bridge Pushbullet OAuth client ID. Users do not need to create their own OAuth client.

The bundled Pushbullet OAuth client must use this redirect URI:

```text
https://ibhimmdnfbnhjdidoofgmlmngjdbneal.chromiumapp.org/pushbullet
```

Leave `allowed_origin` blank if Pushbullet accepts it. If Pushbullet requires a value, use:

```text
chrome-extension://ibhimmdnfbnhjdidoofgmlmngjdbneal
```

The redirect URI depends on the installed extension ID. The GitHub/unpacked build pins the unpacked extension ID with `manifest.key`. Chrome Web Store packages remove `manifest.key` and inject the Web Store OAuth client ID during `npm run build:webstore`.

Keep the Pushbullet OAuth client display identity aligned with Bullet Bridge:

- Name: `Bullet Bridge`
- Website URL: `https://github.com/bulletbridge/bullet-bridge` or the future project site.
- Image URL: a public HTTPS URL for `icons/icon-128.png`.

The image URL must be reachable without authentication. A private GitHub raw URL will not render inside Pushbullet clients.

## Development

Run local checks:

```bash
npm run check
```

Build a GitHub release zip:

```bash
npm run build
```

The build output is written to `dist/bullet-bridge-<version>.zip`.

Build a Chrome Web Store draft zip:

```bash
npm run build:webstore
```

The Web Store build output is written to
`dist/bullet-bridge-<version>-webstore.zip` and removes `manifest.key` so the
Chrome Web Store can assign the store item ID.

## Screenshot Demo Mode

Use demo mode when capturing public screenshots so real names, devices, pushes, and notifications are not shown.

Enable demo mode:

```text
chrome-extension://ibhimmdnfbnhjdidoofgmlmngjdbneal/src/options.html?demo=1
```

Disable demo mode:

```text
chrome-extension://ibhimmdnfbnhjdidoofgmlmngjdbneal/src/options.html?demo=0
```

After enabling or disabling it, reload the popup/options page. Demo mode only changes local display data in the extension UI; it does not send real pushes or upload files.

The committed screenshots in `docs/screenshots/` are captured from demo mode at `1280x800`.

The extension is dependency-free at runtime. It uses vanilla JavaScript modules, Chrome extension APIs, Pushbullet HTTP APIs, and Pushbullet websocket events.

## License

Bullet Bridge is source-available under the [Bullet Bridge Source Available License](LICENSE).

You may inspect the source, audit privacy-sensitive behavior, and install official Bullet Bridge releases. You may not redistribute modified versions, publish derivative browser extensions, or use Bullet Bridge branding without permission.

See [TRADEMARK.md](TRADEMARK.md) for Bullet Bridge branding and Pushbullet compatibility wording.

## Disclaimer

Bullet Bridge is an unofficial client for Pushbullet. It is not affiliated with, endorsed by, sponsored by, or provided by Pushbullet.

Pushbullet is a trademark of its respective owner. The Pushbullet name is used only to describe compatibility with the Pushbullet service.
