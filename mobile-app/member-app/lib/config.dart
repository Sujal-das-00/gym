import 'package:flutter/widgets.dart' show Color;

/// The member app: "Gym Boo Member" (app.gymboo.member on Android and iOS).
/// Opens /checkin and gets push notifications. Its twin is ../admin-app.

/// Where the Gym Boo web app lives. Defaults to production; override at build
/// time without editing code (e.g. local dev on the Android emulator):
///   flutter run --dart-define=APP_URL=http://10.0.2.2:5051/
/// (use your PC's LAN IP instead of 10.0.2.2 on a real phone)
/// Must be https in production.
const String kAppUrl = String.fromEnvironment(
  'APP_URL',
  defaultValue: 'https://gymbot.toolszila.com/',
);

/// Must match ANDROID_CHANNEL_ID in backend/src/services/fcmService.js.
const String kChannelId = 'gymboo_default';
const String kChannelName = 'Gym Boo';
const String kChannelDescription = 'Announcements and reminders from your gym';

/// Pass the gym's slug to land on its page directly:
///   --dart-define=GYM_SLUG=nova-fitness
/// (without it the app opens /checkin, where the member picks their gym).
const String kGymSlug = String.fromEnvironment('GYM_SLUG', defaultValue: '');

const String kAppName = 'Gym Boo Member';

const String kStartPath = kGymSlug == '' ? 'checkin' : 'checkin/$kGymSlug';

/// Top-level pages the WebView may open. Other pages on the site (the landing
/// page, super-admin, the admin app's pages) open in the phone's browser.
const List<String> kAllowedPathPrefixes = ['/checkin', '/api'];

/// Splash look, kept on screen until the first page has loaded. Must match
/// flutter_native_splash.yaml.
const Color kSplashColor = Color(0xFFFFFFFF);
const String kSplashImage = 'assets/splash.png';

/// Main brand colour: progress bar, buttons, offline screen.
const Color kBrandColor = Color(0xFFF76910);
