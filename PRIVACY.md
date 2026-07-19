# Privacy

Bullet Bridge is an independent, unofficial browser extension for Pushbullet users. It is not affiliated with, endorsed by, sponsored by, or provided by Pushbullet.

Pushbullet is a trademark of its respective owner. The Pushbullet name is used only to describe compatibility with the Pushbullet service.

## Data Storage

Bullet Bridge stores configuration in `chrome.storage.local` for this extension. Stored data can include:

- Pushbullet access token.
- Pushbullet OAuth client ID and selected sign-in method.
- Pushbullet account summary returned by the API.
- Device list.
- Local Bullet Bridge device record.
- Extension settings.
- Push sync cursor.
- Local unread count.
- Recent mirrored Android notification records.
- Temporary file upload status.
- A derived, non-extractable end-to-end encryption key in extension-local IndexedDB when the user enables this optional feature.

The end-to-end encryption password is never stored or sent. It is used locally to derive the key. Only the derived key's SHA-256 fingerprint is registered with the user's Bullet Bridge device through Pushbullet.

## Network Requests

Bullet Bridge sends data only to Pushbullet API, websocket, and Pushbullet-provided file upload endpoints:

- `https://www.pushbullet.com/authorize`
- `https://api.pushbullet.com/v2/*`
- `https://api.pushbullet.com/v3/*`
- `wss://stream.pushbullet.com/websocket/*`
- `https://upload.pushbullet.com/*`
- Pushbullet-provided HTTPS upload URLs such as S3 upload URLs.

## Data Handled

Depending on the features you use, Bullet Bridge can handle:

- Pushbullet account details.
- Device names and device metadata.
- Push titles, bodies, URLs, file names, and file URLs.
- Selected file contents for upload.
- Mirrored Android notification title/body/app/source-device text.
- Current active tab URL/title when you click the current-tab send action.

This data is used only to provide extension functionality: showing the UI, sending pushes, uploading selected files, displaying notifications, and opening links you request.

## End-to-End Encryption

When enabled, Bullet Bridge uses Pushbullet's documented end-to-end encryption protocol to decrypt mirrored Android notifications and encrypt their dismissal messages. Authentication tags are verified before notification content is accepted. A notification that cannot be authenticated or decrypted is discarded and not displayed.

Pushbullet end-to-end encryption applies to mirrored notifications and related ephemeral messages. It does not apply to normal notes, links, files, or push history. Those features continue to use Pushbullet's HTTPS API and Pushbullet-provided upload endpoints.

After decryption, recent mirrored notification content is stored locally in the extension so it can appear in the Notifications tab. Users can remove individual records, clear all notification records, or clear the connected account from Bullet Bridge settings.

## No Analytics

Bullet Bridge does not include analytics, ads, trackers, telemetry, remote code execution, or third-party reporting services.
