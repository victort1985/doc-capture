import 'dart:convert';
import 'dart:typed_data';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

/// Loads Hebrew-capable fonts (Noto Sans Hebrew).
/// Call once per PDF build and pass fonts into all text widgets.
Future<_PdfFonts> loadHebrewFonts() async {
  return _PdfFonts(
    regular: await PdfGoogleFonts.notoSansHebrewRegular(),
    bold:    await PdfGoogleFonts.notoSansHebrewBold(),
  );
}

class _PdfFonts {
  const _PdfFonts({required this.regular, required this.bold});
  final pw.Font regular;
  final pw.Font bold;
}

/// Decodes a base64 logo (data:image/...;base64,... or raw base64).
Uint8List? decodeLogoBytes(String? logoBase64) {
  if (logoBase64 == null || logoBase64.isEmpty) return null;
  try {
    // Handle data URI format: data:image/png;base64,AAAA...
    final comma = logoBase64.indexOf(',');
    final raw = comma >= 0 ? logoBase64.substring(comma + 1) : logoBase64;
    // Remove any whitespace/newlines that may have been introduced
    final clean = raw.replaceAll(RegExp(r'\s'), '');
    return base64Decode(clean);
  } catch (_) {
    return null;
  }
}

/// Returns a standard page header widget: logo (if available) + company name.
/// Suitable for use as `header:` in pw.MultiPage or top of pw.Page content.
pw.Widget pdfPageHeader({
  required _PdfFonts fonts,
  required String companyName,
  String? companySubtitle,
  Uint8List? logoBytes,
  double logoHeight = 36,
}) {
  return pw.Container(
    decoration: const pw.BoxDecoration(
      border: pw.Border(bottom: pw.BorderSide(width: 0.5, color: PdfColors.grey400)),
    ),
    padding: const pw.EdgeInsets.only(bottom: 6),
    margin: const pw.EdgeInsets.only(bottom: 10),
    child: pw.Row(
      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
      crossAxisAlignment: pw.CrossAxisAlignment.center,
      children: [
        // Left: company name + subtitle
        pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
          pw.Text(companyName,
            textDirection: pw.TextDirection.rtl,
            style: pw.TextStyle(font: fonts.bold, fontSize: 11)),
          if (companySubtitle != null)
            pw.Text(companySubtitle,
              style: pw.TextStyle(font: fonts.regular, fontSize: 8, color: PdfColors.grey600)),
        ]),
        // Right: logo
        if (logoBytes != null)
          pw.Image(pw.MemoryImage(logoBytes), height: logoHeight, fit: pw.BoxFit.contain)
        else
          pw.SizedBox(width: 1),
      ],
    ),
  );
}

// Re-export fonts class for external use
typedef PdfFonts = _PdfFonts;
