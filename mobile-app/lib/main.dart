import 'dart:convert';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'config.dart';
import 'firebase_options.dart';
import 'notifications.dart';
import 'receipt_pdf.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Push notifications are for members; admins don't register devices.
  if (kIsMemberApp) {
    // On Android the flavor's google-services.json entry picks the Firebase app.
    await (Platform.isAndroid
        ? Firebase.initializeApp()
        : Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform));
    await GymNotifications.instance.init();
  }
  // Android 15+ draws edge-to-edge and ignores statusBarColor; the splash-coloured
  // Scaffold behind SafeArea shows through the bars instead.
  final darkBars = kSplashColor.computeLuminance() < 0.5;
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle(
    statusBarColor: kSplashColor,
    statusBarIconBrightness: darkBars ? Brightness.light : Brightness.dark,
    statusBarBrightness: darkBars ? Brightness.dark : Brightness.light,
    systemNavigationBarColor: kSplashColor,
    systemNavigationBarIconBrightness: darkBars ? Brightness.light : Brightness.dark,
  ));
  runApp(const GymBooApp());
}

const Color kPageBackground = Color(0xFFF6F8F5);

class GymBooApp extends StatelessWidget {
  const GymBooApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: kAppName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: kBrandColor, useMaterial3: true),
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
  // Keeps the splash look until the first page has painted.
  bool _firstLoadDone = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController(onPermissionRequest: _onWebPermission)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(kPageBackground)
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) => setState(() {
          _loading = true;
          _failed = false;
        }),
        onPageFinished: (_) => setState(() {
          _loading = false;
          _firstLoadDone = true;
        }),
        onWebResourceError: (error) {
          // Only a failed main-frame load should replace the page.
          if (error.isForMainFrame ?? true) setState(() => _failed = true);
        },
        onNavigationRequest: _onNavigation,
      ));

    // <input type="file"> (member/trainer photos, gym logo) needs a native picker.
    final platform = _controller.platform;
    if (platform is AndroidWebViewController) platform.setOnShowFileSelector(_pickFiles);

    // Both apps: the WebView can't download (no <a download>, no blob: files)
    // or print, so CSV exports and receipts are handed to the app over this bridge.
    _controller.addJavaScriptChannel('GymBooNative', onMessageReceived: _onBridgeMessage);
    if (kIsMemberApp) {
      // Tapping a notification opens the page it names inside this WebView.
      GymNotifications.instance.onOpenUrl = _openPath;
      GymNotifications.instance.launchUrl().then((url) {
        if (url != null) _openPath(url);
      });
    }
    _controller.loadRequest(_start);
    // Member app: ask for notifications on every launch until they're allowed.
    // (The device is linked to a member after they sign in; see usePushNotifications.js.)
    if (kIsMemberApp) _askForNotifications();
  }

  Future<void> _askForNotifications() async {
    final needsSettings = await GymNotifications.instance.askUntilAllowed();
    if (!needsSettings || !mounted) return;
    final open = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.notifications_active_outlined),
        title: const Text('Turn on notifications'),
        content: const Text(
            'Get announcements, reminders and payment updates from your gym. Tap Open settings, then turn on notifications.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Not now')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Open settings')),
        ],
      ),
    );
    if (open == true) await GymNotifications.instance.openSettings();
  }

  /// Photo picker for file inputs. Android 13+ uses the system photo picker,
  /// which needs no storage permission.
  Future<List<String>> _pickFiles(FileSelectorParams params) async {
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 2048, imageQuality: 85);
    return picked == null ? const [] : [Uri.file(picked.path).toString()];
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
      if (kAllowedPathPrefixes.any((p) => uri.path == p || uri.path.startsWith('$p/'))) {
        return NavigationDecision.navigate;
      }
      // The other app's pages, the landing site etc. open in the browser.
    }
    await launchUrl(uri, mode: LaunchMode.externalApplication);
    return NavigationDecision.prevent;
  }

  /// Requests from the web page: {"id": 1, "type": ...}
  ///   "status" | "enable"   member app: push notification permission (FCM)
  ///   "saveFile"            {name, mime, text}: share/save a generated file (CSV)
  ///   "savePdf"             {name, receipt, html}: build the PDF and save it to Downloads (receipts)
  ///   "printHtml"           {name, html}: print dialog, where "Save as PDF" makes the file
  Future<void> _onBridgeMessage(JavaScriptMessage message) async {
    int? id;
    String result;
    try {
      final request = jsonDecode(message.message) as Map<String, dynamic>;
      id = request['id'] as int?;
      final type = request['type'] as String? ?? 'status';
      if (type == 'saveFile') {
        result = jsonEncode(await _saveFile(request));
      } else if (type == 'savePdf') {
        result = jsonEncode(await _savePdf(request));
      } else if (type == 'printHtml') {
        result = jsonEncode(await _printHtml(request));
      } else if (kIsMemberApp) {
        result = await GymNotifications.instance.handleBridge(type);
      } else {
        result = jsonEncode({'ok': false, 'error': 'unsupported'});
      }
    } catch (error) {
      result = jsonEncode({'ok': false, 'error': '$error', 'permission': 'default', 'token': null});
    }
    if (id == null) return;
    // jsonEncode(result) is a quoted, escaped JS string literal; the web side parses it.
    await _controller.runJavaScript('window.__gymbooNativeResult($id, ${jsonEncode(result)});');
  }

  /// Opens the system share sheet with the file, where it can be saved to Files or
  /// Drive, or sent on WhatsApp / email. Nothing is written outside the app's cache.
  Future<Map<String, Object?>> _saveFile(Map<String, dynamic> request) async {
    final name = _safeFileName(request['name'] as String? ?? 'export.csv');
    final mime = request['mime'] as String? ?? 'text/plain';
    final bytes = utf8.encode(request['text'] as String? ?? '');
    final share = await SharePlus.instance.share(ShareParams(
      files: [XFile.fromData(Uint8List.fromList(bytes), mimeType: mime, name: name)],
      fileNameOverrides: [name],
      title: name,
    ));
    return {'ok': true, 'status': share.status.name};
  }

  /// Native side: MainActivity.kt.
  static const _downloads = MethodChannel('app.gymboo/downloads');

  /// Renders the page to a PDF and saves it straight to Downloads, with no print
  /// dialog. Where the app can't write to Downloads (iOS, Android 9 and older) the
  /// share sheet opens instead, which can save to Files / Drive.
  Future<Map<String, Object?>> _savePdf(Map<String, dynamic> request) async {
    final base = _safeFileName(request['name'] as String? ?? 'document');
    final name = base.toLowerCase().endsWith('.pdf') ? base : '$base.pdf';
    final receipt = request['receipt'];
    final Uint8List pdf;
    if (receipt is Map<String, dynamic>) {
      pdf = await buildReceiptPdf(receipt);
    } else {
      // Web pages from before `receipt` was sent: convert their HTML instead.
      // ignore: deprecated_member_use
      pdf = await Printing.convertHtml(html: request['html'] as String? ?? '');
    }

    final uri = Platform.isAndroid
        ? await _downloads.invokeMethod<String>('save', {'name': name, 'mime': 'application/pdf', 'bytes': pdf})
        : null;
    if (uri == null) {
      await SharePlus.instance.share(ShareParams(
        files: [XFile.fromData(pdf, mimeType: 'application/pdf', name: name)],
        fileNameOverrides: [name],
        title: name,
      ));
      return {'ok': true, 'saved': false};
    }

    if (mounted) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text('Saved to Downloads: $name'),
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 6),
          action: SnackBarAction(
            label: 'Open',
            onPressed: () => _downloads.invokeMethod<bool>('open', {'uri': uri, 'mime': 'application/pdf'}),
          ),
        ));
    }
    return {'ok': true, 'saved': true};
  }

  Future<Map<String, Object?>> _printHtml(Map<String, dynamic> request) async {
    final name = _safeFileName(request['name'] as String? ?? 'document');
    final html = request['html'] as String? ?? '';
    final done = await Printing.layoutPdf(
      name: name,
      // The receipt's layout lives in the web app (checkin-frontend/src/lib/receipt.js);
      // converting that same HTML keeps one design instead of a second one in Dart.
      // Soft-deprecated, but still supported and maintained on Android and iOS.
      // ignore: deprecated_member_use
      onLayout: (format) => Printing.convertHtml(html: html, format: format),
    );
    return {'ok': true, 'printed': done};
  }

  static String _safeFileName(String name) {
    final cleaned = name.replaceAll(RegExp(r'[^A-Za-z0-9._-]+'), '-');
    return cleaned.isEmpty ? 'file' : cleaned;
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
        backgroundColor: kSplashColor,
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_loading && !_failed && _firstLoadDone)
                const LinearProgressIndicator(minHeight: 3, color: kBrandColor),
              if (!_firstLoadDone && !_failed)
                Container(
                  color: kSplashColor,
                  alignment: Alignment.center,
                  child: Image.asset(kSplashImage, width: 150),
                ),
              if (_failed)
                Container(
                  color: kPageBackground,
                  alignment: Alignment.center,
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.wifi_off_rounded, size: 56, color: kBrandColor),
                      const SizedBox(height: 16),
                      const Text("Can't reach $kAppName", style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
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
