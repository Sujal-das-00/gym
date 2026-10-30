# Gym Boo mobile apps

This folder holds **two separate Flutter apps**. Each one is a thin native shell (a WebView) around the Gym Boo website at `https://gymbot.toolszila.com/`:

| | Admin app | Member app |
|---|---|---|
| Folder | [`admin-app/`](admin-app/) | [`member-app/`](member-app/) |
| Name on the phone | **Gym Boo** | **Gym Boo Member** |
| Who uses it | Gym owners and staff | Gym members |
| Opens | `/admin` | `/checkin` (or `/checkin/<slug>`) |
| Android package (`applicationId`) | `app.gymboo.gym_boo` | `app.gymboo.member` |
| iOS bundle ID | `app.gymboo.gymBoo` | `app.gymboo.member` |
| Dart package name (`pubspec.yaml`) | `gym_boo` | `gym_boo_member` |
| Brand colour | dark green `#063A2B` | orange `#F76910` on white |
| Firebase / push notifications | **No** | **Yes** (FCM, APNs on iOS) |
| Camera | Photo picker only | QR check-in scanner + photo picker |

The two apps are **fully independent Flutter projects**: each has its own `pubspec.yaml`, `lib/`, `assets/`, `android/` and `ios/`. There are **no flavors and no custom Xcode schemes**. `cd` into one folder and the normal Flutter commands work (`flutter run`, `flutter build ipa`, `flutter build appbundle`).

> Older versions of this repo built both apps from one project with `--flavor admin|member` and gitignored `android/` and `ios/`. That is gone. Do not add flavors back, and don't follow old guides that mention `--flavor`, `setup.sh`, `android-overlay/` or custom schemes.

---

## 1. Folder structure

```
mobile-app/
├── README.md                    ← this file (structure + how to build on Mac and Linux)
├── PLAY_STORE_GUIDE.md          ← Google Play Console walkthrough (store listing, data safety, upload)
│
├── admin-app/                   ← "Gym Boo" – Flutter project
│   ├── pubspec.yaml             ← name: gym_boo, version: x.y.z+N, NO Firebase packages
│   ├── pubspec.lock             ← committed, keeps package versions fixed
│   ├── analysis_options.yaml
│   ├── flutter_launcher_icons.yaml   ← icon generator config  (dart run flutter_launcher_icons)
│   ├── flutter_native_splash.yaml    ← splash generator config (dart run flutter_native_splash:create)
│   ├── assets/
│   │   ├── icon.png, icon_foreground.png        ← icon sources
│   │   ├── splash.png, splash_android12.png     ← splash sources (splash.png is also drawn by the app)
│   │   └── fonts/NotoSans-Regular.ttf, NotoSans-Bold.ttf   ← for receipt PDFs (₹ sign)
│   ├── lib/
│   │   ├── main.dart            ← WebView shell, navigation rules, JS bridge, file/PDF export
│   │   ├── config.dart          ← URL, start path, allowed paths, colours, app name
│   │   └── receipt_pdf.dart     ← builds the payment receipt PDF in Dart
│   ├── android/                 ← committed Android project
│   │   ├── app/build.gradle.kts ← applicationId, signing (reads android/key.properties), R8
│   │   ├── app/src/main/AndroidManifest.xml     ← label "Gym Boo", permissions
│   │   ├── app/src/main/kotlin/app/gymboo/gym_boo/MainActivity.kt  ← "save to Downloads" channel
│   │   └── key.properties       ← NOT in git (signing passwords)
│   └── ios/                     ← committed iOS project (Xcode)
│       ├── Runner.xcworkspace   ← open THIS in Xcode
│       ├── Runner.xcodeproj/project.pbxproj   ← bundle ID, iOS 15.0, iPhone only
│       └── Runner/Info.plist    ← display name, camera/photo texts, encryption flag
│
└── member-app/                  ← "Gym Boo Member" – Flutter project
    ├── (same files as admin-app, plus:)
    ├── lib/notifications.dart   ← FCM + local notifications (foreground banners, taps)
    ├── lib/firebase_options.dart        ← NOT in git (Firebase client config)
    ├── android/app/google-services.json ← NOT in git (Firebase Android config)
    ├── android/app/src/main/res/drawable/ic_notification.xml   ← tray icon
    ├── android/app/src/main/res/values/notification_colors.xml ← tray accent colour
    ├── android/app/src/main/kotlin/app/gymboo/member/MainActivity.kt
    └── ios/Runner/Runner.entitlements   ← Push Notifications (aps-environment)
```

