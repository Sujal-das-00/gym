# Gym Boo – iOS Release Guide (on a Mac)

This guide shows how to take the code from GitHub, build it on a Mac, and put it on the **App Store** (or TestFlight).
Everything is explained in simple words, with the command and what it does.

---

## 0. The big picture (read this first)

```
Clone repo on Mac  →  Create the iOS folder  →  Add Firebase file
   →  Set up signing in Xcode  →  Set up push notifications
   →  Build the .ipa  →  Upload to App Store Connect  →  TestFlight  →  Release
```

You **must** use a Mac to build an iPhone app. Apple does not allow it on Linux or Windows.
You also need a paid **Apple Developer account** ($99 / year): https://developer.apple.com/programs/

### ⚠️ Important thing about your repo

Your `.gitignore` hides these, so **they will NOT be on the Mac after you clone**:

| Hidden folder/file | Why it matters | What you do on Mac |
|---|---|---|
| `ios/` | The whole iPhone project | Re-create it with `setup.sh` (Step 3) |
| `android/` | Not needed on Mac | Ignore |
| `lib/firebase_options.dart` | Firebase connection settings | Copy it from your Linux PC, or re-create it (Step 4) |
| `pubspec.lock` | Locked package versions | Created automatically by `flutter pub get` |

So Step 3 and Step 4 are **required**. Don't skip them.

---

## 1. Things to install on the Mac (one time only)

| Tool | What it is | How to get it |
|---|---|---|
| **Xcode** | Apple's app-building program | Mac App Store (big download, ~10 GB+) |
| **Xcode command line tools** | Small tools Xcode needs | `xcode-select --install` |
| **Homebrew** | Installer for other tools | https://brew.sh |
| **Flutter SDK** | Builds your app | `brew install --cask flutter` |
| **CocoaPods** | Manages iOS libraries | `brew install cocoapods` |
| **Git** | Gets your code | Comes with Xcode tools |
| **Node + Firebase CLI** | Talks to Firebase | `brew install node` then `npm i -g firebase-tools` |

Run these commands in the **Terminal** app:

```bash
# 1. Install Xcode tools (a popup appears, click Install)
xcode-select --install

# 2. Accept the Xcode license and finish setup
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch

# 3. Install Flutter and CocoaPods (needs Homebrew)
brew install --cask flutter
brew install cocoapods

# 4. Check everything is OK
flutter doctor
```

What `flutter doctor` does: it checks your setup and tells you what is missing.
You want green ticks next to **Flutter** and **Xcode**. (The Android line can be ignored on Mac.)

---

## 2. Get the code

```bash
cd ~/Desktop
git clone <YOUR_REPO_URL> gym
cd gym/mobile-app
```

What it does:
- `git clone` downloads your project.
- `cd gym/mobile-app` goes into the Flutter app folder. **All commands below run from here.**

---

## 3. Re-create the `ios/` folder

Your repo only keeps the app's own code (`lib/`, `pubspec.yaml`). The iPhone project is created by Flutter.

```bash
flutter create --org app.gymboo --project-name gym_boo --platforms ios .
```

What each part means:

| Part | Meaning |
|---|---|
| `flutter create` | Make the platform folders |
| `--org app.gymboo` | Company id prefix |
| `--project-name gym_boo` | App name inside the code |
| `--platforms ios` | Only make the iOS folder |
| `.` | Do it in the current folder |

Together these give the bundle ID **`app.gymboo.gymBoo`**.
This is the **same** ID already registered in your Firebase iOS app (`1:81583580868:ios:89f821408815e522e4cb91`), so keep it exactly like this.

> Do **not** run the full `setup.sh` on Mac. It also does Android steps and starts `flutterfire configure`.
> The command above is the safe iOS-only version. It will not overwrite your `lib/` code.

Now download the packages and make the app icons:

```bash
flutter pub get
dart run flutter_launcher_icons
```

