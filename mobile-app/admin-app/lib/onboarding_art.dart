import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'config.dart';

/// Vector illustrations for the onboarding slides, drawn with widgets and
/// painters (no image assets), so they stay sharp at any size and pick up the
/// brand colours. Each one is laid out on a fixed [kArtSize] canvas; callers
/// scale it with a FittedBox. [t] is a 0..1 looping animation for the gentle
/// floating motion.

const Size kArtSize = Size(320, 280);

class ArtColors {
  static const brand = Color(0xFF063A2B);
  static const green = Color(0xFF11784A);
  static const greenSoft = Color(0xFFE8F6EE);
  static const lime = Color(0xFFC6F26B);
  static const ink = Color(0xFF17201B);
  static const muted = Color(0xFF6D776F);
  static const line = Color(0xFFE1E8E1);
  static const page = Color(0xFFF6F8F5);
  static const amber = Color(0xFFA36500);
  static const amberSoft = Color(0xFFFFF3D8);
  static const red = Color(0xFFC43D32);
  static const redSoft = Color(0xFFFAE9E7);
  static const gold = Color(0xFFF2B630);
  static const chat = Color(0xFFE2F8D3);
  static const tick = Color(0xFF34A6E8);
}

/* ---- Building blocks ------------------------------------------------------ */

/// Bobs [child] up and down; [phase] staggers neighbours so they don't move in step.
class _Float extends StatelessWidget {
  const _Float({required this.t, required this.child, this.phase = 0, this.amp = 4});

  final Animation<double> t;
  final double phase;
  final double amp;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeOf(context)?.disableAnimations ?? false) return child;
    return AnimatedBuilder(
      animation: t,
      child: child,
      builder: (context, child) => Transform.translate(
        offset: Offset(0, math.sin(t.value * 2 * math.pi + phase) * amp),
        child: child,
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child, this.padding = const EdgeInsets.all(10), this.radius = 16});

  final Widget child;
  final EdgeInsets padding;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(radius),
        boxShadow: const [
          BoxShadow(color: Color(0x2E000000), blurRadius: 22, offset: Offset(0, 10)),
          BoxShadow(color: Color(0x14000000), blurRadius: 3, offset: Offset(0, 1)),
        ],
      ),
      child: child,
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.text,
      {super.key, this.fg = ArtColors.green, this.bg = ArtColors.greenSoft, this.size = 8.5, this.icon});

  final String text;
  final Color fg;
  final Color bg;
  final double size;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: size * 0.8, vertical: size * 0.32),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: size * 1.25, color: fg), SizedBox(width: size * 0.35)],
          Text(text, style: TextStyle(color: fg, fontSize: size, fontWeight: FontWeight.w800, height: 1.2)),
        ],
      ),
    );
  }
}

/// A floating "notification" chip: icon tile + one or two lines.
class _Toast extends StatelessWidget {
  const _Toast(
      {required this.icon,
      required this.title,
      this.subtitle,
      this.tint = ArtColors.green,
      this.tintBg = ArtColors.greenSoft});

  final IconData icon;
  final String title;
  final String? subtitle;
  final Color tint;
  final Color tintBg;

  @override
  Widget build(BuildContext context) {
    return _Card(
      padding: const EdgeInsets.fromLTRB(7, 7, 11, 7),
      radius: 13,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(color: tintBg, borderRadius: BorderRadius.circular(8)),
            child: Icon(icon, size: 14, color: tint),
          ),
          const SizedBox(width: 7),
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(color: ArtColors.ink, fontSize: 9.5, fontWeight: FontWeight.w800)),
              if (subtitle != null)
                Text(subtitle!,
                    style: const TextStyle(color: ArtColors.muted, fontSize: 7.5, fontWeight: FontWeight.w600)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar(this.initials, this.color, {this.size = 24});

  final String initials;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color.withValues(alpha: 0.16), shape: BoxShape.circle),
      child: Text(initials, style: TextStyle(color: color, fontSize: size * 0.36, fontWeight: FontWeight.w800)),
    );
  }
}

/// A phone outline with a screen; [child] fills the screen.
class _Phone extends StatelessWidget {
  const _Phone({required this.width, required this.height, required this.child, this.screen = Colors.white});

