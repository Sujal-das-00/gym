# Gym Boo – iOS Release Guide (on a Mac)

This guide shows how to take the code from GitHub, build **both** Gym Boo apps on a Mac, and put them on the **App Store** (through TestFlight first).
Everything is explained in simple words, with the command and what it does.

---

## 0. The big picture (read this first)

One codebase makes **two apps**, picked at build time with `--flavor` (same as Android):

| | Admin app | Member app |
|---|---|---|
| Name on the phone | **Gym Boo** | **Gym Boo Member** |
| Flavor | `admin` | `member` |
| iOS bundle ID | `app.gymboo.gymBoo` | `app.gymboo.member` |
| Android ID (for comparison) | `app.gymboo.gym_boo` | `app.gymboo.member` |
| Opens | `/admin` | `/checkin` |
| Push notifications | No | **Yes** (Firebase + APNs) |

> Why is the admin iOS ID different from Android? Apple does not allow `_` in bundle IDs,
> so `gym_boo` becomes `gymBoo`. Keep `app.gymboo.gymBoo` – it is already used in Firebase.

```
Clone repo  →  Re-create ios/  →  Add the admin + member flavors in Xcode
   →  Icons + Podfile  →  Firebase for the member app  →  Apple account set-up
   →  Build one .ipa per app  →  Upload  →  TestFlight  →  Release
```

You **must** use a Mac to build an iPhone app. Apple does not allow it on Linux or Windows.
You also need a paid **Apple Developer account** ($99 / year): https://developer.apple.com/programs/

### ⚠️ Important thing about your repo

Your `.gitignore` hides these, so **they will NOT be on the Mac after you clone**:

| Hidden folder/file | Why it matters | What you do on Mac |
|---|---|---|
| `ios/` | The whole iPhone project | Re-create it (Step 3) and add the flavors (Step 4) |
| `android/` | Not needed on Mac | Ignore |
| `lib/firebase_options.dart` | Firebase settings. The app does not compile without it | Copy it from your Linux PC (Step 7) |
| `pubspec.lock` | Locked package versions | Created automatically by `flutter pub get` |

Everything you set up in Xcode lives inside `ios/`, which git does **not** save.
After Step 8, **back up the `ios/` folder** (zip it to a private cloud drive), or you will have to redo Steps 3–8 on a new Mac.

---

## 1. Things to install on the Mac (one time only)

