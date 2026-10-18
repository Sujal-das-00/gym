# Gym Boo – Release Guide (Android)

This guide explains, in simple words:

1. Where your finished file (AAB) is
2. What AAB and APK mean
3. How to make a **new release** with a **new build number**
4. What every command does

---

## 1. Where is my file?

Your app is a **Flutter** app. Your project folder is:

```
/home/suajldas/Desktop/gym/mobile-app
```

### Your AAB file (this is what you upload to Google Play)

```
/home/suajldas/Desktop/gym/mobile-app/build/app/outputs/bundle/release/app-release.aab
```

- Size: about 44 MB
- Built on: Oct 18

> There is a second `.aab` inside `build/app/intermediates/...`. **Ignore it.**
> That is a temporary file Flutter uses while building. Only upload the one in `outputs/bundle/release/`.

### Your APK file

**You do not have an APK yet.** Only an AAB was built.
When you build an APK, it will appear here:

```
/home/suajldas/Desktop/gym/mobile-app/build/app/outputs/flutter-apk/app-release.apk
```

### Open the folder quickly

```bash
xdg-open /home/suajldas/Desktop/gym/mobile-app/build/app/outputs/bundle/release
```

---

## 2. AAB vs APK – what is the difference?

| | AAB | APK |
|---|---|---|
| Full name | Android App Bundle | Android Package |
| Used for | **Uploading to Google Play Store** | **Installing directly** on a phone (testing, sharing) |
| Can you install it on a phone by tapping? | No | Yes |
| Size | Bigger file, but users download a smaller custom version | One file that works on all phones |

**Simple rule:**
- Want to publish on Play Store? → use the **AAB**
- Want to test on your own phone or send to a friend? → use the **APK**

---

## 3. Your app's important details

| Thing | Value | Where it is set |
|---|---|---|
| App ID (package name) | `app.gymboo.gym_boo` | `android/app/build.gradle.kts` |
| Current version | `1.0.0+1` | `pubspec.yaml` (line 4) |
| Signing key file | `/home/suajldas/upload-keystore.jks` | `android/key.properties` |

### What does `1.0.0+1` mean?

```
version: 1.0.0+1
         ─┬───  ┬
          │     └── Build number  (Android calls it "versionCode")
          └──────── Version name  (what users see in the Play Store, "versionName")
```

- **Version name (`1.0.0`)**: the nice number users see. Change it when you add features or fixes, like `1.0.1`, `1.1.0`, `2.0.0`.
- **Build number (`+1`)**: a plain whole number. **Google Play requires it to go UP every time you upload.** If you upload a file with a build number that Play already has, Play will reject it.

---

## 4. How to make a NEW release with a NEW build number

### Step 1 – Make your code changes
Edit the app as you like in the `lib/` folder (or other files).

### Step 2 – Change the version number
Open [pubspec.yaml](pubspec.yaml) and change line 4.

Example – you had `1.0.0+1` and want a small update:

```yaml
version: 1.0.1+2
```

Rules:
- The number after `+` must be **bigger than the last one you uploaded**. (1 → 2 → 3 → 4 ...)
- Never reuse a build number. Never go down.
- The version name (before `+`) can stay the same or go up.

### Step 3 – Open a terminal in the project folder

```bash
cd /home/suajldas/Desktop/gym/mobile-app
```

*What it does:* moves the terminal into your app folder. All the next commands must be run from here.

### Step 4 – Clean old build files (optional but recommended)

```bash
flutter clean
```

*What it does:* deletes the old `build/` folder so nothing old is mixed into the new build. Note: this also deletes your old AAB, so **copy it somewhere safe first** if you want to keep it (see Step 8).

### Step 5 – Download the app's libraries

```bash
flutter pub get
```

*What it does:* downloads/updates all packages listed in `pubspec.yaml`. Needed after `flutter clean`.

### Step 6 – (Optional) Check for code problems

```bash
flutter analyze
```

*What it does:* scans your code for mistakes and warns you. Fix errors before building.

### Step 7 – Build the AAB

**Option A – use the version already written in pubspec.yaml (easiest):**

```bash
flutter build appbundle --release
```