  final double width;
  final double height;
  final Widget child;
  final Color screen;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      padding: const EdgeInsets.all(5),
      decoration: BoxDecoration(
        color: const Color(0xFF0E1512),
        borderRadius: BorderRadius.circular(26),
        boxShadow: const [BoxShadow(color: Color(0x55000000), blurRadius: 30, offset: Offset(0, 16))],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(21),
        child: ColoredBox(
          color: screen,
          child: Stack(
            children: [
              Positioned.fill(child: child),
              Align(
                alignment: Alignment.topCenter,
                child: Container(
                  margin: const EdgeInsets.only(top: 5),
                  width: width * 0.26,
                  height: 7,
                  decoration: BoxDecoration(color: const Color(0xFF0E1512), borderRadius: BorderRadius.circular(99)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Foil-pressed lettering: a light metallic face with a dark edge above,
/// so the gym name looks pressed into the card.
class _Engraved extends StatelessWidget {
  const _Engraved(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    const style = TextStyle(fontSize: 21, fontWeight: FontWeight.w900, letterSpacing: -0.4, height: 1.2);
    return Stack(
      children: [
        Transform.translate(
          offset: const Offset(0, -1),
          child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: style.copyWith(color: Colors.black54)),
        ),
        ShaderMask(
          blendMode: BlendMode.srcIn,
          shaderCallback: (bounds) => const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Colors.white, Color(0xFFE4F7EA), Color(0xFFA9D9BD)],
            stops: [0, 0.48, 1],
          ).createShader(bounds),
          child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: style.copyWith(color: Colors.white)),
        ),
      ],
    );
  }
}

/* ---- Painters -------------------------------------------------------------- */

class _BarsPainter extends CustomPainter {
  const _BarsPainter(this.values);

  static const color = ArtColors.green;
  static const highlight = ArtColors.lime;

  final List<double> values;

  @override
  void paint(Canvas canvas, Size size) {
    final gap = size.width * 0.06;
    final w = (size.width - gap * (values.length - 1)) / values.length;
    for (var i = 0; i < values.length; i++) {
      final h = size.height * values[i];
      final last = i == values.length - 1;
      final rect = RRect.fromRectAndRadius(
        Rect.fromLTWH(i * (w + gap), size.height - h, w, h),
        Radius.circular(w * 0.35),
      );
      canvas.drawRRect(rect, Paint()..color = last ? highlight : color.withValues(alpha: 0.22 + 0.5 * values[i]));
    }
  }

  @override
  bool shouldRepaint(_BarsPainter oldDelegate) => oldDelegate.values != values;
}

class _LinePainter extends CustomPainter {
  const _LinePainter(this.points, this.progress);

  /// 0..1 heights, left to right.
  final List<double> points;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final pts = [
      for (var i = 0; i < points.length; i++)
        Offset(size.width * i / (points.length - 1), size.height * (1 - points[i])),
    ];
    final path = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (var i = 1; i < pts.length; i++) {
      final a = pts[i - 1];
      final b = pts[i];
      final mid = (a.dx + b.dx) / 2;
      path.cubicTo(mid, a.dy, mid, b.dy, b.dx, b.dy);
    }
    // Grid
    final grid = Paint()
      ..color = ArtColors.line
      ..strokeWidth = 1;
    for (var i = 1; i <= 3; i++) {
      final y = size.height * i / 4;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }
    canvas.save();
    canvas.clipRect(Rect.fromLTWH(0, -10, size.width * progress, size.height + 20));
    final fill = Path.from(path)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(
      fill,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [ArtColors.green.withValues(alpha: 0.28), ArtColors.green.withValues(alpha: 0)],
        ).createShader(Offset.zero & size),
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = ArtColors.green
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.6
        ..strokeCap = StrokeCap.round,
    );
    canvas.restore();
    if (progress > 0.98) {
      final end = pts.last;
      canvas.drawCircle(end, 9, Paint()..color = ArtColors.lime.withValues(alpha: 0.45));
      canvas.drawCircle(end, 4.5, Paint()..color = ArtColors.brand);
      canvas.drawCircle(end, 2, Paint()..color = Colors.white);
    }
  }

  @override
  bool shouldRepaint(_LinePainter oldDelegate) => oldDelegate.progress != progress;
}

class _DonutPainter extends CustomPainter {
  const _DonutPainter(this.parts);

  final List<(double, Color)> parts;

  @override
  void paint(Canvas canvas, Size size) {
    final stroke = size.width * 0.17;
    final rect = Rect.fromCircle(center: size.center(Offset.zero), radius: size.width / 2 - stroke / 2);
    var start = -math.pi / 2;
    for (final (fraction, color) in parts) {
      final sweep = 2 * math.pi * fraction;
      canvas.drawArc(
        rect,
        start + 0.06,
        sweep - 0.12,
        false,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round,
      );
      start += sweep;
    }
  }

  @override
  bool shouldRepaint(_DonutPainter oldDelegate) => false;
}

/// A QR-code-looking pattern (decorative, not scannable).
class _QrPainter extends CustomPainter {
  const _QrPainter();

  static const color = ArtColors.ink;

  @override
  void paint(Canvas canvas, Size size) {
    const n = 21;
    final cell = size.width / n;
    final paint = Paint()..color = color;
    final random = math.Random(7);
    bool finder(int x, int y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        if (finder(x, y)) continue;
        if (random.nextDouble() < 0.47) {
          canvas.drawRRect(
            RRect.fromRectAndRadius(
                Rect.fromLTWH(x * cell, y * cell, cell * 0.92, cell * 0.92), Radius.circular(cell * 0.25)),
            paint,
          );
        }
      }
    }
    for (final origin in [Offset.zero, Offset((n - 7) * cell, 0), Offset(0, (n - 7) * cell)]) {
      final outer = RRect.fromRectAndRadius(origin & Size(cell * 7, cell * 7), Radius.circular(cell * 1.6));
      canvas.drawRRect(
        outer.deflate(cell / 2),
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = cell,
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(
            (origin + Offset(cell * 2, cell * 2)) & Size(cell * 3, cell * 3), Radius.circular(cell)),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_QrPainter oldDelegate) => false;
}

class _DumbbellPainter extends CustomPainter {
  const _DumbbellPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final h = size.height;
    final w = size.width;
    canvas.drawRRect(
        RRect.fromRectAndRadius(Rect.fromLTWH(w * 0.18, h * 0.42, w * 0.64, h * 0.16), Radius.circular(h)), paint);
    for (final x in [0.0, w * 0.82]) {
      canvas.drawRRect(
          RRect.fromRectAndRadius(Rect.fromLTWH(x, h * 0.12, w * 0.1, h * 0.76), Radius.circular(w * 0.04)), paint);
    }
    for (final x in [w * 0.1, w * 0.74]) {
      canvas.drawRRect(
          RRect.fromRectAndRadius(Rect.fromLTWH(x, h * 0.24, w * 0.08, h * 0.52), Radius.circular(w * 0.03)), paint);
    }
  }

  @override
  bool shouldRepaint(_DumbbellPainter oldDelegate) => oldDelegate.color != color;
}

class _RuledPaperPainter extends CustomPainter {
  const _RuledPaperPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final line = Paint()
      ..color = const Color(0xFFB9C9E8)
      ..strokeWidth = 1;
    for (var y = 22.0; y < size.height - 6; y += 11) {
      canvas.drawLine(Offset(8, y), Offset(size.width - 8, y), line);
    }
    canvas.drawLine(
      Offset(size.width * 0.24, 6),
      Offset(size.width * 0.24, size.height - 6),
      Paint()
        ..color = const Color(0xFFF0A3A3)
        ..strokeWidth = 1,
    );
    // Hand-written scribbles
    final ink = Paint()
      ..color = const Color(0xFF4A5A86)
      ..strokeWidth = 1.4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final random = math.Random(3);
    for (var y = 20.0; y < size.height - 12; y += 11) {
      final path = Path()..moveTo(size.width * 0.28, y - 2);
      var x = size.width * 0.28;
      final end = size.width * (0.5 + random.nextDouble() * 0.38);
      while (x < end) {
        x += 4;
        path.lineTo(x, y - 2 - random.nextDouble() * 4);
      }
      canvas.drawPath(path, ink);
    }
  }

  @override
  bool shouldRepaint(_RuledPaperPainter oldDelegate) => false;
}

/// Backdrop for the illustration area: soft rings, a dot grid and a lime glow.
class StagePainter extends CustomPainter {
  const StagePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final glow = Paint()
      ..shader = RadialGradient(
        colors: [ArtColors.lime.withValues(alpha: 0.22), ArtColors.lime.withValues(alpha: 0)],
      ).createShader(Rect.fromCircle(center: Offset(size.width * 0.5, size.height * 0.55), radius: size.width * 0.6));
    canvas.drawRect(Offset.zero & size, glow);
    final ring = Paint()
      ..color = Colors.white.withValues(alpha: 0.06)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    final c = Offset(size.width * 0.92, size.height * 0.12);
    for (var r = 40.0; r < size.width; r += 46) {
      canvas.drawCircle(c, r, ring);
    }
    final dot = Paint()..color = Colors.white.withValues(alpha: 0.09);
    for (var y = 18.0; y < size.height * 0.5; y += 16) {
      for (var x = 18.0; x < size.width * 0.32; x += 16) {
        canvas.drawCircle(Offset(x, y + size.height * 0.08), 1.3, dot);
      }
    }
  }

