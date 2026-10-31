import 'package:facebook_app_events/facebook_app_events.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Meta (Facebook) App Events for ad measurement. ActivateApp / app install are
/// logged by the SDK itself (AutoLogAppEventsEnabled in AndroidManifest.xml);
/// nothing here logs them again.
///
/// Events come from two places: native code (account created in onboarding) and the
/// web panel over the `GymBooNative` bridge ({"type": "track", "event": ..., "params": {...}}).
/// Bridge input is untrusted page data, so only the events and parameters below are
/// accepted and personal data (email, phone, names) is never forwarded.
class Analytics {
  static final FacebookAppEvents _fb = FacebookAppEvents();

  /// Bridge event -> how it's logged. Purchase/Subscribe are sent only for a purchase
  /// the server has approved (the page checks `status == "approved"`).
  static const _events = {
    'Login',
    'CompleteRegistration',
    'ViewContent',
    'InitiateCheckout',
    'AddPaymentInfo',
    'Contact',
    'Lead',
    'Purchase',
    'Subscribe',
  };

  /// Parameters the page may attach. Everything else is dropped.
  static const _params = {
    'user_id',
    'plan',
    'amount',
    'currency',
    'registration_method',
    'lead_source',
    'gym_category',
    'member_count',
    'content_name',
    'content_category',
    'purchase_id',
  };

  /// Events that must reach Meta once ever per key (remembered across app restarts), e.g. a purchase must not be counted again each time the plans page loads.
  static const _oncePerKey = {'CompleteRegistration', 'AddPaymentInfo', 'Purchase', 'Subscribe'};

  /// Everything else is logged once per app launch per key (page reloads, back/forward).
  static final Set<String> _sentThisLaunch = {};
  static const _prefsKey = 'meta_events_sent';
  static final Map<String, DateTime> _lastContact = {};

  /// Account created in the onboarding screens (the web sign-up form goes through [handleBridge]).
  static Future<void> registered({required String gymId, required String method}) {
    return _log('CompleteRegistration', {
      'user_id': gymId,
      'registration_method': method,
    });
  }

  /// Meta's anonymous id for this install. Sent to our server (once per gym) so an approved
  /// purchase can be reported from there. Not personal data; null if the SDK can't give one.
  static Future<String?> anonymousId() async {
    try {
      return await _fb.getAnonymousId();
    } catch (_) {
      return null;
    }
  }

  /// A "track" request from the web page. Never throws: tracking must not break the app.
  static Future<void> handleBridge(Map<String, dynamic> request) async {
    try {
      final event = request['event'];
      if (event is! String || !_events.contains(event)) return;
      final raw = request['params'];
      final clean = <String, Object>{};
      if (raw is Map) {
        for (final entry in raw.entries) {
          final key = entry.key;
          final value = entry.value;
          if (key is! String || !_params.contains(key)) continue;
          if (value is num && value.isFinite) {
            clean[key] = value;
          } else if (value is String && value.isNotEmpty) {
            clean[key] = value.length > 80 ? value.substring(0, 80) : value;
          }
        }
      }
      await _log(event, clean);
    } catch (error) {
      if (kDebugMode) debugPrint('Analytics: $error');
    }
  }

  static Future<void> _log(String event, Map<String, Object> params) async {
    try {
      if (!await _firstTime(event, params)) return;

      final userId = params['user_id'];
      if (userId is String && (event == 'Login' || event == 'CompleteRegistration')) {
        await _fb.setUserID(userId); // internal gym id, not personal data
      }

      final currency = (params['currency'] as String?) ?? 'INR';
      final amount = (params['amount'] as num?)?.toDouble();
      final extra = <String, dynamic>{
        for (final e in params.entries)
          if (e.key != 'amount' && e.key != 'currency' && e.key != 'registration_method' && e.key != 'user_id') e.key: e.value,
        if (userId != null) 'gym_id': userId,
      };

      switch (event) {
        case 'CompleteRegistration':
          await _fb.logCompletedRegistration(
            registrationMethod: params['registration_method'] as String?,
            parameters: extra,
          );
        case 'ViewContent':
          await _fb.logViewContent(
            type: params['content_category'] as String?,
            id: params['content_name'] as String?,
            currency: currency,
            parameters: extra,
          );
        case 'InitiateCheckout':
          await _fb.logInitiatedCheckout(
            totalPrice: amount,
            currency: currency,
            contentType: 'subscription_plan',
            contentId: params['plan'] as String?,
            numItems: 1,
            parameters: extra,
          );
        case 'AddPaymentInfo':
          await _fb.logEvent(
            name: FacebookAppEvents.eventNameAddedPaymentInfo,
            valueToSum: amount,
            parameters: {...extra, 'fb_currency': currency, 'fb_success': 1},
          );
        case 'Purchase':
          if (amount == null || amount <= 0) return;
          await _fb.logPurchase(amount: amount, currency: currency, parameters: extra);
        case 'Subscribe':
          await _fb.logSubscribe(
            price: amount,
            currency: currency,
            orderId: (params['purchase_id'] as String?) ?? '',
            parameters: extra,
          );
        default: // Login, Contact, Lead
          await _fb.logEvent(
            name: event,
            valueToSum: amount,
            parameters: {...extra, if (amount != null) 'fb_currency': currency},
          );
      }
    } catch (error) {
      if (kDebugMode) debugPrint('Analytics: $error');
    }
  }

  /// Dedupe. Returns false when this event was already logged for its key.
  static Future<bool> _firstTime(String event, Map<String, Object> params) async {
    final key = '$event|${params['purchase_id'] ?? params['user_id'] ?? ''}|${params['plan'] ?? params['content_name'] ?? ''}';
    if (event == 'Contact') {
      // A user can tap the support link repeatedly: one event per 30 seconds.
      final last = _lastContact[key];
      final now = DateTime.now();
      if (last != null && now.difference(last) < const Duration(seconds: 30)) return false;
      _lastContact[key] = now;
      return true;
    }
    if (!_sentThisLaunch.add(key)) return false;
    if (!_oncePerKey.contains(event)) return true;

    final prefs = await SharedPreferences.getInstance();
    final sent = prefs.getStringList(_prefsKey) ?? const <String>[];
    if (sent.contains(key)) return false;
    // Keep the newest 200 keys; far more than any gym owner ever generates.
    await prefs.setStringList(_prefsKey, [...sent.skip(sent.length > 199 ? sent.length - 199 : 0), key]);
    return true;
  }
}
