# Gym Boo mobile app

A Flutter WebView wrapper around the Gym Boo web app, with native push notifications
(Firebase Cloud Messaging). A gym admin sends a notification from the existing
**Notifications** panel in the admin dashboard; it arrives on every member's phone
that turned notifications on, titled by the app name **Gym Boo**.

## How it fits together

```
Admin dashboard ──POST /api/notifications/custom──▶ backend ──FCM (firebase-admin)──▶ phones
Member opens app ─▶ WebView loads /checkin/<slug> ─▶ "Turn on notifications"
   web page ──GymBooNative channel──▶ Flutter asks OS permission, gets FCM token
   web page ──POST /api/public/<slug>/account/push/native {token}──▶ stored in push_subscriptions
```

Tokens are saved in the existing `push_subscriptions` table as `fcm://<token>`, so no
migration is needed and browser Web Push keeps working side by side.

## One-time setup

1. **Firebase**: create a project at console.firebase.google.com (Cloud Messaging is on by default).
2. **Backend key**: Project settings → Service accounts → *Generate new private key*.
   Set it on the server (either one):
   - `FIREBASE_SERVICE_ACCOUNT` = the JSON (raw, or base64 of it), or
   - `FIREBASE_SERVICE_ACCOUNT_FILE` = path to the JSON file.
   Restart the backend. Never commit this file.
3. **App**: install Flutter, `npm i -g firebase-tools && firebase login`,
   `dart pub global activate flutterfire_cli`, then `./setup.sh` (pick your Firebase project
   and the Android/iOS apps when asked).
4. Run: `flutter run --dart-define=APP_URL=https://your-domain.com/`
   Release APK: `flutter build apk --release --dart-define=APP_URL=https://your-domain.com/`
5. Rebuild/redeploy the member web app (`npm run build:checkin`) — it contains the bridge code.

## Using it

Member: open the app, sign in, tap **Turn on notifications** on the home screen → allow.
Admin: Dashboard → Notifications → Send custom notification → audience *All members*.

## Known gaps

- File/photo upload inputs inside the WebView need a file-chooser handler
  (`AndroidWebViewController.setOnShowFileSelector`); not included yet.
- iOS needs an Apple Developer account and an APNs key uploaded in Firebase to receive pushes.
- Pushes go to *members*; admins don't register devices (the existing notification model).
