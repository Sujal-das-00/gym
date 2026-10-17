/// Where the Gym Boo web app lives. Override at build time without editing code:
///   flutter run --dart-define=APP_URL=https://app.yourgym.com/
/// Must be https in production. Members open /checkin/<gym-slug>, admins open
/// /admin — both are reached by navigating inside this one WebView, so the start
/// URL is normally the site root.
const String kAppUrl = String.fromEnvironment(
  'APP_URL',
  defaultValue: 'https://CHANGE-ME.example.com/',
);

/// Must match ANDROID_CHANNEL_ID in backend/src/services/fcmService.js.
const String kChannelId = 'gymboo_default';
const String kChannelName = 'Gym Boo';
const String kChannelDescription = 'Announcements and reminders from your gym';

/// This app is the MEMBER CHECK-IN app only. Pass the gym's slug to land on its
/// page directly:  --dart-define=GYM_SLUG=nova-fitness
/// (without it the app opens /checkin, where the member picks their gym).
const String kGymSlug = String.fromEnvironment('GYM_SLUG', defaultValue: '');

String get kStartPath => kGymSlug.isEmpty ? 'checkin' : 'checkin/$kGymSlug';

/// Top-level pages the WebView may open. Everything else on the site (admin,
/// landing, super-admin) is blocked so the app stays a member app.
const List<String> kAllowedPathPrefixes = ['/checkin', '/api'];