- `flutter pub get` downloads all libraries from `pubspec.yaml`.
- `dart run flutter_launcher_icons` makes all the iPhone icon sizes from `assets/icon.png` (the alpha channel is removed for iOS automatically, because Apple rejects icons with transparency).

Set the app's display name (it should already be "Gym Boo" – check):

```bash
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'Gym Boo'" ios/Runner/Info.plist
```

---

## 4. Add the Firebase file

The app needs `lib/firebase_options.dart`. It was hidden from git, so choose **one** way:

### Way A – Copy it from your Linux PC (easiest)
Copy this file from your Linux machine:

```
/home/suajldas/Desktop/gym/mobile-app/lib/firebase_options.dart
```

to the Mac at:

```
gym/mobile-app/lib/firebase_options.dart
```

(Use AirDrop, USB stick, email to yourself, or a private cloud drive.)
Firebase "API keys" in this file are not passwords, but still don't post it publicly.

### Way B – Re-create it
```bash
dart pub global activate flutterfire_cli
firebase login
flutterfire configure
```
Pick your existing Firebase project (project number `81583580868`) and choose **ios**.

---

## 5. Test the app on the Mac (optional but recommended)

```bash
cd ios && pod install && cd ..
flutter run
```

- `pod install` downloads the iOS native libraries (CocoaPods). If it fails, run `pod repo update` then try again.
- `flutter run` starts the app on the iOS Simulator (or a plugged-in iPhone).

Note: **push notifications do not work on the Simulator.** Test them on a real iPhone.

The app opens your website `https://gymbot.toolszila.com/` by default (set in [lib/config.dart](lib/config.dart)).
To use a different address:

```bash
flutter run --dart-define=APP_URL=https://your-domain.com/
```

---

## 6. Apple account set-up (website work, one time)

Go to https://developer.apple.com/account

### 6.1 Register the App ID
1. **Certificates, Identifiers & Profiles → Identifiers → +**
2. Choose **App IDs → App**
3. Description: `Gym Boo`
4. Bundle ID (Explicit): `app.gymboo.gymBoo`
5. Tick the capability **Push Notifications**
6. Save

(Xcode can do this for you automatically in Step 7, but doing it here is clearer.)

### 6.2 Create the Push Notification key (APNs key)
This lets Firebase send notifications to iPhones.

1. **Keys → +**
2. Name: `GymBoo Push`
3. Tick **Apple Push Notifications service (APNs)**
4. Continue → Register → **Download the `.p8` file** (you can only download it **once** – keep it safe!)
5. Write down the **Key ID** (10 characters) and your **Team ID** (top-right of the page, or under Membership)

### 6.3 Give the key to Firebase
1. Firebase Console → ⚙️ **Project settings → Cloud Messaging** tab
2. Under **Apple app configuration → APNs Authentication Key → Upload**
3. Upload the `.p8` file and type the Key ID and Team ID

Without this step, iPhone users will **never** get notifications.

### 6.4 Create the app in App Store Connect
1. https://appstoreconnect.apple.com → **My Apps → + → New App**
2. Platform: **iOS**
3. Name: `Gym Boo` (must be unique on the App Store; if taken, choose another)
4. Primary language: English
5. Bundle ID: choose `app.gymboo.gymBoo`
6. SKU: any text, e.g. `gymboo-ios-1`

---

## 7. Set up the project in Xcode

Open the project (open the **.xcworkspace**, not .xcodeproj):

```bash
open ios/Runner.xcworkspace
```

In Xcode:

### 7.1 Signing
1. Click **Runner** (blue icon, top of the left list) → target **Runner** → tab **Signing & Capabilities**
2. Tick **Automatically manage signing**
3. **Team**: choose your Apple Developer team
4. **Bundle Identifier**: must be `app.gymboo.gymBoo`

*What this is:* signing is Apple's way of proving the app is really from you. Xcode makes the certificate and profile for you.

### 7.2 Add Push Notifications
Still on **Signing & Capabilities**:
1. Click **+ Capability**
2. Add **Push Notifications**
3. Click **+ Capability** again → add **Background Modes**
4. Tick **Remote notifications**

