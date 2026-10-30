import 'package:flutter/material.dart';

import 'config.dart';
import 'onboarding.dart';

/// Browser preview of the first-run screens, without the WebView app around them:
///   flutter run -d chrome -t lib/tour_preview.dart
/// Open one screen directly with ?screen=onboarding|setup&page=N. Signup here is a
/// dry run: nothing is sent to the server.
/// Not part of the phone app (main.dart is its entry point).
void main() {
  SignupApi.dryRun = true;
  runApp(const _TourPreview());
}

class _TourPreview extends StatelessWidget {
  const _TourPreview();

  @override
  Widget build(BuildContext context) {
    // Drawn inside a phone-sized frame, so the layout matches a real screen.
    return Directionality(
      textDirection: TextDirection.ltr,
      child: ColoredBox(
        color: const Color(0xFF1D2420),
        child: Center(
          child: FittedBox(
            child: Container(
              width: 390,
              height: 844,
              margin: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(36),
                border: Border.all(color: Colors.black, width: 10),
              ),
              clipBehavior: Clip.antiAlias,
              child: MaterialApp(
                title: 'Tour preview',
                debugShowCheckedModeBanner: false,
                theme: ThemeData(colorSchemeSeed: kBrandColor, useMaterial3: true),
                home: const _PreviewHome(),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PreviewHome extends StatefulWidget {
  const _PreviewHome();

  @override
  State<_PreviewHome> createState() => _PreviewHomeState();
}

class _PreviewHomeState extends State<_PreviewHome> {
  @override
  void initState() {
    super.initState();
    // Same as a fresh install. For a direct look at one screen:
    // ?screen=onboarding|setup&page=N
    final query = Uri.base.queryParameters;
    final page = int.tryParse(query['page'] ?? '') ?? 0;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      switch (query['screen']) {
        case 'setup':
          showGymSetup(context, initialStep: page);
        default:
          showOnboarding(context, initialPage: page);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8F5),
      body: const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text(
            'The admin panel loads here in the app.\nTap the tour button to replay the screens.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF6D776F), height: 1.5),
          ),
        ),
      ),
      floatingActionButton: Builder(
        builder: (context) => FloatingActionButton.small(
          tooltip: 'App tour',
          backgroundColor: kBrandColor,
          foregroundColor: Colors.white,
          onPressed: () => showTourMenu(context),
          child: const Icon(Icons.school_rounded),
        ),
      ),
    );
  }
}