  @override
  bool shouldRepaint(StagePainter oldDelegate) => false;
}

/* ---- Slide illustrations -------------------------------------------------- */

Widget _canvas(List<Widget> children) =>
    SizedBox.fromSize(size: kArtSize, child: Stack(clipBehavior: Clip.none, children: children));

/// 1 · Your entire gym, one app — the dashboard replaces the paper register.
class EntireGymArt extends StatelessWidget {
  const EntireGymArt({super.key, required this.t});

  final Animation<double> t;

  @override
  Widget build(BuildContext context) {
    return _canvas([
      // The old paper register, tilted and fading behind the phone.
      Positioned(
        left: 14,
        top: 46,
        child: _Float(
          t: t,
          phase: 1.2,
          amp: 3,
          child: Transform.rotate(
            angle: -0.2,
            child: Opacity(
              opacity: 0.92,
              child: Container(
                width: 104,
                height: 136,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFDF6),
                  borderRadius: BorderRadius.circular(8),
                  boxShadow: const [BoxShadow(color: Color(0x33000000), blurRadius: 14, offset: Offset(0, 8))],
                ),
                child: Stack(
                  children: [
                    const Positioned.fill(child: CustomPaint(painter: _RuledPaperPainter())),
                    Positioned(
                      top: 4,
                      left: 0,
                      right: 0,
                      child: Center(
                        child: Text('REGISTER',
                            style: TextStyle(
                                color: const Color(0xFF4A5A86).withValues(alpha: 0.8),
                                fontSize: 7,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.4)),
                      ),
                    ),
                    Center(
                      child: Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: ArtColors.red.withValues(alpha: 0.12),
                          shape: BoxShape.circle,
                          border: Border.all(color: ArtColors.red, width: 2.4),
                        ),
                        child: const Icon(Icons.close_rounded, color: ArtColors.red, size: 28),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
      // The phone with the dashboard.
      Positioned(
        left: 106,
        top: 6,
        child: _Float(
          t: t,
          amp: 3,
          child: _Phone(
            width: 132,
            height: 262,
            screen: ArtColors.page,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 18, 8, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Good morning',
                      style: TextStyle(color: ArtColors.muted, fontSize: 6.5, fontWeight: FontWeight.w600)),
                  const Text('Iron Temple Gym',
                      style: TextStyle(color: ArtColors.ink, fontSize: 9.5, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(color: ArtColors.brand, borderRadius: BorderRadius.circular(10)),
                    child: const Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Collected today',
                                  style: TextStyle(color: Colors.white70, fontSize: 6, fontWeight: FontWeight.w600)),
                              Text('₹4,800',
                                  style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900)),
                            ],
                          ),
                        ),
                        Icon(Icons.trending_up_rounded, color: ArtColors.lime, size: 16),
                      ],
                    ),
                  ),
                  const SizedBox(height: 5),
                  const Row(
                    children: [
                      Expanded(child: _MiniStat('Members', '128', Icons.groups_rounded)),
                      SizedBox(width: 5),
                      Expanded(child: _MiniStat('Check-ins', '46', Icons.how_to_reg_rounded)),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Container(
                    height: 52,
                    padding: const EdgeInsets.fromLTRB(6, 5, 6, 5),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(9)),
                    child: const Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('This week',
                            style: TextStyle(color: ArtColors.muted, fontSize: 6, fontWeight: FontWeight.w700)),
                        SizedBox(height: 3),
                        Expanded(
                            child: CustomPaint(
                                size: Size.infinite, painter: _BarsPainter([0.45, 0.6, 0.38, 0.72, 0.55, 0.8, 1]))),
                      ],
                    ),
                  ),
                  const SizedBox(height: 5),
                  for (final (name, color, amount) in const [
                    ('Rahul V.', ArtColors.green, '₹800'),
                    ('Priya S.', ArtColors.amber, '₹2,200'),
                  ])
                    Container(
                      margin: const EdgeInsets.only(bottom: 4),
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
                      child: Row(
                        children: [
                          _Avatar(name.substring(0, 1), color, size: 15),
                          const SizedBox(width: 5),
                          Expanded(
                            child: Text(name,
                                style: const TextStyle(color: ArtColors.ink, fontSize: 7, fontWeight: FontWeight.w700)),
                          ),
                          Text(amount, style: TextStyle(color: color, fontSize: 7, fontWeight: FontWeight.w900)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
      Positioned(
        right: 0,
        top: 40,
        child: _Float(
          t: t,
          phase: 2.4,
          child: const _Toast(icon: Icons.schedule_rounded, title: 'Hours saved', subtitle: 'No more paperwork'),
        ),
      ),
      Positioned(
        right: 10,
        bottom: 34,
        child: _Float(
          t: t,
          phase: 0.8,
          child: const _Toast(
              icon: Icons.check_circle_rounded, title: 'All in one place', subtitle: 'Members · fees · staff'),
        ),
      ),
      const Positioned(
          left: 30,
          bottom: 26,
          child: SizedBox(width: 58, height: 26, child: CustomPaint(painter: _DumbbellPainter(ArtColors.lime)))),
    ]);
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat(this.label, this.value, this.icon);

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(6, 5, 6, 5),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(9)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 10, color: ArtColors.green),
              const SizedBox(width: 3),
              Text(value, style: const TextStyle(color: ArtColors.ink, fontSize: 9.5, fontWeight: FontWeight.w900)),
            ],
          ),
          Text(label,
              maxLines: 1,
              softWrap: false,
              style: const TextStyle(color: ArtColors.muted, fontSize: 6, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

/// 2 · Never miss a fee due date — calendar, WhatsApp-style reminder, rupee coin.
class FeesArt extends StatelessWidget {
  const FeesArt({super.key, required this.t});

  final Animation<double> t;

  @override
  Widget build(BuildContext context) {
    return _canvas([
      Positioned(
        left: 10,
        top: 50,
        child: _Float(
          t: t,
          amp: 3,
          child: _Card(
            padding: EdgeInsets.zero,
            radius: 18,
            child: SizedBox(
              width: 178,
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: const BoxDecoration(
                      color: ArtColors.green,
                      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.calendar_month_rounded, size: 12, color: Colors.white),
                        SizedBox(width: 5),
                        Text('NOVEMBER',
                            style: TextStyle(
                                color: Colors.white, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            for (final d in const ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
                              Expanded(
                                child: Center(
                                  child: Text(d,
                                      style: const TextStyle(
                                          color: ArtColors.muted, fontSize: 6.5, fontWeight: FontWeight.w800)),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        for (var week = 0; week < 4; week++)
                          Row(
                            children: [
                              for (var day = 0; day < 7; day++) Expanded(child: _CalendarDay(week * 7 + day + 1, t: t)),
                            ],
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      // "Paid" stamp
      Positioned(
        left: 128,
        top: 190,
        child: Transform.rotate(
          angle: -0.32,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              border: Border.all(color: ArtColors.green, width: 2),
              borderRadius: BorderRadius.circular(6),
              color: Colors.white.withValues(alpha: 0.85),
            ),
            child: const Text('PAID',
                style: TextStyle(color: ArtColors.green, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 2)),
          ),
        ),
      ),
      // Reminder bubble
      Positioned(
        right: 0,
        top: 10,
        child: _Float(
          t: t,
          phase: 2,
          child: Container(
            width: 148,
            padding: const EdgeInsets.fromLTRB(9, 8, 9, 6),
            decoration: const BoxDecoration(
              color: ArtColors.chat,
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(14),
                topRight: Radius.circular(14),
                bottomLeft: Radius.circular(14),
                bottomRight: Radius.circular(4),
              ),
              boxShadow: [BoxShadow(color: Color(0x33000000), blurRadius: 18, offset: Offset(0, 8))],
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.chat_rounded, size: 10, color: ArtColors.green),
                    SizedBox(width: 4),
                    Text('Fee reminder',
                        style: TextStyle(color: ArtColors.green, fontSize: 7.5, fontWeight: FontWeight.w900)),
                  ],
                ),
                SizedBox(height: 3),
                Text('Hi Rahul, your ₹800 fee is due on 10 Nov. See you at the gym!',
                    style: TextStyle(color: ArtColors.ink, fontSize: 8, height: 1.3, fontWeight: FontWeight.w500)),
                SizedBox(height: 2),
                Align(
                  alignment: Alignment.centerRight,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('9:30 AM', style: TextStyle(color: ArtColors.muted, fontSize: 6)),
                      SizedBox(width: 2),
                      Icon(Icons.done_all_rounded, size: 10, color: ArtColors.tick),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      Positioned(
        right: 26,
        top: 128,
        child: _Float(
          t: t,
          phase: 0.6,
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _Pill('Paid  ₹1,200', icon: Icons.check_circle_rounded, size: 9),
              SizedBox(height: 6),
              _Pill('Due  ₹800', fg: ArtColors.amber, bg: ArtColors.amberSoft, icon: Icons.schedule_rounded, size: 9),
              SizedBox(height: 6),
              _Pill('Renews 10 Nov', fg: Colors.white, bg: ArtColors.green, icon: Icons.autorenew_rounded, size: 9),
            ],
          ),
        ),
      ),
      Positioned(
        right: 4,
        bottom: 6,
        child: _Float(
          t: t,
          phase: 3.6,
          amp: 5,
          child: Container(
            width: 54,
            height: 54,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFFFFD86B), ArtColors.gold, Color(0xFFD99413)],
              ),
              border: Border.all(color: const Color(0xFFFFE7A1), width: 3),
              boxShadow: const [BoxShadow(color: Color(0x44000000), blurRadius: 14, offset: Offset(0, 6))],
            ),
            child:
                const Text('₹', style: TextStyle(color: Color(0xFF7A4A00), fontSize: 24, fontWeight: FontWeight.w900)),
          ),
        ),
      ),
    ]);
  }
}

class _CalendarDay extends StatelessWidget {
  const _CalendarDay(this.day, {required this.t});

  final int day;
  final Animation<double> t;

  @override
  Widget build(BuildContext context) {
    final due = day == 10;
    final paid = day == 3 || day == 17;
    final text = Text(
      '$day',
      style: TextStyle(
        color: due ? ArtColors.brand : (paid ? ArtColors.green : ArtColors.ink),
        fontSize: 7.5,
        fontWeight: due || paid ? FontWeight.w900 : FontWeight.w600,
      ),
    );
    Widget cell = Container(
      height: 18,
      margin: const EdgeInsets.all(1),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: due ? ArtColors.lime : (paid ? ArtColors.greenSoft : null),
        shape: BoxShape.circle,
      ),
      child: text,
    );
    if (due) {
      cell = AnimatedBuilder(
        animation: t,
        child: cell,
        builder: (context, child) {
          final p = (t.value * 2) % 1;
          return Stack(
            alignment: Alignment.center,
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 18 + 12 * p,
                height: 18 + 12 * p,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: ArtColors.green.withValues(alpha: 0.6 * (1 - p)), width: 2),
                ),
              ),
              child!,
            ],
          );
        },
      );
    }
    return cell;
  }
}

/// 3 · Every member, under control — searchable member cards with status.
class MembersArt extends StatelessWidget {
  const MembersArt({super.key, required this.t});

  final Animation<double> t;

  @override
  Widget build(BuildContext context) {
    const rows = [
      ('RV', 'Rahul Verma', 'Monthly · ₹800', 'Active', ArtColors.green, ArtColors.greenSoft, ArtColors.green),
      ('PS', 'Priya Shah', '3-month package', 'Due 10 Nov', ArtColors.amber, ArtColors.amberSoft, Color(0xFF7C5CD6)),
      ('AG', 'Aman Gupta', 'Monthly · ₹700', 'Expired', ArtColors.red, ArtColors.redSoft, Color(0xFF2E7DD1)),
    ];
    return _canvas([
      Positioned(
        left: 34,
        top: 22,
        right: 34,
        child: _Float(
          t: t,
          amp: 2.5,
          child: const _Card(
            padding: EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            radius: 14,
            child: Row(
              children: [
                Icon(Icons.search_rounded, size: 15, color: ArtColors.muted),
                SizedBox(width: 6),
                Text('Search members',
                    style: TextStyle(color: ArtColors.muted, fontSize: 9.5, fontWeight: FontWeight.w600)),
                Spacer(),
                _Pill('128 active', size: 8),
              ],
            ),
          ),
        ),
      ),
      for (var i = 0; i < rows.length; i++)
        Positioned(
          left: 20.0 + i * 7,
          right: 48.0 - i * 7,
          top: 78.0 + i * 58,
          child: _Float(
            t: t,
            phase: 0.9 * (i + 1),
            amp: 3,
            child: _Card(
              padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
              radius: 16,
              child: Row(
                children: [
                  _Avatar(rows[i].$1, rows[i].$7, size: 30),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(rows[i].$2,
                            style: const TextStyle(color: ArtColors.ink, fontSize: 10.5, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 1),
                        Text(rows[i].$3,
                            style: const TextStyle(color: ArtColors.muted, fontSize: 8, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                  _Pill(rows[i].$4, fg: rows[i].$5, bg: rows[i].$6, size: 8),
                ],
              ),
            ),
          ),
        ),
      Positioned(
        right: 6,
        bottom: 20,
        child: _Float(
          t: t,
          phase: 3,
          amp: 5,
          child: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: ArtColors.lime,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(color: ArtColors.lime.withValues(alpha: 0.5), blurRadius: 20, offset: const Offset(0, 6))
              ],
            ),
            child: const Icon(Icons.person_add_alt_1_rounded, color: ArtColors.brand, size: 24),
          ),
        ),
      ),
    ]);
  }
}

/// 4 · Run your gym smarter — revenue chart and an income/spend split.
class InsightsArt extends StatelessWidget {
  const InsightsArt({super.key, required this.t});

  final Animation<double> t;

  @override
  Widget build(BuildContext context) {
    return _canvas([
      Positioned(
        left: 12,
        top: 26,
        child: _Float(
          t: t,
          amp: 3,
          child: _Card(
            padding: const EdgeInsets.fromLTRB(12, 11, 12, 12),
            radius: 18,
            child: SizedBox(
              width: 206,
              height: 168,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Text('Revenue',
                          style: TextStyle(color: ArtColors.muted, fontSize: 8.5, fontWeight: FontWeight.w700)),
                      Spacer(),
                      _Pill('This month', size: 7),
                    ],
                  ),
                  const SizedBox(height: 2),
                  const Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text('₹48,200',
                          style: TextStyle(
                              color: ArtColors.ink, fontSize: 19, fontWeight: FontWeight.w900, letterSpacing: -0.5)),
                      SizedBox(width: 6),
                      Padding(
                        padding: EdgeInsets.only(bottom: 3),
                        child: Icon(Icons.trending_up_rounded, color: ArtColors.green, size: 15),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Expanded(
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0, end: 1),
                      duration: const Duration(milliseconds: 1400),
                      curve: Curves.easeOutCubic,
                      builder: (context, progress, _) => CustomPaint(
                        size: Size.infinite,
                        painter: _LinePainter(const [0.18, 0.32, 0.26, 0.48, 0.42, 0.64, 0.58, 0.86], progress),
                      ),
                    ),
                  ),
                  const SizedBox(height: 5),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      for (final m in const ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'])
                        Text(m,
                            style: const TextStyle(color: ArtColors.muted, fontSize: 6.5, fontWeight: FontWeight.w600)),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
      Positioned(
        right: 4,
        top: 98,
        child: _Float(
          t: t,
          phase: 1.8,
          child: _Card(
            padding: const EdgeInsets.all(10),
            radius: 16,
            child: SizedBox(
              width: 92,
              child: Column(
                children: [
                  const SizedBox(
                    width: 58,
                    height: 58,
                    child: CustomPaint(
                      painter: _DonutPainter([(0.68, ArtColors.green), (0.2, ArtColors.gold), (0.12, ArtColors.red)]),
                      child: Center(
                        child: Text('68%',
                            style: TextStyle(color: ArtColors.ink, fontSize: 11, fontWeight: FontWeight.w900)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  for (final (label, color) in const [
                    ('Earned', ArtColors.green),
                    ('Rent', ArtColors.gold),
                    ('Other', ArtColors.red),
                  ])
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Row(
                        children: [
                          Container(
                              width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
                          const SizedBox(width: 4),
                          Text(label,
                              style: const TextStyle(color: ArtColors.muted, fontSize: 7, fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
      Positioned(
        left: 40,
        bottom: 12,
        child: _Float(
          t: t,
          phase: 3.1,
          child: const _Toast(
            icon: Icons.description_rounded,
            title: 'Report ready',
            subtitle: 'Income vs expenses · CSV',
          ),
        ),
      ),
      Positioned(
        right: 22,
        top: 20,
        child: _Float(
          t: t,
          phase: 0.4,
          amp: 5,
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: ArtColors.lime,
              borderRadius: BorderRadius.circular(13),
              boxShadow: [BoxShadow(color: ArtColors.lime.withValues(alpha: 0.5), blurRadius: 18)],
            ),
            child: const Icon(Icons.insights_rounded, color: ArtColors.brand, size: 22),
          ),
        ),
      ),
    ]);
  }
}

/// 5 · Members get their own app — member card with QR, payment notification.
class MemberAppArt extends StatelessWidget {
  const MemberAppArt({super.key, required this.t});

  final Animation<double> t;

  @override
  Widget build(BuildContext context) {
    return _canvas([
      // Owner's phone behind, for "both sides".
      Positioned(
        left: 28,
        top: 40,
        child: Transform.rotate(
          angle: -0.14,
          child: Opacity(
            opacity: 0.55,
            child: _Phone(
              width: 110,
              height: 214,
              screen: ArtColors.page,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 20, 8, 8),
                child: Column(
                  children: [
                    for (var i = 0; i < 5; i++)
                      Container(
                        height: 22,
                        margin: const EdgeInsets.only(bottom: 6),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(7)),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
      // Member's phone in front.
      Positioned(
        left: 94,
        top: 18,
        child: _Float(
          t: t,
          amp: 3,
          child: Transform.rotate(
            angle: 0.05,
            child: _Phone(
              width: 134,
              height: 250,
              screen: ArtColors.brand,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 22, 10, 10),
                child: Column(
                  children: [
                    const Text('IRON TEMPLE GYM',
                        style: TextStyle(
                            color: ArtColors.lime, fontSize: 7, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
                    const SizedBox(height: 2),
                    const Text('Rahul Verma',
                        style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
                      child: const SizedBox(width: 64, height: 64, child: CustomPaint(painter: _QrPainter())),
                    ),
                    const SizedBox(height: 7),
                    const Text('Scan at the desk to check in',
                        style: TextStyle(color: Colors.white70, fontSize: 6.5, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: const Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Plan',
                                    style:
                                        TextStyle(color: Colors.white60, fontSize: 5.5, fontWeight: FontWeight.w700)),
                                Text('Monthly',
                                    style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.w800)),
                              ],
                            ),
                          ),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text('Valid till',
                                  style: TextStyle(color: Colors.white60, fontSize: 5.5, fontWeight: FontWeight.w700)),
                              Text('10 Nov',
                                  style: TextStyle(color: ArtColors.lime, fontSize: 8, fontWeight: FontWeight.w900)),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        for (final (icon, label) in const [
                          (Icons.receipt_long_rounded, 'Receipts'),
                          (Icons.event_available_rounded, 'Visits'),
                        ])
                          Expanded(
                            child: Container(
                              margin: const EdgeInsets.symmetric(horizontal: 2),
                              padding: const EdgeInsets.symmetric(vertical: 5),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Column(
                                children: [
                                  Icon(icon, size: 11, color: ArtColors.lime),
                                  Text(label,
                                      style: const TextStyle(
                                          color: Colors.white, fontSize: 6, fontWeight: FontWeight.w700)),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
      Positioned(
        right: -6,
        top: -8,
        child: _Float(
          t: t,
          phase: 2.2,
          child: const _Toast(
              icon: Icons.receipt_long_rounded, title: 'Payment received', subtitle: '₹800 · receipt sent'),
        ),
      ),
      Positioned(
        right: -6,
        bottom: -10,
        child: _Float(
          t: t,
          phase: 0.7,
          child: const _Toast(
            icon: Icons.notifications_active_rounded,
            title: 'Fee due in 3 days',
            subtitle: 'Reminder on their phone',
            tint: ArtColors.amber,
            tintBg: ArtColors.amberSoft,
          ),
        ),
      ),
      Positioned(
        left: -4,
        bottom: 70,
        child: _Float(
          t: t,
          phase: 3.4,
          child: const _Toast(icon: Icons.qr_code_scanner_rounded, title: 'Checked in', subtitle: '6:42 AM'),
        ),
      ),
    ]);
  }
}

/// The app logo (white mark, assets/splash.png) on a lime tile, tinted brand green.
class LogoTile extends StatelessWidget {
  const LogoTile({super.key, this.size = 34});

  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.symmetric(horizontal: size * 0.17),
      decoration: BoxDecoration(color: ArtColors.lime, borderRadius: BorderRadius.circular(size * 0.3)),
      child: Image.asset(kSplashImage, color: ArtColors.brand, colorBlendMode: BlendMode.srcIn, fit: BoxFit.contain),
    );
  }
}

/// Live card for gym setup: the gym name is pressed into it as the owner types.
class GymCardArt extends StatelessWidget {
  const GymCardArt({
    super.key,
    required this.gymName,
    required this.ownerName,
    required this.phone,
    this.ready = false,
  });

  final String gymName;
  final String ownerName;
  final String phone;

  /// The account exists: the card turns "Active".
  final bool ready;

  @override
  Widget build(BuildContext context) {
    final name = gymName.trim().isEmpty ? 'Your Gym Name' : gymName.trim();
    final owner = ownerName.trim().isEmpty ? 'Owner name' : ownerName.trim();
    final digits = phone.replaceAll(RegExp(r'\D'), '');
    final shownPhone = digits.isEmpty
        ? '+91 ••••• •••••'
        : '+91 ${digits.length > 5 ? '${digits.substring(0, 5)} ${digits.substring(5)}' : digits}';
    return Container(
      width: 300,
      height: 172,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0E5A40), ArtColors.brand, Color(0xFF032219)],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 30, offset: Offset(0, 16))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(
            right: -30,
            bottom: -26,
            child: Opacity(
              opacity: 0.12,
              child: Transform.rotate(
                angle: -0.5,
                child: const SizedBox(
                    width: 170, height: 76, child: CustomPaint(painter: _DumbbellPainter(ArtColors.lime))),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const LogoTile(size: 36),
                    const Spacer(),
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 300),
                      transitionBuilder: (child, a) => ScaleTransition(scale: a, child: child),
                      child: ready
                          ? const _Pill('Active',
                              key: ValueKey('active'),
                              icon: Icons.check_circle_rounded,
                              fg: ArtColors.brand,
                              bg: ArtColors.lime,
                              size: 8.5)
                          : const _Pill('Owner',
                              key: ValueKey('owner'), fg: ArtColors.brand, bg: ArtColors.lime, size: 8.5),
                    ),
                  ],
                ),
                const Spacer(),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 180),
                  child: gymName.trim().isEmpty
                      ? Text(
                          name,
                          key: const ValueKey(''),
                          maxLines: 1,
                          style: const TextStyle(
                            color: Colors.white38,
                            fontSize: 21,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.4,
                          ),
                        )
                      : _Engraved(name, key: ValueKey(name)),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.person_rounded, size: 13, color: ArtColors.lime),
                    const SizedBox(width: 5),
                    Flexible(
                      child: Text(owner,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: ownerName.trim().isEmpty ? Colors.white38 : Colors.white70,
                              fontSize: 11.5,
                              fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(width: 12),
                    const Icon(Icons.call_rounded, size: 13, color: ArtColors.lime),
                    const SizedBox(width: 5),
                    Text(shownPhone,
                        style: TextStyle(
                            color: digits.isEmpty ? Colors.white38 : Colors.white70,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            fontFeatures: const [FontFeature.tabularFigures()])),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