| Tool | What it is | How to get it |
|---|---|---|
| **Xcode** (latest) | Apple's app-building program | Mac App Store (big download, ~10 GB+). Apple only accepts uploads built with a recent Xcode, so keep it updated |
| **Xcode command line tools** | Small tools Xcode needs | `xcode-select --install` |
| **Homebrew** | Installer for other tools | https://brew.sh |
| **Flutter SDK** | Builds your app | `brew install --cask flutter` |
| **CocoaPods** | Manages iOS libraries | `brew install cocoapods` |
| **Git** | Gets your code | Comes with Xcode tools |

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
rm -rf test
flutter pub get
```

| Part | Meaning |
|---|---|
| `flutter create` | Make the platform folder |
| `--org app.gymboo` | Company id prefix |
| `--project-name gym_boo` | App name inside the code (gives the admin bundle ID `app.gymboo.gymBoo`) |
| `--platforms ios` | Only make the iOS folder |
| `.` | Do it in the current folder. It will not overwrite your `lib/` code |
| `rm -rf test` | Removes the sample test Flutter adds (it is for an app we don't have) |
| `flutter pub get` | Downloads all libraries from `pubspec.yaml` |

> Do **not** run `setup.sh` on the Mac. It does Android steps and runs `flutterfire configure`.

### 3.1 Add the permission texts and settings to `Info.plist`

Apple **rejects the upload** if the app can use the camera or photos without a text that explains why.
(The member check-in page scans QR codes with the camera; both apps let you pick photos for members, trainers and the gym logo.)

```bash
P=ios/Runner/Info.plist
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName $(APP_DISPLAY_NAME)' $P
/usr/libexec/PlistBuddy -c 'Add :NSCameraUsageDescription string "The camera is used to scan check-in QR codes and to take photos."' $P
/usr/libexec/PlistBuddy -c 'Add :NSPhotoLibraryUsageDescription string "Photos are used for member, trainer and gym logo pictures."' $P
/usr/libexec/PlistBuddy -c 'Add :ITSAppUsesNonExemptEncryption bool false' $P
```

| Line | What it does |
|---|---|
| `CFBundleDisplayName $(APP_DISPLAY_NAME)` | The name under the icon now comes from each flavor (Step 4.3), so one Info.plist serves both apps |
| `NSCameraUsageDescription` | Text shown when the app asks for the camera |
| `NSPhotoLibraryUsageDescription` | Text shown when the app asks for photos |
| `ITSAppUsesNonExemptEncryption false` | Tells Apple the app only uses normal HTTPS, so App Store Connect stops asking "Export Compliance" for every build |

(The single quotes matter: they stop the Terminal from changing `$(APP_DISPLAY_NAME)`.)

---

## 4. Add the `admin` and `member` flavors in Xcode

On Android the two apps are set up in `build.gradle.kts`. On iOS the same thing is done with **build configurations** and **schemes** in Xcode.
Flutter looks for them by name: `flutter build ipa --flavor member` uses the scheme **`member`** and the configuration **`Release-member`**. The names must match exactly.

Open the project (open the **.xcworkspace**, not .xcodeproj):

```bash
open ios/Runner.xcworkspace
```

### 4.1 Build configurations
1. In the left list click **Runner** (blue icon at the top).
2. In the middle, under **PROJECT**, click **Runner** → tab **Info**.
3. Under **Configurations** click **+** → **Duplicate "Debug" Configuration**, name it `Debug-admin`.
4. Repeat until you have all six:

| Duplicate from | New names |
|---|---|
| Debug | `Debug-admin`, `Debug-member` |
| Release | `Release-admin`, `Release-member` |
| Profile | `Profile-admin`, `Profile-member` |

Keep the original Debug / Release / Profile – the plain `Runner` scheme still uses them.

### 4.2 Schemes
1. Top bar: **Product → Scheme → Manage Schemes…**
2. Select **Runner** → click the **…** (or gear) button → **Duplicate**. Name it `admin`. Tick **Shared**.
3. Do the same again and name it `member`. Tick **Shared**.
4. **Product → Scheme → Edit Scheme…**, pick the `member` scheme at the top and set the **Build Configuration** of each action:

| Action (left side) | `admin` scheme | `member` scheme |
|---|---|---|
| Run | `Debug-admin` | `Debug-member` |
| Test | `Debug-admin` | `Debug-member` |
| Profile | `Profile-admin` | `Profile-member` |
| Analyze | `Debug-admin` | `Debug-member` |
| Archive | `Release-admin` | `Release-member` |

Do the same for the `admin` scheme.

### 4.3 Per-app settings (bundle ID, name, icon)
1. Click **Runner** → under **TARGETS** click **Runner** → tab **Build Settings** → choose **All** and **Levels** off (**Combined**).
2. Search **Product Bundle Identifier**. Click the small arrow to open it per configuration and set:
   - every `*-admin` line (and the plain Debug / Release / Profile lines): `app.gymboo.gymBoo`
   - every `*-member` line: `app.gymboo.member`
3. Click **+** (top left of the Build Settings list) → **Add User-Defined Setting** → name it `APP_DISPLAY_NAME`. Open the arrow and set:
   - `*-admin` and the plain lines: `Gym Boo`
   - `*-member` lines: `Gym Boo Member`
4. Search **Primary App Icon Set Name** (`ASSETCATALOG_COMPILER_APPICON_NAME`) and set:
   - `*-admin` and the plain lines: `AppIcon-admin`
   - `*-member` lines: `AppIcon-member`

   (The icon sets themselves are made in Step 5.)

### 4.4 iPhone only
Still in target **Runner** → tab **General** → **Supported Destinations**: remove **iPad** (and Mac / Vision if listed), keep **iPhone**.

*Why:* the app is a phone app. Keeping iPad means Apple wants iPad screenshots and tests it on iPad, where the share sheet (CSV / receipt export) needs extra code.
iPad users can still install the iPhone version.

### 4.5 Minimum iOS version
Tab **General → Minimum Deployments**: set **15.0**.

### 4.6 Signing
Tab **Signing & Capabilities**:
1. Tick **Automatically manage signing**
2. **Team**: choose your Apple Developer team
3. Check that the Bundle Identifier shows the right one for each configuration (the tab has a configuration switch at the top: Debug-admin, Release-member, …)

*What this is:* signing is Apple's way of proving the app is really from you. Xcode makes the certificates and profiles for you.

### 4.7 Push notifications (needed by the member app)
Still on **Signing & Capabilities**, with **All** selected at the top:
1. Click **+ Capability** → add **Push Notifications**
2. Click **+ Capability** again → add **Background Modes** → tick **Remote notifications**

This creates `Runner.entitlements`. The admin app gets the capability too; it is harmless there (admins never register for pushes), and automatic signing turns it on for its App ID.

Close Xcode when done (**File → Save** first if asked).

---

## 5. Make the app icons

```bash
dart run flutter_launcher_icons
```

It reads `flutter_launcher_icons-admin.yaml` and `flutter_launcher_icons-member.yaml` and makes the icon sets `AppIcon-admin` and `AppIcon-member` in `ios/Runner/Assets.xcassets` (it also rewrites the Android icons – harmless on the Mac).
`remove_alpha_ios: true` in those files removes any transparency, because Apple rejects icons with an alpha channel.

Check: open Xcode again → **Build Settings** → **Primary App Icon Set Name** must still be `AppIcon-admin` / `AppIcon-member` as in Step 4.3. Fix it if the tool changed it.

> The launch screen on iOS is the plain one (`flutter_native_splash` is Android-only here).
> The app then shows its own splash in the brand colour until the page has loaded.

---

## 6. Podfile (CocoaPods)

Let Flutter create the Podfile:

```bash
flutter build ios --config-only --release --flavor admin
```

*What it does:* prepares the iOS project files (and `ios/Podfile`) without building the app.

Open `ios/Podfile` in a text editor and change two things:

1. Near the top, remove the `#` so this line is on:
   ```ruby
   platform :ios, '15.0'
   ```
