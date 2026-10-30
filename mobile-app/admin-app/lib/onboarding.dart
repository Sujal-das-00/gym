import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import 'config.dart';
import 'onboarding_art.dart';

/// First-run onboarding: a few welcome slides, then gym setup, which creates
/// the owner's account and signs the panel in. How to use the menu is taught
/// by the web panel itself (admin-frontend MenuTour.jsx). These are native
/// screens shown over the WebView, so they work while the panel loads.

const Color _lime = ArtColors.lime;
const Color _green = ArtColors.green;
const Color _ink = ArtColors.ink;
const Color _muted = ArtColors.muted;
const Color _line = ArtColors.line;
const Color _page = ArtColors.page;

/// Remembers that this phone has seen the first-run screens.
class OnboardingStore {
  static const _key = 'onboarding_seen_v1';

  static Future<bool> seen() async {
    try {
      return (await SharedPreferences.getInstance()).getBool(_key) ?? false;
    } catch (_) {
      // Storage unavailable: don't trap the owner in onboarding on every launch.
      return true;
    }
  }

  static Future<void> markSeen() async {
    try {
      await (await SharedPreferences.getInstance()).setBool(_key, true);
    } catch (_) {}
  }

  /// Makes the onboarding show again on the next app start.
  static Future<void> reset() async {
    try {
      await (await SharedPreferences.getInstance()).remove(_key);
    } catch (_) {}
  }
}

/// Creates the gym and its owner login: the same POST /api/auth/signup the
/// website uses, so the server applies the same rules.
class SignupApi {
  /// Browser preview only (tour_preview.dart): pretend, never touch the server.
  static bool dryRun = false;

  /// The new session token, or throws a [SignupError] with a message to show.
  static Future<String> signup(Map<String, String> body) async {
    if (dryRun) {
      await Future<void>.delayed(const Duration(milliseconds: 900));
      return 'preview';
    }
    final http.Response response;
    try {
      response = await http
          .post(
            Uri.parse(kAppUrl).resolve('api/auth/signup'),
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode(body),
          )
          .timeout(const Duration(seconds: 25));
    } catch (_) {
      throw const SignupError("Can't reach the server. Check your internet and try again.");
    }
    Map<String, dynamic> data = const {};
    try {
      data = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {}
    final token = data['token'];
    if (response.statusCode >= 400 || token is! String || token.isEmpty) {
      throw SignupError('${data['error'] ?? 'Could not create your account. Please try again.'}');
    }
    return token;
  }
}

class SignupError implements Exception {
  const SignupError(this.message);
  final String message;
}

/// A session created in onboarding, waiting for the WebView to pick it up
/// (main.dart stores it where the panel reads its login and reloads).
class SessionHandoff {
  static final ValueNotifier<String?> token = ValueNotifier(null);
}

/// Slides → gym setup → the panel, signed in (where the menu tour starts).
Future<void> showOnboarding(BuildContext context, {int initialPage = 0}) {
  return Navigator.of(context).push(_fadeRoute(OnboardingScreen(initialPage: initialPage)));
}

Future<void> showGymSetup(BuildContext context, {int initialStep = 0}) {
  return Navigator.of(context).push(_fadeRoute(GymSetupScreen(initialStep: initialStep)));
}

/// The temporary "see every screen" menu behind the tour button. [onMenuTour]
/// starts the web panel's own menu walkthrough (only inside the real app).
Future<void> showTourMenu(BuildContext context, {VoidCallback? onMenuTour}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (sheet) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text('App tour', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: _ink)),
            ),
            if (onMenuTour != null)
              _TourMenuTile(
                icon: Icons.ads_click_rounded,
                title: 'Menu tour',
                subtitle: 'Walks through every menu item in the panel (after login)',
                onTap: () {
                  Navigator.pop(sheet);
                  onMenuTour();
                },
              ),
            _TourMenuTile(
              icon: Icons.auto_awesome_rounded,
              title: 'Onboarding screens',
              subtitle: 'Welcome slides, then gym setup',
              onTap: () {
                Navigator.pop(sheet);
                showOnboarding(context);
              },
            ),
            _TourMenuTile(
              icon: Icons.storefront_rounded,
              title: 'Gym setup',
              subtitle: 'Gym details, then login details. Creates a real account.',
              onTap: () {
                Navigator.pop(sheet);
                showGymSetup(context);
              },
            ),
            _TourMenuTile(
              icon: Icons.restart_alt_rounded,
              title: 'Show again on next launch',
              subtitle: 'Acts like a fresh install next time the app opens',
              onTap: () async {
                Navigator.pop(sheet);
                await OnboardingStore.reset();
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Onboarding will show the next time the app starts.'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                }
              },
            ),
          ],
        ),
      ),
    ),
  );
}