This creates the `Runner.entitlements` file and adds the needed permissions.

### 7.3 Check the minimum iOS version
Tab **General → Minimum Deployments**: it should be **15.0** (the project already uses this).

### 7.4 Check version and build number
Tab **General → Identity**. These are filled from `pubspec.yaml` automatically when you build with Flutter, so you normally don't touch them here.

Close Xcode when done.

---

## 8. Version and build number (very important for every release)

Open [pubspec.yaml](pubspec.yaml), line 4:

```yaml
version: 1.0.0+1
```

- `1.0.0` = **version** users see on the App Store
- `+1` = **build number** – Apple needs a **higher** build number for every upload to the same version

| Situation | What to set |
|---|---|
| First upload | `1.0.0+1` |
| Upload failed or needs a fix, same version | `1.0.0+2` |
| New update for users | `1.0.1+3` |

Never reuse a build number for the same version.

---

## 9. Build the release file (.ipa)

```bash
flutter clean
flutter pub get
cd ios && pod install && cd ..
flutter build ipa --release
```

What each command does:

| Command | What it does |
|---|---|
| `flutter clean` | Removes old build leftovers |
| `flutter pub get` | Downloads Dart packages |
| `pod install` | Downloads iOS native libraries |
| `flutter build ipa --release` | Builds the final, signed iPhone app package |

Set the version right in the command (instead of editing `pubspec.yaml`):

```bash
flutter build ipa --release --build-name=1.0.1 --build-number=3
```

If you use a different website address:

```bash
flutter build ipa --release --dart-define=APP_URL=https://your-domain.com/
```

### Where is the file?

```
gym/mobile-app/build/ios/ipa/gym_boo.ipa
```

and the archive (opens in Xcode Organizer) is at:

```
gym/mobile-app/build/ios/archive/Runner.xcarchive
```

Open the folder:

```bash
open build/ios/ipa
```

> **iOS vs Android names:** `.ipa` is the iPhone version of Android's `.aab`/`.apk`.
> You cannot install an `.ipa` by tapping it. It goes to Apple first (TestFlight / App Store).

---

## 10. Upload to App Store Connect

Pick **one** way.

### Way A – Transporter app (easiest)
1. Install **Transporter** from the Mac App Store
2. Sign in with your Apple ID
3. Drag `build/ios/ipa/gym_boo.ipa` into it
4. Click **Deliver**

### Way B – Command line
```bash
xcrun altool --upload-app --type ios -f build/ios/ipa/gym_boo.ipa \
  --apiKey YOUR_KEY_ID --apiIssuer YOUR_ISSUER_ID
```
(You create the API key in App Store Connect → Users and Access → Integrations → App Store Connect API.)

### Way C – Xcode
Open `build/ios/archive/Runner.xcarchive` in Xcode (Window → Organizer) → **Distribute App → App Store Connect → Upload**.

After upload, wait about 5–30 minutes. Apple "processes" the build. You will get an email when it is ready.

---

## 11. Test with TestFlight (do this before public release)

1. App Store Connect → your app → **TestFlight** tab
2. Your build appears after processing. If asked about "Export Compliance", answer **No** to custom encryption (the app only uses normal HTTPS) – or add this to `ios/Runner/Info.plist` to stop being asked:
   ```xml
   <key>ITSAppUsesNonExemptEncryption</key>
   <false/>
   ```
3. Add testers (Internal Testing = people on your team, instant; External = anyone with an email, needs a short Apple review)
4. Testers install the **TestFlight** app on their iPhone and tap your invite

Check on a real iPhone: login, check-in, and that **notifications arrive**.

---

## 12. Release to the App Store