The rest of the repo (for context): `backend/` is the Node/Express API and also serves the websites, `admin-frontend/` is the `/admin` web app shown in the admin app, `checkin-frontend/` is the `/checkin` web app shown in the member app, and `landing/` is the marketing site plus `/privacy`, `/terms` and `/delete-account`.

### Files that are not in git (copy them by hand)

| File | App | What it is | Where to get it |
|---|---|---|---|
| `member-app/lib/firebase_options.dart` | member | Firebase client config. **The member app does not compile without it.** | From the Linux PC (`~/Desktop/gym/mobile-app/member-app/lib/`), or regenerate (section 4.4) |
| `member-app/android/app/google-services.json` | member (Android) | Firebase Android config | From the Linux PC, or Firebase Console → Project settings → Android app `app.gymboo.member` |
| `admin-app/android/key.properties`, `member-app/android/key.properties` | both (Android) | Signing passwords + path to `upload-keystore.jks` | Owner only. Not needed on the Mac for iOS |
| `/home/suajldas/upload-keystore.jks` | both (Android) | Play upload key | Owner only. **Back it up.** Not needed for iOS |

The admin app needs **no** secret files to build for iOS.

---

## 2. How the apps work

1. On launch the app shows its splash colour and logo, then loads `APP_URL + start path` in a full-screen WebView (`lib/main.dart`, `WebShell`).
2. **Navigation rules** (`kAllowedPathPrefixes` in `lib/config.dart`): pages on the same host under the allowed prefixes stay in the app. Everything else (`tel:`, `mailto:`, WhatsApp, UPI, other sites, the *other* app's pages) opens in the phone's browser or app.
   - admin: `/admin`, `/plans`, `/api`
   - member: `/checkin`, `/api`
3. **JS bridge**: the website talks to the app through a JavaScript channel called `GymBooNative`. Messages are JSON `{"id": n, "type": ...}`, and the app answers by calling `window.__gymbooNativeResult(id, json)`. The web side is `admin-frontend/src/lib/native.js` and `checkin-frontend/src/lib/native.js`.

   | type | App | Does |
   |---|---|---|
   | `saveFile` | both | Shares a generated file (CSV export) through the share sheet |
   | `savePdf` | both | Builds the receipt PDF (`receipt_pdf.dart`). Android 10+ saves it to Downloads (`MainActivity.kt`); iOS opens the share sheet |
   | `printHtml` | both | Print dialog for HTML |
   | `status` / `enable` | member | Push permission + FCM token. The web page then sends the token to `POST /api/public/<slug>/account/push/native` |

4. **File inputs** (`<input type=file>` for photos, logo): Android uses `image_picker` (system photo picker). iOS WKWebView shows its own picker.
5. **Push notifications** (member only): the admin sends one from Dashboard → Notifications. The backend (`backend/src/services/fcmService.js`, `firebase-admin`) sends it to every member device token stored in `push_subscriptions` as `fcm://<token>`. The Android channel id `gymboo_default` must match the backend. Tapping a notification opens its `url` inside the WebView.
6. **Website changes don't need an app release.** Only changes inside `admin-app/` or `member-app/` (Dart, icons, permissions, plugins, version) need a new build.

### Code that exists in both apps

`lib/main.dart` (minus the notification parts), `lib/receipt_pdf.dart`, `MainActivity.kt` and the fonts are **copies**. If you fix a bug in one, make the same change in the other. `receipt_pdf.dart` mirrors `invoiceHtml()` in `checkin-frontend/src/lib/receipt.js`.

---

## 3. Version numbers

Each app has its own `version:` line in its own `pubspec.yaml`, for example `version: 1.0.2+4`:

- `1.0.2` = version name users see
- `+4` = build number. **It must be higher than the last upload of that app** to the App Store or Play (each store counts per app)

Raise it before every store upload, or pass `--build-name=1.0.3 --build-number=5` to the build command.

---

## 4. Building for iOS on a Mac

You need a Mac, Xcode, and a paid Apple Developer account ($99/year).

### 4.1 Install the tools (one time)

```bash
xcode-select --install                 # Xcode command line tools
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch
brew install --cask flutter            # needs Homebrew: https://brew.sh
brew install cocoapods                 # Flutter falls back to CocoaPods for plugins without Swift Package Manager support
flutter doctor                         # Flutter + Xcode must be green; Android can be ignored
```

Install **Xcode** itself from the Mac App Store first, and keep it up to date (Apple only accepts uploads from recent Xcode versions).

### 4.2 Get the code

```bash
cd ~/Desktop
git clone <REPO_URL> gym
cd gym/mobile-app
```

### 4.3 Admin app (`admin-app/`)

```bash
cd ~/Desktop/gym/mobile-app/admin-app
flutter pub get
open ios/Runner.xcworkspace            # the .xcworkspace, not the .xcodeproj
```

In Xcode (one time): left sidebar **Runner** → **TARGETS: Runner** → **Signing & Capabilities** → tick **Automatically manage signing** → pick your **Team**. Bundle Identifier must show `app.gymboo.gymBoo`. Close Xcode.

That is the only Xcode step. Everything else (name, icon, splash, iOS 15.0, iPhone only, camera/photo texts, `ITSAppUsesNonExemptEncryption = NO`) is already in the committed `ios/` folder. Choosing the Team writes `DEVELOPMENT_TEAM` into `project.pbxproj`. It isn't secret, so commit it and the step is never needed again.

```bash
flutter run                            # Simulator or a plugged-in iPhone
flutter build ipa --release            # → build/ios/ipa/*.ipa
```

### 4.4 Member app (`member-app/`)

```bash
cd ~/Desktop/gym/mobile-app/member-app
```

**a) Firebase config file.** Copy `lib/firebase_options.dart` from the Linux PC into `member-app/lib/` (AirDrop, USB or a private drive). Then make sure its iOS block points at a Firebase iOS app registered for **`app.gymboo.member`**:

1. https://console.firebase.google.com → project **gym-boo** → ⚙ Project settings → General.
2. If there is no iOS app with bundle ID `app.gymboo.member`: **Add app → iOS**, bundle ID `app.gymboo.member`, nickname `Gym Boo Member iOS`, then download **GoogleService-Info.plist** (you only read two values from it).
3. In `lib/firebase_options.dart` set the `ios` block:

```dart
  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: '<API_KEY from GoogleService-Info.plist>',
    appId: '<GOOGLE_APP_ID from GoogleService-Info.plist>',   // 1:81583580868:ios:...
    messagingSenderId: '81583580868',
    projectId: 'gym-boo',
    storageBucket: 'gym-boo.firebasestorage.app',
    iosBundleId: 'app.gymboo.member',
  );
```

The file copied from Linux still has the old iOS app (`iosBundleId: 'app.gymboo.gymBoo'`, appId `1:81583580868:ios:89f821408815e522e4cb91`), which belongs to the admin bundle ID. If you leave it, the app builds but **iPhone push notifications never arrive**. The admin app does not use Firebase, so that old Firebase iOS app can stay unused.

**b) Signing.**

```bash
flutter pub get
open ios/Runner.xcworkspace
```

In Xcode: **TARGETS: Runner** → **Signing & Capabilities** → **Automatically manage signing** → **Team**. Bundle Identifier must show `app.gymboo.member`. **Push Notifications** and **Background Modes → Remote notifications** should already be listed; they come from `ios/Runner/Runner.entitlements` and `Info.plist`. If Push Notifications is missing, click **+ Capability → Push Notifications**. Close Xcode and commit the `DEVELOPMENT_TEAM` change.

**c) APNs key** (lets Firebase reach iPhones; one time per Apple account):

1. https://developer.apple.com/account → Certificates, Identifiers & Profiles → **Keys → +** → name `GymBoo Push` → tick **Apple Push Notifications service (APNs)** → Register → **download the `.p8`**. You can download it only once, so keep it safe. Note the **Key ID** and your **Team ID**.
2. Firebase Console → ⚙ Project settings → **Cloud Messaging** → Apple app configuration → app **`app.gymboo.member`** → **APNs Authentication Key → Upload** (`.p8`, Key ID, Team ID).

**d) Run and build.**

```bash
flutter run                            # push + QR camera only work on a REAL iPhone, not the Simulator
flutter build ipa --release            # → build/ios/ipa/*.ipa
```

### 4.5 Useful build options (both apps)

