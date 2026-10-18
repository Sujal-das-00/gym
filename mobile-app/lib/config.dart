import 'package:flutter/services.dart' show appFlavor;
import 'package:flutter/widgets.dart' show Color;

/// One codebase, two apps, picked at build time with `--flavor`:
///   admin  → "Gym Boo"        (app.gymboo.gym_boo) opens /admin
///   member → "Gym Boo Member" (app.gymboo.member)  opens /checkin, gets push notifications
/// Builds without a flavor (e.g. iOS, which has no flavors set up yet) are the admin app.
const bool kIsMemberApp = appFlavor == 'member';

/// Where the Gym Boo web app lives. Defaults to production; override at build
/// time without editing code (e.g. local dev on the Android emulator):
///   flutter run --flavor member --dart-define=APP_URL=http://10.0.2.2:5051/
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

/// Member app only: pass the gym's slug to land on its page directly:
///   --dart-define=GYM_SLUG=nova-fitness
/// (without it the app opens /checkin, where the member picks their gym).
const String kGymSlug = String.fromEnvironment('GYM_SLUG', defaultValue: '');

const String kAppName = kIsMemberApp ? 'Gym Boo Member' : 'Gym Boo';

const String kStartPath = kIsMemberApp ? (kGymSlug == '' ? 'checkin' : 'checkin/$kGymSlug') : 'admin';

/// Top-level pages the WebView may open. Other pages on the site (the landing
/// page, super-admin, the other app's pages) open in the phone's browser.
const List<String> kAllowedPathPrefixes =
    kIsMemberApp ? ['/checkin', '/api'] : ['/admin', '/plans', '/api'];

/// Splash look, kept on screen until the first page has loaded. Must match
/// flutter_native_splash-<flavor>.yaml.
const Color kSplashColor = kIsMemberApp ? Color(0xFFFFFFFF) : Color(0xFF063A2B);
const String kSplashImage = kIsMemberApp ? 'assets/member/splash.png' : 'assets/admin/splash.png';

/// Main brand colour: progress bar, buttons, offline screen.
const Color kBrandColor = kIsMemberApp ? Color(0xFFF76910) : Color(0xFF063A2B);