1. App Store Connect → your app → **App Store** tab → **+ Version** (e.g. 1.0.0)
2. Fill in:
   - **Screenshots** (required): iPhone 6.7" and 6.5" sizes at minimum
   - **Description**, **Keywords**, **Support URL**
   - **Privacy Policy URL** (required – the app uses notifications and a login)
   - **App Privacy** questions (what data you collect)
   - **Age rating**
   - **App Review info**: give a **demo login** (username + password) so Apple can test the app
3. Under **Build**, click **+** and choose the build you uploaded
4. Click **Add for Review → Submit**

Apple usually replies in 1–2 days. After approval it goes live (or at the date you chose).

### Tips to avoid Apple rejection
- Apple dislikes apps that are *only* a website in a box (rule 4.2 "Minimum Functionality"). Your app has real native features: push notifications. Mention that in the **App Review notes** and make sure notifications really work.
- Always give the reviewer a working demo account.
- Make sure the privacy policy page really loads.
- If your gym sells memberships/payments inside the app for digital things, Apple may ask about in-app purchase rules. Real-world gym services paid offline are normally fine – explain this in the review notes.

---

## 13. Releasing an update later

```bash
cd ~/Desktop/gym
git pull
cd mobile-app
```

1. Raise the version in `pubspec.yaml` (e.g. `1.0.1+4`)
2. Run:
   ```bash
   flutter clean
   flutter pub get
   cd ios && pod install && cd ..
   flutter build ipa --release
   ```
3. Upload with Transporter
4. App Store Connect → **+ Version** → choose the new build → write "What's New" → **Submit**

Your `ios/` folder and `firebase_options.dart` stay on the Mac, so Steps 3–4 and the Apple set-up (Steps 6–7) are **one time only**. Just don't delete the folder.

---

## 14. Quick cheat sheet

**First time on the Mac**
```bash
git clone <YOUR_REPO_URL> gym && cd gym/mobile-app
flutter create --org app.gymboo --project-name gym_boo --platforms ios .
# copy lib/firebase_options.dart here
flutter pub get
dart run flutter_launcher_icons
open ios/Runner.xcworkspace      # set Team, add Push Notifications + Background Modes
flutter build ipa --release
open build/ios/ipa               # drag gym_boo.ipa into Transporter
```

**Every update after that**
```bash
git pull
# raise the +number in pubspec.yaml
flutter build ipa --release
open build/ios/ipa
```

---

## 15. Common problems

| Problem | Why | Fix |
|---|---|---|
| `ios` folder missing after clone | It is in `.gitignore` | Run Step 3 |
| `firebase_options.dart` not found | It is in `.gitignore` | Do Step 4 |
| "No signing certificate" / "requires a development team" | Team not chosen | Step 7.1 |
| `pod install` fails | Old CocoaPods cache | `cd ios && pod repo update && pod install` |
| Upload says "build number already used" | Same `+number` as before | Raise the number after `+` |
| Upload says "Invalid icon / alpha channel" | Icon has transparency | Re-run `dart run flutter_launcher_icons` (it removes alpha) |
| Notifications don't arrive on iPhone | APNs key missing or capability missing | Redo Steps 6.2, 6.3 and 7.2. Test on a real device, not the Simulator |
| `Bundle ID` mismatch | Different from Firebase | It must be `app.gymboo.gymBoo` everywhere |
| `flutter: command not found` | Not on PATH | Open a new Terminal window |

---

## 16. Checklist

- [ ] Apple Developer account paid and active
- [ ] Xcode, Flutter, CocoaPods installed (`flutter doctor` is green)
- [ ] Repo cloned, `ios/` re-created, `firebase_options.dart` copied
- [ ] App ID `app.gymboo.gymBoo` created, Push Notifications ticked
- [ ] APNs `.p8` key uploaded to Firebase
- [ ] App created in App Store Connect
- [ ] Xcode: Team set, Push Notifications + Background Modes added
- [ ] Build number higher than the last upload
- [ ] `flutter build ipa --release` succeeded
- [ ] Uploaded with Transporter and tested in TestFlight on a real iPhone
- [ ] Screenshots, description, privacy policy, demo login ready
- [ ] Submitted for review