class _TourMenuTile extends StatelessWidget {
  const _TourMenuTile({required this.icon, required this.title, required this.subtitle, required this.onTap});

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      leading: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(color: ArtColors.greenSoft, borderRadius: BorderRadius.circular(12)),
        child: Icon(icon, color: _green),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: _ink)),
      subtitle: Text(subtitle, style: const TextStyle(color: _muted, fontSize: 13)),
      trailing: const Icon(Icons.chevron_right_rounded, color: _muted),
      onTap: onTap,
    );
  }
}

Route<void> _fadeRoute(Widget page) {
  return PageRouteBuilder<void>(
    opaque: true,
    transitionDuration: const Duration(milliseconds: 360),
    reverseTransitionDuration: const Duration(milliseconds: 240),
    pageBuilder: (_, __, ___) => page,
    transitionsBuilder: (_, animation, __, child) {
      final curved = CurvedAnimation(parent: animation, curve: Curves.easeOutCubic);
      return FadeTransition(
        opacity: curved,
        child: ScaleTransition(scale: Tween(begin: 0.98, end: 1.0).animate(curved), child: child),
      );
    },
  );
}

/// The dark brand backdrop behind the illustrations, rounded at the bottom.
class _Stage extends StatelessWidget {
  const _Stage();

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(36)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0B5A3F), kSplashColor, Color(0xFF042A1F)],
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(36)),
        child: CustomPaint(painter: StagePainter(), size: Size.infinite),
      ),
    );
  }
}

/// The app logo and name, shown on the stage.
class _Brand extends StatelessWidget {
  const _Brand();

  @override
  Widget build(BuildContext context) {
    return const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        LogoTile(size: 34),
        SizedBox(width: 10),
        Text(kAppName, style: TextStyle(color: Colors.white, fontSize: 15.5, fontWeight: FontWeight.w800)),
      ],
    );
  }
}

/* ---------------------------------------------------------------------------
 * Welcome slides: an illustration, a title and one line. Nothing else.
 * ------------------------------------------------------------------------- */

class _Slide {
  const _Slide({required this.title, required this.subtitle, required this.art});

  final String title;
  final String subtitle;
  final Widget Function(Animation<double> t) art;
}