```bash
flutter run --dart-define=APP_URL=https://other-domain.com/       # point at another server
flutter run --dart-define=APP_URL=http://192.168.1.20:5051/       # local backend (debug builds; iOS may need an ATS exception for plain http)
flutter run --dart-define=GYM_SLUG=nova-fitness                   # member app only: open one gym directly
flutter build ipa --release --build-name=1.0.3 --build-number=5   # set version without editing pubspec
```

### 4.6 App Store Connect (one time per app)

https://appstoreconnect.apple.com → **Apps → + → New App**

| Field | Admin | Member |
|---|---|---|
| Platform | iOS | iOS |
| Name (unique on the store) | Gym Boo | Gym Boo Member |
| Bundle ID | `app.gymboo.gymBoo` | `app.gymboo.member` |
| SKU (any text) | `gymboo-admin-ios` | `gymboo-member-ios` |

If the bundle ID isn't in the list, open each project once in Xcode with your Team selected (4.3 / 4.4); automatic signing registers it. You can also add it under developer.apple.com → Identifiers (tick Push Notifications for the member one).

### 4.7 Upload, test, release

1. Upload each `build/ios/ipa/*.ipa` with the **Transporter** app (Mac App Store): sign in, drag the file, **Deliver**. Or use Xcode → Window → Organizer → the archive → **Distribute App**.
2. Wait 5–30 minutes for processing. Then use App Store Connect → the app → **TestFlight** → add testers → install via the TestFlight app on an iPhone.
3. Test on a real iPhone:
   - **Admin:** log in, upload a photo, CSV export (share sheet), receipt PDF.
   - **Member:** log in, notification prompt, QR check-in (camera), send a test notification from the admin dashboard and check it **arrives**, receipt PDF.
4. App Store tab → version → screenshots (iPhone 6.9" or 6.5"), description, keywords, support URL, **Privacy Policy URL** `https://gymbot.toolszila.com/privacy`, App Privacy answers, age rating, **demo login** (admin account for Gym Boo, member account for Gym Boo Member) → pick the build → **Add for Review → Submit**.

Review tips: Apple dislikes "just a website in a box" apps (guideline 4.2), so list the native features in the review notes: push notifications, QR camera check-in, receipt PDFs and CSV export via the share sheet, native photo picker. Gym memberships are paid offline (real-world service), so in-app purchase rules don't apply; say so in the notes.

### 4.8 Lean, compressed iOS build (use this for every store upload)

Release builds are already AOT-compiled, tree-shaken and stripped by Xcode. Two extra flags make the app smaller and harder to reverse-engineer, with no change in behaviour:

- `--obfuscate` shortens Dart symbol names.
- `--split-debug-info=<dir>` moves debug symbols out of the binary (smaller app). **Keep that folder**: it is the only way to read crash stack traces for that build.

```bash
cd ~/Desktop/gym/mobile-app/member-app          # or admin-app
mkdir -p ~/gymboo-symbols/member-1.0.3+5        # one folder per release, OUTSIDE the repo (flutter clean would delete build/)
flutter build ipa --release \
  --obfuscate --split-debug-info=$HOME/gymboo-symbols/member-1.0.3+5
```

Output: `build/ios/ipa/*.ipa`. Upload it with Transporter (4.7). Apple re-thins the app per device (App Thinning), so the download users see is smaller than the `.ipa`.

Keep it light:
- Don't add plugins or fonts/images you don't use (every one is shipped). Run `flutter pub outdated` now and then and remove dead dependencies.
- Compress big PNGs in `assets/` before committing. Icons already come from `flutter_launcher_icons`.
- Never ship a debug or profile build.

### 4.9 Upgrading to a new version (iOS) – the repeatable routine

Do this every time the app changes (website-only changes need **no** release).

```bash
# 0. On the Linux PC: bump the version, commit, push
#    edit <app>/pubspec.yaml   version: 1.0.3+5  →  1.0.4+6     (the +N MUST go up, never reuse)
git add -A && git commit -m "member app 1.0.4+6" && git push

# 1. On the Mac
cd ~/Desktop/gym && git pull
cd mobile-app/member-app                         # or admin-app
flutter clean
flutter pub get
cd ios && pod install && cd ..                   # only needed if plugins changed or CocoaPods errors appear
mkdir -p ~/gymboo-symbols/member-1.0.4+6
flutter build ipa --release \
  --obfuscate --split-debug-info=$HOME/gymboo-symbols/member-1.0.4+6
open build/ios/ipa                               # drag the .ipa into Transporter → Deliver
```