2. Tell CocoaPods which new configurations are debug and which are release:
   ```ruby
   project 'Runner', {
     'Debug' => :debug,
     'Profile' => :release,
     'Release' => :release,
     'Debug-admin' => :debug,
     'Profile-admin' => :release,
     'Release-admin' => :release,
     'Debug-member' => :debug,
     'Profile-member' => :release,
     'Release-member' => :release,
   }
   ```

Then:

```bash
cd ios && pod install && cd ..
```

`pod install` downloads the iOS native libraries. If it fails, run `pod repo update` and try again.
A warning that "CocoaPods did not set the base configuration" is normal for Flutter projects – ignore it.

> If your Flutter uses Swift Package Manager and there is **no** `ios/Podfile`, skip this step.

---

## 7. Firebase (the member app's push notifications)

### 7.1 Copy `firebase_options.dart`
Both apps need this file to compile. Copy it from your Linux machine:

```
/home/suajldas/Desktop/gym/mobile-app/lib/firebase_options.dart
```

to the Mac at:

```
gym/mobile-app/lib/firebase_options.dart
```

(Use AirDrop, USB stick, or a private cloud drive. The "API keys" in it are not passwords, but don't post it publicly.)

### 7.2 Register the member app in Firebase
The Firebase iOS app that already exists (`1:81583580868:ios:89f821408815e522e4cb91`) is for `app.gymboo.gymBoo` – the **admin** app, which does not use Firebase.
Push notifications go to the **member** app, so it needs its own Firebase iOS app:

1. https://console.firebase.google.com → project **gym-boo** → ⚙️ **Project settings → General → Add app → iOS**
2. Apple bundle ID: `app.gymboo.member`, nickname `Gym Boo Member iOS` → **Register app**
3. Download **GoogleService-Info.plist** (you only need two values from it, you don't add it to Xcode)
4. Skip the remaining wizard steps

### 7.3 Point the app at the member Firebase app
Open `lib/firebase_options.dart` and change the `ios` block so it uses the new app:

```dart
  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: '<API_KEY from GoogleService-Info.plist>',
    appId: '<GOOGLE_APP_ID from GoogleService-Info.plist>',   // 1:81583580868:ios:....
    messagingSenderId: '81583580868',
    projectId: 'gym-boo',
    storageBucket: 'gym-boo.firebasestorage.app',
    iosBundleId: 'app.gymboo.member',
  );
```

Only the member app reads this block on iOS (the admin app never starts Firebase), so one block is enough.
If you skip this, the member app installs fine but **iPhone notifications never arrive**.

The APNs key upload for this app is in Step 9.3.

---

## 8. Test the apps on the Mac (recommended)

```bash
flutter run --flavor admin
flutter run --flavor member
```

`flutter run` starts the app on the iOS Simulator (or a plugged-in iPhone). Always pass `--flavor` – without it you get the admin app.

Note: **push notifications and the QR camera do not work on the Simulator.** Test them on a real iPhone.

The apps open `https://gymbot.toolszila.com/` by default (set in [lib/config.dart](lib/config.dart)). Options:

```bash
flutter run --flavor member --dart-define=APP_URL=https://your-domain.com/
flutter run --flavor member --dart-define=GYM_SLUG=nova-fitness   # open one gym's page directly
```

Now **back up the `ios/` folder** (see Step 0).

---

## 9. Apple account set-up (website work, one time)

Go to https://developer.apple.com/account

### 9.1 Register the two App IDs
For **each** app:
1. **Certificates, Identifiers & Profiles → Identifiers → +**
2. Choose **App IDs → App**
3. Description / Bundle ID (Explicit):
   - `Gym Boo` – `app.gymboo.gymBoo`
   - `Gym Boo Member` – `app.gymboo.member`
4. Tick the capability **Push Notifications**
5. Save

(Automatic signing in Xcode can create them too, but doing it here is clearer.)

### 9.2 Create the Push Notification key (APNs key)
This lets Firebase send notifications to iPhones. One key works for all your apps.

1. **Keys → +**
2. Name: `GymBoo Push`
3. Tick **Apple Push Notifications service (APNs)**
4. Continue → Register → **Download the `.p8` file** (you can only download it **once** – keep it safe!)
5. Write down the **Key ID** (10 characters) and your **Team ID** (top-right of the page, or under Membership)

### 9.3 Give the key to Firebase
1. Firebase Console → ⚙️ **Project settings → Cloud Messaging** tab
2. Under **Apple app configuration**, pick the **`app.gymboo.member`** app
3. **APNs Authentication Key → Upload**: the `.p8` file, Key ID and Team ID

Without this step, iPhone members will **never** get notifications.

### 9.4 Create the two apps in App Store Connect
For **each** app: https://appstoreconnect.apple.com → **Apps → + → New App**

| Field | Admin app | Member app |
|---|---|---|
| Platform | iOS | iOS |
| Name (must be unique on the App Store) | `Gym Boo` | `Gym Boo Member` |
| Primary language | English | English |
| Bundle ID | `app.gymboo.gymBoo` | `app.gymboo.member` |
| SKU (any text) | `gymboo-admin-ios` | `gymboo-member-ios` |

---

## 10. Version and build number (very important for every release)

Open [pubspec.yaml](pubspec.yaml), line 4:

```yaml
version: 1.0.1+2
```

- `1.0.1` = **version** users see on the App Store
- `+2` = **build number** – Apple needs a **higher** build number for every upload to the same app

Both apps use this one line. Apple counts build numbers separately per app, so it is fine to upload `1.0.1+2` as both the admin and the member app.

| Situation | What to set |
|---|---|
| Upload failed or needs a fix, same version | raise only the `+number` (e.g. `1.0.1+3`) |
| New update for users | raise both (e.g. `1.0.2+4`) |

Never reuse a build number for the same app. You can keep it in step with Android – it just has to go up.

---

## 11. Build the release files (.ipa)

Build one app at a time. Both builds write to the **same** folder, so copy the file out after each one:

```bash
flutter clean
flutter pub get
cd ios && pod install && cd ..

flutter build ipa --release --flavor admin
mkdir -p ~/Desktop/ipa && cp build/ios/ipa/*.ipa ~/Desktop/ipa/gym-boo-admin.ipa

flutter build ipa --release --flavor member
cp build/ios/ipa/*.ipa ~/Desktop/ipa/gym-boo-member.ipa

open ~/Desktop/ipa
```

| Command | What it does |
|---|---|
| `flutter clean` | Removes old build leftovers |
| `flutter pub get` | Downloads Dart packages |
| `pod install` | Downloads iOS native libraries |
| `flutter build ipa --release --flavor admin` | Builds the signed admin app (scheme `admin`, configuration `Release-admin`) |
| `cp build/ios/ipa/*.ipa …` | Saves it under a clear name before the next build overwrites it |

Set the version right in the command (instead of editing `pubspec.yaml`):

```bash
flutter build ipa --release --flavor member --build-name=1.0.2 --build-number=4
```

If you use a different website address:

```bash
flutter build ipa --release --flavor member --dart-define=APP_URL=https://your-domain.com/
```

The Xcode archive of the last build is at `build/ios/archive/Runner.xcarchive`.

> **iOS vs Android names:** `.ipa` is the iPhone version of Android's `.aab`/`.apk`.
> You cannot install an `.ipa` by tapping it. It goes to Apple first (TestFlight / App Store).

---

## 12. Upload to App Store Connect

Pick **one** way.

### Way A – Transporter app (easiest)
1. Install **Transporter** from the Mac App Store
2. Sign in with your Apple ID
3. Drag `gym-boo-admin.ipa` and `gym-boo-member.ipa` into it (it knows which app each one is from the bundle ID)
4. Click **Deliver**

### Way B – Xcode
Right after a build, open `build/ios/archive/Runner.xcarchive` (Xcode → **Window → Organizer**) → **Distribute App → App Store Connect → Upload**.

After upload, wait about 5–30 minutes while Apple "processes" the build. You get an email when it is ready.

---

## 13. Test with TestFlight (do this before public release)

1. App Store Connect → the app → **TestFlight** tab
2. Your build appears after processing (no Export Compliance question, thanks to Step 3.1)
3. Add testers (Internal Testing = people on your team, instant; External = anyone with an email, needs a short Apple review)
4. Testers install the **TestFlight** app on their iPhone and tap your invite

Check on a **real iPhone**:

| Admin app | Member app |
|---|---|
| Login, dashboard opens | Login, home screen opens |
| Upload a member photo / gym logo | Notification permission prompt appears |
| CSV export opens the share sheet | QR check-in: camera prompt appears, scan works |
| Receipt PDF opens the share sheet | Send a test notification from the admin dashboard – it **arrives** |

---

## 14. Release to the App Store

For each app:

1. App Store Connect → the app → **App Store** tab → the version (e.g. 1.0.1)
2. Fill in:
   - **Screenshots** (required): iPhone 6.9" (or 6.5") – App Store Connect shows the sizes it needs
   - **Description**, **Keywords**, **Support URL**
   - **Privacy Policy URL** (required – the apps have a login, photos, and the member app uses notifications)
   - **App Privacy** questions (what data you collect)
   - **Age rating**
   - **App Review info**: a **demo login** (username + password) – an **admin** account for Gym Boo, a **member** account for Gym Boo Member
3. Under **Build**, click **+** and choose the build you uploaded
4. Click **Add for Review → Submit**

Apple usually replies in 1–2 days. After approval it goes live (or at the date you chose).

### Tips to avoid Apple rejection
- Apple dislikes apps that are *only* a website in a box (rule 4.2 "Minimum Functionality"). In the **App Review notes**, list the native features:
  - Member app: push notifications, QR check-in with the camera, receipt PDFs saved through the share sheet.
  - Admin app: native photo picker, CSV and PDF export through the share sheet. The admin app has **no** push notifications, so it is the one more at risk – explain it is a tool for gym staff.
- Always give the reviewer a working demo account for each app.
- Make sure the privacy policy page really loads.
- Memberships are real-world gym services paid offline, so in-app purchase rules normally don't apply – say so in the review notes.

---

## 15. Releasing an update later

```bash
cd ~/Desktop/gym
git pull
cd mobile-app
```

1. Raise the version in `pubspec.yaml` (e.g. `1.0.2+4`)
2. If you changed `pubspec.yaml` packages: `flutter pub get && cd ios && pod install && cd ..`
3. Build both apps and copy them out (Step 11)
4. Upload with Transporter
5. App Store Connect → each app → **+ Version** → choose the new build → write "What's New" → **Submit**

Your `ios/` folder and `firebase_options.dart` stay on the Mac, so Steps 3–9 are **one time only**. Just don't delete the folder (and keep your backup).

---

## 16. Quick cheat sheet

**First time on the Mac**
```bash
git clone <YOUR_REPO_URL> gym && cd gym/mobile-app
flutter create --org app.gymboo --project-name gym_boo --platforms ios . && rm -rf test
flutter pub get
# Info.plist lines (Step 3.1)
open ios/Runner.xcworkspace      # configurations, schemes, bundle IDs, names, icons, team, push (Step 4)
dart run flutter_launcher_icons
flutter build ios --config-only --release --flavor admin
# edit ios/Podfile (Step 6), then:
cd ios && pod install && cd ..
# copy lib/firebase_options.dart, set its ios block to the member app (Step 7)
flutter build ipa --release --flavor admin  && cp build/ios/ipa/*.ipa ~/Desktop/ipa/gym-boo-admin.ipa
flutter build ipa --release --flavor member && cp build/ios/ipa/*.ipa ~/Desktop/ipa/gym-boo-member.ipa
```

**Every update after that**
```bash
git pull
# raise the +number in pubspec.yaml
flutter build ipa --release --flavor admin  && cp build/ios/ipa/*.ipa ~/Desktop/ipa/gym-boo-admin.ipa
flutter build ipa --release --flavor member && cp build/ios/ipa/*.ipa ~/Desktop/ipa/gym-boo-member.ipa
open ~/Desktop/ipa               # drag both into Transporter
```

---

## 17. Common problems

| Problem | Why | Fix |
|---|---|---|
| `ios` folder missing after clone | It is in `.gitignore` | Step 3, or restore your backup |
| `firebase_options.dart` not found | It is in `.gitignore` | Step 7.1 |
| "The Xcode project does not define custom schemes" / "could not find scheme member" | Schemes missing or not named exactly `admin` / `member` | Step 4.2 |
| "Release-member build configuration not found" | Configuration name typo | Step 4.1 – names are `Debug-member`, `Release-member`, `Profile-member` |
| The member build opens the admin page | Built without `--flavor member`, or the `member` scheme uses the admin configurations | Add `--flavor member`; check Step 4.2 |
| Both apps have the same name or icon | Per-configuration settings not filled | Step 4.3 and Step 5 |
| "No signing certificate" / "requires a development team" | Team not chosen | Step 4.6 |
| `pod install` fails | Old CocoaPods cache | `cd ios && pod repo update && pod install` |
| Upload error "missing purpose string" (`NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription`) | Info.plist texts missing | Step 3.1 |
| Upload says "build number already used" | Same `+number` as before for that app | Raise the number after `+` |
| Upload says "Invalid icon / alpha channel" | Icon has transparency | Check `remove_alpha_ios: true` in the yaml files and re-run Step 5 |
| QR scanner camera does nothing | Camera denied earlier, or testing on the Simulator | iPhone **Settings → Gym Boo Member → Camera** on; test on a real iPhone |
| Notifications don't arrive on iPhone | `firebase_options.dart` still points to the old `gymBoo` app, APNs key not uploaded for `app.gymboo.member`, or capability missing | Steps 7.3, 9.3 and 4.7. Test on a real device |
| `flutter: command not found` | Not on PATH | Open a new Terminal window |

---

## 18. Checklist

- [ ] Apple Developer account paid and active
- [ ] Xcode (latest), Flutter, CocoaPods installed (`flutter doctor` is green)
- [ ] Repo cloned, `ios/` re-created, Info.plist texts added
- [ ] Xcode: 6 configurations, `admin` + `member` schemes, bundle IDs, display names, icon set names
- [ ] Xcode: iPhone only, iOS 15.0, Team set, Push Notifications + Background Modes added
- [ ] Icons generated, Podfile edited, `pod install` OK
- [ ] `firebase_options.dart` copied, its `ios` block points to the `app.gymboo.member` Firebase app
- [ ] `ios/` folder backed up
- [ ] App IDs `app.gymboo.gymBoo` and `app.gymboo.member` created with Push Notifications
- [ ] APNs `.p8` key uploaded to Firebase for `app.gymboo.member`
- [ ] Both apps created in App Store Connect
- [ ] Build number higher than the last upload of each app
- [ ] Both `.ipa` files built and copied out
- [ ] Uploaded with Transporter and tested in TestFlight on a real iPhone
- [ ] Screenshots, description, privacy policy, demo logins (admin + member) ready
- [ ] Both submitted for review
