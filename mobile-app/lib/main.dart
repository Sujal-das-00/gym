import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'config.dart';
import 'firebase_options.dart';
import 'notifications.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await GymNotifications.instance.init();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(statusBarColor: Color(0xFF073F2D), statusBarIconBrightness: Brightness.light),
  );
  runApp(const GymBooApp());
}

class GymBooApp extends StatelessWidget {
  const GymBooApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Gym Boo',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF073F2D), useMaterial3: true),
      home: const WebShell(),
    );
  }
}

class WebShell extends StatefulWidget {
  const WebShell({super.key});

  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> {
  late final WebViewController _controller;
  final Uri _home = Uri.parse(kAppUrl);
  late final Uri _start = _home.resolve(kStartPath);
  bool _loading = true;
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController(onPermissionRequest: _onWebPermission)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF6F8F5))
      ..addJavaScriptChannel('GymBooNative', onMessageReceived: _onBridgeMessage)
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) => setState(() {
          _loading = true;
          _failed = false;
        }),
        onPageFinished: (_) => setState(() => _loading = false),
        onWebResourceError: (error) {
          // Only a failed main-frame load should replace the page.
          if (error.isForMainFrame ?? true) setState(() => _failed = true);
        },
        onNavigationRequest: _onNavigation,
      ));

    // Tapping a notification opens the page it names inside this WebView.
    GymNotifications.instance.onOpenUrl = _openPath;
    _controller.loadRequest(_start);
    // Show the OS "Allow notifications?" popup on first launch, before sign-in.
    // (The device is linked to a member after they sign in; see usePushNotifications.js.)
    GymNotifications.instance.askOnFirstLaunch();
    GymNotifications.instance.launchUrl().then((url) {
      if (url != null) _openPath(url);
    });
  }

  /// The check-in page's QR scanner asks the WebView for the camera. Android also
  /// needs the app itself to hold the camera permission, so ask the OS first.
  Future<void> _onWebPermission(WebViewPermissionRequest request) async {
    final wantsCamera = request.types.contains(WebViewPermissionResourceType.camera);
    final onlyCamera = request.types.every((t) => t == WebViewPermissionResourceType.camera);
    if (wantsCamera && onlyCamera && (await Permission.camera.request()).isGranted) {
      await request.grant();
    } else {
      await request.deny();
    }
  }

  /// Notification URLs are relative to the site (the backend refuses anything
  /// else), so they are resolved against the app origin.
  void _openPath(String path) {
    final target = _home.resolve(path);
    if (target.host != _home.host) return;
    _controller.loadRequest(target);
  }

  /// Stay in the app for our own site; hand everything else (tel:, mailto:,
  /// WhatsApp, UPI, other websites) to the phone.
  Future<NavigationDecision> _onNavigation(NavigationRequest request) async {
    final uri = Uri.tryParse(request.url);
    if (uri == null) return NavigationDecision.prevent;
    if (uri.scheme == 'about' || uri.scheme == 'blob' || uri.scheme == 'data') return NavigationDecision.navigate;
    if ((uri.scheme == 'https' || uri.scheme == 'http') && uri.host == _home.host) {
      // Member app only: /admin, the landing site etc. stay out of this app.
      final allowed = kAllowedPathPrefixes.any((p) => uri.path == p || uri.path.startsWith('$p/'));
      return allowed ? NavigationDecision.navigate : NavigationDecision.prevent;
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
    return NavigationDecision.prevent;
  }

  /// Requests from the web page: {"id": 1, "type": "status" | "enable"}.
  Future<void> _onBridgeMessage(JavaScriptMessage message) async {
    int? id;
    String result;
    try {
      final request = jsonDecode(message.message) as Map<String, dynamic>;
      id = request['id'] as int?;
      result = await GymNotifications.instance.handleBridge(request['type'] as String? ?? 'status');
    } catch (_) {
      result = jsonEncode({'permission': 'default', 'token': null});
    }
    if (id == null) return;
    // jsonEncode(result) is a quoted, escaped JS string literal; the web side parses it.
    await _controller.runJavaScript('window.__gymbooNativeResult($id, ${jsonEncode(result)});');
  }

  Future<void> _onBack(bool didPop, Object? _) async {
    if (didPop) return;
    if (await _controller.canGoBack()) {
      await _controller.goBack();
    } else {
      SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: _onBack,
      child: Scaffold(
        backgroundColor: const Color(0xFFF6F8F5),
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_loading && !_failed) const LinearProgressIndicator(minHeight: 3),
              if (_failed)
                Container(
                  color: const Color(0xFFF6F8F5),
                  alignment: Alignment.center,
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.wifi_off_rounded, size: 56, color: Color(0xFF073F2D)),
                      const SizedBox(height: 16),
                      const Text("Can't reach Gym Boo", style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 8),
                      const Text('Check your internet connection and try again.', textAlign: TextAlign.center),
                      const SizedBox(height: 20),
                      FilledButton(onPressed: () => _controller.loadRequest(_start), child: const Text('Retry')),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
