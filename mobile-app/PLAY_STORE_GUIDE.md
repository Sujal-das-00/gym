# Gym Boo – Play Store Guide (for beginners)

Follow the parts in order. First release = Parts 1 → 5. Every later update = **Part 6 only**.

> How the two apps are laid out, and how to build them for iOS, is in [README.md](README.md).

---

## Part 0 – Know your two apps

There are **two separate Flutter apps**, each in its own folder. Each one is its own app in Play Console.

| | Admin app | Member app |
|---|---|---|
| Name shown on phone | Gym Boo | Gym Boo Member |
| **Package name** | `app.gymboo.gym_boo` | `app.gymboo.member` |
| Folder (run commands here) | `mobile-app/admin-app` | `mobile-app/member-app` |
| For | Gym owners / staff | Gym members |

**Always `cd` into the app's folder before building.** There are no `--flavor` flags any more.

Things you need before starting:
- Flutter installed (`flutter --version` works)
- The signing key file `/home/suajldas/upload-keystore.jks` and `android/key.properties` inside **each** app folder (**ask the owner; they are not in git**)
- Member app only: `member-app/android/app/google-services.json` (Firebase file, also not in git)
- A Google Play Console account (paid $25 once)

---

## Part 1 – Create the app in Play Console

1. Open https://play.google.com/console → **Create app** (top right).
2. Fill in:

| Field | What to enter |
|---|---|
| App name | `Gym Boo` (admin) or `Gym Boo Member` (member) |
| Default language | English (United States) or English (India) |
| App or game | **App** |
| Free or paid | **Free** (cannot be changed to paid later) |

3. Tick both declarations (Developer Program Policies, US export laws) → **Create app**.

> **Package name:** Play Console does **not** ask you to type it here. It is read from the first AAB you upload (Part 4). It must be exactly `app.gymboo.gym_boo` (admin) or `app.gymboo.member` (member). **It can never be changed after the first upload.**

---

## Part 2 – Fill the "Set up your app" tasks

Left menu → **Dashboard**. Complete every task in the list. Most are tick-box forms.

### 2.1 Privacy policy
- Needs a **public web page URL** that explains what data you collect.
- Already built into the website. Paste these URLs (deploy the site first and open each one to confirm it loads):
  - Privacy policy: `https://gymbot.toolszila.com/privacy`
  - Terms of service: `https://gymbot.toolszila.com/terms`
  - Account deletion (Data safety → "Delete account URL"): `https://gymbot.toolszila.com/delete-account`
  - For the App Store, the same privacy URL goes in App Store Connect → App Information → Privacy Policy URL.

### 2.2 App access
- Choose **"All or some functionality is restricted"**.
- Add a **test login** (a demo gym admin / demo member account with username + password). Google reviewers must be able to log in. If they can't, the app is rejected.

### 2.3 Ads
- **No, my app does not contain ads.**

### 2.4 Content rating
- Start questionnaire → category **Utility / Productivity** → answer **No** to violence, sexual content, etc. → Save → Submit.

### 2.5 Target audience
- Choose **18 and over**. (Not for children.)

### 2.6 Data safety (the longest form – answer honestly)
The app uses: login (name, phone/email), payment records, camera (photo upload), push notifications. Typical answers:

| Question | Answer |
|---|---|
| Does the app collect or share user data? | **Yes** |
| Is all data encrypted in transit? | **Yes** (the site uses https) |
| Can users ask to delete their data? | **Yes** |
| Data types to tick | Personal info (name, email, phone), Photos, App activity / device IDs (push token) |
| Purpose | App functionality, Account management |

### 2.7 Other declarations
- **Government app:** No
- **Financial features:** No (payments are recorded offline by the gym, not processed in-app)
- **Health apps:** None / No
- **Advertising ID:** No

### 2.8 Account deletion
If asked for a "delete account" URL, give a page or contact email where users can request deletion.

### 2.9 Store listing (what users see)
Left menu → **Grow → Store presence → Main store listing**.

| Item | Rule |
|---|---|
| App name | Up to 30 characters |
| Short description | Up to 80 characters |
| Full description | Up to 4000 characters |
| App icon | 512 × 512 px PNG (use `admin-app/assets/icon.png` or `member-app/assets/icon.png`) |
| Feature graphic | 1024 × 500 px PNG/JPG |
| Phone screenshots | At least **2**, up to 8 (take from a real phone or emulator) |
| Category | **Health & Fitness** |
| Contact email | A real email you check |

