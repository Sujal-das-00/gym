import 'dart:convert';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:permission_handler/permission_handler.dart';

import 'config.dart';

/// Wraps FCM + the local-notification plugin.
///
/// Notifications that arrive while the app is closed or in the background are
/// drawn by Android itself from the FCM `notification` block (titled with the
/// app label, "Gym Boo Member") — no Dart code runs. This class only has to handle the
/// foreground case, where Android shows nothing, and taps.
class GymNotifications {
  GymNotifications._();
  static final GymNotifications instance = GymNotifications._();

  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();

  /// Called with an in-app path (e.g. /checkin/my-gym?screen=home) when the user
  /// taps a notification.
  void Function(String url)? onOpenUrl;

  Future<void> init() async {
    const androidInit = AndroidInitializationSettings('@drawable/ic_notification');
    await _local.initialize(
      const InitializationSettings(android: androidInit),
      onDidReceiveNotificationResponse: (response) {
        final url = response.payload;
        if (url != null && url.isNotEmpty) onOpenUrl?.call(url);
      },
    );

    // Android 8+: the channel must exist before a message names it, or the
    // notification lands in a silent default channel.
    await _local
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(const AndroidNotificationChannel(
          kChannelId,
          kChannelName,
          description: kChannelDescription,
          importance: Importance.max,
        ));

    // iOS also needs this to show banners while the app is open.
    await _fcm.setForegroundNotificationPresentationOptions(alert: true, badge: true, sound: true);

    // App in the foreground: Android won't draw it, so do it ourselves.
    FirebaseMessaging.onMessage.listen((message) {
      final n = message.notification;
      if (n == null) return;
      _local.show(
        message.messageId.hashCode,
        n.title ?? kAppName,
        n.body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            kChannelId,
            kChannelName,
            channelDescription: kChannelDescription,
            importance: Importance.max,
            priority: Priority.high,
            icon: '@drawable/ic_notification',
          ),
        ),
        payload: message.data['url'] as String?,
      );
    });

    // Tapped while the app was in the background.
    FirebaseMessaging.onMessageOpenedApp.listen((m) => _open(m.data['url'] as String?));
  }

  /// The notification that launched a terminated app, if any.
  Future<String?> launchUrl() async {
    final initial = await _fcm.getInitialMessage();
    return initial?.data['url'] as String?;
  }

  void _open(String? url) {
    if (url != null && url.isNotEmpty) onOpenUrl?.call(url);
  }

  /// "granted" | "denied" | "default" — the vocabulary the web app already uses
  /// for Notification.permission.
  String _permissionName(AuthorizationStatus status) {
    switch (status) {
      case AuthorizationStatus.authorized:
      case AuthorizationStatus.provisional:
        return 'granted';
      case AuthorizationStatus.denied:
        return 'denied';
      case AuthorizationStatus.notDetermined:
        return 'default';
    }
  }

  Future<String?> _token() async {
    try {
      return await _fcm.getToken();
    } catch (_) {
      // No Google Play services (some emulators / de-googled phones).
      return null;
    }
  }

  /// Runs on every launch until notifications are allowed (Android 13+ asks
  /// with its own dialog; older versions have them on unless turned off in
  /// Settings). Returns true when Android could not show its dialog — denied
  /// twice, or switched off in Settings — so the caller offers a shortcut to
  /// the app's notification settings instead.
  Future<bool> askUntilAllowed() async {
    try {
      if (!Platform.isAndroid) {
        final settings = await _fcm.getNotificationSettings();
        if (settings.authorizationStatus == AuthorizationStatus.notDetermined) {
          await _fcm.requestPermission(alert: true, badge: true, sound: true);
        }
        return false;
      }
      if (await Permission.notification.isGranted) return false;
      // The system dialog pauses the app; no pause means Android stayed silent.
      var systemDialogShown = false;
      final listener = AppLifecycleListener(onInactive: () => systemDialogShown = true);
      final status = await Permission.notification.request();
      listener.dispose();
      return !status.isGranted && !systemDialogShown;
    } catch (_) {
      // Best effort; the web page asks again after sign-in.
      return false;
    }
  }

  Future<void> openSettings() => openAppSettings();

  /// Current state without prompting.
  Future<Map<String, dynamic>> status() async {
    final settings = await _fcm.getNotificationSettings();
    final permission = _permissionName(settings.authorizationStatus);
    return {
      'permission': permission,
      'token': permission == 'granted' ? await _token() : null,
    };
  }

  /// Shows the OS permission dialog if needed, then returns the device token.
  Future<Map<String, dynamic>> enable() async {
    final settings = await _fcm.requestPermission(alert: true, badge: true, sound: true);
    final permission = _permissionName(settings.authorizationStatus);
    return {
      'permission': permission,
      'token': permission == 'granted' ? await _token() : null,
    };
  }

  /// Handles one request from the web page's `GymBooNative` channel and returns
  /// the JSON the page's promise resolves with.
  Future<String> handleBridge(String type) async {
    switch (type) {
      case 'enable':
        return jsonEncode(await enable());
      case 'status':
      default:
        return jsonEncode(await status());
    }
  }
}
