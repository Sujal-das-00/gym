#!/usr/bin/env bash
# One-time setup. Needs: Flutter SDK, Firebase CLI (`npm i -g firebase-tools`, `firebase login`)
# and FlutterFire CLI (`dart pub global activate flutterfire_cli`).
set -euo pipefail
cd "$(dirname "$0")"

# 1. Generate the android/ and ios/ scaffolding next to our lib/ and pubspec.yaml.
flutter create --org app.gymboo --project-name gym_boo --platforms android,ios .
rm -rf test  # the template counter test targets an app we do not have

# 2. Drop in the manifest (app name "Gym Boo", notification permission/icon/channel), resources
#    and the app Gradle file (desugaring for flutter_local_notifications, R8 shrinking, signing).
cp -r android-overlay/app/src/. android/app/src/
cp android-overlay/app/build.gradle.kts android/app/build.gradle.kts

# 3. Link a Firebase project: writes lib/firebase_options.dart + android/app/google-services.json
#    and wires the google-services Gradle plugin.
flutterfire configure

# 4. Fetch packages, then each app's launcher icon and splash screen (assets/admin, assets/member).
#    The admin app ("Gym Boo", app.gymboo.gym_boo) and member app ("Gym Boo Member",
#    app.gymboo.member) are Android flavors; both must be registered in Firebase.
flutter pub get
dart run flutter_launcher_icons
dart run flutter_native_splash:create --flavors admin,member

echo
echo "Done. Run:  flutter run --flavor admin    (or --flavor member)"
echo "Release:    flutter build appbundle --release --flavor admin|member   (see RELEASE_GUIDE.md)"