Click **Save**.

---

## Part 3 – Build the release file (AAB)

An **AAB** is the file you upload to Play. (An APK is only for installing on your own phone.)

```bash
cd /home/suajldas/Desktop/gym/mobile-app/member-app     # or admin-app
flutter pub get
flutter build appbundle --release
```

When it finishes you will see `✓ Built build/app/outputs/bundle/release/app-release.aab`.

**Where is the file?**

| App | File |
|---|---|
| Member | `mobile-app/member-app/build/app/outputs/bundle/release/app-release.aab` |
| Admin | `mobile-app/admin-app/build/app/outputs/bundle/release/app-release.aab` |

Open the folder:
```bash
xdg-open build/app/outputs/bundle/release
```

Save a clearly named copy so versions never get mixed up:
```bash
cp build/app/outputs/bundle/release/app-release.aab ~/Desktop/gym-boo-member-1.0.2+4.aab
```

The file is **automatically signed** using `android/key.properties`. If that file is missing, the build silently uses a debug key and **Play will reject it** – so check the file exists first.

---

## Part 4 – Upload and release

Start with **Internal testing** (fast, no review wait), then promote to Production.

1. Left menu → **Test and release → Testing → Internal testing**.
2. **Testers** tab → create an email list → add your own Gmail → Save.
3. **Releases** tab → **Create new release**.
4. **Play App Signing:** when asked, choose **Continue / Use Play App Signing** (recommended, default).
5. Drag in the `.aab` file. Wait for the green tick.
6. Release name fills automatically (e.g. `2 (1.0.1)`). Leave it.
7. Release notes, example:
   ```
   <en-US>
   First release of Gym Boo Member.
   </en-US>
   ```
8. **Next** → fix any red errors → **Save and publish**.
9. On the **Testers** tab copy the opt-in link, open it on your phone, install, and check that the app works (login, check-in, notifications).

### Go to Production
1. **Test and release → Production → Create new release**.
2. Use **Add from library** to pick the AAB you already uploaded (or upload again).
3. Add release notes → **Next** → **Save** → **Go to publishing overview** → **Send changes for review**.
4. Review takes from a few hours to about 7 days (first release is the slowest). You get an email when it is live.

> **New personal developer account?** If the Play Console account was created as a *personal* account recently, Google requires a **Closed test with 12+ testers for 14 days in a row** before Production is unlocked (Dashboard shows "Run a closed test"). Organization accounts skip this. Use **Testing → Closed testing** the same way as Internal testing, then apply for production access from the Dashboard.

---

## Part 5 – Do it again for the other app

Repeat Parts 1 → 4 for the second app (admin ↔ member) from the other app folder.

---

## Part 6 – Releasing an UPDATE (the part you will do most)

### Step 1 – Raise the build number
Open that app's `pubspec.yaml` ([admin-app/pubspec.yaml](admin-app/pubspec.yaml) or [member-app/pubspec.yaml](member-app/pubspec.yaml)), line 4:

```yaml
version: 1.0.1+2
#         │      └─ build number (versionCode). MUST go up on every upload: 2 → 3 → 4
#         └──────── version name users see: 1.0.1 → 1.0.2 → 1.1.0
```

- The number after `+` must be **higher than the last one uploaded to Play for ANY track**. Never reuse, never go down.
- Each app has its own `pubspec.yaml`, so each has its own number. Check Play Console → **Test and release → App bundle explorer** to see the last uploaded build number.

(Shortcut without editing the file: `flutter build appbundle --release --build-name=1.0.3 --build-number=5`)

### Step 2 – Build the AAB again
```bash
cd /home/suajldas/Desktop/gym/mobile-app/member-app     # or admin-app
flutter pub get
flutter build appbundle --release
```

The new file is in the **same place as before** (see Part 3), and it **overwrites the old one**. Copy it to a new name first if you want to keep the old one.

### Step 3 – Upload
**Production → Create new release → upload the AAB → release notes → Next → Save → Send for review.**
(Or test first in Internal testing.)

### Which command do I run? (cheat sheet)

