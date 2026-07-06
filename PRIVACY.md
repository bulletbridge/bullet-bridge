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

## No Analytics

Bullet Bridge does not include analytics, ads, trackers, telemetry, remote code execution, or third-party reporting services.

## Public Release Note

This document describes the local development build. A Chrome Web Store release should publish a hosted privacy policy with the final extension ID, contact information, and store-compliant disclosure wording.