**Option B – set the version right in the command (without editing the file):**

```bash
flutter build appbundle --release --build-name=1.0.1 --build-number=2
```

*What each part means:*

| Part | Meaning |
|---|---|
| `flutter build appbundle` | Make an AAB file |
| `--release` | Make the final, fast, optimized version (not a debug test version) |
| `--build-name=1.0.1` | The version name users see |
| `--build-number=2` | The build number (versionCode). Must be higher than last time |

The build is automatically **signed** with your key from `android/key.properties`. That is how Google knows the update really comes from you.

It takes a few minutes. When done, you will see:

```
✓ Built build/app/outputs/bundle/release/app-release.aab
```

### Step 8 – Find and save your new AAB

New file location (same place as before):

```
/home/suajldas/Desktop/gym/mobile-app/build/app/outputs/bundle/release/app-release.aab
```

**Tip:** copy it with the version in the name so you never mix them up:

```bash
cp build/app/outputs/bundle/release/app-release.aab ~/Desktop/gym-boo-1.0.1+2.aab
```

*What it does:* makes a copy on your Desktop named `gym-boo-1.0.1+2.aab`.

### Step 9 – Upload to Google Play

1. Go to Play Console → your app → **Testing** or **Production** → **Create new release**
2. Upload the new `.aab`
3. Write "release notes" (what changed)
4. Click **Review release** → **Start rollout**

---

## 5. How to build an APK (for testing on a phone)

```bash
flutter build apk --release
```

*What it does:* makes one APK that works on all phones. Output:

```
build/app/outputs/flutter-apk/app-release.apk
```

Smaller APK (one per phone type – most phones use `arm64-v8a`):

```bash
flutter build apk --release --split-per-abi
```

Output files:
```
build/app/outputs/flutter-apk/app-arm64-v8a-release.apk     ← most modern phones
build/app/outputs/flutter-apk/app-armeabi-v7a-release.apk   ← older phones
build/app/outputs/flutter-apk/app-x86_64-release.apk        ← emulators
```

Install on a phone connected by USB (with USB debugging ON):

```bash
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

*What it does:* `adb` sends the APK to the phone; `-r` means "replace the old version if it is already installed".

---

## 6. Quick copy-paste cheat sheet

**New Play Store release (after editing the version in `pubspec.yaml`):**

```bash
cd /home/suajldas/Desktop/gym/mobile-app
flutter pub get
flutter build appbundle --release
cp build/app/outputs/bundle/release/app-release.aab ~/Desktop/gym-boo-new.aab
```

**New test APK:**

```bash
cd /home/suajldas/Desktop/gym/mobile-app
flutter pub get
flutter build apk --release
```

---

## 7. Very important – protect your signing key

Your signing key is the file:

```
/home/suajldas/upload-keystore.jks
```

and its passwords are in `android/key.properties`.

- **Back it up** (USB drive, private cloud). If you lose it you will have a hard time updating your app.
- **Never share it** and never upload it to GitHub. (`key.properties` is already ignored by git, which is good.)
- Always build with the same key.

---

## 8. Common problems

| Problem | Why | Fix |
|---|---|---|
| Play says "Version code 1 has already been used" | Build number was not increased | Raise the number after `+` in `pubspec.yaml` and rebuild |
| Play says "Wrong signing key" | Built with a different keystore | Use the same `upload-keystore.jks` listed in `key.properties` |
| `flutter: command not found` | Flutter is not in PATH | Open a new terminal, or add Flutter's `bin` folder to PATH |
| Build fails after changing packages | Old cache | Run `flutter clean` then `flutter pub get`, then build again |
| I can't install the AAB on my phone | AABs are only for Play Store | Build an APK instead (section 5) |

---

## 9. Release checklist

- [ ] Code changes finished and tested
- [ ] Build number in `pubspec.yaml` is **higher** than the last upload
- [ ] `flutter analyze` shows no errors
- [ ] `flutter build appbundle --release` finished successfully
- [ ] Copied the AAB to a safe, clearly named file
- [ ] Uploaded to Play Console and wrote release notes
- [ ] Keystore backup is safe