| I want to… | Command |
|---|---|
| Upload to Play (member) | in `member-app/`: `flutter build appbundle --release` |
| Upload to Play (admin) | in `admin-app/`: `flutter build appbundle --release` |
| Test on my phone (APK) | `flutter build apk --release` |
| Smaller APK for modern phones | `flutter build apk --release --split-per-abi` (use the `arm64-v8a` file) |
| Install APK on USB phone | `adb install -r build/app/outputs/flutter-apk/app-release.apk` |
| Change the website URL the app opens | add `--dart-define=APP_URL=https://your-url/` |
| Fresh start after errors | `flutter clean && flutter pub get` |

> **Website-only changes do NOT need a new app release.** The app is a WebView of `https://gymbot.toolszila.com/`. Only publish a new AAB when you change something inside `admin-app/` or `member-app/` (Dart code, icons, permissions, plugins).

---

## Part 7 – Troubleshooting

| Problem / Play error | Why | Fix |
|---|---|---|
| **"Version code 2 has already been used"** | Build number not raised | Raise the number after `+` in `pubspec.yaml`, rebuild, upload again |
| **"You uploaded a debug-signed APK/AAB"** or **"signed with wrong key"** | `android/key.properties` (in that app's folder) or the `.jks` file is missing, or a different key was used | Put back the correct `key.properties` and `/home/suajldas/upload-keystore.jks`, then rebuild. Always use the same key |
| **"Package name already exists"** / wrong package | Built in the wrong app folder, or already used by another account | Build from `admin-app/` for `app.gymboo.gym_boo` and from `member-app/` for `app.gymboo.member` |
| **"Your app targets API level X, must target Y"** | Play raised the minimum target SDK | Run `flutter upgrade`, then `flutter pub upgrade`, then rebuild |
| `pubspec.yaml` not found / "No pubspec.yaml file found" | Ran the command in `mobile-app/` | `cd admin-app` or `cd member-app` first |
| **"google-services.json is missing"** (member app) | Firebase file not on this PC | Get `member-app/android/app/google-services.json` from the owner / Firebase console (Android app `app.gymboo.member`) |
| `flutter: command not found` | Flutter not in PATH | Open a new terminal or add Flutter's `bin` folder to PATH |
| Build fails after changing packages | Stale cache | `flutter clean`, `flutter pub get`, build again |
| Can't find the AAB | Looking in the wrong app folder | `<app folder>/build/app/outputs/bundle/release/app-release.aab` |
| Can't install the AAB on my phone | AABs only work through Play | Build an APK (cheat sheet above) |
| **Rejected: "App access" / login not possible** | Reviewers had no test login | Add working demo credentials in **App content → App access** and resubmit |
| **Rejected: Privacy policy** | Missing / broken URL | Publish the policy page, add its URL in **App content → Privacy policy** |
| **Rejected: Data safety mismatch** | Form doesn't match what app does (camera, notifications, personal info) | Update **App content → Data safety** to match, then resubmit |
| "Lost my keystore" | Key deleted | Play Console → **Setup → App signing → Request upload key reset** (needs Play App Signing on). Prevent this by backing up the `.jks` file |
| Push notifications don't arrive in the Play version | Play re-signs the app, Firebase needs that fingerprint | Play Console → **Setup → App signing** → copy the **SHA-1**, add it in Firebase → Project settings → your Android app → **Add fingerprint**, then download a fresh `google-services.json` |
| Update stuck "In review" | Normal | Wait. Updates usually take under 2 days |

---

## Part 8 – Protect the signing key

- Files: `/home/suajldas/upload-keystore.jks` and `admin-app/android/key.properties` + `member-app/android/key.properties` (passwords inside; both point to the same `.jks`).
- **Back them up** to a private place (password manager / private cloud / USB).
- **Never commit them to git, never email or chat them.** Both are already git-ignored.

---

## Release checklist (print this)

- [ ] Code finished and tested on a real phone
- [ ] `version:` in that app's `pubspec.yaml` – number after `+` is higher than the last upload
- [ ] `android/key.properties` (in the app folder), the `.jks` file and (member) `google-services.json` exist
- [ ] `flutter build appbundle --release` (inside `admin-app/` or `member-app/`) succeeded
- [ ] AAB copied to a clearly named file
- [ ] Uploaded to Internal testing and checked on a phone
- [ ] Release notes written
- [ ] Promoted to Production and **Send for review** pressed
- [ ] Keystore backup is safe
