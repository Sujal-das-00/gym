import 'dart:typed_data';

import 'package:flutter/services.dart' show rootBundle;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

/// Builds the member's payment receipt as a PDF, entirely in Dart.
///
/// The fields arrive already formatted by the web app (receiptData() in
/// checkin-frontend/src/lib/receipt.js), and the layout mirrors its invoiceHtml().
/// No WebView or print service is involved: Printing.convertHtml rendered the
/// HTML in an off-screen WebView through hidden Android print APIs, and failed
/// on members' phones.
Future<Uint8List> buildReceiptPdf(Map<String, dynamic> receipt) async {
  String text(String key) => '${receipt[key] ?? ''}';

  // Bundled because the PDF's built-in Helvetica has no ₹.
  final theme = pw.ThemeData.withFont(
    base: pw.Font.ttf(await rootBundle.load('assets/fonts/NotoSans-Regular.ttf')),
    bold: pw.Font.ttf(await rootBundle.load('assets/fonts/NotoSans-Bold.ttf')),
  );

  const ink = PdfColor.fromInt(0xFF0F172A);
  const muted = PdfColor.fromInt(0xFF64748B);
  const label = PdfColor.fromInt(0xFF475569);
  const line = PdfColor.fromInt(0xFFE2E8F0);
  const green = PdfColor.fromInt(0xFF047857);
  final radius = pw.BorderRadius.circular(8);

  pw.Widget field(String name, String value, {bool right = false}) => pw.Expanded(
        child: pw.Column(
          crossAxisAlignment: right ? pw.CrossAxisAlignment.end : pw.CrossAxisAlignment.start,
          children: [
            pw.Text(name.toUpperCase(),
                style: const pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: muted, letterSpacing: .5)),
            pw.SizedBox(height: 3),
            pw.Text(value, style: const pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: ink)),
          ],
        ),
      );

  pw.Widget row(String name, String value, {bool bordered = false}) => pw.Container(
        padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: bordered
            ? const pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: PdfColor.fromInt(0xFFF1F5F9))))
            : null,
        child: pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          children: [
            pw.Text(name, style: const pw.TextStyle(fontSize: 11, color: label)),
            pw.SizedBox(width: 12),
            pw.Flexible(
              child: pw.Text(value,
                  textAlign: pw.TextAlign.right,
                  style: const pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: ink)),
            ),
          ],
        ),
      );

  final mode = text('mode');
  final document = pw.Document(theme: theme, title: text('title'));
  document.addPage(pw.Page(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(16 * PdfPageFormat.mm),
    build: (context) => pw.Column(
      crossAxisAlignment: pw.CrossAxisAlignment.stretch,
      children: [
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(
              child: pw.Text(text('gymName'),
                  style: const pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold, color: ink)),
            ),
            pw.SizedBox(width: 12),
            pw.Text('INVOICE',
                style: const pw.TextStyle(
                    fontSize: 19, fontWeight: pw.FontWeight.bold, color: PdfColor.fromInt(0xFFF86A10), letterSpacing: 1)),
          ],
        ),
        pw.SizedBox(height: 12),
        pw.Container(
          padding: const pw.EdgeInsets.all(11),
          decoration: pw.BoxDecoration(border: pw.Border.all(color: line), borderRadius: radius),
          child: pw.Row(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              field('Bill to', text('memberName')),
              pw.SizedBox(width: 8),
              field('Gym ID', text('gymId')),
              pw.SizedBox(width: 8),
              field('Paid on', text('paidOn'), right: true),
            ],
          ),
        ),
        pw.SizedBox(height: 12),
        pw.Container(
          decoration: pw.BoxDecoration(border: pw.Border.all(color: line), borderRadius: radius),
          child: pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.stretch,
            children: [
              pw.Container(
                padding: const pw.EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: line))),
                child: pw.Text('PAYMENT DETAILS',
                    style: const pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: label, letterSpacing: .5)),
              ),
              row('Paid for', text('paidFor')),
              if (mode.isNotEmpty) row('Mode of payment', mode, bordered: true),
            ],
          ),
        ),
        pw.SizedBox(height: 12),
        pw.Container(
          padding: const pw.EdgeInsets.all(12),
          decoration: pw.BoxDecoration(
            color: const PdfColor.fromInt(0xFFF0FDF4),
            border: pw.Border.all(color: const PdfColor.fromInt(0xFFBBF7D0), width: 1.5),
            borderRadius: radius,
          ),
          child: pw.Row(
            mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
            children: [
              pw.Text('Amount paid', style: const pw.TextStyle(fontSize: 11, fontWeight: pw.FontWeight.bold, color: green)),
              pw.Text(text('amount'), style: const pw.TextStyle(fontSize: 17, fontWeight: pw.FontWeight.bold, color: green)),
            ],
          ),
        ),
        pw.SizedBox(height: 12),
        pw.Container(
          padding: const pw.EdgeInsets.only(top: 9),
          decoration: const pw.BoxDecoration(
              border: pw.Border(top: pw.BorderSide(color: PdfColor.fromInt(0xFFF1F5F9)))),
          child: pw.Text(
            'Computer-generated invoice for a payment collected at the front desk and recorded by '
            '${text('gymName')}. Not a tax invoice.',
            textAlign: pw.TextAlign.center,
            style: const pw.TextStyle(fontSize: 8, color: PdfColor.fromInt(0xFF94A3B8)),
          ),
        ),
      ],
    ),
  ));
  return document.save();
}