Then App Store Connect → the app → **+ Version** (or the existing "Prepare for Submission" version) → choose the new build → "What's New" → **Add for Review → Submit**.

| Situation | What to run |
|---|---|
| Only Dart/app code changed | steps above (`pod install` can be skipped) |
| You added/removed/upgraded a plugin in `pubspec.yaml` | `flutter pub get` **and** `cd ios && pod install && cd ..` |
| Upgrading Flutter itself | `flutter upgrade`, then `flutter clean && flutter pub get && cd ios && pod install --repo-update && cd ..`; run `flutter doctor`; test on a real iPhone |
| Upgrading plugin versions | `flutter pub upgrade` (or `flutter pub upgrade --major-versions`), review `pubspec.lock` diff, rebuild, test, commit `pubspec.yaml` + `pubspec.lock` |
| Upgrading Xcode / Apple rejects the SDK version | Update Xcode from the App Store, `flutter clean`, rebuild |
| "Build number already used" | Raise the `+N`, or pass `--build-number=7` |
| Version set from the command line instead of the file | add `--build-name=1.0.4 --build-number=6` |
| Changed icon/splash | `dart run flutter_launcher_icons && dart run flutter_native_splash:create`, then rebuild |

Quick sanity check before uploading: `flutter analyze` must be clean.

---

## 5. Building for Android (Linux PC)

Needs Flutter, Android SDK, `android/key.properties` in the app folder and `/home/suajldas/upload-keystore.jks`. The member app also needs `android/app/google-services.json`. Without `key.properties`, release builds silently fall back to the debug key, and Play rejects them.

### 5.1 Lean, compressed release build (use this for every Play upload)

R8 code shrinking and resource shrinking are **already on** for release builds (`isMinifyEnabled` / `isShrinkResources` in `android/app/build.gradle.kts`), and Flutter tree-shakes unused icons by default. Add these flags for the smallest, hardest-to-reverse build:

- `--obfuscate` shortens Dart symbol names.
- `--split-debug-info=<dir>` moves debug symbols out of the app. **Keep that folder** for each release; you need it to decode crash stack traces (`flutter symbolize`).

```bash
cd ~/Desktop/gym/mobile-app/admin-app            # or member-app
mkdir -p ~/gymboo-symbols/admin-1.0.4+6          # one folder per release, OUTSIDE the repo
flutter clean
flutter pub get
flutter analyze                                  # must be clean

# → upload this to Play (Play splits it per device, so users download only their CPU/screen/language parts)
flutter build appbundle --release \
  --obfuscate --split-debug-info=$HOME/gymboo-symbols/admin-1.0.4+6
# file: build/app/outputs/bundle/release/app-release.aab

# → optional: a small APK to install on your own phone (arm64 only, ~half the size of a fat APK)
flutter build apk --release --split-per-abi \
  --obfuscate --split-debug-info=$HOME/gymboo-symbols/admin-1.0.4+6
adb install -r build/app/outputs/flutter-apk/app-arm64-v8a-release.apk
```

Because each app has its own folder, the two AABs never overwrite each other. Play Console details are in [PLAY_STORE_GUIDE.md](PLAY_STORE_GUIDE.md).

Optional: after building, upload `build/app/intermediates/merged_native_libs/release/**/out/lib` as a zip of native debug symbols in Play Console → App bundle explorer → Downloads, to silence the "no native debug symbols" warning. Not required.

### 5.2 Upgrading to a new version (Android) – the repeatable routine

Do this every time the app changes (website-only changes need **no** release).

```bash
cd ~/Desktop/gym/mobile-app/admin-app            # or member-app

# 1. Bump the version in pubspec.yaml (the +N MUST go up, never reuse or go down)
#    version: 1.0.3+6  →  1.0.4+7
#    (or skip editing and pass --build-name=1.0.4 --build-number=7 to the build command)

# 2. Build
mkdir -p ~/gymboo-symbols/admin-1.0.4+7
flutter clean && flutter pub get && flutter analyze
flutter build appbundle --release \
  --obfuscate --split-debug-info=$HOME/gymboo-symbols/admin-1.0.4+7

# 3. Keep a named copy, then commit the version bump
cp build/app/outputs/bundle/release/app-release.aab ~/Desktop/gym-boo-admin-1.0.4+7.aab
git add pubspec.yaml pubspec.lock && git commit -m "admin app 1.0.4+7" && git push
```

