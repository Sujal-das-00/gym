import 'package:flutter/widgets.dart' show Color;

/// The admin app: "Simple Gym Manager" (Android app.gymboo.gym_boo, iOS app.gymboo.gymBoo).
/// Opens /admin; no push notifications. Its twin is ../member-app.

/// Where the Gym Boo web app lives. Defaults to production; override at build
/// time without editing code (e.g. local dev on the Android emulator):
///   flutter run --dart-define=APP_URL=http://10.0.2.2:5051/
/// (use your PC's LAN IP instead of 10.0.2.2 on a real phone)
/// Must be https in production.
const String kAppUrl = String.fromEnvironment(
  'APP_URL',
  defaultValue: 'https://gymbot.toolszila.com/',
);

const String kAppName = 'Simple Gym Manager';

const String kStartPath = 'admin';

/// Top-level pages the WebView may open. Other pages on the site (the landing
/// page, super-admin, the member app's pages) open in the phone's browser.
const List<String> kAllowedPathPrefixes = ['/admin', '/plans', '/api'];

/// Splash look, kept on screen until the first page has loaded. Must match
/// flutter_native_splash.yaml.
const Color kSplashColor = Color(0xFF063A2B);
const String kSplashImage = 'assets/splash.png';

/// Main brand colour: progress bar, buttons, offline screen.
const Color kBrandColor = Color(0xFF063A2B);
