# `.well-known/assetlinks.json`

This file is what makes the members' Android app open **without the URL bar**.

The APK is a Trusted Web Activity — a Chrome window with the browser UI hidden —
and Chrome only hides that UI once it can prove the app and this site have the
same owner. It proves it by fetching
`https://gymbot.toolszila.com/.well-known/assetlinks.json` and finding the app's
package name and signing fingerprint inside. Until then the app works fine, it
just carries the address bar on every screen.

## Filling it in

Replace the two placeholders in `assetlinks.json`:

- **`package_name`** — the application id you chose when building the APK,
  e.g. `com.toolszila.gymbot`. It's in the build tool's config
  (`twa-manifest.json` for PWABuilder/Bubblewrap) and on the Play Console page.
- **`sha256_cert_fingerprints`** — the SHA-256 of the certificate the APK is
  **signed with**, as colon-separated hex:

  ```
  keytool -list -v -keystore your.keystore -alias your-alias
  ```

### If you publish through Google Play, list two fingerprints

Play App Signing re-signs your upload, so the app on a member's phone carries a
different certificate than the one you built with. Both have to be here, or
verification fails on installs from Play:

```json
"sha256_cert_fingerprints": [
  "AA:BB:...  <- your upload key, from keytool",
  "11:22:...  <- App signing key, from Play Console > Setup > App integrity"
]
```

## After editing

1. Upload the file (keep the `.well-known` folder name — cPanel's File Manager
   hides dotfolders unless "Show Hidden Files" is on) and restart the app.
2. Open `https://gymbot.toolszila.com/.well-known/assetlinks.json` in a browser.
   It must return this JSON, not a 404 and not HTML.
3. **Reinstall the APK.** Chrome checks the file when the app is installed and
   caches the answer — an app that's already on the phone won't re-check.

Google's checker is useful when it still doesn't verify:
https://developers.google.com/digital-asset-links/tools/generator

## The `.env` alternative

If you'd rather not ship a file — handy when the fingerprint differs per
deployment — leave this file untouched with its placeholders and set
`TWA_PACKAGE_NAME` and `TWA_SHA256_FINGERPRINT` in `.env` instead
(see `deploy/env.production`). The server uses the file when it's filled in, and
falls back to those variables when it isn't.