Then Play Console → the app → **Production** (or Internal testing first) → **Create new release** → upload the `.aab` → release notes → **Next → Save → Send for review**.

| Situation | What to run |
|---|---|
| Only Dart/app code changed | steps above |
| Added/removed/upgraded a plugin | `flutter pub get` (or `flutter pub upgrade`), rebuild, test on a real phone, commit `pubspec.yaml` + `pubspec.lock` |
| Upgrading Flutter itself | `flutter upgrade && flutter doctor`, then `flutter clean && flutter pub get`, rebuild and test |
| Gradle / Android build errors after an upgrade | `flutter clean`, then `cd android && ./gradlew --stop && cd ..`, rebuild |
| Play says "version code already used" | Raise the `+N` above the highest one in App bundle explorer |
| Play says target API level too low | Raise `targetSdk` via Flutter (`flutter upgrade`) or set it in `android/app/build.gradle.kts`, rebuild |
| Changed icon/splash | `dart run flutter_launcher_icons && dart run flutter_native_splash:create`, then rebuild |
| Release crashed and the stack trace is unreadable | `flutter symbolize -i crash.txt -d ~/gymboo-symbols/admin-1.0.4+7` |

---

## 6. Changing icons or splash screens

Edit the PNGs in `<app>/assets/`, then from that app's folder:

```bash
dart run flutter_launcher_icons            # Android + iOS icons (iOS alpha removed automatically)
dart run flutter_native_splash:create      # Android + iOS launch screens
```

If you change the splash colour, also change `kSplashColor` in `lib/config.dart`. The app keeps that look until the first page loads. Commit the generated files under `android/` and `ios/`.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `firebase_options.dart` not found (member) | Copy it in (section 1 table / 4.4a) |
| "Signing requires a development team" | Xcode → Runner target → Signing & Capabilities → Team |
| "No profiles for 'app.gymboo.member' were found" | Same place: Automatically manage signing on, Team set. Xcode then registers the App ID |
| iPhone notifications never arrive | `firebase_options.dart` iOS block isn't the `app.gymboo.member` Firebase app; APNs key not uploaded for `app.gymboo.member`; testing on the Simulator; or the user denied permission (Settings → Gym Boo Member → Notifications) |
| Upload error "missing purpose string" | `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` must be in `ios/Runner/Info.plist` (they are; check they weren't removed) |
| Upload error "build number already used" | Raise the `+N` in that app's `pubspec.yaml` |
| Upload error "invalid icon / alpha channel" | `remove_alpha_ios: true` in `flutter_launcher_icons.yaml`, rerun `dart run flutter_launcher_icons` |
| CocoaPods errors (when Flutter falls back to it) | `cd ios && pod repo update && pod install && cd ..`, or `flutter clean && flutter pub get` |
| Crash log is unreadable gibberish (obfuscated build) | `flutter symbolize -i crash.txt -d ~/gymboo-symbols/<app>-<version>` using the folder saved at build time |
| Strange build errors after switching branches or Flutter versions | `flutter clean && flutter pub get` in that app's folder |
| QR scanner doesn't open the camera | Real device only; check Settings → Gym Boo Member → Camera |
| Play rejects the AAB: debug-signed / wrong key | `android/key.properties` missing in that app folder, or the wrong keystore |

---

## 8. Notes for an AI assistant helping with this project

- These are two separate Flutter apps. Run every command **inside** `admin-app/` or `member-app/`, never in `mobile-app/` itself (it has no `pubspec.yaml`).
- **Never change** the Android `applicationId` (`app.gymboo.gym_boo`, `app.gymboo.member`) or the iOS bundle IDs (`app.gymboo.gymBoo`, `app.gymboo.member`). They identify the existing store listings.
- Don't add `--flavor`, product flavors or custom Xcode schemes. The plain `Runner` scheme is correct.
- `android/` and `ios/` are committed on purpose. Change settings in the files (`Info.plist`, `project.pbxproj`, `build.gradle.kts`, `AndroidManifest.xml`) or in Xcode, and commit the result.
- Only the member app uses Firebase. Don't add Firebase packages to the admin app.
- Secrets (`key.properties`, `*.jks`, `google-services.json`, `firebase_options.dart`, `GoogleService-Info.plist`) must never be committed.
- The real product is the website. For UI changes, edit `admin-frontend/` or `checkin-frontend/`, not the apps.
