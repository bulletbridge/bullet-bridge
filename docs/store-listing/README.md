# Chrome Web Store Listing Prep

This folder contains the working copy for a future Chrome Web Store listing.

## Recommended Release Path

Start with a Chrome Web Store draft or private trusted-tester item, not a public
submission.

Why:

- The first Chrome Web Store upload assigns the permanent extension ID.
- That ID must be added to the Pushbullet OAuth redirect URI before users can
  sign in from the store build.
- A private trusted-tester listing lets the install, OAuth, permissions, and
  update flow be tested before public launch.
- After the trusted-tester build works end to end, use the same listing for a
  public submission.

## Public Contact

Use both, once the public support email is finalized:

- Support email: the Chrome Web Store publisher/support email.
- Support URL: `https://github.com/bulletbridge/bullet-bridge/issues`

Why:

- Chrome Web Store needs an email that receives review and policy messages.
- GitHub issues give users a public place to report bugs and request features.
- The support email gives users a private path for account-specific questions.
- Do not publish a personal email address here. Use a project email only.

## Publisher Name

Use `Bullet Bridge` if the Chrome Web Store developer dashboard allows it.

## Store Assets

- Store icon: `icons/icon-128.png`
- Screenshot 1: `docs/screenshots/01-settings.png`
- Screenshot 2: `docs/screenshots/02-pushes.png`
- Screenshot 3: `docs/screenshots/03-notifications.png`
- Screenshot 4: `docs/screenshots/04-search.png`
- Screenshot 5: `docs/screenshots/05-context-menu.png`

All committed screenshots are real Bullet Bridge UI captures from demo mode at
`1280x800`.

Before Chrome Web Store submission, capture screenshot 5 from the real browser
right-click menu. Do not mock or generate it.

## Privacy Policy

Use `PRIVACY.md` as the source text for a hosted privacy policy page. A Chrome
Web Store listing should point to a public HTTPS URL, for example a GitHub Pages
page generated from this repository.

## Source References

- Chrome Web Store publish flow: https://developer.chrome.com/docs/webstore/publish
- Chrome Web Store image requirements: https://developer.chrome.com/docs/webstore/images
- Chrome Web Store privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome Web Store policy requirements: https://developer.chrome.com/docs/webstore/program-policies/policies