final List<_Slide> _slides = [
  _Slide(
    title: 'Your Entire Gym.\nOne App.',
    subtitle: 'Manage your gym without the daily paperwork.',
    art: (t) => EntireGymArt(t: t),
  ),
  _Slide(
    title: 'Never Miss a\nFee Due Date',
    subtitle: 'Stay ahead of membership payments.',
    art: (t) => FeesArt(t: t),
  ),
  _Slide(
    title: 'Every Member,\nUnder Control',
    subtitle: "Know who's active and who needs attention.",
    art: (t) => MembersArt(t: t),
  ),
  _Slide(
    title: 'Run Your Gym\nSmarter',
    subtitle: 'Make better decisions with a clearer picture.',
    art: (t) => InsightsArt(t: t),
  ),
  _Slide(
    title: 'Members Get\nTheir Own App',
    subtitle: 'Check-ins, receipts and reminders on their phone.',
    art: (t) => MemberAppArt(t: t),
  ),
];

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, this.initialPage = 0});

  final int initialPage;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> with SingleTickerProviderStateMixin {
  late final PageController _pages = PageController(initialPage: widget.initialPage.clamp(0, _slides.length - 1));
  late final AnimationController _float = AnimationController(vsync: this, duration: const Duration(seconds: 5))
    ..repeat();
  late int _index = widget.initialPage.clamp(0, _slides.length - 1);

  bool get _isLast => _index == _slides.length - 1;

  @override
  void dispose() {
    // However the screen is left (finish, skip or back), it counts as seen.
    OnboardingStore.markSeen();
    _pages.dispose();
    _float.dispose();
    super.dispose();
  }

  double get _position =>
      _pages.hasClients && _pages.position.haveDimensions ? _pages.page ?? _index.toDouble() : _index.toDouble();

  void _toSetup() {
    Navigator.of(context).pushReplacement(_fadeRoute(const GymSetupScreen()));
  }

  void _next() {
    HapticFeedback.selectionClick();
    if (_isLast) {
      _toSetup();
      return;
    }
    _pages.nextPage(duration: const Duration(milliseconds: 460), curve: Curves.easeOutCubic);
  }

  void _back() {
    HapticFeedback.selectionClick();
    _pages.previousPage(duration: const Duration(milliseconds: 420), curve: Curves.easeOutCubic);
  }

  @override
  Widget build(BuildContext context) {
    final safeTop = MediaQuery.paddingOf(context).top;
    final safeBottom = MediaQuery.paddingOf(context).bottom;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: _page,
        body: LayoutBuilder(
          builder: (context, box) {
            final h = box.maxHeight;
            final stage = (h * 0.6).clamp(300.0, 560.0);
            const controls = 112.0;
            return Stack(
              children: [
                Positioned(top: 0, left: 0, right: 0, height: stage, child: const _Stage()),
                PageView.builder(
                  controller: _pages,
                  itemCount: _slides.length,
                  onPageChanged: (value) => setState(() => _index = value),
                  itemBuilder: (context, i) => AnimatedBuilder(
                    animation: _pages,
                    builder: (context, _) => _SlidePage(
                      slide: _slides[i],
                      float: _float,
                      delta: _position - i,
                      width: box.maxWidth,
                      stageHeight: stage,
                      topInset: safeTop + 64,
                      bottomInset: controls + safeBottom,
                    ),
                  ),
                ),
                Positioned(
                  top: safeTop + 10,
                  left: 20,
                  right: 8,
                  child: Row(
                    children: [
                      const _Brand(),
                      const Spacer(),
                      TextButton(
                        onPressed: _toSetup,
                        style: TextButton.styleFrom(foregroundColor: Colors.white70),
                        child: const Text('Skip', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      ),
                    ],
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(24, 12, 24, 16 + safeBottom),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AnimatedBuilder(
                          animation: _pages,
                          builder: (context, _) => _Progress(count: _slides.length, page: _position),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 200),
                              transitionBuilder: (child, a) => SizeTransition(
                                sizeFactor: a,
                                axis: Axis.horizontal,
                                child: FadeTransition(opacity: a, child: child),
                              ),
                              child: _index == 0
                                  ? const SizedBox.shrink()
                                  : Padding(
                                      padding: const EdgeInsets.only(right: 12),
                                      child: _SquareButton(icon: Icons.arrow_back_rounded, onPressed: _back),
                                    ),
                            ),
                            Expanded(
                              child: _PrimaryButton(
                                label: _isLast ? 'Set up my gym' : 'Next',
                                icon: Icons.arrow_forward_rounded,
                                onPressed: _next,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SlidePage extends StatelessWidget {
  const _SlidePage({
    required this.slide,
    required this.float,
    required this.delta,
    required this.width,
    required this.stageHeight,
    required this.topInset,
    required this.bottomInset,
  });

  final _Slide slide;
  final Animation<double> float;

  /// How far this page is from the centre: 0 on screen, ±1 one page away.
  final double delta;
  final double width;
  final double stageHeight;
  final double topInset;
  final double bottomInset;

  @override
  Widget build(BuildContext context) {
    final distance = delta.abs().clamp(0.0, 1.0);
    return Column(
      children: [
        SizedBox(
          height: stageHeight,
          child: Padding(
            padding: EdgeInsets.fromLTRB(20, topInset, 20, 26),
            // The art drifts slower than the page and settles in as it arrives.
            child: Transform.translate(
              offset: Offset(delta * width * 0.32, 0),
              child: Opacity(
                opacity: 1 - distance * 0.6,
                child: Transform.scale(scale: 1 - distance * 0.1, child: FittedBox(child: slide.art(float))),
              ),
            ),
          ),
        ),
        Expanded(
          child: Opacity(
            opacity: (1 - distance * 1.6).clamp(0.0, 1.0),
            child: Transform.translate(
              offset: Offset(delta * width * 0.12, 0),
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(28, 28, 28, bottomInset),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      slide.title,
                      style: const TextStyle(
                        color: _ink,
                        fontSize: 32,
                        height: 1.08,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -1,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(slide.subtitle, style: const TextStyle(color: _muted, fontSize: 16, height: 1.45)),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

/// Segmented progress that fills continuously while swiping.
class _Progress extends StatelessWidget {
  const _Progress({required this.count, required this.page});

  final int count;
  final double page;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < count; i++)
          Expanded(
            child: Container(
              height: 5,
              margin: EdgeInsets.only(right: i == count - 1 ? 0 : 6),
              decoration: BoxDecoration(color: _line, borderRadius: BorderRadius.circular(99)),
              child: FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: (page - i + 1).clamp(0.0, 1.0),
                child: DecoratedBox(
                  decoration: BoxDecoration(color: kSplashColor, borderRadius: BorderRadius.circular(99)),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({required this.label, required this.onPressed, this.icon, this.busy = false});

  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: busy ? null : onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: kSplashColor,
        foregroundColor: Colors.white,
        disabledBackgroundColor: kSplashColor.withValues(alpha: 0.75),
        disabledForegroundColor: Colors.white,
        minimumSize: const Size(0, 56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
      ),
      child: busy
          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.6, color: _lime))
          : FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 180),
                    child: Text(label, key: ValueKey(label)),
                  ),
                  if (icon != null) ...[
                    const SizedBox(width: 8),
                    Container(
                      width: 26,
                      height: 26,
                      decoration: BoxDecoration(color: _lime, borderRadius: BorderRadius.circular(8)),
                      child: Icon(icon, size: 16, color: kSplashColor),
                    ),
                  ],
                ],
              ),
            ),
    );
  }
}

class _SquareButton extends StatelessWidget {
  const _SquareButton({required this.icon, required this.onPressed});

  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: _ink,
        backgroundColor: Colors.white,
        minimumSize: const Size(56, 56),
        padding: EdgeInsets.zero,
        side: const BorderSide(color: _line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      ),
      child: Icon(icon),
    );
  }
}

/* ---------------------------------------------------------------------------
 * Gym setup: 1) gym details  2) login details  → account created → panel
 * ------------------------------------------------------------------------- */

// Same rules the server applies at signup (backend authService.signupOwner).
final RegExp _namePattern = RegExp(r'^[A-Za-z]+(?: [A-Za-z]+)*$');
final RegExp _phonePattern = RegExp(r'^[6-9]\d{9}$');
final RegExp _emailPattern = RegExp(r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$');

class GymSetupScreen extends StatefulWidget {
  const GymSetupScreen({super.key, this.initialStep = 0});

  final int initialStep;

  @override
  State<GymSetupScreen> createState() => _GymSetupScreenState();
}

class _GymSetupScreenState extends State<GymSetupScreen> {
  final _gymForm = GlobalKey<FormState>();
  final _loginForm = GlobalKey<FormState>();
  final _owner = TextEditingController();
  final _gym = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _referral = TextEditingController();
  final _focus = List.generate(6, (_) => FocusNode());
  late int _step = widget.initialStep.clamp(0, 1);
  bool _submitted = false;
  bool _busy = false;
  bool _showPassword = false;
  String _error = '';
  String? _token; // set once the account exists

  @override
  void initState() {
    super.initState();
    for (final controller in [_owner, _gym, _phone]) {
      controller.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    OnboardingStore.markSeen();
    for (final controller in [_owner, _gym, _phone, _email, _password, _confirm, _referral]) {
      controller.dispose();
    }
    for (final node in _focus) {
      node.dispose();
    }
    super.dispose();
  }

  String? _nameError(String? value, String what) {
    final text = (value ?? '').trim();
    if (text.isEmpty) return 'Enter $what';
    if (text.length < 2 || !_namePattern.hasMatch(text)) return 'Use 2–30 letters, no numbers or symbols';
    return null;
  }

  String? _phoneError(String? value) {
    final digits = (value ?? '').trim();
    if (digits.isEmpty) return "Enter the gym's phone number";
    if (!_phonePattern.hasMatch(digits)) return 'Enter a valid 10-digit mobile number';
    return null;
  }

  String? _emailError(String? value) {
    final text = (value ?? '').trim();
    if (text.isEmpty) return 'Enter your email';
    if (text.length > 120 || text.contains('..') || !_emailPattern.hasMatch(text)) {
      return 'Enter a valid email, like you@yourgym.in';
    }
    return null;
  }

  String? _passwordError(String? value) {
    final text = value ?? '';
    if (text.isEmpty) return 'Choose a password';
    if (text.length < 8) return 'At least 8 characters';
    if (!RegExp('[A-Za-z]').hasMatch(text) || !RegExp(r'\d').hasMatch(text)) return 'Use a letter and a number';
    return null;
  }

  String? _confirmError(String? value) {
    if ((value ?? '').isEmpty) return 'Type the password again';
    if (value != _password.text) return "Passwords don't match";
    return null;
  }

  void _toStep(int step) {
    FocusScope.of(context).unfocus();
    setState(() {
      _step = step;
      _submitted = false;
      _error = '';
    });
  }

  void _nextFromGym() {
    setState(() => _submitted = true);
    if (!(_gymForm.currentState?.validate() ?? false)) {
      HapticFeedback.mediumImpact();
      return;
    }
    HapticFeedback.selectionClick();
    _toStep(1);
  }

  Future<void> _createAccount() async {
    if (_busy) return;
    setState(() => _submitted = true);
    if (!(_loginForm.currentState?.validate() ?? false)) {
      HapticFeedback.mediumImpact();
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final token = await SignupApi.signup({
        'ownerName': _clean(_owner.text),
        'gymName': _clean(_gym.text),
        'gymPhone': _phone.text.trim(),
        'email': _email.text.trim(),
        'password': _password.text,
        'referralCode': _referral.text.trim(),
      });
      HapticFeedback.heavyImpact();
      if (mounted) setState(() => _token = token);
    } on SignupError catch (error) {
      HapticFeedback.mediumImpact();
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String _clean(String value) => value.trim().replaceAll(RegExp(r'\s+'), ' ');

  void _openDashboard() {
    SessionHandoff.token.value = _token;
    Navigator.of(context).pop();
  }

  void _openLegal(String path) {
    launchUrl(Uri.parse(kAppUrl).resolve(path), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final keyboard = media.viewInsets.bottom > 0;
    final safeTop = media.padding.top;
    final done = _token != null;
    return PopScope(
      // Back on the login step returns to the gym step; after signup it opens the panel.
      canPop: _step == 0 && !done && !_busy,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (done) {
          _openDashboard();
        } else if (_step == 1 && !_busy) {
          _toStep(0);
        }
      },
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(
          backgroundColor: _page,
          body: LayoutBuilder(
            builder: (context, box) {
              final full = (box.maxHeight * (done ? 0.5 : 0.36)).clamp(230.0, 420.0);
              final stage = keyboard ? safeTop + 132 : full;
              return Column(
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 280),
                    curve: Curves.easeOutCubic,
                    height: stage,
                    child: Stack(
                      children: [
                        const Positioned.fill(child: _Stage()),
                        Positioned(
                          top: safeTop + 10,
                          left: 20,
                          right: 20,
                          child: const Row(children: [_Brand()]),
                        ),
                        Positioned.fill(
                          top: safeTop + 60,
                          bottom: 24,
                          left: 24,
                          right: 24,
                          child: FittedBox(
                            child: GymCardArt(
                              gymName: _gym.text,
                              ownerName: _owner.text,
                              phone: _phone.text,
                              ready: done,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 320),
                      switchInCurve: Curves.easeOutCubic,
                      transitionBuilder: (child, animation) => FadeTransition(
                        opacity: animation,
                        child: SlideTransition(
                          position: Tween(begin: const Offset(0.06, 0), end: Offset.zero).animate(animation),
                          child: child,
                        ),
                      ),
                      child: done ? _buildDone(media) : (_step == 0 ? _buildGymStep(media) : _buildLoginStep(media)),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _heading(String step, String title) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            for (var i = 0; i < 2; i++)
              AnimatedContainer(
                duration: const Duration(milliseconds: 260),
                width: i == _step ? 26 : 10,
                height: 6,
                margin: const EdgeInsets.only(right: 6),
                decoration: BoxDecoration(
                  color: i <= _step ? kSplashColor : _line,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            const SizedBox(width: 6),
            Text(step, style: const TextStyle(color: _muted, fontSize: 12.5, fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          title,
          style: const TextStyle(color: _ink, fontSize: 27, fontWeight: FontWeight.w900, letterSpacing: -0.7),
        ),
        const SizedBox(height: 20),
      ],
    );
  }

  Widget _buildGymStep(MediaQueryData media) {
    return Form(
      key: _gymForm,
      autovalidateMode: _submitted ? AutovalidateMode.onUserInteraction : AutovalidateMode.disabled,
      child: ListView(
        key: const ValueKey('gym'),
        padding: EdgeInsets.fromLTRB(24, 24, 24, 20 + media.padding.bottom),
        children: [
          _heading('Step 1 of 2', 'Set up your gym'),
          _Field(
            controller: _gym,
            focusNode: _focus[0],
            label: 'Gym name',
            icon: Icons.storefront_rounded,
            capitalization: TextCapitalization.words,
            autofill: const [AutofillHints.organizationName],
            formatters: [FilteringTextInputFormatter.allow(RegExp('[A-Za-z ]')), LengthLimitingTextInputFormatter(30)],
            validator: (value) => _nameError(value, 'the gym name'),
            onSubmitted: (_) => _focus[1].requestFocus(),
          ),
          const SizedBox(height: 14),
          _Field(
            controller: _owner,
            focusNode: _focus[1],
            label: 'Your name',
            icon: Icons.person_rounded,
            capitalization: TextCapitalization.words,
            autofill: const [AutofillHints.name],
            formatters: [FilteringTextInputFormatter.allow(RegExp('[A-Za-z ]')), LengthLimitingTextInputFormatter(30)],
            validator: (value) => _nameError(value, 'your name'),
            onSubmitted: (_) => _focus[2].requestFocus(),
          ),
          const SizedBox(height: 14),
          _Field(
            controller: _phone,
            focusNode: _focus[2],
            label: 'Gym phone',
            icon: Icons.call_rounded,
            prefix: '+91 ',
            keyboard: TextInputType.phone,
            autofill: const [AutofillHints.telephoneNumberNational],
            formatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(10)],
            validator: _phoneError,
            action: TextInputAction.done,
            onSubmitted: (_) => _nextFromGym(),
          ),
          const SizedBox(height: 24),
          _PrimaryButton(label: 'Next', icon: Icons.arrow_forward_rounded, onPressed: _nextFromGym),
          const SizedBox(height: 6),
          Center(
            child: TextButton(
              onPressed: () => Navigator.of(context).pop(),
              style: TextButton.styleFrom(foregroundColor: _green),
              child: const Text('I already have an account', style: TextStyle(fontWeight: FontWeight.w800)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLoginStep(MediaQueryData media) {
    final eye = IconButton(
      onPressed: () => setState(() => _showPassword = !_showPassword),
      icon: Icon(_showPassword ? Icons.visibility_off_rounded : Icons.visibility_rounded, color: _muted),
      tooltip: _showPassword ? 'Hide password' : 'Show password',
    );
    return Form(
      key: _loginForm,
      autovalidateMode: _submitted ? AutovalidateMode.onUserInteraction : AutovalidateMode.disabled,
      child: AutofillGroup(
        child: ListView(
          key: const ValueKey('login'),
          padding: EdgeInsets.fromLTRB(24, 24, 24, 20 + media.padding.bottom),
          children: [
            _heading('Step 2 of 2', 'Create your login'),
            _Field(
              controller: _email,
              focusNode: _focus[3],
              label: 'Email',
              icon: Icons.mail_rounded,
              keyboard: TextInputType.emailAddress,
              autofill: const [AutofillHints.email],
              formatters: [FilteringTextInputFormatter.deny(RegExp(r'\s')), LengthLimitingTextInputFormatter(120)],
              validator: _emailError,
              onSubmitted: (_) => _focus[4].requestFocus(),
            ),
            const SizedBox(height: 14),
            _Field(
              controller: _password,
              focusNode: _focus[4],
              label: 'Password',
              icon: Icons.lock_rounded,
              obscure: !_showPassword,
              suffix: eye,
              autofill: const [AutofillHints.newPassword],
              formatters: [LengthLimitingTextInputFormatter(72)],
              validator: _passwordError,
              onSubmitted: (_) => _focus[5].requestFocus(),
            ),
            const SizedBox(height: 14),
            _Field(
              controller: _confirm,
              focusNode: _focus[5],
              label: 'Confirm password',
              icon: Icons.lock_reset_rounded,
              obscure: !_showPassword,
              autofill: const [AutofillHints.newPassword],
              formatters: [LengthLimitingTextInputFormatter(72)],
              validator: _confirmError,
            ),
            const SizedBox(height: 14),
            _Field(
              controller: _referral,
              label: 'Referral code (optional)',
              icon: Icons.redeem_rounded,
              capitalization: TextCapitalization.characters,
              formatters: [
                FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
                LengthLimitingTextInputFormatter(20),
                _UpperCase(),
              ],
              validator: (_) => null,
              action: TextInputAction.done,
              onSubmitted: (_) => _createAccount(),
            ),
            AnimatedSize(
              duration: const Duration(milliseconds: 200),
              child: _error.isEmpty
                  ? const SizedBox(height: 22)
                  : Container(
                      margin: const EdgeInsets.only(top: 16, bottom: 6),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: ArtColors.redSoft, borderRadius: BorderRadius.circular(14)),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Icon(Icons.error_rounded, color: ArtColors.red, size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _error,
                              style: const TextStyle(color: ArtColors.red, fontWeight: FontWeight.w700, height: 1.35),
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
            Row(
              children: [
                _SquareButton(icon: Icons.arrow_back_rounded, onPressed: _busy ? null : () => _toStep(0)),
                const SizedBox(width: 12),
                Expanded(
                  child: _PrimaryButton(
                    label: 'Create my gym',
                    icon: Icons.check_rounded,
                    busy: _busy,
                    onPressed: _createAccount,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                const Text('By continuing you agree to the ', style: TextStyle(color: _muted, fontSize: 12.5)),
                _LinkText('Terms', () => _openLegal('terms')),
                const Text(' and ', style: TextStyle(color: _muted, fontSize: 12.5)),
                _LinkText('Privacy Policy', () => _openLegal('privacy')),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDone(MediaQueryData media) {
    return ListView(
      key: const ValueKey('done'),
      padding: EdgeInsets.fromLTRB(24, 28, 24, 20 + media.padding.bottom),
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: const BoxDecoration(color: ArtColors.greenSoft, shape: BoxShape.circle),
          child: const Icon(Icons.check_rounded, color: _green, size: 32),
        ),
        const SizedBox(height: 16),
        const Text(
          'Your gym is ready',
          style: TextStyle(color: _ink, fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: -0.7),
        ),
        const SizedBox(height: 8),
        Text(
          "You're the owner of ${_clean(_gym.text)}. Let's add your first member.",
          style: const TextStyle(color: _muted, fontSize: 15.5, height: 1.45),
        ),
        const SizedBox(height: 26),
        _PrimaryButton(label: 'Open my dashboard', icon: Icons.arrow_forward_rounded, onPressed: _openDashboard),
      ],
    );
  }
}

class _UpperCase extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) =>
      newValue.copyWith(text: newValue.text.toUpperCase());
}

class _LinkText extends StatelessWidget {
  const _LinkText(this.text, this.onTap);

  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(4),
      child: Text(
        text,
        style: const TextStyle(
          color: _green,
          fontSize: 12.5,
          fontWeight: FontWeight.w800,
          decoration: TextDecoration.underline,
          decorationColor: _green,
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.controller,
    required this.label,
    required this.icon,
    required this.validator,
    this.focusNode,
    this.prefix,
    this.suffix,
    this.obscure = false,
    this.keyboard = TextInputType.text,
    this.capitalization = TextCapitalization.none,
    this.formatters = const [],
    this.autofill = const [],
    this.action = TextInputAction.next,
    this.onSubmitted,
  });

  final TextEditingController controller;
  final FocusNode? focusNode;
  final String label;
  final IconData icon;
  final String? prefix;
  final Widget? suffix;
  final bool obscure;
  final TextInputType keyboard;
  final TextCapitalization capitalization;
  final List<TextInputFormatter> formatters;
  final List<String> autofill;
  final TextInputAction action;
  final String? Function(String?) validator;
  final ValueChanged<String>? onSubmitted;

  @override
  Widget build(BuildContext context) {
    OutlineInputBorder border(Color color, [double width = 1]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: color, width: width),
        );
    return TextFormField(
      controller: controller,
      focusNode: focusNode,
      keyboardType: keyboard,
      obscureText: obscure,
      enableSuggestions: !obscure,
      autocorrect: false,
      textCapitalization: capitalization,
      inputFormatters: formatters,
      autofillHints: autofill,
      textInputAction: action,
      validator: validator,
      onFieldSubmitted: onSubmitted,
      style: const TextStyle(color: _ink, fontSize: 16, fontWeight: FontWeight.w600),
      decoration: InputDecoration(
        labelText: label,
        prefixText: prefix,
        prefixStyle: const TextStyle(color: _ink, fontSize: 16, fontWeight: FontWeight.w700),
        prefixIcon: Padding(
          padding: const EdgeInsets.only(left: 6, right: 2),
          child: Icon(icon, color: _green),
        ),
        suffixIcon: suffix,
        filled: true,
        fillColor: Colors.white,
        labelStyle: const TextStyle(color: _muted, fontWeight: FontWeight.w600),
        floatingLabelStyle: const TextStyle(color: _green, fontWeight: FontWeight.w800),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
        enabledBorder: border(_line),
        focusedBorder: border(_green, 1.8),
        errorBorder: border(ArtColors.red),
        focusedErrorBorder: border(ArtColors.red, 1.8),
      ),
    );
  }
}
