#!/usr/bin/env bash
# One-time setup. Needs: Flutter SDK, Firebase CLI (`npm i -g firebase-tools`, `firebase login`)
# and FlutterFire CLI (`dart pub global activate flutterfire_cli`).
set -euo pipefail
cd "$(dirname "$0")"

# 1. Generate the android/ and ios/ scaffolding next to our lib/ and pubspec.yaml.
flutter create --org app.gymboo --project-name gym_boo --platforms android,ios .

# 2. Drop in the manifest (app name "Gym Boo", notification permission/icon/channel) and resources.
cp -r android-overlay/app/src/. android/app/src/

# 2b. flutter_local_notifications needs core library desugaring; enable it in the generated Gradle file.
python3 - <<'PY'
p = "android/app/build.gradle.kts"
s = open(p).read()
if "isCoreLibraryDesugaringEnabled" not in s:
    s = s.replace("compileOptions {", "compileOptions {\n        isCoreLibraryDesugaringEnabled = true", 1)
    s = s.replace("flutter {\n    source", 'dependencies {\n    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")\n}\n\nflutter {\n    source', 1)
    open(p, "w").write(s)
PY

# 3. Link a Firebase project: writes lib/firebase_options.dart + android/app/google-services.json
#    and wires the google-services Gradle plugin.
flutterfire configure

# 4. Launcher icons from assets/icon.png, then fetch packages.
flutter pub get
dart run flutter_launcher_icons

echo
echo "Done. Run:  flutter run --dart-define=APP_URL=https://your-domain.com/"
echo "Release:    flutter build apk --release --dart-define=APP_URL=https://your-domain.com/"
